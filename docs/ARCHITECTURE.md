# Sentinel VMS Architecture

## Runtime data flow

```text
Camera sources
  -> Simulator or physical camera
  -> MediaMTX VMS dynamic paths
  -> MediaMTX fMP4 recorder / optional FFmpeg jobs
  -> Recording and playback APIs
  -> Next.js route handlers
  -> TanStack Query dashboard
```

## Ownership boundaries

- **MediaMTX** owns stream ingress, protocol conversion, path readiness, active readers, and segment creation.
- **MongoDB** owns users, permissions, camera intent, retention policy, recording catalog metadata, notifications, audits, and historical metrics through Mongoose schemas and indexes.
- **Next.js** is the authenticated control plane and operator interface. It never edits MediaMTX YAML for camera changes.
- **Monitor worker** polls MediaMTX every five seconds, persists health samples, and emits transition-only alerts.
- **FFmpeg manager** is reserved for isolated jobs such as snapshots, export/transcode, or deployments where MediaMTX recording is insufficient.

## Consistency

Camera creation configures MediaMTX first and compensates by deleting the path if the database write fails. Renames create the replacement path before switching database metadata and deleting the old path. These operations cannot be a distributed ACID transaction, so compensating actions and audit logs are used.

## Streaming

The browser attempts WHEP/WebRTC first. If negotiation fails, it falls back to HLS.js or native HLS. RTSP is intentionally not sent to browsers; MediaMTX is the RTSP proxy and protocol gateway.

## Security

Sessions are signed, HTTP-only, same-site cookies. Route handlers enforce permissions independently of UI visibility. Camera source credentials remain server-side except for administrative camera responses; production deployments should encrypt source URLs at rest or store credentials in a secret manager.

## Scale

Run multiple stateless Next.js replicas behind a load balancer. Run one monitoring worker under a distributed lease in larger deployments. Store recordings on shared object/NFS storage, front HLS/WebRTC with appropriate network routing, and use a MongoDB replica set for transactions and high availability.
