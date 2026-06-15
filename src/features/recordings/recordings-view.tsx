"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Play, Search, Trash2 } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  NormalizedRecordingPlayer,
  type PlaybackSegment
} from "./normalized-recording-player";
import { api } from "@/lib/api-client";

type Segment = PlaybackSegment;
interface Recording { name: string; segments: Segment[] }
interface Response { items: Recording[] }

export function RecordingsView() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [date, setDate] = useState("");
  const [preview, setPreview] = useState<(Segment & { camera: string }) | null>(null);
  const recordings = useQuery({ queryKey: ["recordings"], queryFn: () => api<Response>("/api/recordings"), refetchInterval: 10_000 });
  const remove = useMutation({
    mutationFn: ({ camera, segment }: { camera: string; segment: Segment }) => {
      if (typeof segment.duration !== "number" || !Number.isFinite(segment.duration)) {
        throw new Error("The recording is still being finalized.");
      }
      const end = new Date(new Date(segment.start).getTime() + segment.duration * 1000).toISOString();
      return api(`/api/recordings?camera=${encodeURIComponent(camera)}&start=${encodeURIComponent(segment.start)}&end=${encodeURIComponent(end)}`, { method: "DELETE" });
    },
    onMutate: async ({ camera, segment }) => {
      await queryClient.cancelQueries({ queryKey: ["recordings"] });
      const previous = queryClient.getQueryData<Response>(["recordings"]);
      queryClient.setQueryData<Response>(["recordings"], (current) => {
        if (!current) return current;
        return {
          ...current,
          items: current.items
            .map((recording) =>
              recording.name === camera
                ? {
                    ...recording,
                    segments: recording.segments.filter(
                      (item) => item.start !== segment.start
                    )
                  }
                : recording
            )
            .filter((recording) => recording.segments.length > 0)
        };
      });
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["recordings"], context.previous);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["recordings"] })
  });
  const rows = useMemo(() => (recordings.data?.items ?? []).flatMap((recording) =>
    recording.segments.map((segment) => ({ camera: recording.name, ...segment }))
  ).filter((row) =>
    row.camera.toLowerCase().includes(search.toLowerCase()) &&
    (!date || row.start.startsWith(date))
  ), [date, recordings.data, search]);

  return (
    <>
      <PageHeading title="Recordings" description="Search, preview, download, and enforce retention across camera archives." />
      {remove.error instanceof Error && (
        <div className="mb-4 rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {remove.error.message}
        </div>
      )}
      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_220px]">
        <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search camera..." className="pl-9" /></div>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <Card><CardContent className="overflow-x-auto p-0">
        <table className="w-full min-w-[700px] text-left text-sm">
          <thead className="border-b text-xs uppercase text-muted-foreground"><tr><th className="px-5 py-4">Camera</th><th className="px-5 py-4">Started</th><th className="px-5 py-4">Duration</th><th className="px-5 py-4">Actions</th></tr></thead>
          <tbody className="divide-y">{rows.map((row) => (
            <tr key={`${row.camera}-${row.start}`}>
              <td className="px-5 py-4 font-medium">{row.camera}</td>
              <td className="px-5 py-4 text-muted-foreground">{new Date(row.start).toLocaleString()}</td>
              <td className="px-5 py-4">
                {row.active
                  ? "Recording..."
                  : typeof row.duration === "number" && Number.isFinite(row.duration)
                  ? `${Math.round(row.duration)}s`
                  : "Unavailable"}
              </td>
              <td className="px-5 py-4"><div className="flex gap-1">
                {row.url && <><Button variant="ghost" size="icon" title="Preview" onClick={() => setPreview(row)}><Play className="h-4 w-4" /></Button><Button asChild variant="ghost" size="icon"><a href={row.url} download><Download className="h-4 w-4" /></a></Button></>}
                <Button variant="ghost" size="icon" disabled={remove.isPending || row.active || typeof row.duration !== "number" || !Number.isFinite(row.duration)} onClick={() => confirm("Delete this recording segment?") && remove.mutate({ camera: row.camera, segment: row })}><Trash2 className="h-4 w-4 text-red-500" /></Button>
              </div></td>
            </tr>
          ))}</tbody>
        </table>
        {!rows.length && <div className="p-10 text-center text-sm text-muted-foreground">No recording segments match the filters.</div>}
      </CardContent></Card>
      <Dialog open={Boolean(preview)} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{preview?.camera} recording</DialogTitle>
            <DialogDescription>
              {preview ? new Date(preview.start).toLocaleString() : ""}
            </DialogDescription>
          </DialogHeader>
          <NormalizedRecordingPlayer
            segment={preview}
            snapshotName={preview?.camera ?? "recording"}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
