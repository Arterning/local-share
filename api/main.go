package main

import (
	"context"
	"embed"
	"errors"
	"flag"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"time"
)

//go:embed all:dist
var frontend embed.FS

func main() {
	exe, err := os.Executable()
	if err != nil {
		log.Fatal(err)
	}
	dir := flag.String("dir", filepath.Dir(exe), "共享目录，默认 exe 所在目录")
	addr := flag.String("addr", ":8080", "监听地址")
	flag.Parse()
	root, err := os.OpenRoot(*dir)
	if err != nil {
		log.Fatal(err)
	}
	defer root.Close()
	messages, err := OpenMessages(filepath.Join(*dir, ".localshare.db"))
	if err != nil {
		log.Fatal("无法打开消息数据库: ", err)
	}
	defer messages.Close()
	assets, err := fs.Sub(frontend, "dist")
	if err != nil {
		log.Fatal(err)
	}
	log.Printf("共享目录: %s", *dir)
	log.Printf("本机访问: http://localhost%s", *addr)
	if addresses, err := net.InterfaceAddrs(); err == nil {
		for _, a := range addresses {
			if ip, ok := a.(*net.IPNet); ok && !ip.IP.IsLoopback() && ip.IP.To4() != nil {
				log.Printf("手机访问: http://%s%s", ip.IP, *addr)
			}
		}
	}
	server := &http.Server{Addr: *addr, Handler: Handler(root, assets, messages), ReadHeaderTimeout: 10 * time.Second}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()
	done := make(chan struct{})
	go func() {
		defer close(done)
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := server.Shutdown(shutdown); err != nil {
			server.Close()
		}
	}()
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Printf("服务启动失败: %v", err)
	}
	stop()
	<-done
}
