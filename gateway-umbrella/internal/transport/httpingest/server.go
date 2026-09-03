package httpingest

import (
	"context"
	"crypto/subtle"
	"github.com/paulohspdev-cmyk/ProjetoGerador/gateway-umbrella/internal/core"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

type Server struct {
	ID             string
	Bind           string
	Path           string
	BearerTokenEnv string
	MaxBodyBytes   int64
	ProtocolHint   string
}

func (s *Server) Run(ctx context.Context, sink core.Sink) error {
	if s.Path == "" {
		s.Path = "/ingest"
	}
	if s.MaxBodyBytes <= 0 {
		s.MaxBodyBytes = 1 << 20
	}
	token := ""
	if s.BearerTokenEnv != "" {
		token = os.Getenv(s.BearerTokenEnv)
		if token == "" {
			return &ConfigError{"bearer token env is configured but empty"}
		}
	}
	mux := http.NewServeMux()
	mux.HandleFunc(s.Path, func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if token != "" && !validBearer(r.Header.Get("Authorization"), token) {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, s.MaxBodyBytes)
		payload, err := io.ReadAll(r.Body)
		if err != nil {
			http.Error(w, "invalid body", http.StatusBadRequest)
			return
		}
		sink.Publish(core.Event{Kind: core.EventDatagram, ListenerID: s.ID, Transport: "http", RemoteAddr: r.RemoteAddr, LocalAddr: s.Bind, ProtocolHint: s.ProtocolHint, ReceivedAt: time.Now().UTC(), Payload: payload, Meta: map[string]any{"contentType": r.Header.Get("Content-Type"), "userAgent": r.UserAgent()}})
		w.WriteHeader(http.StatusAccepted)
		_, _ = w.Write([]byte("accepted\n"))
	})
	srv := &http.Server{Addr: s.Bind, Handler: mux, ReadHeaderTimeout: 5 * time.Second}
	errCh := make(chan error, 1)
	go func() { errCh <- srv.ListenAndServe() }()
	select {
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = srv.Shutdown(shutdownCtx)
		return nil
	case err := <-errCh:
		if err == http.ErrServerClosed {
			return nil
		}
		return err
	}
}
func validBearer(header, token string) bool {
	const prefix = "Bearer "
	if !strings.HasPrefix(header, prefix) {
		return false
	}
	got := strings.TrimPrefix(header, prefix)
	if len(got) != len(token) {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(got), []byte(token)) == 1
}

type ConfigError struct{ message string }

func (e *ConfigError) Error() string { return e.message }
