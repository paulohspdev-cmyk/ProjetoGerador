package tcp

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"net/netip"
	"sync/atomic"
	"time"

	"github.com/paulohspdev-cmyk/ProjetoGerador/gateway-umbrella/internal/core"
)

type Server struct {
	ID           string
	Bind         string
	AllowedCIDRs []string
	ReadTimeout  time.Duration
	counter      atomic.Uint64
}

func (s *Server) Run(ctx context.Context, sink core.Sink) error {
	allowed, err := parsePrefixes(s.AllowedCIDRs)
	if err != nil {
		return fmt.Errorf("tcp listener %s: %w", s.ID, err)
	}
	ln, err := net.Listen("tcp", s.Bind)
	if err != nil {
		return err
	}
	defer ln.Close()
	go func() {
		<-ctx.Done()
		_ = ln.Close()
	}()

	for {
		conn, err := ln.Accept()
		if err != nil {
			if ctx.Err() != nil || errors.Is(err, net.ErrClosed) {
				return nil
			}
			continue
		}
		if !peerAllowed(conn.RemoteAddr(), allowed) {
			_ = conn.Close()
			continue
		}
		go s.handle(ctx, conn, sink)
	}
}

func (s *Server) handle(ctx context.Context, conn net.Conn, sink core.Sink) {
	defer conn.Close()
	id := fmt.Sprintf("%s-%d-%d", s.ID, time.Now().UnixNano(), s.counter.Add(1))
	opened := time.Now().UTC()
	sink.Publish(core.Event{Kind: core.EventSessionOpen, ListenerID: s.ID, SessionID: id, Transport: "tcp", RemoteAddr: conn.RemoteAddr().String(), LocalAddr: conn.LocalAddr().String(), ReceivedAt: opened})
	defer sink.Publish(core.Event{Kind: core.EventSessionClose, ListenerID: s.ID, SessionID: id, Transport: "tcp", RemoteAddr: conn.RemoteAddr().String(), LocalAddr: conn.LocalAddr().String(), ReceivedAt: time.Now().UTC()})

	buf := make([]byte, 64*1024)
	for {
		if s.ReadTimeout > 0 {
			_ = conn.SetReadDeadline(time.Now().Add(s.ReadTimeout))
		}
		n, err := conn.Read(buf)
		if n > 0 {
			payload := append([]byte(nil), buf[:n]...)
			sink.Publish(core.Event{Kind: core.EventSessionData, ListenerID: s.ID, SessionID: id, Transport: "tcp", RemoteAddr: conn.RemoteAddr().String(), LocalAddr: conn.LocalAddr().String(), ReceivedAt: time.Now().UTC(), Payload: payload})
		}
		if err != nil {
			if errors.Is(err, io.EOF) || ctx.Err() != nil {
				return
			}
			if ne, ok := err.(net.Error); ok && ne.Timeout() {
				return
			}
			return
		}
	}
}

func parsePrefixes(raw []string) ([]netip.Prefix, error) {
	prefixes := make([]netip.Prefix, 0, len(raw))
	for _, item := range raw {
		p, err := netip.ParsePrefix(item)
		if err != nil {
			return nil, fmt.Errorf("invalid CIDR %q", item)
		}
		prefixes = append(prefixes, p)
	}
	return prefixes, nil
}

func peerAllowed(addr net.Addr, allowed []netip.Prefix) bool {
	if len(allowed) == 0 {
		return true
	}
	host, _, err := net.SplitHostPort(addr.String())
	if err != nil {
		return false
	}
	ip, err := netip.ParseAddr(host)
	if err != nil {
		return false
	}
	for _, prefix := range allowed {
		if prefix.Contains(ip) {
			return true
		}
	}
	return false
}
