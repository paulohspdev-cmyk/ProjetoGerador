//go:build linux

package main

import(
	"context"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"go.einride.tech/can/pkg/socketcan"
	"github.com/paulohspdev-cmyk/ProjetoGerador/gateway-umbrella/adapters/internal/wire"
)
func main(){var id,iface,protocol string;flag.StringVar(&id,"id","can-1","adapter/session id");flag.StringVar(&iface,"interface","can0","SocketCAN interface");flag.StringVar(&protocol,"protocol","can","can or j1939");flag.Parse();if protocol!="can"&&protocol!="j1939"{fatal("protocol must be can or j1939")};ctx,cancel:=signal.NotifyContext(context.Background(),syscall.SIGINT,syscall.SIGTERM);defer cancel();conn,err:=socketcan.DialContext(ctx,"can",iface);if err!=nil{fatal(fmt.Sprintf("socketcan dial: %v",err))};defer conn.Close();recv:=socketcan.NewReceiver(conn);out:=wire.NewWriter(os.Stdout);for recv.Receive(){frame:=recv.Frame();payload:=append([]byte(nil),frame.Data[:frame.Length]...);meta:=map[string]any{"canId":frame.ID,"length":frame.Length,"extended":frame.IsExtended,"remoteFrame":frame.IsRemote,"interface":iface,"readOnly":true};if protocol=="j1939"&&frame.IsExtended{for k,v:=range j1939Meta(frame.ID){meta[k]=v}};if err:=out.EmitBytes(wire.Message{Kind:"observation",SessionID:id,Transport:"socketcan",RemoteAddr:iface,Protocol:protocol,Meta:meta},payload);err!=nil{fatal(fmt.Sprintf("stdout: %v",err))}};if err:=recv.Err();err!=nil&&ctx.Err()==nil{fatal(fmt.Sprintf("socketcan receive: %v",err))}}
func j1939Meta(id uint32)map[string]any{priority:=(id>>26)&0x7;dp:=(id>>24)&0x1;pf:=(id>>16)&0xff;ps:=(id>>8)&0xff;sa:=id&0xff;pgn:=(dp<<16)|(pf<<8);dest:=uint32(0xff);if pf<240{dest=ps}else{pgn|=ps};return map[string]any{"j1939Priority":priority,"j1939PGN":pgn,"j1939Source":sa,"j1939Destination":dest}}
func fatal(msg string){fmt.Fprintln(os.Stderr,msg);os.Exit(1)}
