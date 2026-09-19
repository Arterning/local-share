package main

import (
	"embed"
	"flag"
	"io/fs"
	"localshare/api"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
)

//go:embed all:web/dist
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
	assets, err := fs.Sub(frontend, "web/dist")
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
	log.Fatal(http.ListenAndServe(*addr, api.Handler(root, assets)))
}
