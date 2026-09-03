package identity

import (
	"encoding/json"
	"fmt"
	"net"
	"os"
	"sort"
	"strings"
	"sync"
)

type State string

const (
	StateUnknown     State = "unknown"
	StateQuarantined State = "quarantined"
	StateEnrolled    State = "enrolled"
	StateRevoked     State = "revoked"
)

type Device struct {
	ID             string   `json:"id"`
	State          State    `json:"state"`
	ComponentIDs   []string `json:"componentIds,omitempty"`
	RemoteCIDRs    []string `json:"remoteCidrs,omitempty"`
	TLSCertSHA256  []string `json:"tlsCertSha256,omitempty"`
	TLSCommonNames []string `json:"tlsCommonNames,omitempty"`
	TLSSerials     []string `json:"tlsSerials,omitempty"`
	MQTTClientIDs  []string `json:"mqttClientIds,omitempty"`
	IMEIs          []string `json:"imeis,omitempty"`
	ICCIDs         []string `json:"iccids,omitempty"`
	SerialNumbers  []string `json:"serialNumbers,omitempty"`
	VPNPeers       []string `json:"vpnPeers,omitempty"`
	UnitIDs        []int    `json:"unitIds,omitempty"`
	Protocols      []string `json:"protocols,omitempty"`
}

type Evidence struct {
	ComponentID   string
	RemoteAddr    string
	TLSCertSHA256 string
	TLSCommonName string
	TLSSerial     string
	MQTTClientID  string
	IMEI          string
	ICCID         string
	SerialNumber  string
	VPNPeer       string
	UnitID        *int
	Protocol      string
}

type Result struct {
	DeviceID   string   `json:"deviceId,omitempty"`
	State      State    `json:"state"`
	Confidence int      `json:"confidence"`
	Matched    []string `json:"matched,omitempty"`
	Reason     string   `json:"reason,omitempty"`
	Resolved   bool     `json:"resolved"`
}

type Inventory struct {
	Schema  int      `json:"schema"`
	Devices []Device `json:"devices"`
}

type Registry struct {
	mu      sync.RWMutex
	devices []Device
}

func New(devices []Device) *Registry {
	cp := append([]Device(nil), devices...)
	return &Registry{devices: cp}
}

func Load(path string) (*Registry, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var inv Inventory
	if err := json.Unmarshal(raw, &inv); err != nil {
		return nil, err
	}
	if inv.Schema == 0 {
		inv.Schema = 1
	}
	if inv.Schema != 1 {
		return nil, fmt.Errorf("unsupported identity inventory schema %d", inv.Schema)
	}
	seen := make(map[string]struct{}, len(inv.Devices))
	for i := range inv.Devices {
		d := &inv.Devices[i]
		d.ID = strings.TrimSpace(d.ID)
		if d.ID == "" {
			return nil, fmt.Errorf("device[%d] id is required", i)
		}
		if _, ok := seen[d.ID]; ok {
			return nil, fmt.Errorf("duplicate device id %q", d.ID)
		}
		seen[d.ID] = struct{}{}
		if d.State == "" {
			d.State = StateQuarantined
		}
		switch d.State {
		case StateQuarantined, StateEnrolled, StateRevoked:
		default:
			return nil, fmt.Errorf("device %q has invalid state %q", d.ID, d.State)
		}
		for _, rawCIDR := range d.RemoteCIDRs {
			if _, _, err := net.ParseCIDR(strings.TrimSpace(rawCIDR)); err != nil {
				return nil, fmt.Errorf("device %q invalid CIDR %q", d.ID, rawCIDR)
			}
		}
	}
	return New(inv.Devices), nil
}

