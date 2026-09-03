package config

import (
	"encoding/json"
	"fmt"
	"net"
	"os"
	"strings"
)

type Admin struct {
	Bind string `json:"bind"`
}

type Security struct {
	RequireAllowlist    bool `json:"requireAllowlist"`
	CommandPlaneEnabled bool `json:"commandPlaneEnabled"`
}

type Endpoint struct {
	Mode         string   `json:"mode"`
	Network      string   `json:"network,omitempty"`
	Bind         string   `json:"bind,omitempty"`
	Address      string   `json:"address,omitempty"`
	AllowedCIDRs []string `json:"allowedCidrs,omitempty"`
	DialTimeoutS int      `json:"dialTimeoutSeconds,omitempty"`
	ReconnectS   int      `json:"reconnectSeconds,omitempty"`
	KeepAliveS   int      `json:"keepAliveSeconds,omitempty"`
}

type Tunnel struct {
	ID            string   `json:"id"`
	Field         Endpoint `json:"field"`
	Consumer      Endpoint `json:"consumer"`
	PairTimeoutS  int      `json:"pairTimeoutSeconds,omitempty"`
	WriteTimeoutS int      `json:"writeTimeoutSeconds,omitempty"`
	DrainTimeoutS int      `json:"drainTimeoutSeconds,omitempty"`
}

type Config struct {
	Schema   int      `json:"schema"`
	NodeID   string   `json:"nodeId"`
	Admin    Admin    `json:"admin"`
	Security Security `json:"security"`
	Tunnels  []Tunnel `json:"tunnels"`
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
	if cfg.Schema == 0 {
		cfg.Schema = 3
	}
	if cfg.Schema != 3 {
		return cfg, fmt.Errorf("unsupported schema %d; bridge-first configuration requires schema 3", cfg.Schema)
	}
	if strings.TrimSpace(cfg.NodeID) == "" {
		return cfg, fmt.Errorf("nodeId is required")
	}
	if cfg.Admin.Bind == "" {
		cfg.Admin.Bind = "127.0.0.1:18080"
	}
	if _, _, err := net.SplitHostPort(cfg.Admin.Bind); err != nil {
		return cfg, fmt.Errorf("admin invalid bind: %w", err)
	}
	if cfg.Security.CommandPlaneEnabled {
		return cfg, fmt.Errorf("commandPlaneEnabled is intentionally unsupported in this release")
	}
	seen := map[string]bool{}
	for i := range cfg.Tunnels {
		t := &cfg.Tunnels[i]
		t.ID = strings.TrimSpace(t.ID)
		if t.ID == "" {
			return cfg, fmt.Errorf("tunnel[%d] requires id", i)
		}
		if seen[t.ID] {
			return cfg, fmt.Errorf("duplicate tunnel id %q", t.ID)
		}
		seen[t.ID] = true
		if t.PairTimeoutS <= 0 {
			t.PairTimeoutS = 30
		}
		if t.WriteTimeoutS <= 0 {
			t.WriteTimeoutS = 30
		}
		if t.DrainTimeoutS <= 0 {
			t.DrainTimeoutS = 2
		}
		if t.PairTimeoutS > 3600 || t.WriteTimeoutS > 3600 || t.DrainTimeoutS > 300 {
			return cfg, fmt.Errorf("tunnel %s timeout exceeds safe configuration limit", t.ID)
		}
		if err := validateEndpoint(&t.Field, "tunnel "+t.ID+" field", cfg.Security.RequireAllowlist); err != nil {
			return cfg, err
		}
		if err := validateEndpoint(&t.Consumer, "tunnel "+t.ID+" consumer", cfg.Security.RequireAllowlist); err != nil {
			return cfg, err
		}
	}
	return cfg, nil
}

func validateEndpoint(ep *Endpoint, label string, requireAllowlist bool) error {
	ep.Mode = strings.TrimSpace(ep.Mode)
	ep.Network = strings.TrimSpace(ep.Network)
	if ep.Network == "" {
		ep.Network = "tcp"
	}
	if ep.Network != "tcp" {
		return fmt.Errorf("%s unsupported network %q; core bridge currently supports tcp", label, ep.Network)
	}
	if ep.KeepAliveS <= 0 {
		ep.KeepAliveS = 30
	}
	switch ep.Mode {
	case "listen":
		if strings.TrimSpace(ep.Bind) == "" {
			return fmt.Errorf("%s requires bind in listen mode", label)
		}
		if _, _, err := net.SplitHostPort(ep.Bind); err != nil {
			return fmt.Errorf("%s invalid bind: %w", label, err)
		}
		for _, cidr := range ep.AllowedCIDRs {
			if _, _, err := net.ParseCIDR(cidr); err != nil {
				return fmt.Errorf("%s invalid allowedCidrs entry %q: %w", label, cidr, err)
			}
		}
		if requireAllowlist && len(ep.AllowedCIDRs) == 0 && !isLoopbackBind(ep.Bind) {
			return fmt.Errorf("%s requires allowedCidrs by security policy", label)
		}
	case "connect":
		if strings.TrimSpace(ep.Address) == "" {
			return fmt.Errorf("%s requires address in connect mode", label)
		}
		if _, _, err := net.SplitHostPort(ep.Address); err != nil {
			return fmt.Errorf("%s invalid address: %w", label, err)
		}
		if ep.DialTimeoutS <= 0 {
			ep.DialTimeoutS = 10
		}
		if ep.ReconnectS <= 0 {
			ep.ReconnectS = 5
		}
	default:
		return fmt.Errorf("%s mode must be listen or connect", label)
	}
	return nil
}

func isLoopbackBind(bind string) bool {
	host, _, err := net.SplitHostPort(bind)
	if err != nil {
		return false
	}
	if host == "localhost" {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}
