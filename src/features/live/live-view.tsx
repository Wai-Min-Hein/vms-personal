"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Grid2X2, Grid3X3, Maximize } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { useLiveStore } from "@/store/live-store";
import type { CameraView } from "@/types";
import { VideoPlayer } from "./video-player";

export function LiveView() {
  const { columns, cameraIds, setColumns, setCameras, moveCamera } = useLiveStore();
  const cameras = useQuery({ queryKey: ["live"], queryFn: () => api<CameraView[]>("/api/live"), refetchInterval: 5_000 });

  useEffect(() => {
    if (!cameras.data) return;

    const availableIds = cameras.data.map((camera) => camera.id);
    const availableSet = new Set(availableIds);
    const retainedIds = cameraIds.filter((id) => availableSet.has(id));
    const retainedSet = new Set(retainedIds);
    const newIds = availableIds.filter((id) => !retainedSet.has(id));
    const nextIds = [...retainedIds, ...newIds];

    if (
      nextIds.length !== cameraIds.length ||
      nextIds.some((id, index) => id !== cameraIds[index])
    ) {
      setCameras(nextIds);
    }
  }, [cameraIds, cameras.data, setCameras]);

  const ordered = cameraIds.map((id) => cameras.data?.find((camera) => camera.id === id)).filter(Boolean) as CameraView[];
  return (
    <>
      <PageHeading title="Live View" description="Low-latency WebRTC with automatic HLS fallback and recovery." action={
        <div className="flex gap-1 rounded-lg border p-1">
          {([1, 2, 3, 4] as const).map((value) => (
            <Button key={value} size="icon" variant={columns === value ? "default" : "ghost"} onClick={() => setColumns(value)} title={`${value} columns`}>
              {value === 1 ? <Maximize className="h-4 w-4" /> : value === 2 ? <Grid2X2 className="h-4 w-4" /> : <Grid3X3 className="h-4 w-4" />}
            </Button>
          ))}
        </div>
      } />
      <div className={cn("grid gap-3", columns === 1 && "grid-cols-1", columns === 2 && "grid-cols-1 xl:grid-cols-2", columns === 3 && "grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3", columns === 4 && "grid-cols-1 lg:grid-cols-2 2xl:grid-cols-4")}>
        {ordered.slice(0, columns * columns).map((camera, index) => (
          <div
            key={camera.id}
            draggable
            onDragStart={(event) => event.dataTransfer.setData("index", String(index))}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => moveCamera(Number(event.dataTransfer.getData("index")), index)}
          >
            <VideoPlayer camera={camera} />
          </div>
        ))}
      </div>
      {!cameras.isLoading && !ordered.length && <div className="grid h-64 place-items-center rounded-xl border text-sm text-muted-foreground">No enabled cameras are available.</div>}
    </>
  );
}
