"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Power, RefreshCw, Trash2 } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { api } from "@/lib/api-client";
import type { CameraView } from "@/types";
import { CameraForm } from "./camera-form";

export function CamerasView() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CameraView | null>(null);
  const cameras = useQuery({ queryKey: ["cameras"], queryFn: () => api<CameraView[]>("/api/cameras"), refetchInterval: 5_000 });
  const save = useMutation({
    mutationFn: (values: unknown) => api(editing ? `/api/cameras/${editing.id}` : "/api/cameras", {
      method: editing ? "PUT" : "POST", body: JSON.stringify(values)
    }),
    onSuccess: () => { setOpen(false); setEditing(null); queryClient.invalidateQueries({ queryKey: ["cameras"] }); }
  });
  const action = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      name === "delete"
        ? api(`/api/cameras/${id}`, { method: "DELETE" })
        : api(`/api/cameras/${id}/actions`, { method: "POST", body: JSON.stringify({ action: name }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cameras"] })
  });
  const formInitial = useMemo(() => editing ? {
      name: editing.name,
      pathName: editing.pathName,
      description: editing.description ?? "",
      location: editing.location ?? "",
      sourceUrl: editing.sourceUrl,
      streamType: editing.streamType,
      enabled: editing.enabled,
      recordingEnabled: editing.recordingEnabled,
      retentionDays: editing.retentionDays,
      recordSegmentDuration: editing.recordSegmentDuration
    } : undefined,
    [editing]
  );

  return (
    <>
      <PageHeading title="Cameras" description="Manage stream sources and MediaMTX paths without service restarts." action={
        <Dialog open={open} onOpenChange={(value) => { setOpen(value); if (!value) setEditing(null); }}>
          <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Add Camera</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? "Edit camera" : "Add camera"}</DialogTitle><DialogDescription>Changes are applied to MediaMTX immediately.</DialogDescription></DialogHeader>
            <CameraForm
              key={editing?.id ?? "new-camera"}
              initial={formInitial}
              loading={save.isPending}
              onSubmit={(values) => save.mutate(values)}
            />
            {save.error && <p className="mt-3 text-sm text-red-500">{save.error.message}</p>}
          </DialogContent>
        </Dialog>
      } />
      {cameras.error && <p className="mb-4 text-sm text-red-500">{cameras.error.message}</p>}
      {action.error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">
          {action.error.message}
        </div>
      )}
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead className="border-b text-xs uppercase text-muted-foreground"><tr>{["Camera", "Location", "Type", "Status", "Recording", "Readers", "Actions"].map((h) => <th className="px-5 py-4 font-medium" key={h}>{h}</th>)}</tr></thead>
            <tbody className="divide-y">
              {cameras.data?.map((camera) => (
                <tr key={camera.id} className="hover:bg-muted/30">
                  <td className="px-5 py-4"><button className="text-left" onClick={() => { setEditing(camera); setOpen(true); }}><div className="font-medium">{camera.name}</div><div className="text-xs text-muted-foreground">{camera.pathName}</div></button></td>
                  <td className="px-5 py-4 text-muted-foreground">{camera.location || "Unassigned"}</td>
                  <td className="px-5 py-4">{camera.streamType}</td>
                  <td className="px-5 py-4"><Badge variant={!camera.enabled ? "warning" : camera.runtime?.ready ? "success" : "destructive"}>{!camera.enabled ? "DISABLED" : camera.runtime?.ready ? "ONLINE" : "OFFLINE"}</Badge></td>
                  <td className="px-5 py-4"><Badge variant={camera.recordingEnabled ? "success" : "default"}>{camera.recordingEnabled ? "ON" : "OFF"}</Badge></td>
                  <td className="px-5 py-4">{camera.runtime?.readers ?? 0}</td>
                  <td className="px-5 py-4">
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" title="Edit" onClick={() => { setEditing(camera); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Restart"
                        disabled={action.isPending || !camera.enabled}
                        onClick={() => action.mutate({ id: camera.id, name: "restart" })}
                      >
                        <RefreshCw className={`h-4 w-4 ${action.isPending ? "animate-spin" : ""}`} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title={camera.enabled ? "Disable" : "Enable"}
                        disabled={action.isPending}
                        onClick={() => action.mutate({ id: camera.id, name: camera.enabled ? "disable" : "enable" })}
                      >
                        <Power className={`h-4 w-4 ${camera.enabled ? "text-emerald-500" : "text-muted-foreground"}`} />
                      </Button>
                      <Button variant="ghost" size="icon" title="Delete" onClick={() => confirm(`Delete ${camera.name}?`) && action.mutate({ id: camera.id, name: "delete" })}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!cameras.isLoading && !cameras.data?.length && <div className="p-10 text-center text-sm text-muted-foreground">No cameras configured.</div>}
        </CardContent>
      </Card>
    </>
  );
}
