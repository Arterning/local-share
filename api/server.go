package main

import (
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"mime"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

type Entry struct {
	Name      string    `json:"name"`
	Path      string    `json:"path"`
	Size      int64     `json:"size"`
	Directory bool      `json:"directory"`
	Modified  time.Time `json:"modified"`
}

func reply(w http.ResponseWriter, value any) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(value)
}
func safePath(r *http.Request) (string, bool) {
	p := r.URL.Query().Get("path")
	if p == "" {
		p = "."
	}
	if strings.Contains(p, "\\") || !filepath.IsLocal(p) {
		return "", false
	}
	for _, part := range strings.Split(p, "/") {
		if part == ".." || (strings.HasPrefix(part, ".") && part != ".") {
			return "", false
		}
	}
	return p, true
}

func Handler(root *os.Root, assets fs.FS, stores ...*MessageStore) http.Handler {
	mux := http.NewServeMux()
	var messages *MessageStore
	if len(stores) > 0 {
		messages = stores[0]
		messages.routes(mux)
	}
	mux.HandleFunc("GET /api/files", func(w http.ResponseWriter, r *http.Request) {
		p, ok := safePath(r)
		if !ok {
			http.Error(w, "无效路径", 400)
			return
		}
		f, err := root.Open(p)
		if err != nil {
			http.Error(w, "无法读取目录", 404)
			return
		}
		defer f.Close()
		entries, err := f.ReadDir(-1)
		if err != nil {
			http.Error(w, "无法读取目录", 400)
			return
		}
		result := []Entry{}
		for _, e := range entries {
			if strings.HasPrefix(e.Name(), ".") || e.Type()&os.ModeSymlink != 0 {
				continue
			}
			info, err := e.Info()
			if err != nil || (!info.IsDir() && !info.Mode().IsRegular()) {
				continue
			}
			result = append(result, Entry{e.Name(), path.Join(p, e.Name()), info.Size(), info.IsDir(), info.ModTime()})
		}
		sort.Slice(result, func(i, j int) bool {
			if result[i].Directory != result[j].Directory {
				return result[i].Directory
			}
			return strings.ToLower(result[i].Name) < strings.ToLower(result[j].Name)
		})
		reply(w, result)
	})
	mux.HandleFunc("GET /api/content", func(w http.ResponseWriter, r *http.Request) {
		p, ok := safePath(r)
		if !ok {
			http.Error(w, "无效路径", 400)
			return
		}
		f, err := root.Open(p)
		if err != nil {
			http.Error(w, "文件不存在或无法读取", 404)
			return
		}
		defer f.Close()
		info, err := f.Stat()
		if err != nil || !info.Mode().IsRegular() {
			http.Error(w, "无法读取文件", 400)
			return
		}
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Content-Security-Policy", "sandbox")
		if r.URL.Query().Get("text") == "1" {
			w.Header().Set("Content-Type", "text/plain; charset=utf-8")
			io.Copy(w, io.LimitReader(f, 1024*1024))
			return
		}
		if r.URL.Query().Get("download") == "1" {
			w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": info.Name()}))
		}
		http.ServeContent(w, r, info.Name(), info.ModTime(), f)
	})
	mux.HandleFunc("POST /api/upload", func(w http.ResponseWriter, r *http.Request) {
		var message Message
		chat := r.URL.Query().Get("chat") == "1"
		if chat {
			if messages == nil {
				http.Error(w, "消息服务未启动", 503)
				return
			}
			messages.uploads.Lock()
			defer messages.uploads.Unlock()
			var ok bool
			message, ok = messages.uploadIdentity(w, r)
			if !ok {
				return
			}
		}
		r.Body = http.MaxBytesReader(w, r.Body, 10<<30)
		reader, err := r.MultipartReader()
		if err != nil {
			http.Error(w, "无效上传请求", 400)
			return
		}
		part, err := reader.NextPart()
		if err != nil {
			http.Error(w, "请选择文件", 400)
			return
		}
		defer part.Close()
		name := part.FileName()
		if name == "" || strings.ContainsAny(name, "/\\:") || strings.HasPrefix(name, ".") || !filepath.IsLocal(name) {
			http.Error(w, "无效文件名", 400)
			return
		}
		var file *os.File
		original := name
		for i := 0; i < 10000; i++ {
			if i > 0 {
				ext := filepath.Ext(original)
				name = fmt.Sprintf("%s (%d)%s", strings.TrimSuffix(original, ext), i, ext)
			}
			file, err = root.OpenFile(name, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
			if !os.IsExist(err) {
				break
			}
		}
		if err != nil {
			http.Error(w, "无法保存文件，请检查目录权限", 500)
			return
		}
		size, copyErr := io.Copy(file, part)
		closeErr := file.Close()
		if copyErr != nil || closeErr != nil {
			root.Remove(name)
			http.Error(w, "上传失败或文件超过 10 GB", 400)
			return
		}
		if chat {
			message.FileName = name
			message.FileSize = size
			saved, err := messages.add(message)
			if err != nil {
				root.Remove(name)
				http.Error(w, "消息保存失败，请重新上传", 500)
				return
			}
			reply(w, saved)
			return
		}
		reply(w, map[string]string{"name": name})
	})
	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) { http.Error(w, "接口不存在", 404) })
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			http.Error(w, "不支持此请求方法", http.StatusMethodNotAllowed)
			return
		}
		p := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
		if p == "" {
			p = "index.html"
		}
		data, err := fs.ReadFile(assets, p)
		if err != nil {
			if path.Ext(p) != "" {
				http.NotFound(w, r)
				return
			}
			p = "index.html"
			data, err = fs.ReadFile(assets, p)
		}
		if err != nil {
			http.Error(w, "请先构建前端", 500)
			return
		}
		if t := mime.TypeByExtension(path.Ext(p)); t != "" {
			w.Header().Set("Content-Type", t)
		}
		w.Write(data)
	})
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Browser cross-origin requests cannot read or modify the shared directory.
		if origin := r.Header.Get("Origin"); origin != "" && origin != "http://"+r.Host && origin != "https://"+r.Host {
			http.Error(w, "不允许跨站请求", 403)
			return
		}
		if r.Header.Get("Sec-Fetch-Site") == "cross-site" {
			http.Error(w, "不允许跨站请求", 403)
			return
		}
		mux.ServeHTTP(w, r)
	})
}
