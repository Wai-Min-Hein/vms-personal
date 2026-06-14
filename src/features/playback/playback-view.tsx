"use client";

import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Camera, FastForward, Pause, Play, Rewind } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api-client";

interface Segment { start: string; duration?: number | null; url?: string }
interface Recording { name: string; segments: Segment[] }
interface Response { items: Recording[] }

export function PlaybackView() {
  const video = useRef<HTMLVideoElement>(null);
  const [camera, setCamera] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [segment, setSegment] = useState<Segment | null>(null);
  const recordings = useQuery({ queryKey: ["recordings"], queryFn: () => api<Response>("/api/recordings") });
  const cameras = recordings.data?.items ?? [];
  const segments = useMemo(() => cameras.find((item) => item.name === camera)?.segments.filter((item) => item.start.startsWith(date)) ?? [], [camera, cameras, date]);

  function snapshot() {
    if (!video.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.current.videoWidth; canvas.height = video.current.videoHeight;
    canvas.getContext("2d")?.drawImage(video.current, 0, 0);
    const link = document.createElement("a"); link.download = `playback-${Date.now()}.jpg`; link.href = canvas.toDataURL("image/jpeg"); link.click();
  }
  return (
    <>
      <PageHeading title="Playback" description="Review archived video by camera, date, and recording segment." />
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <select className="h-10 rounded-md border bg-background px-3 text-sm" value={camera} onChange={(e) => { setCamera(e.target.value); setSegment(null); }}>
          <option value="">Select camera</option>{cameras.map((item) => <option key={item.name}>{item.name}</option>)}
        </select>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
        <Card><CardContent className="p-3">
          <div className="aspect-video overflow-hidden rounded-lg bg-black"><video ref={video} className="h-full w-full" src={segment?.url} controls={false} /></div>
          <div className="mt-3 flex items-center justify-center gap-2">
            <Button variant="outline" size="icon" onClick={() => { if (video.current) video.current.currentTime -= 10; }}><Rewind className="h-4 w-4" /></Button>
            <Button size="icon" onClick={() => video.current?.paused ? video.current.play() : video.current?.pause()}>{video.current?.paused === false ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</Button>
            <Button variant="outline" size="icon" onClick={() => { if (video.current) video.current.currentTime += 10; }}><FastForward className="h-4 w-4" /></Button>
            <Button variant="outline" size="icon" onClick={snapshot}><Camera className="h-4 w-4" /></Button>
          </div>
        </CardContent></Card>
        <Card><CardContent className="max-h-[600px] overflow-y-auto p-3">
          <div className="mb-3 px-2 text-sm font-medium">Timeline segments</div>
          <div className="space-y-2">{segments.map((item) => <button key={item.start} onClick={() => setSegment(item)} className={`w-full rounded-md border p-3 text-left text-sm ${segment?.start === item.start ? "border-primary bg-primary/10" : "hover:bg-accent"}`}><div>{new Date(item.start).toLocaleTimeString()}</div><div className="mt-1 text-xs text-muted-foreground">{typeof item.duration === "number" && Number.isFinite(item.duration) ? `${Math.round(item.duration)} seconds` : "Recording..."}</div></button>)}</div>
          {!segments.length && <p className="p-6 text-center text-sm text-muted-foreground">No segments for this date.</p>}
        </CardContent></Card>
      </div>
    </>
  );
}
