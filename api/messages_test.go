package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"testing/fstest"
)

func TestMessagesPersistencePaginationAndRetry(t *testing.T) {
	filename := filepath.Join(t.TempDir(), "messages.db")
	store, err := OpenMessages(filename)
	if err != nil {
		t.Fatal(err)
	}
	first, err := store.add(Message{SenderID: "phone", SenderName: "手机", RequestID: "retry", Kind: "text", Text: "你好\nhttps://example.com"})
	if err != nil {
		t.Fatal(err)
	}
	duplicate, err := store.add(Message{SenderID: "phone", SenderName: "手机", RequestID: "retry", Kind: "text", Text: "duplicate"})
	if err != nil || first.ID != duplicate.ID || first.Text != duplicate.Text {
		t.Fatalf("retry: %+v %v", duplicate, err)
	}
	for i := 0; i < 104; i++ {
		if _, err = store.add(Message{SenderID: "pc", SenderName: "电脑", RequestID: fmt.Sprint(i), Kind: "text", Text: "历史消息"}); err != nil {
			t.Fatal(err)
		}
	}
	store.Close()
	store, err = OpenMessages(filename)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	mux := http.NewServeMux()
	store.routes(mux)
	get := func(query string) []Message {
		t.Helper()
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, httptest.NewRequest("GET", "/api/messages"+query, nil))
		if w.Code != 200 {
			t.Fatalf("list: %d %s", w.Code, w.Body)
		}
		var result []Message
		if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
			t.Fatal(err)
		}
		return result
	}
	latest := get("")
	if len(latest) != 100 || latest[0].RequestID != "4" || latest[99].RequestID != "103" {
		t.Fatalf("latest: %v", latest)
	}
	older := get(fmt.Sprintf("?before=%d", latest[0].ID))
	if len(older) != 5 || older[0].Text != first.Text {
		t.Fatalf("restart/history: %v", older)
	}
	if next := get(fmt.Sprintf("?after=%d", latest[97].ID)); len(next) != 2 || next[0].ID != latest[98].ID {
		t.Fatalf("incremental: %v", next)
	}
	if next := get(fmt.Sprintf("?after=%d", latest[99].ID)); len(next) != 0 {
		t.Fatalf("empty: %v", next)
	}
	for _, body := range []string{`{}`, `{"senderId":"pc","senderName":"电脑","requestId":"empty","text":"  "}`} {
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, httptest.NewRequest("POST", "/api/messages", bytes.NewBufferString(body)))
		if w.Code != 400 {
			t.Fatalf("invalid text: %d", w.Code)
		}
	}
	body := `{"senderId":"pc","senderName":"电脑","requestId":"post","text":"来自电脑"}`
	for i := 0; i < 2; i++ {
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, httptest.NewRequest("POST", "/api/messages", bytes.NewBufferString(body)))
		if w.Code != 200 {
			t.Fatalf("post: %d %s", w.Code, w.Body)
		}
	}
	if next := get(fmt.Sprintf("?after=%d", latest[99].ID)); len(next) != 1 {
		t.Fatalf("POST retry duplicated: %v", next)
	}
}

func TestChatUploadAndHiddenDatabase(t *testing.T) {
	dir := t.TempDir()
	root, err := os.OpenRoot(dir)
	if err != nil {
		t.Fatal(err)
	}
	defer root.Close()
	store, err := OpenMessages(filepath.Join(dir, ".localshare.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	handler := Handler(root, fstest.MapFS{"index.html": {Data: []byte("app")}}, store)
	upload := func(id string) *httptest.ResponseRecorder {
		t.Helper()
		var body bytes.Buffer
		writer := multipart.NewWriter(&body)
		part, err := writer.CreateFormFile("file", "照片.txt")
		if err != nil {
			t.Fatal(err)
		}
		io.WriteString(part, "phone bytes")
		writer.Close()
		r := httptest.NewRequest("POST", "/api/upload?chat=1&senderId=phone&senderName=phone&requestId="+id, &body)
		r.Header.Set("Content-Type", writer.FormDataContentType())
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		return w
	}
	for i := 0; i < 2; i++ {
		w := upload("one")
		if w.Code != 200 {
			t.Fatalf("upload: %d %s", w.Code, w.Body)
		}
		var m Message
		json.Unmarshal(w.Body.Bytes(), &m)
		if m.ID != 1 || m.FileName != "照片.txt" || m.FileSize != 11 {
			t.Fatalf("file message: %+v", m)
		}
	}
	if _, err := os.Stat(filepath.Join(dir, "照片 (1).txt")); !os.IsNotExist(err) {
		t.Fatal("retry created duplicate file")
	}
	if w := upload("two"); w.Code != 200 {
		t.Fatalf("second: %d", w.Code)
	}
	if data, err := os.ReadFile(filepath.Join(dir, "照片 (1).txt")); err != nil || string(data) != "phone bytes" {
		t.Fatalf("root upload: %s %v", data, err)
	}
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, httptest.NewRequest("GET", "/api/files", nil))
	if bytes.Contains(w.Body.Bytes(), []byte(".localshare")) {
		t.Fatal("database listed")
	}
	w = httptest.NewRecorder()
	handler.ServeHTTP(w, httptest.NewRequest("GET", "/api/content?path=.localshare.db", nil))
	if w.Code != 400 {
		t.Fatal("database exposed")
	}
	// A failed database write must not leave an untracked uploaded file.
	if _, err := store.db.Exec(`CREATE TRIGGER fail_message BEFORE INSERT ON messages BEGIN SELECT RAISE(ABORT, 'simulated write failure'); END`); err != nil {
		t.Fatal(err)
	}
	w = upload("failed")
	if w.Code != 500 {
		t.Fatalf("db failure: %d", w.Code)
	}
	if _, err := os.Stat(filepath.Join(dir, "照片 (2).txt")); !os.IsNotExist(err) {
		t.Fatal("failed message left file")
	}
}
