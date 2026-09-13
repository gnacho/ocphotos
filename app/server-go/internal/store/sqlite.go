// Package store — persistencia SQLite (modernc.org/sqlite, Go puro, sin cgo).
// Diseño single-tenant: una instancia = un usuario OpenCloud.
// Para 70k-500k assets SQLite va sobrado; backups = copiar el fichero .db.
package store

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

const schema = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS assets (
    id          INTEGER PRIMARY KEY,
    path        TEXT NOT NULL UNIQUE,      -- ruta WebDAV completa
    etag        TEXT NOT NULL,
    filename    TEXT NOT NULL,
    media_type  TEXT NOT NULL DEFAULT 'image',
    taken_at    INTEGER NOT NULL,          -- unix epoch (EXIF o mtime)
    exif_done   INTEGER NOT NULL DEFAULT 0,
    width       INTEGER,
    height      INTEGER,
    camera      TEXT,
    lens        TEXT,
    iso         INTEGER,
    aperture    TEXT,
    shutter     TEXT,
    focal       TEXT,
    lat         REAL,
    lon         REAL,
    size        INTEGER NOT NULL DEFAULT 0,
    is_favorite INTEGER NOT NULL DEFAULT 0,
    deleted_at  INTEGER,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS assets_taken ON assets (taken_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS assets_geo   ON assets (lat, lon) WHERE deleted_at IS NULL AND lat IS NOT NULL;

CREATE TABLE IF NOT EXISTS scan_state (
    key   TEXT PRIMARY KEY,
    value TEXT
);
`

type Asset struct {
	ID         int64      `json:"id"`
	Path       string     `json:"path"`
	Filename   string     `json:"filename"`
	MediaType  string     `json:"mediaType"`
	TakenAt    int64      `json:"takenAt"`
	Width      int        `json:"width"`
	Height     int        `json:"height"`
	Camera     string     `json:"camera,omitempty"`
	Lens       string     `json:"lens,omitempty"`
	ISO        int        `json:"iso,omitempty"`
	Aperture   string     `json:"aperture,omitempty"`
	Shutter    string     `json:"shutter,omitempty"`
	Focal      string     `json:"focal,omitempty"`
	Lat        *float64   `json:"lat,omitempty"`
	Lon        *float64   `json:"lon,omitempty"`
	Size       int64      `json:"size"`
	IsFavorite bool       `json:"favorite"`
	ExifDone   bool       `json:"-"`
	DeletedAt  *int64     `json:"-"`
}

type DayBucket struct {
	Day   string `json:"day"` // yyyy-mm-dd
	Count int    `json:"count"`
}

type Store struct {
	db *sql.DB
}

func Open(path string) (*Store, error) {
	db, err := sql.Open("sqlite", path+"?_pragma=busy_timeout(10000)&_pragma=synchronous(NORMAL)")
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1) // SQLite: un writer; WAL permite readers concurrentes en conns separadas, pero con database/sql simplificamos a 1
	if _, err := db.Exec(schema); err != nil {
		return nil, fmt.Errorf("schema: %w", err)
	}
	return &Store{db: db}, nil
}

func (s *Store) Close() error { return s.db.Close() }

// --- escritura (scanner) ---

// UpsertByETag inserta o actualiza si el etag cambió. Devuelve (id, changed).
func (s *Store) UpsertByETag(ctx context.Context, path, etag, filename, mediaType string, mtime time.Time, size int64) (int64, bool, error) {
	var id int64
	var curETag string
	err := s.db.QueryRowContext(ctx, `SELECT id, etag FROM assets WHERE path = ?`, path).Scan(&id, &curETag)
	switch {
	case err == sql.ErrNoRows:
		res, err := s.db.ExecContext(ctx,
			`INSERT INTO assets (path, etag, filename, media_type, taken_at, size) VALUES (?,?,?,?,?,?)`,
			path, etag, filename, mediaType, mtime.Unix(), size)
		if err != nil {
			return 0, false, err
		}
		id, _ = res.LastInsertId()
		return id, true, nil
	case err != nil:
		return 0, false, err
	case curETag != etag:
		// fichero modificado: resetea EXIF para reprocesar, conserva favorito
		if _, err := s.db.ExecContext(ctx,
			`UPDATE assets SET etag=?, taken_at=?, size=?, exif_done=0, deleted_at=NULL WHERE id=?`,
			etag, mtime.Unix(), size, id); err != nil {
			return 0, false, err
		}
		return id, true, nil
	default:
		// sin cambios; asegúrate de resucitarlo si estaba soft-deleted
		_, err := s.db.ExecContext(ctx, `UPDATE assets SET deleted_at=NULL WHERE id=?`, id)
		return id, false, err
	}
}

// SoftDeleteExcept marca como borrados los assets vivos cuyo etag no está en seen.
func (s *Store) SoftDeleteExcept(ctx context.Context, seen map[string]bool) (int, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, etag FROM assets WHERE deleted_at IS NULL`)
	if err != nil {
		return 0, err
	}
	var stale []int64
	for rows.Next() {
		var id int64
		var etag string
		if err := rows.Scan(&id, &etag); err != nil {
			rows.Close()
			return 0, err
		}
		if !seen[etag] {
			stale = append(stale, id)
		}
	}
	rows.Close()
	now := time.Now().Unix()
	for _, id := range stale {
		if _, err := s.db.ExecContext(ctx, `UPDATE assets SET deleted_at=? WHERE id=?`, now, id); err != nil {
			return 0, err
		}
	}
	return len(stale), nil
}

