import { loadEnvConfig } from "@next/env";
import { z } from "zod";

loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

const serverSchema = z.object({
  MONGODB_URI: z.string().min(1),
  AUTH_SECRET: z.string().min(32),
  MEDIAMTX_API_URL: z.string().url().default("http://localhost:9997"),
  MEDIAMTX_PLAYBACK_URL: z.string().url().default("http://localhost:9996"),
  TAMPER_RTSP_BASE_URL: z.string().url().default("rtsp://localhost:8554"),
  ALARM_INGEST_TOKEN: z.string().min(24).optional(),
  REALTIME_INTERNAL_URL: z.string().url().optional(),
  MEDIAMTX_API_USERNAME: z.string().optional(),
  MEDIAMTX_API_PASSWORD: z.string().optional(),
  FFMPEG_PATH: z.string().default("ffmpeg"),
  FFPROBE_PATH: z.string().default("ffprobe"),
  RECORDINGS_PATH: z.string().default("./recordings")
});

const clientSchema = z.object({
  NEXT_PUBLIC_MEDIAMTX_API_URL: z.string().url().default("http://localhost:9997"),
  NEXT_PUBLIC_MEDIAMTX_HLS_URL: z.string().url().default("http://localhost:8888"),
  NEXT_PUBLIC_MEDIAMTX_WEBRTC_URL: z.string().url().default("http://localhost:8889"),
  NEXT_PUBLIC_MEDIAMTX_PLAYBACK_URL: z.string().url().default("http://localhost:9996"),
  NEXT_PUBLIC_SOCKET_URL: z.string().url().default("http://localhost:3001"),
  NEXT_PUBLIC_APP_NAME: z.string().default("Sentinel VMS")
});

export const env = serverSchema.parse({
  MONGODB_URI: process.env.MONGODB_URI,
  AUTH_SECRET: process.env.AUTH_SECRET,
  MEDIAMTX_API_URL: process.env.MEDIAMTX_API_URL,
  MEDIAMTX_PLAYBACK_URL: process.env.MEDIAMTX_PLAYBACK_URL,
  TAMPER_RTSP_BASE_URL: process.env.TAMPER_RTSP_BASE_URL,
  ALARM_INGEST_TOKEN: process.env.ALARM_INGEST_TOKEN,
  REALTIME_INTERNAL_URL: process.env.REALTIME_INTERNAL_URL,
  MEDIAMTX_API_USERNAME: process.env.MEDIAMTX_API_USERNAME,
  MEDIAMTX_API_PASSWORD: process.env.MEDIAMTX_API_PASSWORD,
  FFMPEG_PATH: process.env.FFMPEG_PATH,
  FFPROBE_PATH: process.env.FFPROBE_PATH,
  RECORDINGS_PATH: process.env.RECORDINGS_PATH
});

export const publicEnv = clientSchema.parse({
  NEXT_PUBLIC_MEDIAMTX_API_URL: process.env.NEXT_PUBLIC_MEDIAMTX_API_URL,
  NEXT_PUBLIC_MEDIAMTX_HLS_URL: process.env.NEXT_PUBLIC_MEDIAMTX_HLS_URL,
  NEXT_PUBLIC_MEDIAMTX_WEBRTC_URL: process.env.NEXT_PUBLIC_MEDIAMTX_WEBRTC_URL,
  NEXT_PUBLIC_MEDIAMTX_PLAYBACK_URL: process.env.NEXT_PUBLIC_MEDIAMTX_PLAYBACK_URL,
  NEXT_PUBLIC_SOCKET_URL: process.env.NEXT_PUBLIC_SOCKET_URL,
  NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME
});
