// Package index — scanner WebDAV incremental sobre OpenCloud.
package index

import (
	"context"
	"log/slog"
	"net/url"
	"path"
	"time"

	"github.com/opencloud-memories/photos-service/internal/dav"
	"github.com/opencloud-memories/photos-service/internal/store"
)

type Scanner struct {
	dav   *dav.Client
	store *store.Store
	log   *slog.Logger
}

func NewScanner(c *dav.Client, st *store.Store, log *slog.Logger) *Scanner {
	return &Scanner{dav: c, store: st, log: log}
}

// ScanSpace recorre un espacio desde root (p. ej. "Fotos"; "" = todo el espacio).
// Incremental por etag: upsert solo de lo cambiado; soft-delete de lo desaparecido.
// 70k fotos ≈ unos pocos miles de PROPFINDs: varios minutos el primer scan,
// segundos los incrementales (mismo número de peticiones, pero upserts ≈ 0).
func (s *Scanner) ScanSpace(ctx context.Context, webdavURL, root string) error {
	start := time.Now()
	queue := []string{root}
	seen := map[string]bool{}
	var scanned, changed int

	for len(queue) > 0 {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}
		cur := queue[0]
		queue = queue[1:]

		entries, err := s.dav.ListFolder(ctx, webdavURL, cur)
		if err != nil {
			s.log.Warn("propfind falló, se omite", "path", cur, "err", err)
			continue
		}
		for _, e := range entries {
			if e.IsDir {
				queue = append(queue, e.Href) // href absoluto; ListFolder lo resuelve
				continue
			}
			if !e.IsMedia() {
				continue
			}
			scanned++
			seen[e.ETag] = true
			mt := "image"
			if e.IsVideo() {
				mt = "video"
			}
			mtime := e.LastModified
			if mtime.IsZero() {
				mtime = time.Now()
			}
			p, _ := url.PathUnescape(e.Href)
			_, ch, err := s.store.UpsertByETag(ctx, p, e.ETag, path.Base(p), mt, mtime, e.Size)
			if err != nil {
				s.log.Error("upsert", "path", p, "err", err)
				continue
			}
			if ch {
				changed++
			}
		}
	}

	removed, err := s.store.SoftDeleteExcept(ctx, seen)
	if err != nil {
		return err
	}
	s.log.Info("scan completado",
		"escaneados", scanned, "cambiados", changed, "eliminados", removed,
		"duracion", time.Since(start).Round(time.Second))
	return nil
}
