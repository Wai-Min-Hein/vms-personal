FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV MONGODB_URI=mongodb://localhost:27017/build
ENV AUTH_SECRET=build-only-secret-that-is-at-least-32-characters
ENV MEDIAMTX_API_URL=http://mediamtx-vms:9997
ENV NEXT_PUBLIC_MEDIAMTX_HLS_URL=http://localhost:8888
ENV NEXT_PUBLIC_MEDIAMTX_WEBRTC_URL=http://localhost:8889
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN apk add --no-cache ffmpeg
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
