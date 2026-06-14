# Sentinel VMS

Production-oriented VMS control plane built with Next.js 15, TypeScript, MongoDB, Mongoose, MediaMTX, FFmpeg, Tailwind, ShadCN patterns, TanStack Query, Zustand, React Hook Form, and Zod.

## Quick start

1. Create local configuration:

   ```bash
   cp .env.example .env
   ```

2. Start infrastructure:

   ```bash
   docker compose up -d mongodb mediamtx-simulator mediamtx-vms
   ```

3. Initialize and run:

   ```bash
   npm run seed
   npm run dev
   ```

4. In a second terminal, start health monitoring:

   ```bash
   npm run monitor
   ```

Start the two persistent simulator publishers:

```bash
pnpm run simulators
```

The publishers run as Docker services, so closing the terminal does not stop
the cameras. Stop them with `pnpm run simulators:stop`.

MediaMTX recordings are stored in a Docker-managed named volume:

```text
/recordings/<camera-path>/
```

The MediaMTX and application containers share the volume so recordings can be
listed, probed, played, and deleted. Inspect it with
`docker volume inspect vms_recordings`.

The seed creates two cameras matching `infra/mediamtx/vms.yml`:

| VMS path | Simulator source | Recording |
| --- | --- | --- |
| `cam1` | `rtsp://mediamtx-simulator:18554/vcam1` | Enabled |
| `cam2` | `rtsp://mediamtx-simulator:18554/vcam2` | Disabled |
The simulator publishes the files in `public/videos` through FFmpeg. To publish
an additional synthetic stream manually, use `sh scripts/publish-simulator.sh`.

Seeded cameras use the MediaMTX defaults from `vms.yml`: one-minute recording
segments and one-day retention.

The default seeded login is `admin@example.com` / `ChangeMe123!`. Override both seed variables and change the password immediately.

## Deployment

Set a random `AUTH_SECRET` of at least 32 characters, configure `MONGODB_URI`
with a managed MongoDB connection string, restrict the MediaMTX API to the
application network, configure WebRTC public addresses/ICE, terminate HTTPS at
the edge, and put recordings on durable shared storage.

Run database deployment before application rollout:

```bash
npm run seed
docker compose up -d --build
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for boundaries and scaling decisions.

Run following command in terminal to start mobilecam

ffmpeg -rtsp_transport tcp \
  -i "rtsp://192.168.1.2:8080/h264.sdp" \
  -c copy -f rtsp -rtsp_transport tcp \
  "rtsp://localhost:18554/mobilecam"