import { spawn, type ChildProcess } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env";

interface ManagedProcess {
  process: ChildProcess;
  startedAt: Date;
}

class FfmpegProcessManager {
  private readonly processes = new Map<string, ManagedProcess>();

  async startRecording(cameraId: string, sourceUrl: string, cameraPath: string) {
    if (this.processes.has(cameraId)) throw new Error(`FFmpeg process already running for ${cameraId}`);
    const outputDirectory = path.resolve(env.RECORDINGS_PATH, cameraPath);
    await mkdir(outputDirectory, { recursive: true });
    const output = path.join(outputDirectory, "%Y-%m-%d_%H-%M-%S.mp4");
    const child = spawn(env.FFMPEG_PATH, [
      "-hide_banner", "-loglevel", "warning", "-rtsp_transport", "tcp",
      "-i", sourceUrl, "-map", "0", "-c", "copy", "-f", "segment",
      "-segment_time", "3600", "-reset_timestamps", "1", "-strftime", "1", output
    ], { stdio: ["ignore", "pipe", "pipe"] });
    this.processes.set(cameraId, { process: child, startedAt: new Date() });
    child.once("exit", () => this.processes.delete(cameraId));
    return child.pid;
  }

  async stop(cameraId: string) {
    const managed = this.processes.get(cameraId);
    if (!managed) return false;
    managed.process.kill("SIGTERM");
    const forced = setTimeout(() => managed.process.kill("SIGKILL"), 10_000);
    managed.process.once("exit", () => clearTimeout(forced));
    return true;
  }

  status(cameraId: string) {
    const managed = this.processes.get(cameraId);
    return managed ? { running: true, pid: managed.process.pid, startedAt: managed.startedAt } : { running: false };
  }

  async snapshot(sourceUrl: string, outputPath: string) {
    await mkdir(path.dirname(outputPath), { recursive: true });
    return new Promise<string>((resolve, reject) => {
      const child = spawn(env.FFMPEG_PATH, [
        "-hide_banner", "-loglevel", "error", "-rtsp_transport", "tcp",
        "-i", sourceUrl, "-frames:v", "1", "-y", outputPath
      ]);
      child.once("error", reject);
      child.once("exit", (code) => code === 0 ? resolve(outputPath) : reject(new Error(`FFmpeg exited with code ${code}`)));
    });
  }
}

export const ffmpegManager = new FfmpegProcessManager();
