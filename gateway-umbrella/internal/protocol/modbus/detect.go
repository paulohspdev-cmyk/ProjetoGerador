package modbus

import "encoding/binary"

type Framing string

const (
	Unknown   Framing = "unknown"
	ModbusTCP Framing = "modbus_tcp"
	ModbusRTU Framing = "modbus_rtu"
)

func Detect(payload []byte) Framing {
	if IsTCPFrame(payload) {
		return ModbusTCP
	}
	if IsRTUFrame(payload) {
		return ModbusRTU
	}
	return Unknown
}
func IsTCPFrame(payload []byte) bool {
	if len(payload) < 8 {
		return false
	}
	if binary.BigEndian.Uint16(payload[2:4]) != 0 {
		return false
	}
	length := int(binary.BigEndian.Uint16(payload[4:6]))
	if length < 2 || length > 254 {
		return false
	}
	total := 6 + length
	if len(payload) != total {
		return false
	}
	unit := payload[6]
	if unit > 247 {
		return false
	}
	return validFunction(payload[7])
}
func IsRTUFrame(payload []byte) bool {
	if len(payload) < 4 || len(payload) > 256 {
		return false
	}
	unit := payload[0]
	if unit < 1 || unit > 247 {
		return false
	}
	if !validFunction(payload[1]) {
		return false
	}
	got := uint16(payload[len(payload)-2]) | uint16(payload[len(payload)-1])<<8
	want := CRC16(payload[:len(payload)-2])
	return got == want
}
func validFunction(fn byte) bool {
	if fn >= 1 && fn <= 24 {
		return true
	}
	return fn == 43 || fn >= 0x81
}
func CRC16(data []byte) uint16 {
	crc := uint16(0xFFFF)
	for _, b := range data {
		crc ^= uint16(b)
		for i := 0; i < 8; i++ {
			if crc&1 != 0 {
				crc = (crc >> 1) ^ 0xA001
			} else {
				crc >>= 1
			}
		}
	}
	return crc
}