// PendingExif devuelve assets sin EXIF procesado (lotes para el worker).
func (s *Store) PendingExif(ctx context.Context, limit int) ([]Asset, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, path, media_type FROM assets WHERE exif_done = 0 AND deleted_at IS NULL AND media_type='image' LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Asset
	for rows.Next() {
		var a Asset
		if err := rows.Scan(&a.ID, &a.Path, &a.MediaType); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

type ExifResult struct {
	TakenAt *time.Time
	Camera, Lens, Aperture, Shutter, Focal string
	ISO      int
	Width, Height int
	Lat, Lon *float64
}

func (s *Store) SaveExif(ctx context.Context, id int64, r ExifResult) error {
	q := `UPDATE assets SET exif_done=1, camera=?, lens=?, iso=?, aperture=?, shutter=?, focal=?, width=?, height=?, lat=?, lon=?`
	args := []any{r.Camera, r.Lens, r.ISO, r.Aperture, r.Shutter, r.Focal, r.Width, r.Height, r.Lat, r.Lon}
	if r.TakenAt != nil {
		q += `, taken_at=?`
		args = append(args, r.TakenAt.Unix())
	}
	q += ` WHERE id=?`
	args = append(args, id)
	_, err := s.db.ExecContext(ctx, q, args...)
	return err
}

// --- lectura (API) ---

const assetCols = `id, path, filename, media_type, taken_at, width, height, camera, lens, iso, aperture, shutter, focal, lat, lon, size, is_favorite, exif_done, deleted_at`

func scanAsset(rows interface{ Scan(...any) error }) (Asset, error) {
	var a Asset
	var fav, exif int
	var lat, lon *float64
	var camera, lens, aperture, shutter, focal *string
	var iso, width, height *int
	err := rows.Scan(&a.ID, &a.Path, &a.Filename, &a.MediaType, &a.TakenAt, &width, &height,
		&camera, &lens, &iso, &aperture, &shutter, &focal, &lat, &lon, &a.Size, &fav, &exif, &a.DeletedAt)
	if err != nil {
		return a, err
	}
	a.IsFavorite = fav == 1
	a.ExifDone = exif == 1
	a.Lat, a.Lon = lat, lon
	if camera != nil { a.Camera = *camera }
	if lens != nil { a.Lens = *lens }
	if aperture != nil { a.Aperture = *aperture }
	if shutter != nil { a.Shutter = *shutter }
	if focal != nil { a.Focal = *focal }
	if iso != nil { a.ISO = *iso }
	if width != nil { a.Width = *width }
	if height != nil { a.Height = *height }
	return a, nil
}

// AssetsPage pagina por cursor (taken_at, id) descendente — scroll infinito estable.
func (s *Store) AssetsPage(ctx context.Context, beforeTaken int64, beforeID int64, limit int, favoritesOnly bool, query string) ([]Asset, error) {
	q := `SELECT ` + assetCols + ` FROM assets WHERE deleted_at IS NULL AND (taken_at < ? OR (taken_at = ? AND id < ?))`
	args := []any{beforeTaken, beforeTaken, beforeID}
	if favoritesOnly {
		q += ` AND is_favorite = 1`
	}
	if query != "" {
		q += ` AND (filename LIKE ? OR camera LIKE ? OR path LIKE ?)`
		like := "%" + query + "%"
		args = append(args, like, like, like)
	}
	q += ` ORDER BY taken_at DESC, id DESC LIMIT ?`
	args = append(args, limit)
	rows, err := s.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Asset{}
	for rows.Next() {
		a, err := scanAsset(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

func (s *Store) AssetByID(ctx context.Context, id int64) (Asset, error) {
	row := s.db.QueryRowContext(ctx, `SELECT `+assetCols+` FROM assets WHERE id=?`, id)
	return scanAsset(row)
}

func (s *Store) SetFavorite(ctx context.Context, id int64, fav bool) error {
	v := 0
	if fav {
		v = 1
	}
	_, err := s.db.ExecContext(ctx, `UPDATE assets SET is_favorite=? WHERE id=?`, v, id)
	return err
}

// OnThisDay: fotos de este mes-día (o ±dayRange días) en años anteriores.
func (s *Store) OnThisDay(ctx context.Context, month, day, thisYear, dayRange int) ([]Asset, error) {
	// pares (mes, día) del rango, evitando duplicados
	base := time.Date(2000, time.Month(month), day, 12, 0, 0, 0, time.UTC)
	seen := map[[2]int]bool{}
	var conds []string
	var args []any
	for j := -dayRange; j <= dayRange; j++ {
		t := base.AddDate(0, 0, j)
		k := [2]int{int(t.Month()), t.Day()}
		if seen[k] {
			continue
		}
		seen[k] = true
		conds = append(conds, `(CAST(strftime('%m', taken_at, 'unixepoch') AS INT) = ? AND CAST(strftime('%d', taken_at, 'unixepoch') AS INT) = ?)`)
		args = append(args, k[0], k[1])
	}
	args = append(args, thisYear)
	rows, err := s.db.QueryContext(ctx,
		`SELECT `+assetCols+` FROM assets
		 WHERE deleted_at IS NULL
		   AND (`+strings.Join(conds, " OR ")+`)
		   AND CAST(strftime('%Y', taken_at, 'unixepoch') AS INT) < ?
		 ORDER BY taken_at DESC`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Asset{}
	for rows.Next() {
		a, err := scanAsset(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// OnThisMonth: fotos del mes actual en años anteriores (fallback de highlights).
func (s *Store) OnThisMonth(ctx context.Context, month, thisYear, limit int) ([]Asset, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT `+assetCols+` FROM assets
		 WHERE deleted_at IS NULL
		   AND CAST(strftime('%m', taken_at, 'unixepoch') AS INT) = ?
		   AND CAST(strftime('%Y', taken_at, 'unixepoch') AS INT) < ?
		 ORDER BY taken_at DESC LIMIT ?`, month, thisYear, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Asset{}
	for rows.Next() {
		a, err := scanAsset(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// OldestAssets: las fotos más antiguas (último recurso de highlights).
func (s *Store) OldestAssets(ctx context.Context, limit int) ([]Asset, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT `+assetCols+` FROM assets WHERE deleted_at IS NULL ORDER BY taken_at ASC LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Asset{}
	for rows.Next() {
		a, err := scanAsset(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

func (s *Store) GeoAssets(ctx context.Context, limit int) ([]Asset, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT `+assetCols+` FROM assets WHERE deleted_at IS NULL AND lat IS NOT NULL ORDER BY taken_at DESC LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Asset{}
	for rows.Next() {
		a, err := scanAsset(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// YearCount: fotos por año de captura (para el scrubber "Rewind").
type YearCount struct {
	Year  int   `json:"year"`
	Count int64 `json:"count"`
}

// Calendar devuelve los años con fotos y su recuento, descendente.
func (s *Store) Calendar(ctx context.Context) ([]YearCount, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT CAST(strftime('%Y', taken_at, 'unixepoch') AS INT) AS y, count(*)
		 FROM assets WHERE deleted_at IS NULL GROUP BY y ORDER BY y DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []YearCount{}
	for rows.Next() {
		var yc YearCount
		if err := rows.Scan(&yc.Year, &yc.Count); err != nil {
			return nil, err
		}
		out = append(out, yc)
	}
	return out, rows.Err()
}

func (s *Store) Stats(ctx context.Context) (map[string]any, error) {
	var total, favs, geo, exifPending, videos int64
	row := s.db.QueryRowContext(ctx, `SELECT
		count(*),
		COALESCE(sum(is_favorite),0),
		COALESCE(sum(lat IS NOT NULL),0),
		COALESCE(sum(exif_done=0 AND media_type='image'),0),
		COALESCE(sum(media_type='video'),0)
	  FROM assets WHERE deleted_at IS NULL`)
	if err := row.Scan(&total, &favs, &geo, &exifPending, &videos); err != nil {
		return nil, err
	}
	return map[string]any{
		"assets": total, "favorites": favs, "geo": geo,
		"exifPending": exifPending, "videos": videos,
	}, nil
}
