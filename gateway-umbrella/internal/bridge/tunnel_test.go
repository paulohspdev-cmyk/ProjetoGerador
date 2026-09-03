package bridge

import (
	"context"
	"io"
	"net"
	"testing"
	"time"
)

func TestCopyDuplexPreservesBytesBothDirections(t *testing.T) {
	fieldApp, fieldGW := net.Pipe()
	consumerGW, consumerApp := net.Pipe()
	defer fieldApp.Close()
	defer consumerApp.Close()

	done := make(chan error, 1)
	go func() {
		done <- copyDuplex(context.Background(), "test-pair", fieldGW, consumerGW, Hooks{})
	}()

	fieldPayload := []byte{0x01, 0x03, 0x00, 0x64, 0xff, 0x00}
	go func() { _, _ = fieldApp.Write(fieldPayload) }()
	gotAtConsumer := make([]byte, len(fieldPayload))
	if _, err := io.ReadFull(consumerApp, gotAtConsumer); err != nil {
		t.Fatal(err)
	}
	if string(gotAtConsumer) != string(fieldPayload) {
		t.Fatalf("field->consumer bytes changed: got %x want %x", gotAtConsumer, fieldPayload)
	}

	consumerPayload := []byte{0x00, 0x01, 0x00, 0x00, 0x00, 0x06, 0x01, 0x03}
	go func() { _, _ = consumerApp.Write(consumerPayload) }()
	gotAtField := make([]byte, len(consumerPayload))
	if _, err := io.ReadFull(fieldApp, gotAtField); err != nil {
		t.Fatal(err)
	}
	if string(gotAtField) != string(consumerPayload) {
		t.Fatalf("consumer->field bytes changed: got %x want %x", gotAtField, consumerPayload)
	}

	_ = fieldApp.Close()
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("copyDuplex returned error: %v", err)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("copyDuplex did not stop")
	}
}
