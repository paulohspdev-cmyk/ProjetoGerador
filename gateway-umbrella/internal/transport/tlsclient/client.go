package tlsclient

import(
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"io"
	"net"
	"sync/atomic"
	"time"
	"github.com/paulohspdev-cmyk/ProjetoGerador/gateway-umbrella/internal/core"
	"github.com/paulohspdev-cmyk/ProjetoGerador/gateway-umbrella/internal/security"
)
type Client struct{ID string;Address string;ReadTimeout time.Duration;Reconnect time.Duration;ProtocolHint string;ServerName string;ClientCertFile string;ClientKeyFile string;RootCAFile string;InsecureSkipVerify bool;counter atomic.Uint64}
func(c *Client)Run(ctx context.Context,sink core.Sink)error{cfg,err:=security.ClientTLS(c.ServerName,c.ClientCertFile,c.ClientKeyFile,c.RootCAFile,c.InsecureSkipVerify);if err!=nil{return err};if c.Reconnect<=0{c.Reconnect=5*time.Second};dialer:=&net.Dialer{Timeout:10*time.Second,KeepAlive:30*time.Second};for{if ctx.Err()!=nil{return nil};raw,err:=dialer.DialContext(ctx,"tcp",c.Address);if err!=nil{if !sleep(ctx,c.Reconnect){return nil};continue};tc:=tls.Client(raw,cfg);if err:=tc.HandshakeContext(ctx);err!=nil{_=raw.Close();if !sleep(ctx,c.Reconnect){return nil};continue};c.handle(ctx,tc,sink);if !sleep(ctx,c.Reconnect){return nil}}}
func(c *Client)handle(ctx context.Context,conn *tls.Conn,sink core.Sink){defer conn.Close();id:=fmt.Sprintf("%s-%d-%d",c.ID,time.Now().UnixNano(),c.counter.Add(1));state:=conn.ConnectionState();meta:=map[string]any{"tlsVersion":state.Version,"cipherSuite":state.CipherSuite};if len(state.PeerCertificates)>0{meta["peerCommonName"]=state.PeerCertificates[0].Subject.CommonName};base:=core.Event{ListenerID:c.ID,SessionID:id,Transport:"tls_client",RemoteAddr:conn.RemoteAddr().String(),LocalAddr:conn.LocalAddr().String(),ProtocolHint:c.ProtocolHint,Meta:meta};ev:=base;ev.Kind=core.EventSessionOpen;ev.ReceivedAt=time.Now().UTC();sink.Publish(ev);defer func(){ev:=base;ev.Kind=core.EventSessionClose;ev.ReceivedAt=time.Now().UTC();sink.Publish(ev)}();buf:=make([]byte,64*1024);for{if c.ReadTimeout>0{_=conn.SetReadDeadline(time.Now().Add(c.ReadTimeout))};n,err:=conn.Read(buf);if n>0{ev:=base;ev.Kind=core.EventSessionData;ev.ReceivedAt=time.Now().UTC();ev.Payload=append([]byte(nil),buf[:n]...);sink.Publish(ev)};if err!=nil{if errors.Is(err,io.EOF)||ctx.Err()!=nil{return};return}}}
func sleep(ctx context.Context,d time.Duration)bool{t:=time.NewTimer(d);defer t.Stop();select{case<-ctx.Done():return false;case<-t.C:return true}}
