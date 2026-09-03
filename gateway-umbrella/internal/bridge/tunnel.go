package bridge

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/netip"
	"sync/atomic"
	"time"

	"github.com/paulohspdev-cmyk/ProjetoGerador/gateway-umbrella/internal/transport/netutil"
)

// Endpoint describes one side of a raw byte tunnel.
// Listen waits for a peer to connect. Connect dials a peer.
// The bridge never interprets the application payload.
type Endpoint struct {
	Name         string
	Mode         string
	Network      string
	Bind         string
	Address      string
	AllowedCIDRs []string
	DialTimeout  time.Duration
	Reconnect    time.Duration
	KeepAlive    time.Duration
}

type PairInfo struct {
	TunnelID       string
	PairID         string
	FieldLocal     string
	FieldRemote    string
	ConsumerLocal  string
	ConsumerRemote string
	OpenedAt       time.Time
}

type Hooks struct {
	OnOpen  func(PairInfo)
	OnBytes func(pairID, direction string, n uint64)
	OnClose func(PairInfo, error)
}

type Tunnel struct {
	ID       string
	Field    Endpoint
	Consumer Endpoint
	Logger   *slog.Logger
	Hooks    Hooks
	counter  atomic.Uint64
}

type connectionSource interface {
	Acquire(context.Context) (net.Conn, error)
	Close() error
}

func (t *Tunnel) Run(ctx context.Context) error {
	if t.ID == "" {
		return fmt.Errorf("tunnel id is required")
	}
	field, err := newSource(ctx, t.Field)
	if err != nil {
		return fmt.Errorf("tunnel %s field: %w", t.ID, err)
	}
	defer field.Close()
	consumer, err := newSource(ctx, t.Consumer)
	if err != nil {
		return fmt.Errorf("tunnel %s consumer: %w", t.ID, err)
	}
	defer consumer.Close()

	for {
		if ctx.Err() != nil {
			return nil
		}
		fieldConn, consumerConn, err := acquirePair(ctx, field, consumer)
		if err != nil {
			if ctx.Err() != nil {
				return nil
			}
			return fmt.Errorf("tunnel %s acquire pair: %w", t.ID, err)
		}
		pairID := fmt.Sprintf("%s-%d-%d", t.ID, time.Now().UnixNano(), t.counter.Add(1))
		info := PairInfo{
			TunnelID:       t.ID,
			PairID:         pairID,
			FieldLocal:     addr(fieldConn.LocalAddr()),
			FieldRemote:    addr(fieldConn.RemoteAddr()),
			ConsumerLocal:  addr(consumerConn.LocalAddr()),
			ConsumerRemote: addr(consumerConn.RemoteAddr()),
			OpenedAt:       time.Now().UTC(),
		}
		if t.Hooks.OnOpen != nil {
			t.Hooks.OnOpen(info)
		}
		if t.Logger != nil {
			t.Logger.Info("bridge pair open", "tunnel", t.ID, "pair", pairID, "fieldRemote", info.FieldRemote, "consumerRemote", info.ConsumerRemote)
		}

		err = copyDuplex(ctx, pairID, fieldConn, consumerConn, t.Hooks)
		_ = fieldConn.Close()
		_ = consumerConn.Close()
		if t.Hooks.OnClose != nil {
			t.Hooks.OnClose(info, err)
		}
		if t.Logger != nil {
			attrs := []any{"tunnel", t.ID, "pair", pairID}
			if err != nil {
				attrs = append(attrs, "error", err)
			}
			t.Logger.Info("bridge pair closed", attrs...)
		}
	}
}

func acquirePair(ctx context.Context, field, consumer connectionSource) (net.Conn, net.Conn, error) {
	type result struct {
		name string
		conn net.Conn
		err  error
	}
	ch := make(chan result, 2)
	go func() {
		c, err := field.Acquire(ctx)
		ch <- result{name: "field", conn: c, err: err}
	}()
	go func() {
		c, err := consumer.Acquire(ctx)
		ch <- result{name: "consumer", conn: c, err: err}
	}()

	var fieldConn, consumerConn net.Conn
	for i := 0; i < 2; i++ {
		select {
		case <-ctx.Done():
			if fieldConn != nil {
				_ = fieldConn.Close()
			}
			if consumerConn != nil {
				_ = consumerConn.Close()
			}
			return nil, nil, ctx.Err()
		case r := <-ch:
			if r.err != nil {
				if fieldConn != nil {
					_ = fieldConn.Close()
				}
				if consumerConn != nil {
					_ = consumerConn.Close()
				}
				return nil, nil, fmt.Errorf("%s: %w", r.name, r.err)
			}
			if r.name == "field" {
				fieldConn = r.conn
			} else {
				consumerConn = r.conn
			}
		}
	}
	return fieldConn, consumerConn, nil
}

