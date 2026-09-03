package gateway

import (
	"context"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"github.com/paulohspdev-cmyk/ProjetoGerador/gateway-umbrella/internal/admin"
	"github.com/paulohspdev-cmyk/ProjetoGerador/gateway-umbrella/internal/config"
	"github.com/paulohspdev-cmyk/ProjetoGerador/gateway-umbrella/internal/core"
	"github.com/paulohspdev-cmyk/ProjetoGerador/gateway-umbrella/internal/metrics"
	httpout "github.com/paulohspdev-cmyk/ProjetoGerador/gateway-umbrella/internal/northbound/httpjson"
	"github.com/paulohspdev-cmyk/ProjetoGerador/gateway-umbrella/internal/plugin"
	"github.com/paulohspdev-cmyk/ProjetoGerador/gateway-umbrella/internal/protocol/modbus"
	"github.com/paulohspdev-cmyk/ProjetoGerador/gateway-umbrella/internal/protocol/registry"
	"github.com/paulohspdev-cmyk/ProjetoGerador/gateway-umbrella/internal/spool"
	httpingest "github.com/paulohspdev-cmyk/ProjetoGerador/gateway-umbrella/internal/transport/httpingest"
	tcptransport "github.com/paulohspdev-cmyk/ProjetoGerador/gateway-umbrella/internal/transport/tcp"
	tlsclient "github.com/paulohspdev-cmyk/ProjetoGerador/gateway-umbrella/internal/transport/tlsclient"
	tlsserver "github.com/paulohspdev-cmyk/ProjetoGerador/gateway-umbrella/internal/transport/tlsserver"
	udptransport "github.com/paulohspdev-cmyk/ProjetoGerador/gateway-umbrella/internal/transport/udp"
	"log/slog"
	"sync"
	"sync/atomic"
	"time"
)

type recordSink interface{ Publish(core.Record) error }
type Gateway struct {
	cfg        config.Config
	bus        *core.Bus
	sessions   *core.SessionRegistry
	metrics    *metrics.Registry
	logger     *slog.Logger
	admin      *admin.Server
	spool      *spool.Writer
	northbound []recordSink
	seq        atomic.Uint64
	streamsMu  sync.Mutex
	streams    map[string]*modbus.Stream
}

