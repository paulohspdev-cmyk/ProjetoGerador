package gateway

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/paulohspdev-cmyk/ProjetoGerador/gateway-umbrella/internal/admin"
	"github.com/paulohspdev-cmyk/ProjetoGerador/gateway-umbrella/internal/bridge"
	"github.com/paulohspdev-cmyk/ProjetoGerador/gateway-umbrella/internal/config"
	"github.com/paulohspdev-cmyk/ProjetoGerador/gateway-umbrella/internal/core"
	"github.com/paulohspdev-cmyk/ProjetoGerador/gateway-umbrella/internal/metrics"
)

type Gateway struct {
	cfg      config.Config
	sessions *core.SessionRegistry
	metrics  *metrics.Registry
	logger   *slog.Logger
	admin    *admin.Server
}

func New(cfg config.Config, logger *slog.Logger) *Gateway {
	m := metrics.New()
	sessions := core.NewSessionRegistry()
	a := &admin.Server{Bind: cfg.Admin.Bind, NodeID: cfg.NodeID, Sessions: sessions, Metrics: m}
	return &Gateway{cfg: cfg, sessions: sessions, metrics: m, logger: logger, admin: a}
}
func (g *Gateway) Run(ctx context.Context) error {
	var wg sync.WaitGroup
	errCh := make(chan error, 1+len(g.cfg.Tunnels))
	wg.Add(1)
	go func() {
		defer wg.Done()
		if err := g.admin.Run(ctx); err != nil && ctx.Err() == nil {
			sendErr(errCh, fmt.Errorf("admin: %w", err))
		}
	}()
	for _, cfgTunnel := range g.cfg.Tunnels {
		cfgTunnel := cfgTunnel
		tunnel := &bridge.Tunnel{ID: cfgTunnel.ID, Field: bridgeEndpoint("field", cfgTunnel.Field), Consumer: bridgeEndpoint("consumer", cfgTunnel.Consumer), Logger: g.logger, Hooks: g.tunnelHooks(cfgTunnel.ID), PairTimeout: time.Duration(cfgTunnel.PairTimeoutS) * time.Second, WriteTimeout: time.Duration(cfgTunnel.WriteTimeoutS) * time.Second, DrainTimeout: time.Duration(cfgTunnel.DrainTimeoutS) * time.Second}
		wg.Add(1)
		go func() {
			defer wg.Done()
			if err := tunnel.Run(ctx); err != nil && ctx.Err() == nil {
				sendErr(errCh, fmt.Errorf("tunnel %s: %w", cfgTunnel.ID, err))
			}
		}()
	}
	g.admin.SetReady(true)
	g.metrics.Set("rc_gateway_ready", 1)
	g.metrics.Set("rc_gateway_configured_tunnels", int64(len(g.cfg.Tunnels)))
	g.logger.Info("bridge runtime ready", "nodeId", g.cfg.NodeID, "tunnels", len(g.cfg.Tunnels))
	select {
	case <-ctx.Done():
		g.admin.SetReady(false)
		g.metrics.Set("rc_gateway_ready", 0)
		wg.Wait()
		return nil
	case err := <-errCh:
		g.admin.SetReady(false)
		g.metrics.Set("rc_gateway_ready", 0)
		return err
	}
}
func bridgeEndpoint(name string, ep config.Endpoint) bridge.Endpoint {
	return bridge.Endpoint{Name: name, Mode: ep.Mode, Network: ep.Network, Bind: ep.Bind, Address: ep.Address, AllowedCIDRs: ep.AllowedCIDRs, DialTimeout: time.Duration(ep.DialTimeoutS) * time.Second, Reconnect: time.Duration(ep.ReconnectS) * time.Second, KeepAlive: time.Duration(ep.KeepAliveS) * time.Second, TLS: bridge.TLSOptions{Enabled: ep.TLS.Enabled, CAFile: ep.TLS.CAFile, CertFile: ep.TLS.CertFile, KeyFile: ep.TLS.KeyFile, ServerName: ep.TLS.ServerName, RequireClientCert: ep.TLS.RequireClientCert}}
}
func (g *Gateway) tunnelHooks(tunnelID string) bridge.Hooks {
	prefix := "rc_gateway_tunnel_" + tunnelID
	return bridge.Hooks{OnOpen: func(info bridge.PairInfo) {
		g.sessions.Open(core.Session{ID: info.PairID, ListenerID: info.TunnelID, Transport: "raw_bridge", RemoteAddr: info.FieldRemote, LocalAddr: info.ConsumerRemote, OpenedAt: info.OpenedAt, LastSeenAt: info.OpenedAt})
		g.metrics.Inc("rc_gateway_pairs_opened_total")
		g.metrics.Inc(prefix + "_pairs_opened_total")
		g.metrics.Set("rc_gateway_active_pairs", int64(g.sessions.Count()))
		g.metrics.Set(prefix+"_active", 1)
	}, OnBytes: func(pairID, direction string, n uint64) {
		g.sessions.Touch(pairID, direction, int(n), time.Now().UTC())
		g.metrics.Add("rc_gateway_bytes_forwarded_total", n)
		g.metrics.Add(prefix+"_bytes_forwarded_total", n)
		g.metrics.Add(prefix+"_"+direction+"_bytes_total", n)
	}, OnClose: func(info bridge.PairInfo, err error) {
		g.sessions.Close(info.PairID)
		g.metrics.Inc("rc_gateway_pairs_closed_total")
		g.metrics.Inc(prefix + "_pairs_closed_total")
		g.metrics.Set("rc_gateway_active_pairs", int64(g.sessions.Count()))
		g.metrics.Set(prefix+"_active", 0)
		if err != nil {
			g.metrics.Inc("rc_gateway_bridge_errors_total")
			g.metrics.Inc(prefix + "_errors_total")
		}
	}, OnPairWaitTimeout: func(_ string) {
		g.metrics.Inc("rc_gateway_pair_wait_timeouts_total")
		g.metrics.Inc(prefix + "_pair_wait_timeouts_total")
	}}
}
func sendErr(ch chan<- error, err error) {
	select {
	case ch <- err:
	default:
	}
}
