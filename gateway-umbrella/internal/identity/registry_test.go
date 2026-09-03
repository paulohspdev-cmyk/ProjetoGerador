package identity

import "testing"

func TestMatchRequiresStrongEvidence(t *testing.T) {
	r := New([]Device{{
		ID:          "GEN163",
		State:       StateEnrolled,
		RemoteCIDRs: []string{"10.60.20.0/24"},
		Protocols:   []string{"modbus"},
	}})
	got := r.Match(Evidence{RemoteAddr: "10.60.20.222:502", Protocol: "modbus"})
	if got.Resolved || got.State != StateQuarantined {
		t.Fatalf("weak evidence must quarantine, got %+v", got)
	}
}

func TestComponentIDAloneIsWeak(t *testing.T) {
	r := New([]Device{{
		ID:           "GEN203",
		State:        StateEnrolled,
		ComponentIDs: []string{"reverse-modems"},
	}})
	got := r.Match(Evidence{ComponentID: "reverse-modems"})
	if got.Resolved || got.State != StateQuarantined {
		t.Fatalf("listener/component id alone must not identify a device, got %+v", got)
	}
}

func TestMatchStrongCertificate(t *testing.T) {
	r := New([]Device{{
		ID:            "GEN163",
		State:         StateEnrolled,
		TLSCertSHA256: []string{"abc123"},
	}})
	got := r.Match(Evidence{TLSCertSHA256: "ABC123"})
	if !got.Resolved || got.DeviceID != "GEN163" || got.State != StateEnrolled {
		t.Fatalf("strong certificate should resolve, got %+v", got)
	}
}

func TestMatchAmbiguousStrongEvidenceQuarantines(t *testing.T) {
	r := New([]Device{
		{ID: "A", State: StateEnrolled, MQTTClientIDs: []string{"same"}},
		{ID: "B", State: StateEnrolled, MQTTClientIDs: []string{"same"}},
	})
	got := r.Match(Evidence{MQTTClientID: "same"})
	if got.Resolved || got.State != StateQuarantined {
		t.Fatalf("ambiguous identity must quarantine, got %+v", got)
	}
}

func TestRevokedDeviceNeverResolves(t *testing.T) {
	r := New([]Device{{ID: "GENX", State: StateRevoked, IMEIs: []string{"123"}}})
	got := r.Match(Evidence{IMEI: "123"})
	if got.Resolved || got.State != StateRevoked {
		t.Fatalf("revoked device must not resolve, got %+v", got)
	}
}
