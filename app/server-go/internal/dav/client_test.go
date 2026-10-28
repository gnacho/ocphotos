package dav

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestPutWritesFile(t *testing.T) {
	var gotBody string
	var gotType, gotAuth string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPut {
			t.Errorf("método: %s", r.Method)
		}
		b, _ := io.ReadAll(r.Body)
		gotBody = string(b)
		gotType = r.Header.Get("Content-Type")
		gotAuth = r.Header.Get("Authorization")
		w.WriteHeader(http.StatusCreated)
	}))
	defer srv.Close()

	c := New(srv.URL, "nacho", "app-token")
	if err := c.Put(context.Background(), "/Fotos/a.jpg.xmp", "application/rdf+xml", []byte("<x/>")); err != nil {
		t.Fatalf("put: %v", err)
	}
	if gotBody != "<x/>" {
		t.Fatalf("body: %q", gotBody)
	}
	if gotType != "application/rdf+xml" {
		t.Fatalf("content-type: %q", gotType)
	}
	if gotAuth == "" {
		t.Fatal("se esperaba autenticación básica")
	}
}

func TestPutReportsErrorStatus(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusForbidden)
	}))
	defer srv.Close()

	c := New(srv.URL, "nacho", "app-token")
	if err := c.Put(context.Background(), "/Fotos/a.jpg.xmp", "application/rdf+xml", []byte("<x/>")); err == nil {
		t.Fatal("se esperaba error con 403")
	}
}

func TestGetSmallMissingFile(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()

	c := New(srv.URL, "nacho", "app-token")
	b, found, err := c.GetSmall(context.Background(), "/Fotos/nada.xmp")
	if err != nil || found || b != nil {
		t.Fatalf("se esperaba no encontrado sin error: %v %v %q", err, found, b)
	}
}

func TestGetSmallReturnsContent(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		io.WriteString(w, "<xmp/>")
	}))
	defer srv.Close()

	c := New(srv.URL, "nacho", "app-token")
	b, found, err := c.GetSmall(context.Background(), "/Fotos/a.jpg.xmp")
	if err != nil || !found {
		t.Fatalf("err=%v found=%v", err, found)
	}
	if string(b) != "<xmp/>" {
		t.Fatalf("body: %q", b)
	}
}
