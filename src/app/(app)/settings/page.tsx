import { PageHeading } from "@/components/page-heading";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function SettingsPage() {
  return (
    <>
      <PageHeading title="Settings" description="Runtime endpoints are managed through validated environment configuration." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>MediaMTX VMS</CardTitle></CardHeader><CardContent className="space-y-2 text-sm"><p>API: server-side <code className="text-primary">MEDIAMTX_API_URL</code></p><p>HLS: <code className="text-primary">NEXT_PUBLIC_MEDIAMTX_HLS_URL</code></p><p>WebRTC: <code className="text-primary">NEXT_PUBLIC_MEDIAMTX_WEBRTC_URL</code></p></CardContent></Card>
        <Card><CardHeader><CardTitle>Recording Policy</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">Retention and segment duration are configured per camera and applied dynamically through the MediaMTX v3 API.</CardContent></Card>
      </div>
    </>
  );
}
