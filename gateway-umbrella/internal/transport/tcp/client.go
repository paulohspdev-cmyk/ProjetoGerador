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
)
type Client struct{ID string;Address string;ReadTimeout time.Duration;Reconnect time.Duration;ProtocolHint string;Dial func(context.Context,string,string)(net.Conn,error);counter atomic.Uint64}
func(c *Client)Run(ctx context.Context,sink core.Sink)error{if c.Reconnect<=0{c.Reconnect=5*time.Second};dial:=c.Dial;if dial==nil{d:=net.Dialer{Timeout:10*time.Second,KeepAlive:30*time.Second};dial=d.DialContext};for{if ctx.Err()!=nil{return nil};conn,err:=dial(ctx,"tcp",c.Address);if err!=nil{if !sleep(ctx,c.Reconnect){return nil};continue};c.handle(ctx,conn,sink);if !sleep(ctx,c.Reconnect){return nil}}}
func(c *Client)handle(ctx context.Context,conn net.Conn,sink core.Sink){defer conn.Close();id:=fmt.Sprintf("%s-%d-%d",c.ID,time.Now().UnixNano(),c.counter.Add(1));base:=core.Event{ListenerID:c.ID,SessionID:id,Transport:"tcp_client",RemoteAddr:conn.RemoteAddr().String(),LocalAddr:conn.LocalAddr().String(),ProtocolHint:c.ProtocolHint};ev:=base;ev.Kind=core.EventSessionOpen;ev.ReceivedAt=time.Now().UTC();sink.Publish(ev);defer func(){ev:=base;ev.Kind=core.EventSessionClose;ev.ReceivedAt=time.Now().UTC();sink.Publish(ev)}();buf:=make([]byte,64*1024);for{if c.ReadTimeout>0{_=conn.SetReadDeadline(time.Now().Add(c.ReadTimeout))};n,err:=conn.Read(buf);if n>0{ev:=base;ev.Kind=core.EventSessionData;ev.ReceivedAt=time.Now().UTC();ev.Payload=append([]byte(nil),buf[:n]...);sink.Publish(ev)};if err!=nil{if errors.Is(err,io.EOF)||ctx.Err()!=nil{return};return}}}
func sleep(ctx context.Context,d time.Duration)bool{t:=time.NewTimer(d);defer t.Stop();select{case<-ctx.Done():return false;case<-t.C:return true}}
