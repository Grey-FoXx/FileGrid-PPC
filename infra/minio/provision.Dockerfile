FROM golang:1.24-bookworm AS build
WORKDIR /src
COPY infra/minio/provision/go.mod infra/minio/provision/go.sum ./
RUN go mod download
COPY infra/minio/provision/main.go ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags='-s -w' -o /provision .
FROM scratch
COPY --from=build /provision /provision
USER 10001:10001
ENTRYPOINT ["/provision"]
