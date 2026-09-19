package api

import (
	"bytes"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"testing/fstest"
)

func TestFilesAndUpload(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "sample.txt"), []byte("0123456789"), 0600); err != nil {
		t.Fatal(err)
	}
	root, err := os.OpenRoot(dir)
	if err != nil {
		t.Fatal(err)
	}
	defer root.Close()
	handler := Handler(root, fstest.MapFS{"index.html": {Data: []byte("<html>app</html>")}})
	request := func(url string) *httptest.ResponseRecorder {
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, httptest.NewRequest("GET", url, nil))
		return w
	}
	if w := request("/api/files"); w.Code != 200 || !strings.Contains(w.Body.String(), "sample.txt") {
		t.Fatalf("list: %d %s", w.Code, w.Body)
	}
	if w := request("/api/content?path=../outside.txt"); w.Code != 400 {
		t.Fatalf("traversal: %d", w.Code)
	}
	if w := request("/api/content?path=.hidden"); w.Code != 400 {
		t.Fatalf("hidden: %d", w.Code)
	}
	r := httptest.NewRequest("GET", "/api/content?path=sample.txt", nil)
	r.Header.Set("Range", "bytes=2-5")
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, r)
	if w.Code != http.StatusPartialContent || w.Body.String() != "2345" {
		t.Fatalf("range: %d %s", w.Code, w.Body)
	}
	if w := request("/files"); w.Code != 200 || !strings.Contains(w.Body.String(), "<html>") {
		t.Fatalf("SPA: %d", w.Code)
	}
	if w := request("/assets/missing.js"); w.Code != 404 {
		t.Fatalf("asset: %d", w.Code)
	}
	for i := 0; i < 2; i++ {
		var body bytes.Buffer
		writer := multipart.NewWriter(&body)
		part, err := writer.CreateFormFile("file", "手机.txt")
		if err != nil {
			t.Fatal(err)
		}
		io.WriteString(part, "来自手机")
		writer.Close()
		r := httptest.NewRequest("POST", "/api/upload", &body)
		r.Header.Set("Content-Type", writer.FormDataContentType())
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		if w.Code != 200 {
			t.Fatalf("upload: %d %s", w.Code, w.Body)
		}
	}
	for _, name := range []string{"手机.txt", "手机 (1).txt"} {
		data, err := os.ReadFile(filepath.Join(dir, name))
		if err != nil || string(data) != "来自手机" {
			t.Fatalf("saved upload %s: %s %v", name, data, err)
		}
	}
	r = httptest.NewRequest("POST", "/api/upload", nil)
	r.Header.Set("Origin", "https://other.example")
	w = httptest.NewRecorder()
	handler.ServeHTTP(w, r)
	if w.Code != 403 {
		t.Fatalf("cross origin: %d", w.Code)
	}
}
