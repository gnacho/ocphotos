// photos-service — backend de OpenCloud Memories (single-tenant, SQLite).
//
// Arranque: scan inicial → worker EXIF en background → rescans programados
// (incrementales por etag) → API REST + PWA estática en el mismo puerto.
package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"sync"
	"time"

	"github.com/opencloud-memories/photos-service/internal/api"
	"github.com/opencloud-memories/photos-service/internal/dav"
	"github.com/opencloud-memories/photos-service/internal/exif"
	"github.com/opencloud-memories/photos-service/internal/geo"
	"github.com/opencloud-memories/photos-service/internal/index"
	"github.com/opencloud-memories/photos-service/internal/store"
	"github.com/opencloud-memories/photos-service/internal/thumb"
)

type config struct {
	listenAddr string
	ocBaseURL  string
	ocUser     string
	ocAppToken string
	scanRoot   string // carpeta raíz dentro del espacio personal ("Fotos"; "" = todo)
	scanEvery  time.Duration
	dataDir    string // sqlite + caché de thumbs
	webDir     string // dist de la PWA (opcional; "" = solo API)
	token      string // Bearer propio (opcional pero recomendado)
}

func getenv(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func loadConfig() config {
	d, _ := time.ParseDuration(getenv("SCAN_EVERY", "5m"))
	return config{
		listenAddr: getenv("LISTEN_ADDR", ":9210"),
		ocBaseURL:  getenv("OC_BASE_URL", "https://localhost:9200"),
		ocUser:     getenv("OC_USER", ""),
		ocAppToken: getenv("OC_APP_TOKEN", ""),
		scanRoot:   getenv("SCAN_ROOT", "Fotos"),
		scanEvery:  d,
		dataDir:    getenv("DATA_DIR", "./data"),
		webDir:     getenv("WEB_DIR", "./web"),
		token:      getenv("MEMORIES_TOKEN", ""),
	}
}

func main() {
	log := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	cfg := loadConfig()

	if cfg.ocUser == "" || cfg.ocAppToken == "" {
		log.Error("faltan OC_USER / OC_APP_TOKEN — crea un app-token en OpenCloud (Ajustes → Seguridad)")
		os.Exit(1)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()

	if err := os.MkdirAll(cfg.dataDir, 0o755); err != nil {
		log.Error("data dir", "err", err)
		os.Exit(1)
	}

	st, err := store.Open(filepath.Join(cfg.dataDir, "memories.db"))
	if err != nil {
		log.Error("sqlite", "err", err)
		os.Exit(1)
	}
	defer st.Close()

	dc := dav.New(cfg.ocBaseURL, cfg.ocUser, cfg.ocAppToken)

	// identidad del usuario configurado: el servicio es single-tenant y solo
	// atiende a su sesión (rechaza a otros usuarios de la instancia)
	meID, err := dc.MeID(ctx)
	if err != nil {
		log.Warn("no se pudo resolver el id del usuario (se omite la comprobación de sesión)", "err", err)
	} else {
		log.Info("usuario del servicio", "id", meID)
	}

	// descubrir el espacio personal y su webDavUrl
	drives, err := dc.ListDrives(ctx)
	if err != nil {
		log.Error("no se pudieron listar los espacios de OpenCloud", "err", err)
		os.Exit(1)
	}
	var webdavURL string
	for _, d := range drives {
		if d.DriveType == "personal" {
			webdavURL = d.WebDAVURL
			break
		}
	}
	if webdavURL == "" && len(drives) > 0 {
		webdavURL = drives[0].WebDAVURL
	}
	if webdavURL == "" {
		log.Error("ningún espacio con webDavUrl disponible")
		os.Exit(1)
	}
	log.Info("espacio OpenCloud localizado", "webdav", webdavURL, "root", cfg.scanRoot)

	thumbs, err := thumb.New(dc, filepath.Join(cfg.dataDir, "thumbs"))
	if err != nil {
		log.Error("thumb cache", "err", err)
		os.Exit(1)
	}

	scanner := index.NewScanner(dc, st, log)
	exifWorker := exif.NewWorker(dc, st, log)
	geocoder := geo.New(st, log)
	apiSrv := api.New(st, thumbs, dc, scanner, geocoder, webdavURL, cfg.scanRoot, cfg.ocBaseURL, meID, cfg.token, log)

	// scan + EXIF bajo demanda y programados. El rescan bajo demanda (lo pide la
	// extensión al abrir/enfocar para recoger fotos recién subidas) va con throttle
	// para no encadenar PROPFINDs completos.
	var scanMu sync.Mutex
	lastScan := time.Time{}
	runScan := func(reason string) {
		sctx, cancel := context.WithTimeout(ctx, 2*time.Hour)
		defer cancel()
		log.Info("scan", "motivo", reason)
		if err := scanner.ScanSpace(sctx, webdavURL, cfg.scanRoot); err != nil {
			log.Error("scan", "err", err)
		}
		exifWorker.Run(sctx)
		scanMu.Lock()
		lastScan = time.Now()
		scanMu.Unlock()
	}
	go func() {
		runScan("inicial")
		ticker := time.NewTicker(cfg.scanEvery)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				runScan("programado")
			case <-apiSrv.RescanRequests():
				scanMu.Lock()
				recent := time.Since(lastScan) < 20*time.Second
				scanMu.Unlock()
				if recent {
					continue
				}
				runScan("bajo demanda")
			}
		}
	}()

	// HTTP: API + PWA estática
	mux := http.NewServeMux()
	mux.Handle("/api/", apiSrv.Handler())
	mux.Handle("/healthz", apiSrv.Handler())
	if cfg.webDir != "" {
		if _, err := os.Stat(filepath.Join(cfg.webDir, "index.html")); err == nil {
			mux.Handle("/", spaHandler(cfg.webDir))
			log.Info("sirviendo PWA", "dir", cfg.webDir)
		}
	}

	srv := &http.Server{Addr: cfg.listenAddr, Handler: mux, ReadHeaderTimeout: 15 * time.Second}
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

// spaHandler sirve la PWA con fallback a index.html (client-side routing).
func spaHandler(dir string) http.Handler {
	fs := http.FileServer(http.Dir(dir))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := filepath.Join(dir, filepath.Clean(r.URL.Path))
		if info, err := os.Stat(p); err != nil || info.IsDir() {
			http.ServeFile(w, r, filepath.Join(dir, "index.html"))
			return
		}
		fs.ServeHTTP(w, r)
	})
}
