package modbus

import(
	"encoding/binary"
	"testing"
)
func TestDetectTCP(t *testing.T){frame:=[]byte{0,1,0,0,0,6,1,3,0,0,0,1};if got:=Detect(frame);got!=ModbusTCP{t.Fatalf("got %s",got)}}
func TestDetectRTU(t *testing.T){body:=[]byte{1,3,0,0,0,1};crc:=CRC16(body);frame:=append(append([]byte(nil),body...),byte(crc),byte(crc>>8));if got:=Detect(frame);got!=ModbusRTU{t.Fatalf("got %s",got)}}
func TestStreamReassemblesTCP(t *testing.T){frame:=[]byte{0,1,0,0,0,6,1,3,0,0,0,1};s:=NewStream(4096);if out:=s.Push(frame[:5]);len(out)!=0{t.Fatal("unexpected frame")};out:=s.Push(frame[5:]);if len(out)!=1||out[0].Framing!=ModbusTCP{t.Fatalf("unexpected output: %#v",out)}}
func TestStreamTwoTCPFrames(t *testing.T){f1:=[]byte{0,1,0,0,0,6,1,3,0,0,0,1};f2:=append([]byte(nil),f1...);binary.BigEndian.PutUint16(f2[0:2],2);s:=NewStream(4096);out:=s.Push(append(f1,f2...));if len(out)!=2{t.Fatalf("expected 2 frames, got %d",len(out))}}
