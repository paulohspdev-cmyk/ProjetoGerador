package config

import (
	"encoding/json"
	"fmt"
	"os"
)

type Listener struct {
	ID           string   `json:"id"`
	Kind         string   `json:"kind"`
	Bind         string   `json:"bind"`
	AllowedCIDRs []string `json:"allowedCidrs,omitempty"`
	ReadTimeoutS int      `json:"readTimeoutSeconds,omitempty"`
}

type Config struct {
	NodeID    string     `json:"nodeId"`
	EventBuf  int        `json:"eventBuffer"`
	Listeners []Listener `json:"listeners"`
}

func Load(path string) (Config, error) {
	var cfg Config
	raw, err := os.ReadFile(path)
	if err != nil {
		return cfg, err
	}
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return cfg, err
	}
	if cfg.NodeID == "" {
		return cfg, fmt.Errorf("nodeId is required")
	}
	if cfg.EventBuf <= 0 {
		cfg.EventBuf = 4096
	}
	seen := map[string]bool{}
	for i, listener := range cfg.Listeners {
		if listener.ID == "" || listener.Bind == "" || listener.Kind == "" {
			return cfg, fmt.Errorf("listener[%d] requires id, kind and bind", i)
		}
		if seen[listener.ID] {
			return cfg, fmt.Errorf("duplicate listener id %q", listener.ID)
		}
		seen[listener.ID] = true
		switch listener.Kind {
		case "tcp_server", "udp_server":
		default:
			return cfg, fmt.Errorf("listener %q has unsupported kind %q", listener.ID, listener.Kind)
		}
	}
	return cfg, nil
}
