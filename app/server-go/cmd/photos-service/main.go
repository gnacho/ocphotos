// photos-service — backend de OpenCloud Memories.
//
// Arquitectura (fase MVP):
//   - Scanner WebDAV incremental (etag) → tabla assets (Postgres)
//   - Workers River: ExtractExif (Range request, solo cabecera) → MakeThumbs (libvips)
//   - API REST consumida por la PWA / extensión web OpenCloud
//   - Auth: valida JWT OIDC de OpenCloud (mismo issuer)
//
// Fases posteriores: DetectFaces + ClipEmbed contra ml-service Python (ONNX),
// transcodificación de vídeo (ffmpeg, patrón go-vod de Memories).
package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"time"
)

func main() {
	log := slog.New(slog.NewJSONHandler(os.Stdout, nil))

	cfg := loadConfig() // env: OC_BASE_URL, DATABASE_URL, OIDC_ISSUER, LISTEN_ADDR...

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()

	// TODO: pool pgx + river.NewClient(riversqlite/pgx driver)
	// TODO: store postgres implementando index.AssetStore
	// TODO: scheduler: rescan incremental por usuario cada 5 min + full scan nocturno

	mux := http.NewServeMux()
	// Timeline: GET /api/timeline/days            → buckets día (COUNT por día, paginado)
	//           GET /api/timeline/assets?day=...  → assets de un día
	// Media:    GET /api/assets/{id}/thumb?w=     → redirect a thumbnails de OpenCloud o propios
	//           GET /api/assets/{id}/original     → proxy/stream WebDAV con auth
	// Memories: GET /api/memories/on-this-day
	// Mapa:     GET /api/assets/geo (bbox query)
	// Álbumes:  CRUD /api/albums
	// Admin:    POST /api/admin/rescan
	registerRoutes(mux, cfg, log)

	srv := &http.Server{Addr: cfg.listenAddr, Handler: withAuth(cfg, mux)}

	go func() {
		log.Info("photos-service escuchando", "addr", cfg.listenAddr)
		if err := srv.ListenAndServe(); err != http.ErrServerClosed {
			log.Error("http", "err", err)
			os.Exit(1)
		}
	}()

	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = srv.Shutdown(shutdownCtx)
}

// --- scaffolding pendiente de implementar (ver docs del proyecto) ---

type config struct {
	listenAddr string
	ocBaseURL  string
	dbURL      string
	oidcIssuer string
}

func loadConfig() config {
	get := func(k, def string) string {
		if v := os.Getenv(k); v != "" {
			return v
		}
		return def
	}
	return config{
		listenAddr: get("LISTEN_ADDR", ":9210"),
		ocBaseURL:  get("OC_BASE_URL", "https://localhost:9200"),
		dbURL:      get("DATABASE_URL", "postgres://photos:photos@localhost:5432/photos"),
		oidcIssuer: get("OIDC_ISSUER", ""),
	}
}

func registerRoutes(mux *http.ServeMux, cfg config, log *slog.Logger) {
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Write([]byte("ok"))
	})
	// Las rutas reales se implementan sobre internal/api (chi o ServeMux 1.22+)
}

func withAuth(cfg config, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// TODO: validar Bearer JWT contra el issuer OIDC de OpenCloud (JWKS),
		// extraer sub → user_id. En dev: header X-User-Id.
		next.ServeHTTP(w, r)
	})
}
