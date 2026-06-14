"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const schema = z.object({
  name: z.string().min(2, "Name is required"),
  pathName: z.string().regex(/^[a-zA-Z0-9_-]+$/, "Letters, numbers, underscores, or hyphens only"),
  description: z.string().optional(),
  location: z.string().optional(),
  sourceUrl: z.string().url("Enter a valid stream URL"),
  streamType: z.enum(["RTSP", "RTMP", "HLS", "SRT", "UDP_MPEGTS", "IP_WEBCAM", "LARIX"]),
  enabled: z.boolean(),
  recordingEnabled: z.boolean(),
  retentionDays: z.number().int().min(1).max(3650),
  recordSegmentDuration: z.number().int().min(10).max(86400)
});
type Values = z.infer<typeof schema>;

const defaults: Values = {
  name: "",
  pathName: "",
  description: "",
  location: "",
  sourceUrl: "",
  streamType: "RTSP",
  enabled: true,
  recordingEnabled: false,
  retentionDays: 30,
  recordSegmentDuration: 3600
};

export function CameraForm({
  initial,
  loading,
  onSubmit
}: {
  initial?: Partial<Values>;
  loading?: boolean;
  onSubmit: (values: Values) => void;
}) {
  const { register, handleSubmit, reset, formState: { errors } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { ...defaults, ...initial }
  });

  useEffect(() => {
    reset({ ...defaults, ...initial });
  }, [initial, reset]);
  const field = (name: keyof Values, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <label className="mb-1.5 block text-sm font-medium" htmlFor={name}>{label}</label>
      <Input id={name} {...register(name, props.type === "number" ? { valueAsNumber: true } : undefined)} {...props} />
      {errors[name] && <p className="mt-1 text-xs text-red-500">{errors[name]?.message}</p>}
    </div>
  );
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        {field("name", "Camera name")}
        {field("pathName", "MediaMTX path")}
        {field("location", "Location")}
        <div>
          <label className="mb-1.5 block text-sm font-medium" htmlFor="streamType">Source type</label>
          <select id="streamType" className="h-10 w-full rounded-md border bg-background px-3 text-sm" {...register("streamType")}>
            {["RTSP", "RTMP", "HLS", "SRT", "UDP_MPEGTS", "IP_WEBCAM", "LARIX"].map((value) => <option key={value}>{value}</option>)}
          </select>
        </div>
      </div>
      {field("sourceUrl", "Source URL")}
      {field("description", "Description")}
      <div className="grid gap-4 sm:grid-cols-2">
        {field("retentionDays", "Retention days", { type: "number" })}
        {field("recordSegmentDuration", "Segment duration (seconds)", { type: "number" })}
      </div>
      <div className="flex flex-wrap gap-6">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" {...register("enabled")} /> Enabled</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" {...register("recordingEnabled")} /> Automatic recording</label>
      </div>
      <div className="flex justify-end"><Button disabled={loading}>{loading ? "Saving..." : "Save camera"}</Button></div>
    </form>
  );
}
