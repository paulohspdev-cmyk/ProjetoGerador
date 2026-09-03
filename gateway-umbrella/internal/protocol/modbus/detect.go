package modbus

import "encoding/binary"

type Framing string

const (
	Unknown Framing = "unknown"
	TCP     Framing = "modbus_tcp"
	RTU     Framing = "modbus_rtu"
)

func Detect(frame []byte) Framing {
	if validTCP(frame) {
		return TCP
	}
	if validRTU(frame) {
		return RTU
	}
	return Unknown
}

func validTCP(frame []byte) bool {
	if len(frame) < 8 {
		return false
	}
	if binary.BigEndian.Uint16(frame[2:4]) != 0 {
		return false
	}
	length := int(binary.BigEndian.Uint16(frame[4:6]))
	if length < 2 || length > 254 {
		return false
	}
	return 6+length == len(frame)
}

func validRTU(frame []byte) bool {
	if len(frame) < 4 || frame[0] == 0 || frame[0] > 247 {
		return false
	}
	received := binary.LittleEndian.Uint16(frame[len(frame)-2:])
	return received == CRC16(frame[:len(frame)-2])
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
