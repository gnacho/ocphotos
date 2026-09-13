// Package api — REST consumida por la PWA. Single-tenant: el servicio
// ya está autenticado contra OpenCloud; hacia fuera se protege con un
// Bearer token propio (MEMORIES_TOKEN) o se expone solo en LAN/VPN.
package api

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/opencloud-memories/photos-service/internal/dav"
	"github.com/opencloud-memories/photos-service/internal/geo"
	"github.com/opencloud-memories/photos-service/internal/index"
	"github.com/opencloud-memories/photos-service/internal/store"
	"github.com/opencloud-memories/photos-service/internal/thumb"
)

type Server struct {
	st        *store.Store
	thumbs    *thumb.Service
	dav       *dav.Client
	scanner   *index.Scanner
	geo       *geo.Geocoder
	webdavURL string
	scanRoot  string
	ocBaseURL string
	ocUserID  string
	token     string
	log       *slog.Logger
	rescanCh  chan struct{}
}

func New(st *store.Store, th *thumb.Service, dc *dav.Client, sc *index.Scanner, gc *geo.Geocoder, webdavURL, scanRoot, ocBaseURL, ocUserID, token string, log *slog.Logger) *Server {
	return &Server{
		st: st, thumbs: th, dav: dc, scanner: sc, geo: gc,
		webdavURL: webdavURL, scanRoot: scanRoot, ocBaseURL: ocBaseURL, ocUserID: ocUserID, token: token, log: log,
		rescanCh: make(chan struct{}, 1),
	}
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) { w.Write([]byte("ok")) })
	mux.HandleFunc("GET /api/stats", s.stats)
	mux.HandleFunc("GET /api/assets", s.assets)
	mux.HandleFunc("GET /api/assets/{id}", s.asset)
	mux.HandleFunc("POST /api/assets/{id}/favorite", s.favorite)
	mux.HandleFunc("GET /api/assets/{id}/thumb", s.thumbHandler)
	mux.HandleFunc("GET /api/thumb", s.thumbByPath)
	mux.HandleFunc("GET /api/assets/{id}/original", s.original)
	mux.HandleFunc("GET /api/memories/on-this-day", s.onThisDay)
	mux.HandleFunc("GET /api/timeline/calendar", s.calendar)
	mux.HandleFunc("GET /api/memories/highlights", s.highlights)
	mux.HandleFunc("GET /api/geo", s.geoHandler)
	mux.HandleFunc("GET /api/places", s.places)
	mux.HandleFunc("GET /api/albums", s.listAlbums)
	mux.HandleFunc("POST /api/albums", s.createAlbum)
	mux.HandleFunc("PATCH /api/albums/{id}", s.renameAlbum)
	mux.HandleFunc("DELETE /api/albums/{id}", s.deleteAlbum)
	mux.HandleFunc("GET /api/albums/{id}/assets", s.albumAssets)
	mux.HandleFunc("POST /api/albums/{id}/assets", s.addToAlbum)
	mux.HandleFunc("DELETE /api/albums/{id}/assets/{assetId}", s.removeFromAlbum)
	mux.HandleFunc("POST /api/admin/rescan", s.rescan)
	return s.withAuth(withCORS(mux))
}

func (s *Server) withAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/healthz" {
			next.ServeHTTP(w, r)
			return
		}
		// 1) token propio del servicio (admin/API)
		if s.token != "" && (r.Header.Get("Authorization") == "Bearer "+s.token || r.URL.Query().Get("token") == s.token) {
			next.ServeHTTP(w, r)
			return
		}
		// 2) sesión de OpenCloud (la usa la extensión web)
		if s.validOpenCloudSession(r) {
			next.ServeHTTP(w, r)
			return
		}
		// 3) legacy: sin token ni base configurados (solo LAN/VPN)
		if s.token == "" && s.ocBaseURL == "" {
			next.ServeHTTP(w, r)
			return
		}
		http.Error(w, "unauthorized", http.StatusUnauthorized)
	})
}

// validOpenCloudSession valida el Bearer de la sesión web contra Graph /me.
func (s *Server) validOpenCloudSession(r *http.Request) bool {
	auth := r.Header.Get("Authorization")
	if !strings.HasPrefix(auth, "Bearer ") || s.ocBaseURL == "" {
		return false
	}
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimRight(s.ocBaseURL, "/")+"/graph/v1.0/me", nil)
	if err != nil {
		return false
	}
	req.Header.Set("Authorization", auth)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		_, _ = io.Copy(io.Discard, resp.Body)
		return false
	}
	// single-tenant: solo la sesión del usuario configurado (evita que otros
	// usuarios de la instancia reciban miniaturas de su espacio)
	if s.ocUserID == "" {
		_, _ = io.Copy(io.Discard, resp.Body)
		return true
	}
	var out struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return false
	}
	return out.ID == s.ocUserID
}

