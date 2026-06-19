from dataclasses import dataclass


@dataclass(frozen=True)
class CameraSource:
    id: str
    name: str
    path_name: str
    rtsp_url: str


@dataclass(frozen=True)
class Detection:
    tamper_type: str
    confidence: float
    metric: float
