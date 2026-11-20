package main

import (
	"context"
	"flag"
	"log"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"path/filepath"
	"strconv"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"localshare/internal/server"
)

func main() {
	defaultAddr, err := server.AddressFromEnv()
	if err != nil {
		log.Fatal(err)
	}
	executable, err := os.Executable()
	if err != nil {
		log.Fatal(err)
	}
	dir := flag.String("dir", filepath.Dir(executable), "shared directory")
	flag.Parse()
	httpServer, listener, cleanup, err := server.NewHTTPServer(defaultAddr, *dir)
	if err != nil {
		log.Fatal(err)
	}
	go func() {
		if err := httpServer.Serve(listener); err != nil && err != net.ErrClosed {
			log.Printf("server failed: %v", err)
		}
	}()

	port := listener.Addr().(*net.TCPAddr).Port
	target, err := url.Parse("http://127.0.0.1:" + strconv.Itoa(port))
	if err != nil {
		log.Fatal(err)
	}
	proxy := httputil.NewSingleHostReverseProxy(target)
	director := proxy.Director
	proxy.Director = func(request *http.Request) {
		director(request)
		request.Header.Set("X-LocalShare-Port", strconv.Itoa(port))
	}
	err = wails.Run(&options.App{
		Title:  "LocalShare",
		Width:  1200,
		Height: 800,
		AssetServer: &assetserver.Options{
			Handler: proxy,
		},
		OnShutdown: func(ctx context.Context) {
			if err := httpServer.Shutdown(ctx); err != nil {
				_ = httpServer.Close()
			}
			if err := cleanup(); err != nil {
				log.Printf("cleanup failed: %v", err)
			}
		},
	})
	if err != nil {
		_ = httpServer.Close()
		_ = cleanup()
		log.Fatal(err)
	}
}
