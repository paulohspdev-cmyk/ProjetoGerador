package plugin

import(
	"bufio"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"os"
	"os/exec"
	"time"
	"github.com/paulohspdev-cmyk/ProjetoGerador/gateway-umbrella/internal/config"
	"github.com/paulohspdev-cmyk/ProjetoGerador/gateway-umbrella/internal/core"
)
type Supervisor struct{NodeID string;Logger *slog.Logger;Sink core.Sink}
func(s *Supervisor)Run(ctx context.Context,cfg config.Sidecar)error{delay:=time.Duration(cfg.RestartS)*time.Second;if delay<=0{delay=5*time.Second};for{if ctx.Err()!=nil{return nil};err:=s.runOnce(ctx,cfg);if ctx.Err()!=nil{return nil};s.Logger.Error("sidecar exited","id",cfg.ID,"protocol",cfg.Protocol,"lifecycle",cfg.Lifecycle,"error",err);t:=time.NewTimer(delay);select{case<-ctx.Done():t.Stop();return nil;case<-t.C:}}}
func(s *Supervisor)runOnce(ctx context.Context,cfg config.Sidecar)error{cmd:=exec.CommandContext(ctx,cfg.Command,cfg.Args...);cmd.Env=append([]string(nil),os.Environ()...);for k,v:=range cfg.Env{cmd.Env=append(cmd.Env,k+"="+v)};stdout,err:=cmd.StdoutPipe();if err!=nil{return err};stderr,err:=cmd.StderrPipe();if err!=nil{return err};if err:=cmd.Start();err!=nil{return err};s.Logger.Info("sidecar started","id",cfg.ID,"pid",cmd.Process.Pid,"protocol",cfg.Protocol,"lifecycle",cfg.Lifecycle);go s.copyStderr(cfg.ID,stderr);if err:=s.consume(cfg,stdout);err!=nil{_=cmd.Process.Kill();_=cmd.Wait();return err};return cmd.Wait()}
func(s *Supervisor)consume(cfg config.Sidecar,r io.Reader)error{sc:=bufio.NewScanner(r);buf:=make([]byte,64*1024);sc.Buffer(buf,8<<20);for sc.Scan(){var wire struct{Kind string `json:"kind"`;SessionID string `json:"sessionId"`;Transport string `json:"transport"`;RemoteAddr string `json:"remoteAddr"`;LocalAddr string `json:"localAddr"`;Protocol string `json:"protocol"`;Payload string `json:"payload"`;PayloadBase64 string `json:"payloadBase64"`;Meta map[string]any `json:"meta"`};if err:=json.Unmarshal(sc.Bytes(),&wire);err!=nil{return fmt.Errorf("sidecar %s invalid JSON: %w",cfg.ID,err)};if wire.Payload!=""&&wire.PayloadBase64!=""{return fmt.Errorf("sidecar %s supplied both payload and payloadBase64",cfg.ID)};payload:=[]byte(wire.Payload);if wire.PayloadBase64!=""{decoded,err:=base64.StdEncoding.DecodeString(wire.PayloadBase64);if err!=nil{return fmt.Errorf("sidecar %s invalid payloadBase64: %w",cfg.ID,err)};payload=decoded};ev:=core.Event{Kind:core.EventSidecar,ListenerID:cfg.ID,SessionID:wire.SessionID,Transport:wire.Transport,RemoteAddr:wire.RemoteAddr,LocalAddr:wire.LocalAddr,ProtocolHint:wire.Protocol,ReceivedAt:time.Now().UTC(),Payload:payload,Meta:wire.Meta};if ev.Transport==""{ev.Transport="sidecar"};if ev.ProtocolHint==""{ev.ProtocolHint=cfg.Protocol};s.Sink.Publish(ev)};return sc.Err()}
func(s *Supervisor)copyStderr(id string,r io.Reader){sc:=bufio.NewScanner(r);for sc.Scan(){s.Logger.Warn("sidecar stderr","id",id,"line",sc.Text())}}
