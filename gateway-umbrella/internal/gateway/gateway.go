package gateway

import (
	"context"
	"encoding/hex"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/paulohspdev-cmyk/ProjetoGerador/gateway-umbrella/internal/config"
	"github.com/paulohspdev-cmyk/ProjetoGerador/gateway-umbrella/internal/core"
	"github.com/paulohspdev-cmyk/ProjetoGerador/gateway-umbrella/internal/protocol/modbus"
	tcptransport "github.com/paulohspdev-cmyk/ProjetoGerador/gateway-umbrella/internal/transport/tcp"
	udptransport "github.com/paulohspdev-cmyk/ProjetoGerador/gateway-umbrella/internal/transport/udp"
)

type Gateway struct {
	cfg      config.Config
	bus      *core.Bus
	sessions *core.SessionRegistry
	logger   *slog.Logger
}

func New(cfg config.Config, logger *slog.Logger) *Gateway {
	return &Gateway{cfg: cfg, bus: core.NewBus(cfg.EventBuf), sessions: core.NewSessionRegistry(), logger: logger}
}

func (g *Gateway) Run(ctx context.Context) error {
	var wg sync.WaitGroup
	errCh := make(chan error, len(g.cfg.Listeners))

	wg.Add(1)
	go func() {
		defer wg.Done()
		g.bus.Run(ctx, g.handleEvent)
	}()

	for _, listener := range g.cfg.Listeners {
		listener := listener
		wg.Add(1)
		go func() {
			defer wg.Done()
			var err error
			switch listener.Kind {
			case "tcp_server":
				t := time.Duration(listener.ReadTimeoutS) * time.Second
				err = (&tcptransport.Server{ID: listener.ID, Bind: listener.Bind, AllowedCIDRs: listener.AllowedCIDRs, ReadTimeout: t}).Run(ctx, g.bus)
			case "udp_server":
				err = (&udptransport.Server{ID: listener.ID, Bind: listener.Bind}).Run(ctx, g.bus)
			default:
				err = fmt.Errorf("unsupported listener kind %q", listener.Kind)
			}
			if err != nil && ctx.Err() == nil {
				errCh <- fmt.Errorf("listener %s: %w", listener.ID, err)
			}
		}()
	}

	select {
	case <-ctx.Done():
		g.bus.Close()
		wg.Wait()
		return nil
	case err := <-errCh:
		return err
	}
}

func (g *Gateway) handleEvent(event core.Event) {
	switch event.Kind {
	case core.EventSessionOpen:
		g.sessions.Open(core.Session{ID: event.SessionID, ListenerID: event.ListenerID, Transport: event.Transport, RemoteAddr: event.RemoteAddr, LocalAddr: event.LocalAddr, OpenedAt: event.ReceivedAt, LastSeenAt: event.ReceivedAt})
		g.logger.Info("session opened", "listener", event.ListenerID, "session", event.SessionID, "remote", event.RemoteAddr)
	case core.EventSessionData:
		g.sessions.Touch(event.SessionID, len(event.Payload), event.ReceivedAt)
		framing := modbus.Detect(event.Payload)
		g.logger.Info("session data", "listener", event.ListenerID, "session", event.SessionID, "bytes", len(event.Payload), "candidateProtocol", string(framing), "previewHex", preview(event.Payload))
	case core.EventSessionClose:
		g.sessions.Close(event.SessionID)
		g.logger.Info("session closed", "listener", event.ListenerID, "session", event.SessionID, "remote", event.RemoteAddr)
	case core.EventDatagram:
		framing := modbus.Detect(event.Payload)
		g.logger.Info("datagram", "listener", event.ListenerID, "remote", event.RemoteAddr, "bytes", len(event.Payload), "candidateProtocol", string(framing), "previewHex", preview(event.Payload))
	}
}

func preview(payload []byte) string {
	const max = 32
	if len(payload) > max {
		payload = payload[:max]
	}
	return hex.EncodeToString(payload)
}
