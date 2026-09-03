package registry

import (
	"bytes"
	"encoding/json"
	"github.com/paulohspdev-cmyk/ProjetoGerador/gateway-umbrella/internal/protocol/modbus"
	"github.com/paulohspdev-cmyk/ProjetoGerador/gateway-umbrella/internal/protocol/nmea"
	"unicode/utf8"
)

type Detection struct {
	Protocol string
	Framing  string
	Quality  string
}

func Detect(payload []byte, hint string) Detection {
	if hint == "modbus_tcp" || hint == "modbus_rtu" {
		if f := modbus.Detect(payload); f != modbus.Unknown {
			return Detection{Protocol: "modbus", Framing: string(f), Quality: "strong"}
		}
	}
	if f := modbus.Detect(payload); f != modbus.Unknown {
		return Detection{Protocol: "modbus", Framing: string(f), Quality: "strong"}
	}
	if nmea.Detect(payload) {
		return Detection{Protocol: "nmea0183", Framing: "line", Quality: "strong"}
	}
	trimmed := bytes.TrimSpace(payload)
	if len(trimmed) > 1 && utf8.Valid(trimmed) && (trimmed[0] == '{' || trimmed[0] == '[') {
		var v any
		if json.Unmarshal(trimmed, &v) == nil {
			return Detection{Protocol: "json", Framing: "message", Quality: "medium"}
		}
	}
	if hint != "" && hint != "auto" {
		return Detection{Protocol: hint, Framing: "hinted", Quality: "hint"}
	}
	return Detection{Protocol: "raw", Framing: "stream", Quality: "unknown"}
}
