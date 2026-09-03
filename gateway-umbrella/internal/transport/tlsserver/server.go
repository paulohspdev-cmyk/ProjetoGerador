package tlsserver

import (
	"context"
	"crypto/sha256"
	"crypto/tls"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net"
	"sync/atomic"
	"time"

	"github.com/paulohspdev-cmyk/ProjetoGerador/gateway-umbrella/internal/core"
	"github.com/paulohspdev-cmyk/ProjetoGerador/gateway-umbrella/internal/security"
	"github.com/paulohspdev-cmyk/ProjetoGerador/gateway-umbrella/internal/transport/netutil"
)

type Server struct {
	ID                string
	Bind              string
	AllowedCIDRs      []string
	ReadTimeout       time.Duration
	MaxConnections    int
	ProtocolHint      string
	CertFile          string
	KeyFile           string
	ClientCAFile      string
	RequireClientCert bool
	counter           atomic.Uint64
	active            atomic.Int64
}

func (s *Server) Run(ctx context.Context, sink core.Sink) error {
	allowed, err := netutil.ParsePrefixes(s.AllowedCIDRs)
	if err != nil {
		return err
	}
	cfg, err := security.ServerTLS(s.CertFile, s.KeyFile, s.ClientCAFile, s.RequireClientCert)
	if err != nil {
		return err
	}
	if s.MaxConnections <= 0 {
		s.MaxConnections = 1024
	}
	ln, err := tls.Listen("tcp", s.Bind, cfg)
	if err != nil {
		return err
	}
	defer ln.Close()
	go func() { <-ctx.Done(); _ = ln.Close() }()
	for {
		raw, err := ln.Accept()
		if err != nil {
			if ctx.Err() != nil || errors.Is(err, net.ErrClosed) {
				return nil
			}
			continue
		}
		if !netutil.PeerAllowed(raw.RemoteAddr(), allowed) || s.active.Load() >= int64(s.MaxConnections) {
			_ = raw.Close()
			continue
		}
		s.active.Add(1)
		go func(conn net.Conn) { defer s.active.Add(-1); s.handle(ctx, conn, sink) }(raw)
	}
}

func (s *Server) handle(ctx context.Context, conn net.Conn, sink core.Sink) {
	defer conn.Close()
	tc, ok := conn.(*tls.Conn)
	if !ok {
		return
	}
	if err := tc.HandshakeContext(ctx); err != nil {
		return
	}
	state := tc.ConnectionState()
	meta := map[string]any{"tlsVersion": state.Version, "cipherSuite": state.CipherSuite}
	if len(state.PeerCertificates) > 0 {
		cert := state.PeerCertificates[0]
		sum := sha256.Sum256(cert.Raw)
		meta["peerCommonName"] = cert.Subject.CommonName
		meta["peerSerial"] = cert.SerialNumber.String()
		meta["peerCertSHA256"] = hex.EncodeToString(sum[:])
	}
	id := fmt.Sprintf("%s-%d-%d", s.ID, time.Now().UnixNano(), s.counter.Add(1))
	base := core.Event{ListenerID: s.ID, SessionID: id, Transport: "tls", RemoteAddr: conn.RemoteAddr().String(), LocalAddr: conn.LocalAddr().String(), ProtocolHint: s.ProtocolHint, Meta: meta}
	ev := base
	ev.Kind = core.EventSessionOpen
	ev.ReceivedAt = time.Now().UTC()
	sink.Publish(ev)
	defer func() {
		ev := base
		ev.Kind = core.EventSessionClose
		ev.ReceivedAt = time.Now().UTC()
		sink.Publish(ev)
	}()
	buf := make([]byte, 64*1024)
	for {
		if s.ReadTimeout > 0 {
			_ = conn.SetReadDeadline(time.Now().Add(s.ReadTimeout))
		}
		n, err := conn.Read(buf)
		if n > 0 {
			ev := base
			ev.Kind = core.EventSessionData
			ev.ReceivedAt = time.Now().UTC()
			ev.Payload = append([]byte(nil), buf[:n]...)
			sink.Publish(ev)
		}
		if err != nil {
			if errors.Is(err, io.EOF) || ctx.Err() != nil {
				return
			}
			return
		}
	}
}
