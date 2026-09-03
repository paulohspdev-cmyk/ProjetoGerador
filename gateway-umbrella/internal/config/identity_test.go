package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRequireEnrollmentNeedsInventory(t *testing.T) {
	path := filepath.Join(t.TempDir(), "gateway.json")
	raw := `{
		"schema": 2,
		"nodeId": "test-node",
		"security": {"requireAllowlist": false, "commandPlaneEnabled": false},
		"identity": {"requireEnrollment": true},
		"listeners": []
	}`
	if err := os.WriteFile(path, []byte(raw), 0o600); err != nil {
		t.Fatal(err)
	}
	_, err := Load(path)
	if err == nil || !strings.Contains(err.Error(), "identity.inventoryFile") {
		t.Fatalf("expected identity inventory validation error, got %v", err)
	}
}
