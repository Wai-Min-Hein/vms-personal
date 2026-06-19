from __future__ import annotations

from abc import ABC, abstractmethod

import cv2
import numpy as np

from .config import Settings
from .types import Detection


def _confidence(value: float, threshold: float, scale: float) -> float:
    if scale <= 0:
        return 1.0
    return max(0.0, min(1.0, (value - threshold) / scale))


class Detector(ABC):
    @abstractmethod
    def analyze(self, frame: np.ndarray) -> Detection | None:
        raise NotImplementedError


class CoveredCameraDetector(Detector):
    def __init__(self, settings: Settings) -> None:
        self.threshold = settings.dark_brightness_threshold

    def analyze(self, frame: np.ndarray) -> Detection | None:
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        brightness = float(np.mean(gray))
        if brightness >= self.threshold:
            return None
        confidence = max(0.0, min(1.0, (self.threshold - brightness) / self.threshold))
        return Detection("COVERED", confidence, brightness)


class BlurDetector(Detector):
    def __init__(self, settings: Settings) -> None:
        self.threshold = settings.blur_laplacian_threshold

    def analyze(self, frame: np.ndarray) -> Detection | None:
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        variance = float(cv2.Laplacian(gray, cv2.CV_64F).var())
        if variance >= self.threshold:
            return None
        confidence = max(0.0, min(1.0, (self.threshold - variance) / self.threshold))
        return Detection("BLURRED", confidence, variance)


class OverexposureDetector(Detector):
    def __init__(self, settings: Settings) -> None:
        self.brightness_threshold = settings.overexposed_brightness_threshold
        self.pixel_threshold = settings.overexposed_pixel_threshold

    def analyze(self, frame: np.ndarray) -> Detection | None:
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        brightness = float(np.mean(gray))
        bright_ratio = float(np.mean(gray >= 245))
        if brightness < self.brightness_threshold and bright_ratio < self.pixel_threshold:
            return None
        brightness_confidence = _confidence(brightness, self.brightness_threshold, 255 - self.brightness_threshold)
        ratio_confidence = _confidence(bright_ratio, self.pixel_threshold, 1 - self.pixel_threshold)
        return Detection("OVEREXPOSED", max(brightness_confidence, ratio_confidence), max(brightness, bright_ratio))


class MovedCameraDetector(Detector):
    def __init__(self, settings: Settings) -> None:
        self.threshold = settings.moved_difference_threshold
        self.scale = settings.moved_confidence_scale
        self.warmup_frames = settings.reference_warmup_frames
        self.reference: np.ndarray | None = None
        self.samples: list[np.ndarray] = []

    def _prepare(self, frame: np.ndarray) -> np.ndarray:
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        resized = cv2.resize(gray, (320, 180), interpolation=cv2.INTER_AREA)
        return cv2.GaussianBlur(resized, (5, 5), 0)

    def analyze(self, frame: np.ndarray) -> Detection | None:
        current = self._prepare(frame)
        if self.reference is None:
            self.samples.append(current.astype(np.float32))
            if len(self.samples) >= self.warmup_frames:
                self.reference = np.mean(self.samples, axis=0).astype(np.uint8)
                self.samples.clear()
            return None

        difference = float(np.mean(cv2.absdiff(self.reference, current)))
        if difference < self.threshold:
            return None
        return Detection("MOVED", _confidence(difference, self.threshold, self.scale), difference)


def build_detectors(settings: Settings) -> list[Detector]:
    return [
        CoveredCameraDetector(settings),
        BlurDetector(settings),
        MovedCameraDetector(settings),
        OverexposureDetector(settings),
    ]
