package gateway

import (
	"fmt"
	"strings"

	"github.com/paulohspdev-cmyk/ProjetoGerador/gateway-umbrella/internal/core"
	"github.com/paulohspdev-cmyk/ProjetoGerador/gateway-umbrella/internal/identity"
)

type identityResolver interface {
	Match(identity.Evidence) identity.Result
}

func (g *Gateway) loadIdentity() error {
	if g.cfg.Identity.InventoryFile == "" {
		return nil
	}
	registry, err := identity.Load(g.cfg.Identity.InventoryFile)
	if err != nil {
		return fmt.Errorf("identity inventory: %w", err)
	}
	g.identities = registry
	return nil
}

func (g *Gateway) applyIdentity(event core.Event, record *core.Record) {
	if record.Meta == nil {
		record.Meta = make(map[string]any)
	}
	if g.identities == nil {
		if g.cfg.Identity.RequireEnrollment {
			record.Quality = core.QualityUnknown
			record.Meta["identityState"] = string(identity.StateQuarantined)
			record.Meta["identityReason"] = "identity enrollment required but no inventory is loaded"
			g.metrics.Inc("rc_gateway_identity_quarantined_records_total")
		}
		return
	}

	evidence := identity.Evidence{
		ComponentID:   event.ListenerID,
		RemoteAddr:    event.RemoteAddr,
		TLSCertSHA256: metaString(event.Meta, "peerCertSHA256"),
		TLSCommonName: metaString(event.Meta, "peerCommonName"),
		TLSSerial:     metaString(event.Meta, "peerSerial"),
		MQTTClientID:  firstMetaString(event.Meta, "clientId", "mqttClientId"),
		IMEI:          firstMetaString(event.Meta, "imei", "IMEI"),
		ICCID:         firstMetaString(event.Meta, "iccid", "ICCID"),
		SerialNumber:  firstMetaString(event.Meta, "serialNumber", "deviceSerial"),
		VPNPeer:       firstMetaString(event.Meta, "vpnPeer", "vpnPeerId"),
		UnitID:        metaInt(event.Meta, "unitId"),
		Protocol:      record.Protocol,
	}
	result := g.identities.Match(evidence)
	record.Meta["identityState"] = string(result.State)
	record.Meta["identityConfidence"] = result.Confidence
	if len(result.Matched) > 0 {
		record.Meta["identityMatched"] = result.Matched
	}
	if result.Reason != "" {
		record.Meta["identityReason"] = result.Reason
	}
	if result.DeviceID != "" {
		record.Meta["identityCandidate"] = result.DeviceID
	}

	if result.Resolved {
		record.DeviceID = result.DeviceID
		g.metrics.Inc("rc_gateway_identity_resolved_records_total")
		return
	}

	switch result.State {
	case identity.StateRevoked:
		record.Quality = core.QualityBad
		g.metrics.Inc("rc_gateway_identity_revoked_records_total")
	case identity.StateQuarantined:
		record.Quality = core.QualityUnknown
		g.metrics.Inc("rc_gateway_identity_quarantined_records_total")
	default:
		if g.cfg.Identity.RequireEnrollment {
			record.Quality = core.QualityUnknown
		}
		g.metrics.Inc("rc_gateway_identity_unknown_records_total")
	}
}

func metaString(meta map[string]any, key string) string {
	if meta == nil {
		return ""
	}
	value, ok := meta[key]
	if !ok || value == nil {
		return ""
	}
	if raw, ok := value.(string); ok {
		return strings.TrimSpace(raw)
	}
	return ""
}

func firstMetaString(meta map[string]any, keys ...string) string {
	for _, key := range keys {
		if value := metaString(meta, key); value != "" {
			return value
		}
	}
	return ""
}

func metaInt(meta map[string]any, key string) *int {
	if meta == nil {
		return nil
	}
	value, ok := meta[key]
	if !ok || value == nil {
		return nil
	}
	var out int
	switch v := value.(type) {
	case int:
		out = v
	case int8:
		out = int(v)
	case int16:
		out = int(v)
	case int32:
		out = int(v)
	case int64:
		out = int(v)
	case uint:
		out = int(v)
	case uint8:
		out = int(v)
	case uint16:
		out = int(v)
	case uint32:
		out = int(v)
	case uint64:
		if v > uint64(^uint(0)>>1) {
			return nil
		}
		out = int(v)
	case float64:
		if v != float64(int(v)) {
			return nil
		}
		out = int(v)
	default:
		return nil
	}
	if out < 0 || out > 255 {
		return nil
	}
	return &out
}