type copyResult struct {
	direction string
	n         int64
	err       error
}

func copyDuplex(ctx context.Context, pairID string, field, consumer net.Conn, hooks Hooks) error {
	results := make(chan copyResult, 2)
	copyOne := func(direction string, dst, src net.Conn) {
		buf := make([]byte, 64*1024)
		n, err := io.CopyBuffer(dst, src, buf)
		results <- copyResult{direction: direction, n: n, err: normalizeCopyError(err)}
	}
	go copyOne("field_to_consumer", consumer, field)
	go copyOne("consumer_to_field", field, consumer)

	var first copyResult
	select {
	case <-ctx.Done():
		first.err = ctx.Err()
	case first = <-results:
	}
	if first.n > 0 && hooks.OnBytes != nil {
		hooks.OnBytes(pairID, first.direction, uint64(first.n))
	}
	_ = field.Close()
	_ = consumer.Close()

	select {
	case second := <-results:
		if second.n > 0 && hooks.OnBytes != nil {
			hooks.OnBytes(pairID, second.direction, uint64(second.n))
		}
		if first.err == nil {
			first.err = second.err
		}
	case <-time.After(2 * time.Second):
		if first.err == nil {
			first.err = fmt.Errorf("bridge copy shutdown timeout")
		}
	}
	return normalizeCopyError(first.err)
}

func normalizeCopyError(err error) error {
	if err == nil || errors.Is(err, io.EOF) || errors.Is(err, io.ErrClosedPipe) || errors.Is(err, net.ErrClosed) || errors.Is(err, context.Canceled) {
		return nil
	}
	return err
}

func newSource(ctx context.Context, ep Endpoint) (connectionSource, error) {
	if ep.Network == "" {
		ep.Network = "tcp"
	}
	if ep.Network != "tcp" {
		return nil, fmt.Errorf("unsupported network %q", ep.Network)
	}
	switch ep.Mode {
	case "listen":
		allowed, err := netutil.ParsePrefixes(ep.AllowedCIDRs)
		if err != nil {
			return nil, err
		}
		ln, err := net.Listen("tcp", ep.Bind)
		if err != nil {
			return nil, err
		}
		s := &listenSource{ln: ln, allowed: allowed, keepAlive: ep.KeepAlive}
		go func() {
			<-ctx.Done()
			_ = s.Close()
		}()
		return s, nil
	case "connect":
		if ep.DialTimeout <= 0 {
			ep.DialTimeout = 10 * time.Second
		}
		if ep.Reconnect <= 0 {
			ep.Reconnect = 5 * time.Second
		}
		if ep.KeepAlive <= 0 {
			ep.KeepAlive = 30 * time.Second
		}
		return &dialSource{address: ep.Address, timeout: ep.DialTimeout, reconnect: ep.Reconnect, keepAlive: ep.KeepAlive}, nil
	default:
		return nil, fmt.Errorf("unsupported mode %q", ep.Mode)
	}
}

type listenSource struct {
	ln        net.Listener
	allowed   []netip.Prefix
	keepAlive time.Duration
}

func (s *listenSource) Acquire(ctx context.Context) (net.Conn, error) {
	for {
		conn, err := s.ln.Accept()
		if err != nil {
			if ctx.Err() != nil || errors.Is(err, net.ErrClosed) {
				return nil, ctx.Err()
			}
			return nil, err
		}
		if !netutil.PeerAllowed(conn.RemoteAddr(), s.allowed) {
			_ = conn.Close()
			continue
		}
		configureTCP(conn, s.keepAlive)
		return conn, nil
	}
}

func (s *listenSource) Close() error { return s.ln.Close() }

type dialSource struct {
	address   string
	timeout   time.Duration
	reconnect time.Duration
	keepAlive time.Duration
}

func (s *dialSource) Acquire(ctx context.Context) (net.Conn, error) {
	d := net.Dialer{Timeout: s.timeout, KeepAlive: s.keepAlive}
	for {
		conn, err := d.DialContext(ctx, "tcp", s.address)
		if err == nil {
			configureTCP(conn, s.keepAlive)
			return conn, nil
		}
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		t := time.NewTimer(s.reconnect)
		select {
		case <-ctx.Done():
			t.Stop()
			return nil, ctx.Err()
		case <-t.C:
		}
	}
}

func (s *dialSource) Close() error { return nil }

func configureTCP(conn net.Conn, keepAlive time.Duration) {
	tcpConn, ok := conn.(*net.TCPConn)
	if !ok {
		return
	}
	_ = tcpConn.SetNoDelay(true)
	if keepAlive > 0 {
		_ = tcpConn.SetKeepAlive(true)
		_ = tcpConn.SetKeepAlivePeriod(keepAlive)
	}
}

func addr(a net.Addr) string {
	if a == nil {
		return ""
	}
	return a.String()
}
