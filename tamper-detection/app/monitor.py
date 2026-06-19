from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
import logging
import threading
import time

import cv2
import requests

from .api import ApiClient
from .config import Settings
from .detectors import build_detectors
from .types import CameraSource, Detection

logger = logging.getLogger(__name__)


@dataclass
class PendingAlarm:
    tamper_type: str
    confidence: float
    screenshot_path: Path
    timestamp: datetime
    next_attempt_at: float
    attempts: int = 0


class CameraMonitor:
    def __init__(self, camera: CameraSource, settings: Settings, api: ApiClient) -> None:
        self.camera = camera
        self.settings = settings
        self.api = api
        self.stop_event = threading.Event()
        self.detectors = build_detectors(settings)
        self.consecutive: dict[str, int] = defaultdict(int)
        self.cooldowns: dict[str, float] = defaultdict(float)
        self.cooldown_log_at: dict[str, float] = defaultdict(float)
        self.pending_alarms: list[PendingAlarm] = []

    def stop(self) -> None:
        self.stop_event.set()

    def run(self) -> None:
        logger.info("Starting tamper monitor for %s (%s)", self.camera.name, self.camera.rtsp_url)
        while not self.stop_event.is_set():
            capture = cv2.VideoCapture(self.camera.rtsp_url, cv2.CAP_FFMPEG)
            if not capture.isOpened():
                logger.warning("Could not open RTSP stream for %s", self.camera.path_name)
                self.stop_event.wait(self.settings.connect_retry_seconds)
                continue

            try:
                self._read_loop(capture)
            finally:
                capture.release()

        logger.info("Stopped tamper monitor for %s", self.camera.name)

    def _read_loop(self, capture: cv2.VideoCapture) -> None:
        while not self.stop_event.is_set():
            started = time.monotonic()
            ok, frame = capture.read()
            if not ok or frame is None:
                logger.warning("Lost RTSP frame for %s; reconnecting", self.camera.path_name)
                self.stop_event.wait(self.settings.connect_retry_seconds)
                return

            self._retry_pending_alarms()
            detections = [result for detector in self.detectors if (result := detector.analyze(frame))]
            self._process_detections(frame, detections)

            elapsed = time.monotonic() - started
            wait_time = max(0.0, self.settings.frame_interval_seconds - elapsed)
            self.stop_event.wait(wait_time)

    def _process_detections(self, frame, detections: list[Detection]) -> None:
        active_types = {detection.tamper_type for detection in detections}
        for tamper_type in list(self.consecutive.keys()):
            if tamper_type not in active_types:
                self.consecutive[tamper_type] = 0

        for detection in detections:
            self.consecutive[detection.tamper_type] += 1
            if self.consecutive[detection.tamper_type] < self.settings.consecutive_frames:
                continue
            if time.monotonic() < self.cooldowns[detection.tamper_type]:
                self._log_cooldown(detection)
                continue

            self._confirm_alarm(frame, detection)
            self.consecutive[detection.tamper_type] = 0
            self.cooldowns[detection.tamper_type] = time.monotonic() + self.settings.cooldown_seconds

    def _confirm_alarm(self, frame, detection: Detection) -> None:
        timestamp = datetime.now(timezone.utc)
        screenshot_path = self._save_screenshot(frame, detection.tamper_type, timestamp)
        logger.warning(
            "Tamper confirmed camera=%s type=%s confidence=%.2f metric=%.2f screenshot=%s",
            self.camera.path_name,
            detection.tamper_type,
            detection.confidence,
            detection.metric,
            screenshot_path,
        )
        try:
            self._send_alarm(detection.tamper_type, detection.confidence, screenshot_path, timestamp)
        except requests.RequestException:
            logger.exception("Failed to send tamper alarm for %s", self.camera.path_name)
            self._queue_alarm(detection.tamper_type, detection.confidence, screenshot_path, timestamp)

    def _log_cooldown(self, detection: Detection) -> None:
        now = time.monotonic()
        if now < self.cooldown_log_at[detection.tamper_type]:
            return
        remaining = max(0, self.cooldowns[detection.tamper_type] - now)
        logger.info(
            "Tamper still detected camera=%s type=%s but alarm is in cooldown for %.0fs",
            self.camera.path_name,
            detection.tamper_type,
            remaining,
        )
        self.cooldown_log_at[detection.tamper_type] = now + 30

    def _send_alarm(
        self,
        tamper_type: str,
        confidence: float,
        screenshot_path: Path,
        timestamp: datetime,
    ) -> None:
        self.api.send_alarm(
            self.camera,
            tamper_type,
            confidence,
            screenshot_path,
            timestamp,
        )

    def _queue_alarm(
        self,
        tamper_type: str,
        confidence: float,
        screenshot_path: Path,
        timestamp: datetime,
    ) -> None:
        self.pending_alarms.append(
            PendingAlarm(
                tamper_type=tamper_type,
                confidence=confidence,
                screenshot_path=screenshot_path,
                timestamp=timestamp,
                next_attempt_at=time.monotonic() + 15,
            )
        )

    def _retry_pending_alarms(self) -> None:
        if not self.pending_alarms:
            return

        now = time.monotonic()
        remaining: list[PendingAlarm] = []
        for alarm in self.pending_alarms:
            if alarm.next_attempt_at > now:
                remaining.append(alarm)
                continue

            try:
                self._send_alarm(
                    alarm.tamper_type,
                    alarm.confidence,
                    alarm.screenshot_path,
                    alarm.timestamp,
                )
                logger.info(
                    "Retried tamper alarm successfully camera=%s type=%s screenshot=%s",
                    self.camera.path_name,
                    alarm.tamper_type,
                    alarm.screenshot_path,
                )
            except requests.RequestException:
                alarm.attempts += 1
                alarm.next_attempt_at = now + min(300, 15 * (2 ** min(alarm.attempts, 5)))
                remaining.append(alarm)
                logger.warning(
                    "Tamper alarm retry failed camera=%s type=%s attempts=%s next_retry_seconds=%.0f",
                    self.camera.path_name,
                    alarm.tamper_type,
                    alarm.attempts,
                    max(0, alarm.next_attempt_at - now),
                )

        self.pending_alarms = remaining

    def _save_screenshot(self, frame, tamper_type: str, timestamp: datetime) -> Path:
        camera_dir = Path(self.settings.screenshot_dir) / self.camera.path_name
        camera_dir.mkdir(parents=True, exist_ok=True)
        filename = f"{timestamp.strftime('%Y%m%dT%H%M%S%fZ')}_{tamper_type.lower()}.jpg"
        path = camera_dir / filename
        cv2.imwrite(str(path), frame, [int(cv2.IMWRITE_JPEG_QUALITY), 90])
        return path
