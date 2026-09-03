package config

import (
	"encoding/json"
	"fmt"
	"net"
	"net/url"
	"os"
	"strings"
)

type Admin struct {
	Bind string `json:"bind"`
}

type Spool struct {
	Enabled         bool   `json:"enabled"`
	Dir             string `json:"dir"`
	MaxSegmentBytes int64  `json:"maxSegmentBytes"`
	SyncEvery       int    `json:"syncEvery"`
}

type Identity struct {
	InventoryFile     string `json:"inventoryFile,omitempty"`
	RequireEnrollment bool   `json:"requireEnrollment"`
}

type Listener struct {
	ID                string   `json:"id"`
	Kind              string   `json:"kind"`
	Bind              string   `json:"bind"`
	Path              string   `json:"path,omitempty"`
	AllowedCIDRs      []string `json:"allowedCidrs,omitempty"`
	ReadTimeoutS      int      `json:"readTimeoutSeconds,omitempty"`
	MaxConnections    int      `json:"maxConnections,omitempty"`
	ProtocolHint      string   `json:"protocolHint,omitempty"`
	CertFile          string   `json:"certFile,omitempty"`
	KeyFile           string   `json:"keyFile,omitempty"`
	ClientCAFile      string   `json:"clientCAFile,omitempty"`
	RequireClientCert bool     `json:"requireClientCert,omitempty"`
	BearerTokenEnv    string   `json:"bearerTokenEnv,omitempty"`
	MaxBodyBytes      int64    `json:"maxBodyBytes,omitempty"`
}

type Connector struct {
	ID                 string   `json:"id"`
	Kind               string   `json:"kind"`
	Address            string   `json:"address"`
	AllowedCIDRs       []string `json:"allowedCidrs,omitempty"`
	ReadTimeoutS       int      `json:"readTimeoutSeconds,omitempty"`
	ReconnectS         int      `json:"reconnectSeconds,omitempty"`
	ProtocolHint       string   `json:"protocolHint,omitempty"`
	TLSServerName      string   `json:"tlsServerName,omitempty"`
	ClientCertFile     string   `json:"clientCertFile,omitempty"`
	ClientKeyFile      string   `json:"clientKeyFile,omitempty"`
	RootCAFile         string   `json:"rootCAFile,omitempty"`
	InsecureSkipVerify bool     `json:"insecureSkipVerify,omitempty"`
}

type Northbound struct {
	ID             string `json:"id"`
	Kind           string `json:"kind"`
	URL            string `json:"url"`
	TimeoutS       int    `json:"timeoutSeconds,omitempty"`
	Queue          int    `json:"queue,omitempty"`
	BearerTokenEnv string `json:"bearerTokenEnv,omitempty"`
}

type Sidecar struct {
	ID        string            `json:"id"`
	Command   string            `json:"command"`
	Args      []string          `json:"args,omitempty"`
	Env       map[string]string `json:"env,omitempty"`
	RestartS  int               `json:"restartSeconds,omitempty"`
	Lifecycle string            `json:"lifecycle,omitempty"`
	Protocol  string            `json:"protocol,omitempty"`
}

type Security struct {
	RequireAllowlist    bool `json:"requireAllowlist"`
	CommandPlaneEnabled bool `json:"commandPlaneEnabled"`
}