// thumbByPath genera una miniatura a partir de la ruta del fichero (sin índice),
// de modo que la extensión puede pedir miniaturas de HEIC que OpenCloud no sabe
// previsualizar. path = ruta dentro del espacio ("/Fotos/IMG.heic").
func (s *Server) thumbByPath(w http.ResponseWriter, r *http.Request) {
	p := r.URL.Query().Get("path")
	if p == "" {
		http.Error(w, "path required", http.StatusBadRequest)
		return
	}
	maxSize := 400
	if v := r.URL.Query().Get("w"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 64 && n <= 2048 {
			maxSize = n
		}
	}
	href := s.dav.SpaceFileURL(s.webdavURL, p)
	file, err := s.thumbs.Get(r.Context(), href, r.URL.Query().Get("etag"), maxSize)
	if err != nil {
		s.log.Warn("thumb by path", "path", p, "err", err)
		http.Error(w, err.Error(), http.StatusUnprocessableEntity)
		return
	}
	w.Header().Set("Cache-Control", "public, max-age=2592000, immutable")
	http.ServeFile(w, r, file)
}

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}

func (s *Server) stats(w http.ResponseWriter, r *http.Request) {
	st, err := s.st.Stats(r.Context())
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	writeJSON(w, st)
}

// GET /api/assets?before_taken=&before_id=&limit=&favorites=1&q=
func (s *Server) assets(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	beforeTaken := int64(1<<62 - 1)
	beforeID := int64(1<<62 - 1)
	if v := q.Get("before_taken"); v != "" {
		beforeTaken, _ = strconv.ParseInt(v, 10, 64)
	}
	if v := q.Get("before_id"); v != "" {
		beforeID, _ = strconv.ParseInt(v, 10, 64)
	}
	limit := 500
	if v := q.Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 2000 {
			limit = n
		}
	}
	list, err := s.st.AssetsPage(r.Context(), beforeTaken, beforeID, limit, q.Get("favorites") == "1", q.Get("q"))
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	writeJSON(w, map[string]any{"assets": list})
}

func (s *Server) asset(w http.ResponseWriter, r *http.Request) {
	id, _ := strconv.ParseInt(r.PathValue("id"), 10, 64)
	a, err := s.st.AssetByID(r.Context(), id)
	if err != nil {
		http.Error(w, "not found", 404)
		return
	}
	writeJSON(w, a)
}

