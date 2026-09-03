package main

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"flag"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/coder/websocket"
	"github.com/paulohspdev-cmyk/ProjetoGerador/gateway-umbrella/adapters/internal/wire"
)

func main() {
	var id, endpoint, subprotocolsCSV, tokenEnv, caFile, certFile, keyFile string
	var maxBytes int64
	flag.StringVar(&id, "id", "websocket-1", "adapter id")
	flag.StringVar(&endpoint, "endpoint", "", "WebSocket endpoint: ws:// or wss://")
	flag.StringVar(&subprotocolsCSV, "subprotocols", "", "comma-separated WebSocket subprotocols")
	flag.StringVar(&tokenEnv, "bearer-token-env", "", "environment variable containing bearer token")
	flag.StringVar(&caFile, "ca-file", "", "optional CA PEM")
	flag.StringVar(&certFile, "client-cert", "", "optional mTLS client cert PEM")
	flag.StringVar(&keyFile, "client-key", "", "optional mTLS client key PEM")
	flag.Int64Var(&maxBytes, "max-message-bytes", 4<<20, "maximum accepted WebSocket message size")
	flag.Parse()

	if endpoint == "" {
		fatal("-endpoint is required")
	}
	if !strings.HasPrefix(endpoint, "ws://") && !strings.HasPrefix(endpoint, "wss://") {
		fatal("-endpoint must use ws:// or wss://")
	}
	if maxBytes < 1 {
		fatal("-max-message-bytes must be >0")
	}
	if (certFile == "") != (keyFile == "") {
		fatal("client-cert and client-key must be supplied together")
	}

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	out := wire.NewWriter(os.Stdout)

	tlsCfg, err := tlsConfig(caFile, certFile, keyFile)
	if err != nil {
		fatal(err.Error())
	}
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.TLSClientConfig = tlsCfg
	client := &http.Client{Transport: transport, Timeout: 20 * time.Second}
	header := http.Header{}
	if tokenEnv != "" {
		token := os.Getenv(tokenEnv)
		if token == "" {
			fatal("bearer token env is empty")
		}
		header.Set("Authorization", "Bearer "+token)
	}

	conn, resp, err := websocket.Dial(ctx, endpoint, &websocket.DialOptions{
		HTTPClient:   client,
		HTTPHeader:   header,
		Subprotocols: splitNonEmpty(subprotocolsCSV),
	})
	if err != nil {
		if resp != nil {
			fatal(fmt.Sprintf("WebSocket dial failed: %v (HTTP %s)", err, resp.Status))
		}
		fatal(fmt.Sprintf("WebSocket dial failed: %v", err))
	}
	defer conn.CloseNow()
	conn.SetReadLimit(maxBytes)

	for {
		messageType, payload, err := conn.Read(ctx)
		if err != nil {
			if ctx.Err() != nil || websocket.CloseStatus(err) == websocket.StatusNormalClosure {
				return
			}
			fatal(fmt.Sprintf("WebSocket read failed: %v", err))
		}
		kind := "binary"
		if messageType == websocket.MessageText {
			kind = "text"
		}
		if err := out.EmitBytes(wire.Message{
			Kind:       "observation",
			SessionID:  id,
			Transport:  "websocket",
			RemoteAddr: endpoint,
			Protocol:   "websocket",
			Meta: map[string]any{
				"messageType": kind,
				"subprotocol": conn.Subprotocol(),
				"readOnly":    true,
			},
		}, payload); err != nil {
			fatal(fmt.Sprintf("stdout: %v", err))
		}
	}
}

func splitNonEmpty(raw string) []string {
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part != "" {
			out = append(out, part)
		}
	}
	return out
}

func tlsConfig(caFile, certFile, keyFile string) (*tls.Config, error) {
	cfg := &tls.Config{MinVersion: tls.VersionTLS13}
	if caFile != "" {
		raw, err := os.ReadFile(caFile)
		if err != nil {
			return nil, err
		}
		pool := x509.NewCertPool()
		if !pool.AppendCertsFromPEM(raw) {
			return nil, fmt.Errorf("unable to parse CA PEM")
		}
		cfg.RootCAs = pool
	}
	if certFile != "" {
		cert, err := tls.LoadX509KeyPair(certFile, keyFile)
		if err != nil {
			return nil, err
		}
		cfg.Certificates = []tls.Certificate{cert}
	}
	return cfg, nil
}

func fatal(msg string) {
	fmt.Fprintln(os.Stderr, msg)
	os.Exit(1)
}
