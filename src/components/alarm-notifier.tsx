"use client";

import { AlertTriangle, Bell, Volume2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { io } from "socket.io-client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AlarmPayload {
  id?: string;
  type?: string;
  confidence?: number;
  detectedAt?: string;
  camera?: {
    name?: string;
    pathName?: string;
  };
  cameraId?: {
    name?: string;
    pathName?: string;
  } | null;
}

interface ToastItem {
  id: string;
  title: string;
  message: string;
}

function alarmCameraName(alarm: AlarmPayload) {
  return alarm.camera?.name ?? alarm.cameraId?.name ?? "Unknown camera";
}

function alarmMessage(alarm: AlarmPayload) {
  const type = alarm.type ?? "TAMPER";
  const confidence =
    typeof alarm.confidence === "number"
      ? ` · ${Math.round(alarm.confidence * 100)}% confidence`
      : "";
  return `${type} detected${confidence}`;
}

function vibrate() {
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  navigator.vibrate([250, 120, 250]);
}

function sendBrowserNotification(toast: ToastItem) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  new Notification(toast.title, {
    body: toast.message,
    icon: "/favicon.ico",
    tag: toast.id
  });
}

let audioContext: AudioContext | null = null;

function getAudioContext() {
  if (typeof window === "undefined") return null;
  const AudioContextConstructor =
    window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) return null;
  audioContext ??= new AudioContextConstructor();
  return audioContext;
}

async function playAlarmSound() {
  const context = getAudioContext();
  if (!context) return false;

  try {
    if (context.state === "suspended") {
      await context.resume();
    }

    const now = context.currentTime;
    const gain = context.createGain();
    gain.connect(context.destination);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.95);

    for (const [index, frequency] of [880, 660, 880].entries()) {
      const startAt = now + index * 0.28;
      const oscillator = context.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, startAt);
      oscillator.connect(gain);
      oscillator.start(startAt);
      oscillator.stop(startAt + 0.18);
    }

    return true;
  } catch {
    return false;
  }
}

export function AlarmNotifier() {
  const queryClient = useQueryClient();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [soundBlocked, setSoundBlocked] = useState(false);

  useEffect(() => {
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:3001";
    const socket = io(socketUrl, { transports: ["websocket", "polling"] });

    socket.on("alarm:created", (alarm: AlarmPayload) => {
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });

      const toast = {
        id: alarm.id ?? `${Date.now()}`,
        title: `${alarmCameraName(alarm)} tamper alarm`,
        message: alarmMessage(alarm)
      };

      vibrate();
      sendBrowserNotification(toast);
      void playAlarmSound().then((played) => setSoundBlocked(!played));
      setToasts((current) => [toast, ...current].slice(0, 4));
      window.setTimeout(() => {
        setToasts((current) => current.filter((item) => item.id !== toast.id));
      }, 10_000);
    });

    return () => {
      socket.disconnect();
    };
  }, [queryClient]);

  async function requestBrowserNotifications() {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "default") {
      await Notification.requestPermission();
    }
  }

  async function enableAlarmSound() {
    const played = await playAlarmSound();
    setSoundBlocked(!played);
  }

  if (!toasts.length) return null;

  const canRequestNotifications =
    typeof window !== "undefined" &&
    "Notification" in window &&
    Notification.permission === "default";

  return (
    <div className="fixed right-4 top-4 z-50 flex w-[min(420px,calc(100vw-2rem))] flex-col gap-3">
      {toasts.map((toast, index) => (
        <div
          key={toast.id}
          className={cn(
            "rounded-xl border border-red-500/40 bg-red-950/95 p-4 text-red-50 shadow-2xl backdrop-blur",
            index > 0 && "opacity-90"
          )}
        >
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-full bg-red-500/20 p-2">
              <AlertTriangle className="h-5 w-5 text-red-300" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{toast.title}</div>
              <div className="mt-1 text-sm text-red-100/80">{toast.message}</div>
              {canRequestNotifications && (
                <Button
                  className="mt-3 h-8 border-red-300/40 bg-red-500/10 px-3 text-xs text-red-50 hover:bg-red-500/20"
                  variant="outline"
                  onClick={requestBrowserNotifications}
                >
                  <Bell className="mr-2 h-3.5 w-3.5" />
                  Enable browser alerts
                </Button>
              )}
              {soundBlocked && (
                <Button
                  className="mt-3 h-8 border-red-300/40 bg-red-500/10 px-3 text-xs text-red-50 hover:bg-red-500/20"
                  variant="outline"
                  onClick={enableAlarmSound}
                >
                  <Volume2 className="mr-2 h-3.5 w-3.5" />
                  Enable alarm sound
                </Button>
              )}
            </div>
            <button
              className="rounded-md p-1 text-red-100/70 hover:bg-red-500/20 hover:text-red-50"
              onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}
              aria-label="Dismiss alarm"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
