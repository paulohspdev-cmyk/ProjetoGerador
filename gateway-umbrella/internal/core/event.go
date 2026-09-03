package core

import "time"

type EventKind string

const (
	EventSessionOpen  EventKind = "session_open"
	EventSessionData  EventKind = "session_data"
	EventSessionClose EventKind = "session_close"
	EventDatagram     EventKind = "datagram"
)

type Event struct {
	Kind       EventKind      `json:"kind"`
	ListenerID string         `json:"listenerId"`
	SessionID  string         `json:"sessionId,omitempty"`
	Transport  string         `json:"transport"`
	RemoteAddr string         `json:"remoteAddr,omitempty"`
	LocalAddr  string         `json:"localAddr,omitempty"`
	ReceivedAt time.Time      `json:"receivedAt"`
	Payload    []byte         `json:"-"`
	Meta       map[string]any `json:"meta,omitempty"`
}

type Sink interface {
	Publish(Event)
}
