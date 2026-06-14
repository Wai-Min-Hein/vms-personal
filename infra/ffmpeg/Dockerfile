FROM alpine:3.22

RUN apk add --no-cache ffmpeg

COPY infra/ffmpeg/publish-loop.sh /usr/local/bin/publish-loop
RUN chmod +x /usr/local/bin/publish-loop

ENTRYPOINT ["/usr/local/bin/publish-loop"]
