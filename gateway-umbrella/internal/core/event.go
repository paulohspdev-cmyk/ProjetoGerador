package core

import "time"

type EventKind string

const (
	EventSessionOpen  EventKind = "session_open"
	EventSessionData  EventKind = "session_data"
	EventSessionClose EventKind = "session_close"
	EventDatagram     EventKind = "datagram"
	EventObservation  EventKind = "observation"
	EventSidecar      EventKind = "sidecar"
)

type Event struct {
	Kind         EventKind      `json:"kind"`
	ListenerID   string         `json:"listenerId,omitempty"`
	SessionID    string         `json:"sessionId,omitempty"`
	Transport    string         `json:"transport,omitempty"`
	RemoteAddr   string         `json:"remoteAddr,omitempty"`
	LocalAddr    string         `json:"localAddr,omitempty"`
	ProtocolHint string         `json:"protocolHint,omitempty"`
	ReceivedAt   time.Time      `json:"receivedAt"`
	Payload      []byte         `json:"-"`
	Meta         map[string]any `json:"meta,omitempty"`
}
type Quality string

const (
	QualityGood        Quality = "GOOD"
	QualityStale       Quality = "STALE"
	QualityBad         Quality = "BAD"
	QualityCommFailure Quality = "COMM_FAILURE"
	QualityUnavailable Quality = "UNAVAILABLE"
	QualityUnknown     Quality = "UNKNOWN"
)

type Record struct {
	Schema        int            `json:"schema"`
	NodeID        string         `json:"nodeId"`
	Sequence      uint64         `json:"sequence"`
	Kind          EventKind      `json:"kind"`
	ListenerID    string         `json:"listenerId,omitempty"`
	SessionID     string         `json:"sessionId,omitempty"`
	DeviceID      string         `json:"deviceId,omitempty"`
	Transport     string         `json:"transport,omitempty"`
	RemoteAddr    string         `json:"remoteAddr,omitempty"`
	LocalAddr     string         `json:"localAddr,omitempty"`
	Protocol      string         `json:"protocol,omitempty"`
	Framing       string         `json:"framing,omitempty"`
	Quality       Quality        `json:"quality"`
	ReceivedAt    time.Time      `json:"receivedAt"`
	Size          int            `json:"size,omitempty"`
	PayloadBase64 string         `json:"payloadBase64,omitempty"`
	Meta          map[string]any `json:"meta,omitempty"`
}
type Sink interface{ Publish(Event) }
