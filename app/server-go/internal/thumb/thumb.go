// Package thumb — generación y caché en disco de miniaturas.
// Decodifica JPEG/PNG/GIF/WebP y HEIC/HEIF (decodificador HEVC en Go puro,
// sin CGo ni libvips: gen2brain/h265 registra el formato en image.Decode).
// Formatos sin decodificador (RAW) devuelven ErrUnsupported: la API sirve
// entonces el original o un placeholder.
package thumb

import (
	"context"
	"crypto/sha1"
	"encoding/hex"
	"errors"
	"fmt"
	"image"
	_ "image/gif"
	"image/jpeg"
	_ "image/png"
	"io"
	"os"
	"path/filepath"

	"github.com/opencloud-memories/photos-service/internal/dav"
	_ "github.com/gen2brain/h265/heic" // registra image.Decode para HEIC/HEIF
	"golang.org/x/image/draw"
	_ "golang.org/x/image/webp"
)

var ErrUnsupported = errors.New("formato sin decodificador nativo")

type Service struct {
	dav      *dav.Client
	cacheDir string
}

func New(c *dav.Client, cacheDir string) (*Service, error) {
	if err := os.MkdirAll(cacheDir, 0o755); err != nil {
		return nil, err
	}
	return &Service{dav: c, cacheDir: cacheDir}, nil
}

func cacheKey(href, etag string, maxSize int) string {
	h := sha1.Sum([]byte(fmt.Sprintf("%s|%s|%d", href, etag, maxSize)))
	return hex.EncodeToString(h[:]) + ".jpg"
}

// Get devuelve la ruta del thumbnail en caché, generándolo si hace falta.
// maxSize es el lado largo. Se sirve como JPEG progresivo calidad 80.
func (s *Service) Get(ctx context.Context, href, etag string, maxSize int) (string, error) {
	key := cacheKey(href, etag, maxSize)
	out := filepath.Join(s.cacheDir, key[:2], key)
	if _, err := os.Stat(out); err == nil {
		return out, nil
	}

	rc, _, err := s.dav.Download(ctx, href)
	if err != nil {
		return "", err
	}
	defer rc.Close()

	// límite defensivo: 60 MB por foto
	img, _, err := image.Decode(io.LimitReader(rc, 60<<20))
	if err != nil {
		return "", fmt.Errorf("%w: %v", ErrUnsupported, err)
	}

	b := img.Bounds()
	w, h := b.Dx(), b.Dy()
	if w > maxSize || h > maxSize {
		if w >= h {
			h = h * maxSize / w
			w = maxSize
		} else {
			w = w * maxSize / h
			h = maxSize
		}
	}
	dst := image.NewRGBA(image.Rect(0, 0, w, h))
	draw.CatmullRom.Scale(dst, dst.Bounds(), img, b, draw.Over, nil)

	if err := os.MkdirAll(filepath.Dir(out), 0o755); err != nil {
		return "", err
	}
	tmp := out + ".tmp"
	f, err := os.Create(tmp)
	if err != nil {
		return "", err
	}
	err = jpeg.Encode(f, dst, &jpeg.Options{Quality: 80})
	f.Close()
	if err != nil {
		os.Remove(tmp)
		return "", err
	}
	return out, os.Rename(tmp, out)
}