func (s *Server) favorite(w http.ResponseWriter, r *http.Request) {
	id, _ := strconv.ParseInt(r.PathValue("id"), 10, 64)
	var body struct {
		Favorite bool `json:"favorite"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "bad request", 400)
		return
	}
	if err := s.st.SetFavorite(r.Context(), id, body.Favorite); err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) thumbHandler(w http.ResponseWriter, r *http.Request) {
	id, _ := strconv.ParseInt(r.PathValue("id"), 10, 64)
	a, err := s.st.AssetByID(r.Context(), id)
	if err != nil || a.DeletedAt != nil {
		http.Error(w, "not found", 404)
		return
	}
	maxSize := 400
	if v := r.URL.Query().Get("w"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 64 && n <= 2048 {
			maxSize = n
		}
	}
	if a.MediaType == "video" {
		// sin poster de vídeo en v1 (ffmpeg vendrá con la fase de transcoding)
		http.Redirect(w, r, "/api/assets/"+r.PathValue("id")+"/original", http.StatusFound)
		return
	}
	// necesitamos el etag para la clave de caché: está en path→etag; lo pedimos
	// (consulta ligera; el store lo tiene en la tabla pero no lo expone en Asset)
	path, err := s.thumbs.Get(r.Context(), a.Path, etagFor(a), maxSize)
	if err != nil {
		s.log.Warn("thumb", "id", id, "err", err)
		http.Redirect(w, r, "/api/assets/"+r.PathValue("id")+"/original", http.StatusFound)
		return
	}
	w.Header().Set("Cache-Control", "public, max-age=2592000, immutable")
	http.ServeFile(w, r, path)
}

// etagFor: clave de caché determinista sin exponer el etag en el JSON de la API.
func etagFor(a store.Asset) string {
	return strconv.FormatInt(a.TakenAt, 10) + "-" + strconv.FormatInt(a.Size, 10)
}

func (s *Server) original(w http.ResponseWriter, r *http.Request) {
	id, _ := strconv.ParseInt(r.PathValue("id"), 10, 64)
	a, err := s.st.AssetByID(r.Context(), id)
	if err != nil || a.DeletedAt != nil {
		http.Error(w, "not found", 404)
		return
	}
	rc, ct, err := s.dav.Download(r.Context(), a.Path)
	if err != nil {
		http.Error(w, err.Error(), 502)
		return
	}
	defer rc.Close()
	if ct != "" {
		w.Header().Set("Content-Type", ct)
	}
	w.Header().Set("Cache-Control", "private, max-age=3600")
	w.Header().Set("Content-Disposition", `inline; filename="`+a.Filename+`"`)
	_, _ = io.Copy(w, rc)
}

func (s *Server) onThisDay(w http.ResponseWriter, r *http.Request) {
	// rango de días alrededor de hoy (±3 por defecto, como Memories)
	days := 3
	if v := r.URL.Query().Get("days"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 && n <= 30 {
			days = n
		}
	}
	now := time.Now()
	list, err := s.st.OnThisDay(r.Context(), int(now.Month()), now.Day(), now.Year(), days)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	writeJSON(w, map[string]any{"assets": list, "days": days})
}

// highlights: contenido para la sección "On this day". Intenta, en orden:
// mismo día (años anteriores), mismo mes (años anteriores), las más antiguas.
func (s *Server) highlights(w http.ResponseWriter, r *http.Request) {
	now := time.Now()
	ctx := r.Context()
	if list, err := s.st.OnThisDay(ctx, int(now.Month()), now.Day(), now.Year(), 3); err == nil && len(list) > 0 {
		writeJSON(w, map[string]any{"scope": "day", "assets": list})
		return
	}
	if list, err := s.st.OnThisMonth(ctx, int(now.Month()), now.Year(), 60); err == nil && len(list) > 0 {
		writeJSON(w, map[string]any{"scope": "month", "assets": list})
		return
	}
	list, err := s.st.OldestAssets(ctx, 20)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	writeJSON(w, map[string]any{"scope": "oldest", "assets": list})
}

func (s *Server) calendar(w http.ResponseWriter, r *http.Request) {
	years, err := s.st.Calendar(r.Context())
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	writeJSON(w, map[string]any{"years": years})
}

func (s *Server) geoHandler(w http.ResponseWriter, r *http.Request) {
	list, err := s.st.GeoAssets(r.Context(), 5000)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	writeJSON(w, map[string]any{"assets": list})
}

// --- Lugares ---

// places: clusters de fotos con GPS, con nombre (geocodificación inversa cacheada).
// Geocodifica como mucho 3 sitios nuevos por petición (límite de Nominatim).
func (s *Server) places(w http.ResponseWriter, r *http.Request) {
	clusters, err := s.st.PlaceClusters(r.Context(), 2)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	budget := 3
	for i := range clusters {
		if name, ok, _ := s.st.GetGeocode(r.Context(), clusters[i].Lat, clusters[i].Lon); ok {
			clusters[i].Name = name
			continue
		}
		if budget > 0 && s.geo != nil {
			if name, err := s.geo.Name(r.Context(), clusters[i].Lat, clusters[i].Lon, 2); err == nil {
				clusters[i].Name = name
				budget--
			}
		}
	}
	writeJSON(w, map[string]any{"places": clusters})
}

// --- Álbumes ---

func (s *Server) listAlbums(w http.ResponseWriter, r *http.Request) {
	albums, err := s.st.ListAlbums(r.Context())
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	writeJSON(w, map[string]any{"albums": albums})
}

func (s *Server) createAlbum(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || strings.TrimSpace(body.Name) == "" {
		http.Error(w, "name required", 400)
		return
	}
	id, err := s.st.CreateAlbum(r.Context(), strings.TrimSpace(body.Name))
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	writeJSON(w, map[string]any{"id": id})
}

func (s *Server) renameAlbum(w http.ResponseWriter, r *http.Request) {
	id, _ := strconv.ParseInt(r.PathValue("id"), 10, 64)
	var body struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || strings.TrimSpace(body.Name) == "" {
		http.Error(w, "name required", 400)
		return
	}
	if err := s.st.RenameAlbum(r.Context(), id, strings.TrimSpace(body.Name)); err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) deleteAlbum(w http.ResponseWriter, r *http.Request) {
	id, _ := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err := s.st.DeleteAlbum(r.Context(), id); err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) albumAssets(w http.ResponseWriter, r *http.Request) {
	id, _ := strconv.ParseInt(r.PathValue("id"), 10, 64)
	list, err := s.st.AlbumAssets(r.Context(), id)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	writeJSON(w, map[string]any{"assets": list})
}

func (s *Server) addToAlbum(w http.ResponseWriter, r *http.Request) {
	id, _ := strconv.ParseInt(r.PathValue("id"), 10, 64)
	var body struct {
		AssetIDs []int64 `json:"assetIds"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || len(body.AssetIDs) == 0 {
		http.Error(w, "assetIds required", 400)
		return
	}
	if err := s.st.AddToAlbum(r.Context(), id, body.AssetIDs); err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) removeFromAlbum(w http.ResponseWriter, r *http.Request) {
	id, _ := strconv.ParseInt(r.PathValue("id"), 10, 64)
	assetID, _ := strconv.ParseInt(r.PathValue("assetId"), 10, 64)
	if err := s.st.RemoveFromAlbum(r.Context(), id, assetID); err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) rescan(w http.ResponseWriter, r *http.Request) {
	select {
	case s.rescanCh <- struct{}{}:
		writeJSON(w, map[string]any{"status": "rescan encolado"})
	default:
		writeJSON(w, map[string]any{"status": "ya hay un scan en curso"})
	}
}

// RescanRequests devuelve el canal para que el main lance scans bajo demanda.
func (s *Server) RescanRequests() <-chan struct{} { return s.rescanCh }
