// Package dav implementa el cliente WebDAV/Graph de OpenCloud.
// Patrón validado por el proyecto PhotoSort: Graph para descubrir espacios,
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
	".webp": true, ".gif": true, ".tiff": true, ".dng": true, ".raw": true,
}

var videoExt = map[string]bool{
	".mp4": true, ".mov": true, ".m4v": true, ".webm": true, ".3gp": true,
}

type Client struct {
	base     string
	user     string
	token    string
	http     *http.Client
}

func New(baseURL, user, appToken string) *Client {
	return &Client{
		base:  strings.TrimRight(baseURL, "/"),
		user:  user,
		token: appToken,
		http:  &http.Client{Timeout: 60 * time.Second},
	}
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
		} `xml:"propstat"`
	} `xml:"response"`
}

// ListFolder hace PROPFIND depth=1 sobre una carpeta.
func (c *Client) ListFolder(ctx context.Context, webdavURL, relPath string) ([]Entry, error) {
	u := strings.TrimRight(webdavURL, "/")
	if relPath != "" {
		for _, seg := range strings.Split(strings.Trim(relPath, "/"), "/") {
			if seg == ".." {
				return nil, fmt.Errorf("path traversal rechazado: %q", relPath)
			}
			u += "/" + url.PathEscape(seg)
		}
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
		return nil, fmt.Errorf("carpeta no encontrada: %s", relPath)
	}
	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("propfind %s: %s", relPath, resp.Status)
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	var ms multistatus
	if err := xml.Unmarshal(body, &ms); err != nil {
		return nil, err
	}
	entries := make([]Entry, 0, len(ms.Responses))
	for _, r := range ms.Responses {
		if len(r.PropStat) == 0 {
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
func (c *Client) GetRange(ctx context.Context, fileURL string, n int64) ([]byte, error) {
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, fileURL, nil)
	req.SetBasicAuth(c.user, c.token)
	req.Header.Set("Range", fmt.Sprintf("bytes=0-%d", n-1))
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	return io.ReadAll(resp.Body)
}
