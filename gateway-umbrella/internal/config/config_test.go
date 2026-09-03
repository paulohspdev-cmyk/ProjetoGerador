package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadRejectsCommandPlane(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "cfg.json")
	raw := `{"schema":2,"nodeId":"gw","security":{"commandPlaneEnabled":true},"listeners":[]}`
	if err := os.WriteFile(path, []byte(raw), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := Load(path); err == nil {
		t.Fatal("expected command plane rejection")
	}
}
func TestLoadRequiresAllowlistOnPublicListener(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "cfg.json")
	raw := `{"schema":2,"nodeId":"gw","security":{"requireAllowlist":true},"listeners":[{"id":"tcp","kind":"tcp_server","bind":"0.0.0.0:15001"}]}`
	if err := os.WriteFile(path, []byte(raw), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := Load(path); err == nil {
		t.Fatal("expected allowlist rejection")
	}
}
