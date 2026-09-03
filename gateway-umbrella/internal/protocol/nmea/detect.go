package nmea

import (
	"bytes"
	"strconv"
	"strings"
)

func Detect(payload []byte) bool {
	payload = bytes.TrimSpace(payload)
	if len(payload) < 6 || payload[0] != '$' {
		return false
	}
	star := bytes.LastIndexByte(payload, '*')
	if star < 0 || star+3 != len(payload) {
		return false
	}
	want, err := strconv.ParseUint(string(payload[star+1:]), 16, 8)
	if err != nil {
		return false
	}
	var got byte
	for _, b := range payload[1:star] {
		got ^= b
	}
	if got != byte(want) {
		return false
	}
	head := string(payload[1:])
	if len(head) < 5 {
		return false
	}
	talker := head[:2]
	return strings.IndexFunc(talker, func(r rune) bool { return r < 'A' || r > 'Z' }) == -1
}
