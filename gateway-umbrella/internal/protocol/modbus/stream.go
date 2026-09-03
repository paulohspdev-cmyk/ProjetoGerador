package modbus

import "encoding/binary"

type Frame struct {
	Framing Framing
	Data    []byte
}
type Stream struct {
	buf []byte
	max int
}

func NewStream(max int) *Stream {
	if max < 1024 {
		max = 128 * 1024
	}
	return &Stream{max: max}
}
func (s *Stream) Push(chunk []byte) []Frame {
	if len(chunk) == 0 {
		return nil
	}
	s.buf = append(s.buf, chunk...)
	if len(s.buf) > s.max {
		s.buf = append([]byte(nil), s.buf[len(s.buf)-s.max:]...)
	}
	var out []Frame
	for len(s.buf) > 0 {
		if frame, n, ok := tcpPrefix(s.buf); ok {
			out = append(out, Frame{Framing: ModbusTCP, Data: append([]byte(nil), frame...)})
			s.buf = s.buf[n:]
			continue
		}
		if frame, n, ok := rtuPrefix(s.buf); ok {
			out = append(out, Frame{Framing: ModbusRTU, Data: append([]byte(nil), frame...)})
			s.buf = s.buf[n:]
			continue
		}
		if len(s.buf) >= 6 && binary.BigEndian.Uint16(s.buf[2:4]) == 0 {
			length := int(binary.BigEndian.Uint16(s.buf[4:6]))
			if length >= 2 && length <= 254 && len(s.buf) < 6+length {
				break
			}
		}
		if len(s.buf) < 8 {
			break
		}
		s.buf = s.buf[1:]
	}
	return out
}
func tcpPrefix(buf []byte) ([]byte, int, bool) {
	if len(buf) < 8 || binary.BigEndian.Uint16(buf[2:4]) != 0 {
		return nil, 0, false
	}
	length := int(binary.BigEndian.Uint16(buf[4:6]))
	if length < 2 || length > 254 {
		return nil, 0, false
	}
	total := 6 + length
	if len(buf) < total {
		return nil, 0, false
	}
	frame := buf[:total]
	if !IsTCPFrame(frame) {
		return nil, 0, false
	}
	return frame, total, true
}
func rtuPrefix(buf []byte) ([]byte, int, bool) {
	max := len(buf)
	if max > 256 {
		max = 256
	}
	for n := 4; n <= max; n++ {
		candidate := buf[:n]
		if IsRTUFrame(candidate) {
			return candidate, n, true
		}
	}
	return nil, 0, false
}
func (s *Stream) Buffered() int { return len(s.buf) }
