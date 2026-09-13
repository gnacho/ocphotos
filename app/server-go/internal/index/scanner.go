// Package index recorre el árbol WebDAV de un usuario y mantiene
// la tabla assets sincronizada (upsert por etag, soft-delete de desaparecidos).
package index

import (
	"context"
	"log/slog"
	"net/url"
	"strings"

	"github.com/gnacho/ocphotos/photos-service/internal/dav"
)

type AssetStore interface {
	Upsert(ctx context.Context, a Asset) error
	MarkMissingExcept(ctx context.Context, userID string, seenETags []string) (int, error)
	EnqueueExif(assetID int64) error
}

type Asset struct {
	UserID string
	Path   string
	ETag   string
	Name   string
	Size   int64
	MTime  interface{ Unix() int64 }
}

// Scanner mantiene el índice de un espacio OpenCloud.
// Estrategia: walk completo incremental comparando etags (el filecache lo hace
// el propio OpenCloud; nosotros solo lo consultamos). Un rescan de 50k ficheros
// son ~N_carpetas PROPFINDs; viable cada X minutos por usuario.
type Scanner struct {
	dav   *dav.Client
	store AssetStore
	log   *slog.Logger
}

func NewScanner(c *dav.Client, s AssetStore, log *slog.Logger) *Scanner {
	return &Scanner{dav: c, store: s, log: log}
}

// ScanSpace recorre un espacio completo a partir de su raíz (p. ej. "Fotos").
func (s *Scanner) ScanSpace(ctx context.Context, userID, webdavURL, root string) error {
	type pending struct{ rel string }
	queue := []pending{{rel: root}}
	seen := []string{}

	for len(queue) > 0 {
		cur := queue[0]
		queue = queue[1:]

		entries, err := s.dav.ListFolder(ctx, webdavURL, cur.rel)
		if err != nil {
			s.log.Warn("propfind falló, se omite", "path", cur.rel, "err", err)
			continue
		}
		for i, e := range entries {
			if i == 0 { // PROPFIND depth=1 incluye la propia carpeta
				continue
			}
			p, _ := url.PathUnescape(e.Href)
			if e.IsDir {
				queue = append(queue, pending{rel: relOf(p)})
				continue
			}
			if !e.IsMedia() {
				continue
			}
			seen = append(seen, e.ETag)
			// Upsert solo si el etag cambió (el store compara antes de tocar nada)
			if err := s.store.Upsert(ctx, Asset{
				UserID: userID,
				Path:   p,
				ETag:   e.ETag,
				Name:   base(p),
				Size:   e.Size,
				MTime:  e.LastModified,
			}); err != nil {
				s.log.Error("upsert", "path", p, "err", err)
			}
		}
	}

	// lo que estaba indexado y ya no aparece → soft-delete (papelera lógica)
	removed, err := s.store.MarkMissingExcept(ctx, userID, seen)
	if err != nil {
		return err
	}
	s.log.Info("scan completado", "user", userID, "vistos", len(seen), "eliminados", removed)
	return nil
}

func relOf(href string) string {
	// extrae la ruta relativa dentro del space a partir del href DAV
	if i := strings.Index(href, "/dav/spaces/"); i >= 0 {
		parts := strings.SplitN(href[i:], "/", 4)
		if len(parts) == 4 {
			return parts[3]
		}
	}
	return strings.TrimPrefix(href, "/")
}

func base(p string) string {
	if i := strings.LastIndex(p, "/"); i >= 0 {
		return p[i+1:]
	}
	return p
}
