package main

import (
	"context"
	"flag"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/paulohspdev-cmyk/ProjetoGerador/gateway-umbrella/adapters/internal/wire"
	"github.com/plgd-dev/go-coap/v3/udp"
)

func main() {
	endpoint := flag.String("endpoint", "", "CoAP UDP endpoint, for example 10.0.0.20:5683")
	path := flag.String("path", "/", "CoAP resource path")
	interval := flag.Duration("interval", 5*time.Second, "GET interval")
	timeout := flag.Duration("timeout", 2*time.Second, "GET timeout")
	flag.Parse()

	if *endpoint == "" {
		log.Fatal("-endpoint is required")
	}
	if *path == "" || (*path)[0] != '/' {
		log.Fatal("-path must start with /")
	}
	if *interval <= 0 || *timeout <= 0 {
		log.Fatal("-interval and -timeout must be greater than zero")
	}

	client, err := udp.Dial(*endpoint)
	if err != nil {
		log.Fatalf("connect CoAP: %v", err)
	}
	defer client.Close()

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	out := wire.NewWriter(os.Stdout)

	poll := func() {
		requestCtx, requestCancel := context.WithTimeout(ctx, *timeout)
		defer requestCancel()
		resp, err := client.Get(requestCtx, *path)
		if err != nil {
			_ = out.EmitBytes(wire.Message{
				Kind:       "data",
				SessionID:  *endpoint,
				Transport:  "udp",
				RemoteAddr: *endpoint,
				Protocol:   "coap",
				Meta: map[string]any{
					"path":    *path,
					"quality": "BAD",
					"error":   err.Error(),
				},
			}, nil)
			return
		}
		payload, err := resp.ReadBody()
		if err != nil {
			_ = out.EmitBytes(wire.Message{
				Kind:       "data",
				SessionID:  *endpoint,
				Transport:  "udp",
				RemoteAddr: *endpoint,
				Protocol:   "coap",
				Meta: map[string]any{
					"path":    *path,
					"quality": "BAD",
					"error":   err.Error(),
				},
			}, nil)
			return
		}
		if err := out.EmitBytes(wire.Message{
			Kind:       "data",
			SessionID:  *endpoint,
			Transport:  "udp",
			RemoteAddr: *endpoint,
			Protocol:   "coap",
			Meta: map[string]any{
				"path":    *path,
				"code":    resp.Code().String(),
				"quality": "GOOD",
			},
		}, payload); err != nil {
			log.Fatalf("emit CoAP value: %v", err)
		}
	}

	poll()
	ticker := time.NewTicker(*interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			poll()
		}
	}
}
