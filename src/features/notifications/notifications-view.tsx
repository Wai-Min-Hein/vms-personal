"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api-client";

interface Notice { id: string; title: string; message: string; severity: string; acknowledged: boolean; createdAt: string }

export function NotificationsView() {
  const client = useQueryClient();
  const notices = useQuery({ queryKey: ["notifications"], queryFn: () => api<Notice[]>("/api/notifications"), refetchInterval: 5_000 });
  const acknowledge = useMutation({ mutationFn: (id: string) => api("/api/notifications", { method: "PATCH", body: JSON.stringify({ id }) }), onSuccess: () => client.invalidateQueries({ queryKey: ["notifications"] }) });
  return (
    <>
      <PageHeading title="Notifications" description="Camera, recording, storage, and platform alerts." />
      <Card><CardContent className="divide-y p-0">{notices.data?.map((notice) => (
        <div key={notice.id} className={`flex items-start gap-4 p-5 ${notice.acknowledged ? "opacity-60" : ""}`}>
          <Badge variant={notice.severity === "INFO" ? "success" : notice.severity === "WARNING" ? "warning" : "destructive"}>{notice.severity}</Badge>
          <div className="flex-1"><div className="font-medium">{notice.title}</div><p className="mt-1 text-sm text-muted-foreground">{notice.message}</p><p className="mt-2 text-xs text-muted-foreground">{new Date(notice.createdAt).toLocaleString()}</p></div>
          {!notice.acknowledged && <Button variant="ghost" size="icon" onClick={() => acknowledge.mutate(notice.id)}><Check className="h-4 w-4" /></Button>}
        </div>
      ))}{!notices.data?.length && <div className="p-10 text-center text-sm text-muted-foreground">No notifications.</div>}</CardContent></Card>
    </>
  );
}
