package udp

import (
	"context"
	"errors"
	"net"
	"time"

	"github.com/paulohspdev-cmyk/ProjetoGerador/gateway-umbrella/internal/core"
)

type Server struct {
	ID   string
	Bind string
}

func (s *Server) Run(ctx context.Context, sink core.Sink) error {
	addr, err := net.ResolveUDPAddr("udp", s.Bind)
	if err != nil {
		return err
	}
	conn, err := net.ListenUDP("udp", addr)
	if err != nil {
		return err
	}
	defer conn.Close()
	go func() {
		<-ctx.Done()
		_ = conn.Close()
	}()

	buf := make([]byte, 65535)
	for {
		n, peer, err := conn.ReadFromUDP(buf)
		if err != nil {
			if ctx.Err() != nil || errors.Is(err, net.ErrClosed) {
				return nil
			}
			continue
		}
		payload := append([]byte(nil), buf[:n]...)
		sink.Publish(core.Event{Kind: core.EventDatagram, ListenerID: s.ID, Transport: "udp", RemoteAddr: peer.String(), LocalAddr: conn.LocalAddr().String(), ReceivedAt: time.Now().UTC(), Payload: payload})
	}
}
