package wire

import (
	"encoding/base64"
	"encoding/json"
	"io"
	"sync"
)

type Message struct {
	Kind          string         `json:"kind"`
	SessionID     string         `json:"sessionId,omitempty"`
	Transport     string         `json:"transport,omitempty"`
	RemoteAddr    string         `json:"remoteAddr,omitempty"`
	LocalAddr     string         `json:"localAddr,omitempty"`
	Protocol      string         `json:"protocol,omitempty"`
	PayloadBase64 string         `json:"payloadBase64,omitempty"`
	Meta          map[string]any `json:"meta,omitempty"`
}
type Writer struct {
	mu  sync.Mutex
	enc *json.Encoder
}

func NewWriter(w io.Writer) *Writer { return &Writer{enc: json.NewEncoder(w)} }
func (w *Writer) EmitBytes(msg Message, payload []byte) error {
	msg.PayloadBase64 = base64.StdEncoding.EncodeToString(payload)
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.enc.Encode(msg)
}
