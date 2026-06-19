from __future__ import annotations

import logging
import signal
import threading

import requests

from .api import ApiClient
from .config import load_settings
from .monitor import CameraMonitor
from .types import CameraSource


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger(__name__)


class MonitorSupervisor:
    def __init__(self) -> None:
        self.settings = load_settings()
        self.api = ApiClient(self.settings)
        self.stop_event = threading.Event()
        self.monitors: dict[str, tuple[CameraMonitor, threading.Thread]] = {}

    def stop(self, *_args) -> None:
        self.stop_event.set()
        for monitor, _thread in self.monitors.values():
            monitor.stop()

    def run(self) -> None:
        signal.signal(signal.SIGINT, self.stop)
        signal.signal(signal.SIGTERM, self.stop)
        logger.info("Tamper detection supervisor started")

        while not self.stop_event.is_set():
            try:
                self.sync_monitors(self.api.fetch_enabled_cameras())
            except requests.RequestException as error:
                logger.warning("Failed to sync tamper camera list: %s", error)
            except Exception:
                logger.exception("Failed to sync tamper camera list")

            self.stop_event.wait(self.settings.poll_interval_seconds)

        self._join_monitors()
        logger.info("Tamper detection supervisor stopped")

    def sync_monitors(self, cameras: list[CameraSource]) -> None:
        desired = {camera.id: camera for camera in cameras}
        current = set(self.monitors.keys())

        for camera_id in current - set(desired):
            monitor, thread = self.monitors.pop(camera_id)
            monitor.stop()
            thread.join(timeout=5)

        for camera_id, camera in desired.items():
            existing = self.monitors.get(camera_id)
            if existing:
                monitor, thread = existing
                if monitor.camera.rtsp_url == camera.rtsp_url and thread.is_alive():
                    continue
                monitor.stop()
                thread.join(timeout=5)

            monitor = CameraMonitor(camera, self.settings, self.api)
            thread = threading.Thread(target=monitor.run, name=f"tamper-{camera.path_name}", daemon=True)
            thread.start()
            self.monitors[camera_id] = (monitor, thread)

    def _join_monitors(self) -> None:
        for monitor, thread in self.monitors.values():
            monitor.stop()
            thread.join(timeout=5)
        self.monitors.clear()


if __name__ == "__main__":
    MonitorSupervisor().run()
