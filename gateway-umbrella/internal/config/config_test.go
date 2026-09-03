package config

import (
	"os"
	"path/filepath"
	"testing"
)

func writeConfig(t *testing.T, raw string) string {
	t.Helper()
	p := filepath.Join(t.TempDir(), "cfg.json")
	if err := os.WriteFile(p, []byte(raw), 0o600); err != nil {
		t.Fatal(err)
	}
	return p
}

func TestLoadRejectsCommandPlane(t *testing.T) {
	p := writeConfig(t, `{"schema":3,"nodeId":"gw","security":{"commandPlaneEnabled":true},"tunnels":[]}`)
	if _, err := Load(p); err == nil {
		t.Fatal("expected command plane rejection")
	}
}

func TestLoadRequiresAllowlistOnPublicFieldListener(t *testing.T) {
	p := writeConfig(t, `{"schema":3,"nodeId":"gw","security":{"requireAllowlist":true},"tunnels":[{"id":"pusr","field":{"mode":"listen","network":"tcp","bind":"0.0.0.0:15001"},"consumer":{"mode":"listen","network":"tcp","bind":"127.0.0.1:25001"}}]}`)
	if _, err := Load(p); err == nil {
		t.Fatal("expected allowlist rejection")
	}
}

func TestLoadAcceptsListenListenTunnel(t *testing.T) {
	p := writeConfig(t, `{"schema":3,"nodeId":"gw","security":{"requireAllowlist":true},"tunnels":[{"id":"pusr-rapid","field":{"mode":"listen","bind":"0.0.0.0:15003","allowedCidrs":["10.0.0.0/8"]},"consumer":{"mode":"listen","bind":"127.0.0.1:25003"}}]}`)
	cfg, err := Load(p)
	if err != nil {
		t.Fatal(err)
	}
	tunnel := cfg.Tunnels[0]
	if tunnel.Field.Network != "tcp" || tunnel.PairTimeoutS != 30 || tunnel.WriteTimeoutS != 30 || tunnel.DrainTimeoutS != 2 {
		t.Fatalf("unexpected defaults: %#v", tunnel)
	}
}

func TestLoadAcceptsDirectDeviceTunnel(t *testing.T) {
	p := writeConfig(t, `{"schema":3,"nodeId":"gw","tunnels":[{"id":"direct-device","field":{"mode":"connect","address":"10.60.20.222:502"},"consumer":{"mode":"listen","bind":"127.0.0.1:25020"}}]}`)
	cfg, err := Load(p)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Tunnels[0].Field.ReconnectS != 5 || cfg.Tunnels[0].Field.DialTimeoutS != 10 {
		t.Fatalf("expected connect defaults, got %#v", cfg.Tunnels[0].Field)
	}
}

func TestLoadRejectsUnsafeTimeoutMagnitude(t *testing.T) {
	p := writeConfig(t, `{"schema":3,"nodeId":"gw","tunnels":[{"id":"bad","pairTimeoutSeconds":7200,"field":{"mode":"listen","bind":"127.0.0.1:15001"},"consumer":{"mode":"listen","bind":"127.0.0.1:25001"}}]}`)
	if _, err := Load(p); err == nil {
		t.Fatal("expected unsafe timeout rejection")
	}
}
