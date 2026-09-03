package gateway

import (
	"testing"

	"github.com/paulohspdev-cmyk/ProjetoGerador/gateway-umbrella/internal/config"
	"github.com/paulohspdev-cmyk/ProjetoGerador/gateway-umbrella/internal/core"
	"github.com/paulohspdev-cmyk/ProjetoGerador/gateway-umbrella/internal/identity"
	"github.com/paulohspdev-cmyk/ProjetoGerador/gateway-umbrella/internal/metrics"
)

func TestApplyIdentityQuarantinesWeakSession(t *testing.T) {
	g := &Gateway{
		cfg: config.Config{Identity: config.Identity{RequireEnrollment: true}},
		identities: identity.New([]identity.Device{{
			ID:           "GEN203",
			State:        identity.StateEnrolled,
			ComponentIDs: []string{"reverse-modems"},
			RemoteCIDRs:  []string{"10.50.0.0/16"},
		}}),
		metrics: metrics.New(),
	}
	event := core.Event{ListenerID: "reverse-modems", RemoteAddr: "10.50.1.20:50000"}
	record := core.Record{Protocol: "modbus", Quality: core.QualityGood}
	g.applyIdentity(event, &record)
	if record.DeviceID != "" {
		t.Fatalf("weak session must not receive trusted device id, got %q", record.DeviceID)
	}
	if record.Quality != core.QualityUnknown {
		t.Fatalf("weak session must be UNKNOWN quality, got %s", record.Quality)
	}
}

func TestApplyIdentityResolvesStrongCertificate(t *testing.T) {
	g := &Gateway{
		cfg: config.Config{Identity: config.Identity{RequireEnrollment: true}},
		identities: identity.New([]identity.Device{{
			ID:            "GEN-TLS",
			State:         identity.StateEnrolled,
			TLSCertSHA256: []string{"abc123"},
		}}),
		metrics: metrics.New(),
	}
	event := core.Event{Meta: map[string]any{"peerCertSHA256": "ABC123"}}
	record := core.Record{Protocol: "modbus", Quality: core.QualityGood}
	g.applyIdentity(event, &record)
	if record.DeviceID != "GEN-TLS" {
		t.Fatalf("strong certificate should resolve GEN-TLS, got %q", record.DeviceID)
	}
	if record.Quality != core.QualityGood {
		t.Fatalf("resolved identity should preserve telemetry quality, got %s", record.Quality)
	}
}
