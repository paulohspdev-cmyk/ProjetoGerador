package udp

import(
	"context"
	"errors"
	"net"
	"time"
	"github.com/paulohspdev-cmyk/ProjetoGerador/gateway-umbrella/internal/core"
	"github.com/paulohspdev-cmyk/ProjetoGerador/gateway-umbrella/internal/transport/netutil"
)
type Server struct{ID string;Bind string;AllowedCIDRs []string;ProtocolHint string}
func(s *Server)Run(ctx context.Context,sink core.Sink)error{allowed,err:=netutil.ParsePrefixes(s.AllowedCIDRs);if err!=nil{return err};addr,err:=net.ResolveUDPAddr("udp",s.Bind);if err!=nil{return err};conn,err:=net.ListenUDP("udp",addr);if err!=nil{return err};defer conn.Close();go func(){<-ctx.Done();_=conn.Close()}();buf:=make([]byte,64*1024);for{n,remote,err:=conn.ReadFromUDP(buf);if err!=nil{if ctx.Err()!=nil||errors.Is(err,net.ErrClosed){return nil};continue};if !netutil.PeerAllowed(remote,allowed){continue};sink.Publish(core.Event{Kind:core.EventDatagram,ListenerID:s.ID,Transport:"udp",RemoteAddr:remote.String(),LocalAddr:conn.LocalAddr().String(),ProtocolHint:s.ProtocolHint,ReceivedAt:time.Now().UTC(),Payload:append([]byte(nil),buf[:n]...)})}}
