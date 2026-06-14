import { z } from "zod";
import { STREAM_TYPES } from "@/models/constants";

const pathName = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-zA-Z0-9_-]+$/, "Use letters, numbers, underscores, or hyphens");

export const cameraInputSchema = z.object({
  name: z.string().trim().min(2).max(100),
  pathName,
  description: z.string().trim().max(500).optional().nullable(),
  location: z.string().trim().max(120).optional().nullable(),
  groupId: z.string().regex(/^[a-f\d]{24}$/i).optional().nullable(),
  sourceUrl: z.string().trim().url(),
  streamType: z.enum(STREAM_TYPES),
  enabled: z.boolean().default(true),
  recordingEnabled: z.boolean().default(false),
  retentionDays: z.number().int().min(1).max(3650).default(30),
  recordSegmentDuration: z.number().int().min(10).max(86400).default(3600)
});

export const cameraPatchSchema = cameraInputSchema.partial();

export type CameraInput = z.infer<typeof cameraInputSchema>;
export type CameraPatch = z.infer<typeof cameraPatchSchema>;
