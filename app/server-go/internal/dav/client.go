// Package dav implementa el cliente WebDAV/Graph de OpenCloud.
// Patrón validado por PhotoSort: Graph para descubrir espacios,
// PROPFIND para recorrer, GET/Range para contenido. Auth: usuario + app-token.
package dav

import (
	"bytes"
	"context"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path"
	"strings"
	"time"
)

const propfindBody = `<?xml version="1.0"?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:resourcetype/><d:getetag/><d:getlastmodified/>
    <d:getcontentlength/><d:getcontenttype/>
  </d:prop>
</d:propfind>`

var imageExt = map[string]bool{
	".jpg": true, ".jpeg": true, ".png": true, ".heic": true, ".heif": true,
	".webp": true, ".gif": true, ".tiff": true, ".dng": true,
}

var videoExt = map[string]bool{
	".mp4": true, ".mov": true, ".m4v": true, ".webm": true, ".3gp": true,
}

type Client struct {
	base  string
	user  string
	token string
	http  *http.Client
}

func New(baseURL, user, appToken string) *Client {
	return &Client{
		base:  strings.TrimRight(baseURL, "/"),
		user:  user,
		token: appToken,
		http:  &http.Client{Timeout: 120 * time.Second},
	}
}

// FileURL resuelve un href DAV (ruta absoluta del servidor) a URL completa.
func (c *Client) FileURL(href string) string {
	if strings.HasPrefix(href, "http") {
		return href
	}
	return c.base + href
}

// SpaceFileURL construye la URL interna de un fichero a partir del webDavUrl del
// espacio y de su ruta relativa ("/Fotos/IMG.heic"), usando la base configurada
// (permite que el servicio use 127.0.0.1 en vez de la URL pública).
func (c *Client) SpaceFileURL(webdavURL, relPath string) string {
	u, err := url.Parse(webdavURL)
	if err != nil || u.Path == "" {
		return c.base + relPath
	}
	segs := strings.Split(strings.Trim(relPath, "/"), "/")
	esc := make([]string, 0, len(segs))
	for _, s := range segs {
		if s != "" {
			esc = append(esc, url.PathEscape(s))
		}
	}
	return c.base + strings.TrimRight(u.Path, "/") + "/" + strings.Join(esc, "/")
}

type Drive struct {
	ID        string
	Name      string
	DriveType string
	WebDAVURL string
}

// ListDrives llama a GET /graph/v1.0/me/drives y devuelve los espacios del usuario.
func (c *Client) ListDrives(ctx context.Context) ([]Drive, error) {
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, c.base+"/graph/v1.0/me/drives", nil)
	req.SetBasicAuth(c.user, c.token)
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("graph /me/drives: %s", resp.Status)
	}
	var out struct {
		Value []struct {
			ID        string `json:"id"`
			Name      string `json:"name"`
			DriveType string `json:"driveType"`
			Root      struct {
				WebDAVURL string `json:"webDavUrl"`
			} `json:"root"`
		} `json:"value"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, err
	}
	drives := make([]Drive, 0, len(out.Value))
	for _, d := range out.Value {
		drives = append(drives, Drive{d.ID, d.Name, d.DriveType, d.Root.WebDAVURL})
	}
	return drives, nil
}

type Entry struct {
	Href         string
	IsDir        bool
	ETag         string
	LastModified time.Time
	Size         int64
	ContentType  string
}

func (e Entry) IsMedia() bool {
	ext := strings.ToLower(path.Ext(e.Href))
	return imageExt[ext] || videoExt[ext]
}

func (e Entry) IsVideo() bool {
	return videoExt[strings.ToLower(path.Ext(e.Href))]
}

type multistatus struct {
	Responses []struct {
		Href     string `xml:"href"`
		PropStat []struct {
			Prop struct {
				ResourceType struct {
					Collection *struct{} `xml:"collection"`
				} `xml:"resourcetype"`
				ETag         string `xml:"getetag"`
				LastModified string `xml:"getlastmodified"`
				Length       int64  `xml:"getcontentlength"`
				ContentType  string `xml:"getcontenttype"`
			} `xml:"prop"`
			Status string `xml:"status"`
		} `xml:"propstat"`
	} `xml:"response"`
}

// ListFolder hace PROPFIND depth=1. folderRef admite ruta relativa al space
// ("Viajes/2025") o href absoluto devuelto por un listado anterior.
func (c *Client) ListFolder(ctx context.Context, webdavURL, folderRef string) ([]Entry, error) {
	var u string
	if strings.HasPrefix(folderRef, "/") {
		u = c.base + folderRef
	} else if folderRef == "" {
		u = strings.TrimRight(webdavURL, "/") + "/"
	} else {
		u = strings.TrimRight(webdavURL, "/")
		for _, seg := range strings.Split(strings.Trim(folderRef, "/"), "/") {
			if seg == ".." {
				return nil, fmt.Errorf("path traversal rechazado: %q", folderRef)
			}
			u += "/" + url.PathEscape(seg)
		}
		u += "/"
	}

	req, _ := http.NewRequestWithContext(ctx, "PROPFIND", u, bytes.NewBufferString(propfindBody))
	req.SetBasicAuth(c.user, c.token)
	req.Header.Set("Depth", "1")
	req.Header.Set("Content-Type", "application/xml")

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound {
		return nil, fmt.Errorf("carpeta no encontrada: %s", folderRef)
	}
	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("propfind %s: %s", folderRef, resp.Status)
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	var ms multistatus
	if err := xml.Unmarshal(body, &ms); err != nil {
		return nil, err
	}

	selfPath, _ := url.Parse(u)
	entries := make([]Entry, 0, len(ms.Responses))
	for _, r := range ms.Responses {
		// excluye la entrada de la propia carpeta
		if selfPath != nil && r.Href == selfPath.Path {
			continue
		}
		if len(r.PropStat) == 0 || !strings.Contains(r.PropStat[0].Status, "200") {
			continue
		}
		p := r.PropStat[0].Prop
		mtime, _ := time.Parse(time.RFC1123, p.LastModified)
		entries = append(entries, Entry{
			Href:         r.Href,
			IsDir:        p.ResourceType.Collection != nil,
			ETag:         p.ETag,
			LastModified: mtime,
			Size:         p.Length,
			ContentType:  p.ContentType,
		})
	}
	return entries, nil
}

// GetRange descarga los primeros n bytes (cabecera EXIF sin bajar el fichero entero).
func (c *Client) GetRange(ctx context.Context, href string, n int64) ([]byte, error) {
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, c.FileURL(href), nil)
	req.SetBasicAuth(c.user, c.token)
	req.Header.Set("Range", fmt.Sprintf("bytes=0-%d", n-1))
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("range %s: %s", href, resp.Status)
	}
	return io.ReadAll(resp.Body)
}

// Download abre un stream del fichero completo (caller cierra el body).
func (c *Client) Download(ctx context.Context, href string) (io.ReadCloser, string, error) {
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, c.FileURL(href), nil)
	req.SetBasicAuth(c.user, c.token)
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, "", err
	}
	if resp.StatusCode >= 300 {
		resp.Body.Close()
		return nil, "", fmt.Errorf("download %s: %s", href, resp.Status)
	}
	ct := resp.Header.Get("Content-Type")
	return resp.Body, ct, nil
}