type Config struct {
	Schema     int          `json:"schema"`
	NodeID     string       `json:"nodeId"`
	EventBuf   int          `json:"eventBuffer"`
	Admin      Admin        `json:"admin"`
	Spool      Spool        `json:"spool"`
	Identity   Identity     `json:"identity"`
	Security   Security     `json:"security"`
	Listeners  []Listener   `json:"listeners"`
	Connectors []Connector  `json:"connectors,omitempty"`
	Northbound []Northbound `json:"northbound,omitempty"`
	Sidecars   []Sidecar    `json:"sidecars,omitempty"`
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
		cfg.Schema = 2
	}
	if cfg.Schema != 2 {
		return cfg, fmt.Errorf("unsupported schema %d", cfg.Schema)
	}
	if strings.TrimSpace(cfg.NodeID) == "" {
		return cfg, fmt.Errorf("nodeId is required")
	}
	if cfg.EventBuf <= 0 {
		cfg.EventBuf = 8192
	}
	if cfg.Admin.Bind == "" {
		cfg.Admin.Bind = "127.0.0.1:18080"
	}
	if cfg.Spool.Enabled {
		if cfg.Spool.Dir == "" {
			cfg.Spool.Dir = "/var/lib/rc-gateway-umbrella/spool"
		}
		if cfg.Spool.MaxSegmentBytes <= 0 {
			cfg.Spool.MaxSegmentBytes = 64 << 20
		}
		if cfg.Spool.SyncEvery <= 0 {
			cfg.Spool.SyncEvery = 1
		}
	}
	if cfg.Security.CommandPlaneEnabled {
		return cfg, fmt.Errorf("commandPlaneEnabled is intentionally unsupported in this release")
	}
	cfg.Identity.InventoryFile = strings.TrimSpace(cfg.Identity.InventoryFile)
	if cfg.Identity.RequireEnrollment && cfg.Identity.InventoryFile == "" {
		return cfg, fmt.Errorf("identity.inventoryFile is required when requireEnrollment=true")
	}

	seen := map[string]bool{}
	for i := range cfg.Listeners {
		l := &cfg.Listeners[i]
		if l.ID == "" || l.Bind == "" || l.Kind == "" {
			return cfg, fmt.Errorf("listener[%d] requires id, kind and bind", i)
		}
		if seen[l.ID] {
			return cfg, fmt.Errorf("duplicate component id %q", l.ID)
		}
		seen[l.ID] = true
		switch l.Kind {
		case "tcp_server", "udp_server", "tls_server", "http_ingest":
		default:
			return cfg, fmt.Errorf("listener %q has unsupported kind %q", l.ID, l.Kind)
		}
		if _, _, err := net.SplitHostPort(l.Bind); err != nil {
			return cfg, fmt.Errorf("listener %q invalid bind: %w", l.ID, err)
		}
		if l.MaxConnections <= 0 {
			l.MaxConnections = 1024
		}
		if l.ReadTimeoutS <= 0 {
			l.ReadTimeoutS = 60
		}
		if l.ProtocolHint == "" {
			l.ProtocolHint = "auto"
		}
		if cfg.Security.RequireAllowlist && l.Kind != "http_ingest" && len(l.AllowedCIDRs) == 0 && !isLoopbackBind(l.Bind) {
			return cfg, fmt.Errorf("listener %q requires allowedCidrs by security policy", l.ID)
		}
		if l.Kind == "tls_server" {
			if l.CertFile == "" || l.KeyFile == "" {
				return cfg, fmt.Errorf("tls listener %q requires certFile and keyFile", l.ID)
			}
			if l.RequireClientCert && l.ClientCAFile == "" {
				return cfg, fmt.Errorf("tls listener %q requires clientCAFile when requireClientCert=true", l.ID)
			}
		}
		if l.Kind == "http_ingest" {
			if l.Path == "" {
				l.Path = "/ingest"
			}
			if !strings.HasPrefix(l.Path, "/") {
				return cfg, fmt.Errorf("http listener %q path must start with /", l.ID)
			}
			if l.MaxBodyBytes <= 0 {
				l.MaxBodyBytes = 1 << 20
			}
		}
	}
	for i := range cfg.Connectors {
		c := &cfg.Connectors[i]
		if c.ID == "" || c.Kind == "" || c.Address == "" {
			return cfg, fmt.Errorf("connector[%d] requires id, kind and address", i)
		}
		if seen[c.ID] {
			return cfg, fmt.Errorf("duplicate component id %q", c.ID)
		}
		seen[c.ID] = true
		switch c.Kind {
		case "tcp_client", "tls_client":
		default:
			return cfg, fmt.Errorf("connector %q has unsupported kind %q", c.ID, c.Kind)
		}
		if _, _, err := net.SplitHostPort(c.Address); err != nil {
			return cfg, fmt.Errorf("connector %q invalid address: %w", c.ID, err)
		}
		if c.ReadTimeoutS <= 0 {
			c.ReadTimeoutS = 60
		}
		if c.ReconnectS <= 0 {
			c.ReconnectS = 5
		}
		if c.ProtocolHint == "" {
			c.ProtocolHint = "auto"
		}
	}
	for i := range cfg.Northbound {
		n := &cfg.Northbound[i]
		if n.ID == "" || n.Kind == "" || n.URL == "" {
			return cfg, fmt.Errorf("northbound[%d] requires id, kind and url", i)
		}
		if seen[n.ID] {
			return cfg, fmt.Errorf("duplicate component id %q", n.ID)
		}
		seen[n.ID] = true
		if n.Kind != "http_json" {
			return cfg, fmt.Errorf("northbound %q has unsupported kind %q", n.ID, n.Kind)
		}
		u, err := url.Parse(n.URL)
		if err != nil || (u.Scheme != "http" && u.Scheme != "https") {
			return cfg, fmt.Errorf("northbound %q requires http/https url", n.ID)
		}
		if n.TimeoutS <= 0 {
			n.TimeoutS = 5
		}
		if n.Queue <= 0 {
			n.Queue = 4096
		}
	}
	validLifecycle := map[string]bool{"experimental": true, "lab_validated": true, "field_validated": true, "production": true}
	for i := range cfg.Sidecars {
		s := &cfg.Sidecars[i]
		if s.ID == "" || s.Command == "" {
			return cfg, fmt.Errorf("sidecar[%d] requires id and command", i)
		}
		if seen[s.ID] {
			return cfg, fmt.Errorf("duplicate component id %q", s.ID)
		}
		seen[s.ID] = true
		if s.RestartS <= 0 {
			s.RestartS = 5
		}
		if s.Lifecycle == "" {
			s.Lifecycle = "experimental"
		}
		if !validLifecycle[s.Lifecycle] {
			return cfg, fmt.Errorf("sidecar %q invalid lifecycle %q", s.ID, s.Lifecycle)
		}
	}
	return cfg, nil
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