func New(cfg config.Config, logger *slog.Logger) *Gateway {
	m := metrics.New()
	sessions := core.NewSessionRegistry()
	a := &admin.Server{Bind: cfg.Admin.Bind, NodeID: cfg.NodeID, Sessions: sessions, Metrics: m}
	return &Gateway{cfg: cfg, bus: core.NewBus(cfg.EventBuf), sessions: sessions, metrics: m, logger: logger, admin: a, streams: make(map[string]*modbus.Stream)}
}
func (g *Gateway) Run(ctx context.Context) error {
	var err error
	if g.cfg.Spool.Enabled {
		g.spool, err = spool.New(g.cfg.Spool.Dir, g.cfg.Spool.MaxSegmentBytes, g.cfg.Spool.SyncEvery)
		if err != nil {
			return fmt.Errorf("spool: %w", err)
		}
		defer g.spool.Close()
	}
	for _, n := range g.cfg.Northbound {
		if n.Kind != "http_json" {
			continue
		}
		s, err := httpout.New(n.ID, n.URL, time.Duration(n.TimeoutS)*time.Second, n.Queue, n.BearerTokenEnv)
		if err != nil {
			return err
		}
		s.Start(ctx)
		g.northbound = append(g.northbound, s)
	}
	var wg sync.WaitGroup
	errCh := make(chan error, 1+len(g.cfg.Listeners)+len(g.cfg.Connectors)+len(g.cfg.Sidecars))
	wg.Add(1)
	go func() { defer wg.Done(); g.bus.Run(ctx, g.handleEvent) }()
	wg.Add(1)
	go func() {
		defer wg.Done()
		if err := g.admin.Run(ctx); err != nil && ctx.Err() == nil {
			sendErr(errCh, fmt.Errorf("admin: %w", err))
		}
	}()
	for _, listener := range g.cfg.Listeners {
		listener := listener
		wg.Add(1)
		go func() {
			defer wg.Done()
			err := g.runListener(ctx, listener)
			if err != nil && ctx.Err() == nil {
				sendErr(errCh, fmt.Errorf("listener %s: %w", listener.ID, err))
			}
		}()
	}
	for _, connector := range g.cfg.Connectors {
		connector := connector
		wg.Add(1)
		go func() {
			defer wg.Done()
			err := g.runConnector(ctx, connector)
			if err != nil && ctx.Err() == nil {
				sendErr(errCh, fmt.Errorf("connector %s: %w", connector.ID, err))
			}
		}()
	}
	sup := &plugin.Supervisor{NodeID: g.cfg.NodeID, Logger: g.logger, Sink: g.bus}
	for _, sidecar := range g.cfg.Sidecars {
		sidecar := sidecar
		wg.Add(1)
		go func() {
			defer wg.Done()
			if err := sup.Run(ctx, sidecar); err != nil && ctx.Err() == nil {
				sendErr(errCh, fmt.Errorf("sidecar %s: %w", sidecar.ID, err))
			}
		}()
	}
	g.admin.SetReady(true)
	g.metrics.Set("rc_gateway_ready", 1)
	select {
	case <-ctx.Done():
		g.admin.SetReady(false)
		g.metrics.Set("rc_gateway_ready", 0)
		g.bus.Close()
		wg.Wait()
		return nil
	case err := <-errCh:
		return err
	}
}
func (g *Gateway) runListener(ctx context.Context, l config.Listener) error {
	switch l.Kind {
	case "tcp_server":
		return (&tcptransport.Server{ID: l.ID, Bind: l.Bind, AllowedCIDRs: l.AllowedCIDRs, ReadTimeout: time.Duration(l.ReadTimeoutS) * time.Second, MaxConnections: l.MaxConnections, ProtocolHint: l.ProtocolHint}).Run(ctx, g.bus)
	case "udp_server":
		return (&udptransport.Server{ID: l.ID, Bind: l.Bind, AllowedCIDRs: l.AllowedCIDRs, ProtocolHint: l.ProtocolHint}).Run(ctx, g.bus)
	case "tls_server":
		return (&tlsserver.Server{ID: l.ID, Bind: l.Bind, AllowedCIDRs: l.AllowedCIDRs, ReadTimeout: time.Duration(l.ReadTimeoutS) * time.Second, MaxConnections: l.MaxConnections, ProtocolHint: l.ProtocolHint, CertFile: l.CertFile, KeyFile: l.KeyFile, ClientCAFile: l.ClientCAFile, RequireClientCert: l.RequireClientCert}).Run(ctx, g.bus)
	case "http_ingest":
		return (&httpingest.Server{ID: l.ID, Bind: l.Bind, Path: l.Path, BearerTokenEnv: l.BearerTokenEnv, MaxBodyBytes: l.MaxBodyBytes, ProtocolHint: l.ProtocolHint}).Run(ctx, g.bus)
	default:
		return fmt.Errorf("unsupported listener kind %q", l.Kind)
	}
}
func (g *Gateway) runConnector(ctx context.Context, c config.Connector) error {
	switch c.Kind {
	case "tcp_client":
		return (&tcptransport.Client{ID: c.ID, Address: c.Address, ReadTimeout: time.Duration(c.ReadTimeoutS) * time.Second, Reconnect: time.Duration(c.ReconnectS) * time.Second, ProtocolHint: c.ProtocolHint}).Run(ctx, g.bus)
	case "tls_client":
		return (&tlsclient.Client{ID: c.ID, Address: c.Address, ReadTimeout: time.Duration(c.ReadTimeoutS) * time.Second, Reconnect: time.Duration(c.ReconnectS) * time.Second, ProtocolHint: c.ProtocolHint, ServerName: c.TLSServerName, ClientCertFile: c.ClientCertFile, ClientKeyFile: c.ClientKeyFile, RootCAFile: c.RootCAFile, InsecureSkipVerify: c.InsecureSkipVerify}).Run(ctx, g.bus)
	default:
		return fmt.Errorf("unsupported connector kind %q", c.Kind)
	}
}
func (g *Gateway) handleEvent(event core.Event) {
	g.metrics.Inc("rc_gateway_events_total")
	switch event.Kind {
	case core.EventSessionOpen:
		g.sessions.Open(core.Session{ID: event.SessionID, ListenerID: event.ListenerID, Transport: event.Transport, RemoteAddr: event.RemoteAddr, LocalAddr: event.LocalAddr, OpenedAt: event.ReceivedAt, LastSeenAt: event.ReceivedAt})
		g.metrics.Inc("rc_gateway_sessions_opened_total")
		g.metrics.Set("rc_gateway_active_sessions", int64(g.sessions.Count()))
		g.ensureStream(event.SessionID)
	case core.EventSessionData:
		g.sessions.Touch(event.SessionID, len(event.Payload), event.ReceivedAt)
		g.metrics.Add("rc_gateway_bytes_rx_total", uint64(len(event.Payload)))
	case core.EventSessionClose:
		g.sessions.Close(event.SessionID)
		g.metrics.Inc("rc_gateway_sessions_closed_total")
		g.metrics.Set("rc_gateway_active_sessions", int64(g.sessions.Count()))
		g.dropStream(event.SessionID)
	case core.EventDatagram:
		g.metrics.Inc("rc_gateway_datagrams_total")
		g.metrics.Add("rc_gateway_bytes_rx_total", uint64(len(event.Payload)))
	case core.EventSidecar:
		g.metrics.Inc("rc_gateway_sidecar_events_total")
	}
	for _, record := range g.normalize(event) {
		if g.spool != nil {
			if err := g.spool.Append(record); err != nil {
				g.metrics.Inc("rc_gateway_spool_errors_total")
				g.logger.Error("spool append failed", "error", err)
			} else {
				g.metrics.Inc("rc_gateway_spool_records_total")
			}
		}
		for _, sink := range g.northbound {
			if err := sink.Publish(record); err != nil {
				g.metrics.Inc("rc_gateway_northbound_errors_total")
				g.logger.Warn("northbound publish failed", "error", err)
			}
		}
		g.logger.Info("gateway record", "kind", record.Kind, "listener", record.ListenerID, "session", record.SessionID, "transport", record.Transport, "protocol", record.Protocol, "framing", record.Framing, "bytes", record.Size, "remote", record.RemoteAddr, "previewHex", preview(event.Payload))
	}
}
func (g *Gateway) normalize(event core.Event) []core.Record {
	base := core.Record{Schema: 1, NodeID: g.cfg.NodeID, Kind: event.Kind, ListenerID: event.ListenerID, SessionID: event.SessionID, Transport: event.Transport, RemoteAddr: event.RemoteAddr, LocalAddr: event.LocalAddr, ReceivedAt: event.ReceivedAt, Quality: core.QualityGood, Size: len(event.Payload), Meta: cloneMeta(event.Meta)}
	if len(event.Payload) > 0 {
		base.PayloadBase64 = base64.StdEncoding.EncodeToString(event.Payload)
	}
	if event.Kind != core.EventSessionData || event.SessionID == "" {
		d := registry.Detect(event.Payload, event.ProtocolHint)
		base.Sequence = g.seq.Add(1)
		base.Protocol, base.Framing = d.Protocol, d.Framing
		if d.Protocol == "raw" {
			base.Quality = core.QualityUnknown
		}
		return []core.Record{base}
	}
	stream := g.ensureStream(event.SessionID)
	frames := stream.Push(event.Payload)
	if len(frames) == 0 {
		d := registry.Detect(event.Payload, event.ProtocolHint)
		base.Sequence = g.seq.Add(1)
		base.Protocol, base.Framing = d.Protocol, d.Framing
		if d.Protocol == "raw" {
			base.Quality = core.QualityUnknown
		}
		if d.Protocol != "raw" {
			g.sessions.SetProtocol(event.SessionID, d.Protocol)
		}
		return []core.Record{base}
	}
	out := make([]core.Record, 0, len(frames))
	for _, frame := range frames {
		rec := base
		rec.Sequence = g.seq.Add(1)
		rec.Protocol = "modbus"
		rec.Framing = string(frame.Framing)
		rec.Size = len(frame.Data)
		rec.PayloadBase64 = base64.StdEncoding.EncodeToString(frame.Data)
		rec.Meta = cloneMeta(base.Meta)
		rec.Meta["streamReassembled"] = true
		out = append(out, rec)
		g.sessions.SetProtocol(event.SessionID, "modbus")
		g.metrics.Inc("rc_gateway_modbus_frames_total")
	}
	return out
}
func (g *Gateway) ensureStream(id string) *modbus.Stream {
	g.streamsMu.Lock()
	defer g.streamsMu.Unlock()
	s := g.streams[id]
	if s == nil {
		s = modbus.NewStream(256 * 1024)
		g.streams[id] = s
	}
	return s
}
func (g *Gateway) dropStream(id string) {
	g.streamsMu.Lock()
	defer g.streamsMu.Unlock()
	delete(g.streams, id)
}
func cloneMeta(in map[string]any) map[string]any {
	out := make(map[string]any, len(in)+2)
	for k, v := range in {
		out[k] = v
	}
	return out
}
func preview(payload []byte) string {
	const max = 32
	if len(payload) > max {
		payload = payload[:max]
	}
	return hex.EncodeToString(payload)
}
func sendErr(ch chan<- error, err error) {
	select {
	case ch <- err:
	default:
	}
}
