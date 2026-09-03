package modbus

import (
	"encoding/binary"
	"testing"
)

func TestDetectModbusTCP(t *testing.T) {
	frame := []byte{0x00, 0x01, 0x00, 0x00, 0x00, 0x06, 0x01, 0x03, 0x00, 0x00, 0x00, 0x01}
	if got := Detect(frame); got != TCP {
		t.Fatalf("Detect()=%s want %s", got, TCP)
	}
}

func TestDetectModbusRTU(t *testing.T) {
	body := []byte{0x01, 0x03, 0x00, 0x00, 0x00, 0x01}
	crc := CRC16(body)
	frame := append(append([]byte(nil), body...), 0, 0)
	binary.LittleEndian.PutUint16(frame[len(frame)-2:], crc)
	if got := Detect(frame); got != RTU {
		t.Fatalf("Detect()=%s want %s", got, RTU)
	}
}

func TestRejectInvalidRTUCRC(t *testing.T) {
	frame := []byte{0x01, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00}
	if got := Detect(frame); got != Unknown {
		t.Fatalf("Detect()=%s want unknown", got)
	}
}
