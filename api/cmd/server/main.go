package main

import (
	"context"
	"flag"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"time"

	"localshare/internal/server"
)

func main() {
	executable, err := os.Executable()
	if err != nil {
		log.Fatal(err)
	}
	defaultAddr, err := server.AddressFromEnv()
	if err != nil {
		log.Fatal(err)
	}
	dir := flag.String("dir", filepath.Dir(executable), "shared directory")
	addr := flag.String("addr", defaultAddr, "listen address")
	flag.Parse()

	httpServer, listener, cleanup, err := server.NewHTTPServer(*addr, *dir)
	if err != nil {
		log.Fatal(err)
	}
	defer cleanup()
	port := listener.Addr().(*net.TCPAddr).Port
	log.Printf("shared directory: %s", *dir)
	log.Printf("local address: http://localhost:%d", port)
	if addresses, err := net.InterfaceAddrs(); err == nil {
		for _, address := range addresses {
			if ip, ok := address.(*net.IPNet); ok && !ip.IP.IsLoopback() && ip.IP.To4() != nil {
				log.Printf("LAN address: http://%s", net.JoinHostPort(ip.IP.String(), strconv.Itoa(port)))
			}
		}
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := httpServer.Shutdown(shutdown); err != nil {
			_ = httpServer.Close()
		}
	}()
	if err := httpServer.Serve(listener); err != nil && err != http.ErrServerClosed {
		log.Printf("server failed: %v", err)
	}
}
