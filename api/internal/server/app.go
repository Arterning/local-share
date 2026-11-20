package server

import (
	"embed"
	"fmt"
	"io/fs"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"time"
)

//go:embed all:dist
var frontend embed.FS

func AddressFromEnv() (string, error) {
	port := os.Getenv("LOCALSHARE_PORT")
	if port == "" {
		return ":0", nil
	}
	number, err := strconv.Atoi(port)
	if err != nil || number < 1 || number > 65535 {
		return "", fmt.Errorf("LOCALSHARE_PORT must be a port from 1 to 65535")
	}
	return ":" + port, nil
}

func NewHTTPServer(addr, dir string) (*http.Server, net.Listener, func() error, error) {
	root, err := os.OpenRoot(dir)
	if err != nil {
		return nil, nil, nil, err
	}
	messages, err := OpenMessages(filepath.Join(dir, ".localshare.db"))
	if err != nil {
		root.Close()
		return nil, nil, nil, fmt.Errorf("open message database: %w", err)
	}
	assets, err := fs.Sub(frontend, "dist")
	if err != nil {
		messages.Close()
		root.Close()
		return nil, nil, nil, err
	}
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		messages.Close()
		root.Close()
		return nil, nil, nil, err
	}
	server := &http.Server{
		Handler:           Handler(root, assets, messages),
		ReadHeaderTimeout: 10 * time.Second,
	}
	cleanup := func() error {
		messageErr := messages.Close()
		rootErr := root.Close()
		if messageErr != nil {
			return messageErr
		}
		return rootErr
	}
	return server, listener, cleanup, nil
}
