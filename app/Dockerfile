# OpenCloud Memories — todo en uno: PWA + photos-service (Go + SQLite)
# Build:  docker build -t opencloud-memories .
# Run:    ver docker-compose.yml

# --- etapa 1: frontend ---
FROM node:20-alpine AS web
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.ts tsconfig*.json tailwind.config.js postcss.config.js components.json ./
COPY public ./public
COPY src ./src
RUN npm run build

# --- etapa 2: backend Go (SQLite Go puro → binario estático sin CGO) ---
FROM golang:1.24-alpine AS server
WORKDIR /build
COPY server-go/go.mod server-go/go.sum ./
RUN go mod download
COPY server-go ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /photos-service ./cmd/photos-service

# --- etapa 3: runtime ---
FROM alpine:3.21
RUN apk add --no-cache ca-certificates tzdata && adduser -D -u 10001 memories
COPY --from=server /photos-service /usr/local/bin/photos-service
COPY --from=web /build/dist /app/web
ENV LISTEN_ADDR=:9210 \
    DATA_DIR=/data \
    WEB_DIR=/app/web \
    SCAN_ROOT=Fotos \
    SCAN_EVERY=30m
VOLUME /data
EXPOSE 9210
USER memories
ENTRYPOINT ["/usr/local/bin/photos-service"]
