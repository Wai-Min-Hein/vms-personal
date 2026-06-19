"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity, AlertTriangle, Camera, CircleOff, Database, Download, Radio, Upload, Video } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageHeading } from "@/components/page-heading";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api-client";
import { formatBytes } from "@/lib/utils";

interface DashboardData {
  totals: {
    cameras: number; online: number; offline: number; recording: number; storageBytes: number;
    recordings: number; activeReaders: number; inboundBytes: number; outboundBytes: number; activeAlarms: number;
  };
  history: Array<{ time: string; inbound: number; outbound: number; online: number }>;
  recentAlarms: Array<{
    id: string;
    type: string;
    confidence: number;
    detectedAt: string;
    cameraId?: { name?: string; pathName?: string } | null;
  }>;
}

export function DashboardView() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api<DashboardData>("/api/dashboard"),
    refetchInterval: 5_000
  });

  const cards = data ? [
    ["Total Cameras", data.totals.cameras, Camera],
    ["Online", data.totals.online, Radio],
    ["Offline", data.totals.offline, CircleOff],
    ["Recording", data.totals.recording, Video],
    ["Storage Used", formatBytes(data.totals.storageBytes), Database],
    ["Recordings", data.totals.recordings, Activity],
    ["Active Readers", data.totals.activeReaders, Activity],
    ["Inbound", formatBytes(data.totals.inboundBytes), Download],
    ["Outbound", formatBytes(data.totals.outboundBytes), Upload],
    ["Active Alarms", data.totals.activeAlarms, AlertTriangle]
  ] as const : [];

  return (
    <>
      <PageHeading title="Operations Dashboard" description="Live system health and video infrastructure telemetry." />
      {error && <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">{error.message}</div>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
        {isLoading
          ? Array.from({ length: 9 }).map((_, index) => <div key={index} className="h-28 animate-pulse rounded-xl bg-muted" />)
          : cards.map(([label, value, Icon]) => (
              <Card key={label}>
                <CardContent className="flex items-center justify-between p-5">
                  <div><p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div>
                  <Icon className="h-6 w-6 text-primary" />
                </CardContent>
              </Card>
            ))}
      </div>
      <Card className="mt-6">
        <CardHeader><CardTitle>Bandwidth History</CardTitle></CardHeader>
        <CardContent className="h-80">
          {data?.history.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.history}>
                <defs>
                  <linearGradient id="inbound" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#22d3ee" stopOpacity={0.5}/><stop offset="95%" stopColor="#22d3ee" stopOpacity={0}/></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="time" tickFormatter={(value) => new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} fontSize={11} />
                <YAxis tickFormatter={(value) => formatBytes(value)} fontSize={11} />
                <Tooltip labelFormatter={(value) => new Date(value).toLocaleString()} formatter={(value) => formatBytes(Number(value))} />
                <Area type="monotone" dataKey="inbound" stroke="#22d3ee" fill="url(#inbound)" />
                <Area type="monotone" dataKey="outbound" stroke="#818cf8" fillOpacity={0} />
              </AreaChart>
            </ResponsiveContainer>
          ) : <div className="grid h-full place-items-center text-sm text-muted-foreground">Metric history appears after the monitoring worker starts.</div>}
        </CardContent>
      </Card>
      <Card className="mt-6">
        <CardHeader><CardTitle>Recent Tamper Alarms</CardTitle></CardHeader>
        <CardContent>
          {data?.recentAlarms?.length ? (
            <div className="divide-y divide-border">
              {data.recentAlarms.map((alarm) => (
                <div key={alarm.id} className="flex items-center justify-between gap-4 py-3 text-sm">
                  <div>
                    <div className="font-medium">{alarm.cameraId?.name ?? "Unknown camera"}</div>
                    <div className="text-muted-foreground">{alarm.type} · {Math.round(alarm.confidence * 100)}%</div>
                  </div>
                  <div className="text-right text-muted-foreground">
                    {new Date(alarm.detectedAt).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-muted-foreground">No tamper alarms detected.</div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
