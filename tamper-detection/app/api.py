from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

import requests

from .config import Settings
from .types import CameraSource


class ApiClient:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.session = requests.Session()
        self.session.headers.update({
            "Authorization": f"Bearer {settings.ingest_token}",
            "Content-Type": "application/json",
        })

    def fetch_enabled_cameras(self) -> list[CameraSource]:
        response = self.session.get(f"{self.settings.app_base_url}/api/tamper/cameras", timeout=10)
        self._raise_for_status(response)
        cameras = response.json()
        return [
            CameraSource(
                id=str(camera["id"]),
                name=str(camera["name"]),
                path_name=str(camera["pathName"]),
                rtsp_url=str(camera["rtspUrl"]),
            )
            for camera in cameras
        ]

    def send_alarm(
        self,
        camera: CameraSource,
        tamper_type: str,
        confidence: float,
        screenshot_path: Path,
        timestamp: datetime,
    ) -> None:
        payload = {
            "cameraId": camera.id,
            "type": tamper_type,
            "confidence": round(float(confidence), 4),
            "screenshotPath": str(screenshot_path),
            "timestamp": timestamp.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
        }
        response = self.session.post(f"{self.settings.app_base_url}/api/alarms", json=payload, timeout=10)
        self._raise_for_status(response)

    def _raise_for_status(self, response: requests.Response) -> None:
        try:
            response.raise_for_status()
        except requests.HTTPError as error:
            body = response.text[:1000]
            raise requests.HTTPError(f"{error}; response={body}", response=response) from error