func (r *Registry) Match(e Evidence) Result {
	r.mu.RLock()
	defer r.mu.RUnlock()

	type candidate struct {
		device  Device
		score   int
		strong  int
		matched []string
	}
	candidates := make([]candidate, 0, len(r.devices))
	for _, d := range r.devices {
		score, strong, matched := scoreDevice(d, e)
		if score > 0 {
			candidates = append(candidates, candidate{device: d, score: score, strong: strong, matched: matched})
		}
	}
	if len(candidates) == 0 {
		return Result{State: StateUnknown, Reason: "no identity evidence matched"}
	}
	sort.Slice(candidates, func(i, j int) bool { return candidates[i].score > candidates[j].score })
	best := candidates[0]
	if len(candidates) > 1 && candidates[1].score == best.score {
		return Result{State: StateQuarantined, Confidence: best.score, Reason: "ambiguous identity evidence"}
	}
	if best.device.State == StateRevoked {
		return Result{DeviceID: best.device.ID, State: StateRevoked, Confidence: best.score, Matched: best.matched, Reason: "device identity is revoked"}
	}
	if best.device.State != StateEnrolled {
		return Result{DeviceID: best.device.ID, State: StateQuarantined, Confidence: best.score, Matched: best.matched, Reason: "device is not enrolled"}
	}
	if best.strong == 0 {
		return Result{DeviceID: best.device.ID, State: StateQuarantined, Confidence: best.score, Matched: best.matched, Reason: "only weak identity evidence matched"}
	}
	return Result{DeviceID: best.device.ID, State: StateEnrolled, Confidence: best.score, Matched: best.matched, Resolved: true}
}

func scoreDevice(d Device, e Evidence) (int, int, []string) {
	score, strong := 0, 0
	matched := make([]string, 0, 6)
	addStrong := func(ok bool, label string, points int) {
		if ok {
			score += points
			strong++
			matched = append(matched, label)
		}
	}
	addWeak := func(ok bool, label string, points int) {
		if ok {
			score += points
			matched = append(matched, label)
		}
	}

	addStrong(matchString(d.TLSCertSHA256, e.TLSCertSHA256), "tls_cert_sha256", 120)
	addStrong(matchString(d.MQTTClientIDs, e.MQTTClientID), "mqtt_client_id", 100)
	addStrong(matchString(d.IMEIs, e.IMEI), "imei", 100)
	addStrong(matchString(d.ICCIDs, e.ICCID), "iccid", 100)
	addStrong(matchString(d.SerialNumbers, e.SerialNumber), "serial_number", 100)
	addStrong(matchString(d.VPNPeers, e.VPNPeer), "vpn_peer", 90)
	addStrong(matchString(d.TLSSerials, e.TLSSerial), "tls_serial", 80)
	addWeak(matchString(d.TLSCommonNames, e.TLSCommonName), "tls_common_name", 40)
	addWeak(matchString(d.ComponentIDs, e.ComponentID), "component_id", 20)
	addWeak(matchRemoteCIDR(d.RemoteCIDRs, e.RemoteAddr), "remote_cidr", 15)
	addWeak(matchInt(d.UnitIDs, e.UnitID), "unit_id", 8)
	addWeak(matchString(d.Protocols, e.Protocol), "protocol", 3)
	return score, strong, matched
}

func matchString(values []string, actual string) bool {
	actual = strings.TrimSpace(actual)
	if actual == "" {
		return false
	}
	for _, value := range values {
		if strings.EqualFold(strings.TrimSpace(value), actual) {
			return true
		}
	}
	return false
}

func matchInt(values []int, actual *int) bool {
	if actual == nil {
		return false
	}
	for _, value := range values {
		if value == *actual {
			return true
		}
	}
	return false
}

func matchRemoteCIDR(cidrs []string, remote string) bool {
	host, _, err := net.SplitHostPort(remote)
	if err != nil {
		host = remote
	}
	ip := net.ParseIP(strings.TrimSpace(host))
	if ip == nil {
		return false
	}
	for _, raw := range cidrs {
		_, network, err := net.ParseCIDR(strings.TrimSpace(raw))
		if err == nil && network.Contains(ip) {
			return true
		}
	}
	return false
}
