package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	_ "modernc.org/sqlite"
)

type Message struct {
	ID         int64  `json:"id"`
	RequestID  string `json:"requestId"`
	SenderID   string `json:"senderId"`
	SenderName string `json:"senderName"`
	Kind       string `json:"kind"`
	Text       string `json:"text"`
	FileName   string `json:"fileName"`
	FileSize   int64  `json:"fileSize"`
	CreatedAt  string `json:"createdAt"`
}

type MessageStore struct {
	db      *sql.DB
	uploads sync.Mutex
}

func OpenMessages(filename string) (*MessageStore, error) {
	db, err := sql.Open("sqlite", filename)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	_, err = db.Exec(`PRAGMA busy_timeout=5000;
 PRAGMA journal_mode=WAL;
 CREATE TABLE IF NOT EXISTS messages (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 request_id TEXT NOT NULL,
 sender_id TEXT NOT NULL,
 sender_name TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('text','file')),
 text TEXT NOT NULL DEFAULT '',
 file_name TEXT NOT NULL DEFAULT '',
 file_size INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL,
 UNIQUE(sender_id,request_id)
 );`)
	if err != nil {
		db.Close()
		return nil, err
	}
	return &MessageStore{db: db}, nil
}
func (s *MessageStore) Close() error { return s.db.Close() }

const messageColumns = "id,request_id,sender_id,sender_name,kind,text,file_name,file_size,created_at"

type scanner interface{ Scan(...any) error }

func scanMessage(row scanner) (Message, error) {
	var m Message
	err := row.Scan(&m.ID, &m.RequestID, &m.SenderID, &m.SenderName, &m.Kind, &m.Text, &m.FileName, &m.FileSize, &m.CreatedAt)
	return m, err
}
func (s *MessageStore) find(sender, request string) (Message, error) {
	return scanMessage(s.db.QueryRow("SELECT "+messageColumns+" FROM messages WHERE sender_id=? AND request_id=?", sender, request))
}
func (s *MessageStore) add(m Message) (Message, error) {
	m.CreatedAt = time.Now().UTC().Format(time.RFC3339Nano)
	_, err := s.db.Exec(`INSERT INTO messages (request_id,sender_id,sender_name,kind,text,file_name,file_size,created_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(sender_id,request_id) DO NOTHING`, m.RequestID, m.SenderID, m.SenderName, m.Kind, m.Text, m.FileName, m.FileSize, m.CreatedAt)
	if err != nil {
		return Message{}, err
	}
	return s.find(m.SenderID, m.RequestID)
}
func validIdentity(m Message) bool {
	return len(m.SenderID) > 0 && len(m.SenderID) <= 100 && len(m.RequestID) > 0 && len(m.RequestID) <= 100 && len(strings.TrimSpace(m.SenderName)) > 0 && len(m.SenderName) <= 100
}
func (s *MessageStore) routes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/messages", func(w http.ResponseWriter, r *http.Request) {
		after, before := int64(0), int64(0)
		for key, target := range map[string]*int64{"after": &after, "before": &before} {
			if value := r.URL.Query().Get(key); value != "" {
				parsed, err := strconv.ParseInt(value, 10, 64)
				if err != nil || parsed < 0 {
					http.Error(w, "无效消息游标", 400)
					return
				}
				*target = parsed
			}
		}
		if after > 0 && before > 0 {
			http.Error(w, "不能同时指定两个游标", 400)
			return
		}
		query := "SELECT " + messageColumns + " FROM messages"
		args := []any{}
		if after > 0 {
			query += " WHERE id>?"
			args = append(args, after)
		} else if before > 0 {
			query += " WHERE id<?"
			args = append(args, before)
		}
		if after > 0 {
			query += " ORDER BY id ASC LIMIT 100"
		} else {
			query += " ORDER BY id DESC LIMIT 100"
		}
		rows, err := s.db.QueryContext(r.Context(), query, args...)
		if err != nil {
			http.Error(w, "无法读取消息", 500)
			return
		}
		defer rows.Close()
		result := []Message{}
		for rows.Next() {
			m, err := scanMessage(rows)
			if err != nil {
				http.Error(w, "无法读取消息", 500)
				return
			}
			result = append(result, m)
		}
		if rows.Err() != nil {
			http.Error(w, "无法读取消息", 500)
			return
		}
		if after == 0 {
			for i, j := 0, len(result)-1; i < j; i, j = i+1, j-1 {
				result[i], result[j] = result[j], result[i]
			}
		}
		w.Header().Set("Cache-Control", "no-store")
		reply(w, result)
	})
	mux.HandleFunc("POST /api/messages", func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, 128<<10)
		var m Message
		if err := json.NewDecoder(r.Body).Decode(&m); err != nil || !validIdentity(m) || strings.TrimSpace(m.Text) == "" || len(m.Text) > 64<<10 {
			http.Error(w, "消息不能为空，且不能超过 64 KB", 400)
			return
		}
		saved, err := s.add(Message{SenderID: m.SenderID, SenderName: m.SenderName, RequestID: m.RequestID, Kind: "text", Text: m.Text})
		if err != nil {
			http.Error(w, "消息保存失败，请重试", 500)
			return
		}
		reply(w, saved)
	})
}

func (s *MessageStore) uploadIdentity(w http.ResponseWriter, r *http.Request) (Message, bool) {
	m := Message{SenderID: r.URL.Query().Get("senderId"), SenderName: r.URL.Query().Get("senderName"), RequestID: r.URL.Query().Get("requestId"), Kind: "file"}
	if !validIdentity(m) {
		http.Error(w, "无效发送设备信息", 400)
		return m, false
	}
	previous, err := s.find(m.SenderID, m.RequestID)
	if err == nil {
		reply(w, previous)
		return m, false
	}
	if !errors.Is(err, sql.ErrNoRows) {
		http.Error(w, "无法读取消息记录", 500)
		return m, false
	}
	return m, true
}
