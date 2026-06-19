from dataclasses import dataclass
import os


def _float(name: str, default: float) -> float:
    value = os.getenv(name)
    return default if value is None else float(value)


def _int(name: str, default: int) -> int:
    value = os.getenv(name)
    return default if value is None else int(value)


@dataclass(frozen=True)
class Settings:
    app_base_url: str
    ingest_token: str
    screenshot_dir: str
    poll_interval_seconds: int
    frame_interval_seconds: float
    consecutive_frames: int
    cooldown_seconds: int
    connect_retry_seconds: int
    dark_brightness_threshold: float
    overexposed_brightness_threshold: float
    overexposed_pixel_threshold: float
    blur_laplacian_threshold: float
    moved_difference_threshold: float
    moved_confidence_scale: float
    reference_warmup_frames: int


def load_settings() -> Settings:
    token = os.getenv("ALARM_INGEST_TOKEN", "")
    if not token:
        raise RuntimeError("ALARM_INGEST_TOKEN is required")

    return Settings(
        app_base_url=os.getenv("APP_BASE_URL", "http://localhost:3000").rstrip("/"),
        ingest_token=token,
        screenshot_dir=os.getenv("TAMPER_SCREENSHOT_DIR", "/tamper-screenshots"),
        poll_interval_seconds=_int("TAMPER_CAMERA_POLL_SECONDS", 10),
        frame_interval_seconds=_float("TAMPER_FRAME_INTERVAL_SECONDS", 1.0),
        consecutive_frames=_int("TAMPER_CONSECUTIVE_FRAMES", 4),
        cooldown_seconds=_int("TAMPER_COOLDOWN_SECONDS", 300),
        connect_retry_seconds=_int("TAMPER_CONNECT_RETRY_SECONDS", 5),
        dark_brightness_threshold=_float("TAMPER_DARK_BRIGHTNESS", 35.0),
        overexposed_brightness_threshold=_float("TAMPER_OVEREXPOSED_BRIGHTNESS", 230.0),
        overexposed_pixel_threshold=_float("TAMPER_OVEREXPOSED_PIXEL_RATIO", 0.55),
        blur_laplacian_threshold=_float("TAMPER_BLUR_LAPLACIAN", 55.0),
        moved_difference_threshold=_float("TAMPER_MOVED_DIFF", 28.0),
        moved_confidence_scale=_float("TAMPER_MOVED_CONFIDENCE_SCALE", 80.0),
        reference_warmup_frames=_int("TAMPER_REFERENCE_WARMUP_FRAMES", 5),
    )
