FROM golang:1.24-bookworm AS build
ARG MINIO_COMMIT=7aac2a2c5b7c882e68c1ce017d8256be2feea27f
RUN mkdir /src && cd /src && git init && git remote add origin https://github.com/minio/minio.git && git fetch --depth 1 origin "$MINIO_COMMIT" && git checkout --detach FETCH_HEAD
WORKDIR /src
RUN CGO_ENABLED=0 GOMAXPROCS=2 go build -p 2 -trimpath -o /minio .
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/* && useradd -u 10001 minio && mkdir /data && chown minio /data
COPY --from=build /minio /usr/local/bin/minio
USER minio
ENTRYPOINT ["minio"]
CMD ["server","/data","--console-address",":9001"]
