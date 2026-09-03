package tcp

import(
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"sync/atomic"
	"time"
	"github.com/paulohspdev-cmyk/ProjetoGerador/gateway-umbrella/internal/core"
	"github.com/paulohspdev-cmyk/ProjetoGerador/gateway-umbrella/internal/transport/netutil"
)
type Server struct{ID string;Bind string;AllowedCIDRs []string;ReadTimeout time.Duration;MaxConnections int;ProtocolHint string;counter atomic.Uint64;active atomic.Int64}
func(s *Server)Run(ctx context.Context,sink core.Sink)error{allowed,err:=netutil.ParsePrefixes(s.AllowedCIDRs);if err!=nil{return fmt.Errorf("tcp listener %s: %w",s.ID,err)};if s.MaxConnections<=0{s.MaxConnections=1024};ln,err:=net.Listen("tcp",s.Bind);if err!=nil{return err};defer ln.Close();go func(){<-ctx.Done();_=ln.Close()}();for{conn,err:=ln.Accept();if err!=nil{if ctx.Err()!=nil||errors.Is(err,net.ErrClosed){return nil};continue};if !netutil.PeerAllowed(conn.RemoteAddr(),allowed){_=conn.Close();continue};if s.active.Load()>=int64(s.MaxConnections){_=conn.Close();continue};s.active.Add(1);go func(){defer s.active.Add(-1);s.handle(ctx,conn,sink)}()}}
func(s *Server)handle(ctx context.Context,conn net.Conn,sink core.Sink){defer conn.Close();id:=fmt.Sprintf("%s-%d-%d",s.ID,time.Now().UnixNano(),s.counter.Add(1));base:=core.Event{ListenerID:s.ID,SessionID:id,Transport:"tcp",RemoteAddr:conn.RemoteAddr().String(),LocalAddr:conn.LocalAddr().String(),ProtocolHint:s.ProtocolHint};ev:=base;ev.Kind=core.EventSessionOpen;ev.ReceivedAt=time.Now().UTC();sink.Publish(ev);defer func(){ev:=base;ev.Kind=core.EventSessionClose;ev.ReceivedAt=time.Now().UTC();sink.Publish(ev)}();buf:=make([]byte,64*1024);for{if s.ReadTimeout>0{_=conn.SetReadDeadline(time.Now().Add(s.ReadTimeout))};n,err:=conn.Read(buf);if n>0{ev:=base;ev.Kind=core.EventSessionData;ev.ReceivedAt=time.Now().UTC();ev.Payload=append([]byte(nil),buf[:n]...);sink.Publish(ev)};if err!=nil{if errors.Is(err,io.EOF)||ctx.Err()!=nil{return};if ne,ok:=err.(net.Error);ok&&ne.Timeout(){return};return}}}
