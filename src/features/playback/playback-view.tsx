"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeading } from "@/components/page-heading";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  NormalizedRecordingPlayer,
  type PlaybackSegment
} from "@/features/recordings/normalized-recording-player";
import { api } from "@/lib/api-client";

type Segment = PlaybackSegment;
interface Recording { name: string; segments: Segment[] }
interface Response { items: Recording[] }

export function PlaybackView() {
  const [camera, setCamera] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [segment, setSegment] = useState<Segment | null>(null);
  const recordings = useQuery({ queryKey: ["recordings"], queryFn: () => api<Response>("/api/recordings") });
  const cameras = recordings.data?.items ?? [];
  const segments = useMemo(() => cameras.find((item) => item.name === camera)?.segments.filter((item) => item.start.startsWith(date)) ?? [], [camera, cameras, date]);

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
          <NormalizedRecordingPlayer segment={segment} snapshotName="playback" />
        </CardContent></Card>
        <Card><CardContent className="max-h-[600px] overflow-y-auto p-3">
          <div className="mb-3 px-2 text-sm font-medium">Timeline segments</div>
          <div className="space-y-2">{segments.map((item) => <button key={item.start} onClick={() => setSegment(item)} className={`w-full rounded-md border p-3 text-left text-sm ${segment?.start === item.start ? "border-primary bg-primary/10" : "hover:bg-accent"}`}><div>{new Date(item.start).toLocaleTimeString()}</div><div className="mt-1 text-xs text-muted-foreground">{item.active ? "Recording..." : typeof item.duration === "number" && Number.isFinite(item.duration) ? `${Math.round(item.duration)} seconds` : "Duration unavailable"}</div></button>)}</div>
          {!segments.length && <p className="p-6 text-center text-sm text-muted-foreground">No segments for this date.</p>}
        </CardContent></Card>
      </div>
    </>
  );
}
