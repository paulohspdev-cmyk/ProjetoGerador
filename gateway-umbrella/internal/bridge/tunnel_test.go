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

	assertDuplexBytes(t, fieldApp, consumerApp)

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

func TestListenListenTunnelUsesRealTCPSockets(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	fieldSource, fieldAddr := testListenSource(t, ctx)
	defer fieldSource.Close()
	consumerSource, consumerAddr := testListenSource(t, ctx)
	defer consumerSource.Close()

	pairCh := make(chan pairResult, 1)
	go func() {
		fieldConn, consumerConn, err := acquirePair(ctx, fieldSource, consumerSource, "listen", "listen")
		pairCh <- pairResult{field: fieldConn, consumer: consumerConn, err: err}
	}()

	fieldPeer := dialTestPeer(t, fieldAddr)
	defer fieldPeer.Close()
	consumerPeer := dialTestPeer(t, consumerAddr)
	defer consumerPeer.Close()

	pair := waitPair(t, pairCh)
	defer pair.field.Close()
	defer pair.consumer.Close()

	done := make(chan error, 1)
	go func() { done <- copyDuplex(ctx, "listen-listen", pair.field, pair.consumer, Hooks{}) }()
	assertDuplexBytes(t, fieldPeer, consumerPeer)
	_ = fieldPeer.Close()
	waitCopy(t, done)
}

func TestConnectListenWaitsForInboundPeerBeforeDialingField(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	deviceListener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer deviceListener.Close()
	tcpDeviceListener := deviceListener.(*net.TCPListener)

	fieldSource, err := newSource(ctx, Endpoint{
		Mode:        "connect",
		Network:     "tcp",
		Address:     deviceListener.Addr().String(),
		DialTimeout: time.Second,
		Reconnect:   20 * time.Millisecond,
		KeepAlive:   time.Second,
	})
	if err != nil {
		t.Fatal(err)
	}
	defer fieldSource.Close()

	consumerSource, consumerAddr := testListenSource(t, ctx)
	defer consumerSource.Close()

	pairCh := make(chan pairResult, 1)
	go func() {
		fieldConn, consumerConn, err := acquirePair(ctx, fieldSource, consumerSource, "connect", "listen")
		pairCh <- pairResult{field: fieldConn, consumer: consumerConn, err: err}
	}()

	// A direct device must not be dialed before the consumer (for example Rapid)
	// actually opens the local side of the tunnel.
	if err := tcpDeviceListener.SetDeadline(time.Now().Add(150 * time.Millisecond)); err != nil {
		t.Fatal(err)
	}
	unexpected, err := tcpDeviceListener.Accept()
	if err == nil {
		_ = unexpected.Close()
		t.Fatal("field was dialed before the consumer connected")
	}
	if netErr, ok := err.(net.Error); !ok || !netErr.Timeout() {
		t.Fatalf("expected accept timeout before consumer connection, got %v", err)
	}
	if err := tcpDeviceListener.SetDeadline(time.Time{}); err != nil {
		t.Fatal(err)
	}

	consumerPeer := dialTestPeer(t, consumerAddr)
	defer consumerPeer.Close()

	fieldPeer, err := deviceListener.Accept()
	if err != nil {
		t.Fatal(err)
	}
	defer fieldPeer.Close()

	pair := waitPair(t, pairCh)
	defer pair.field.Close()
	defer pair.consumer.Close()

	done := make(chan error, 1)
	go func() { done <- copyDuplex(ctx, "connect-listen", pair.field, pair.consumer, Hooks{}) }()
	assertDuplexBytes(t, fieldPeer, consumerPeer)
	_ = consumerPeer.Close()
	waitCopy(t, done)
}

type pairResult struct {
	field    net.Conn
	consumer net.Conn
	err      error
}

func testListenSource(t *testing.T, ctx context.Context) (connectionSource, string) {
	t.Helper()
	source, err := newSource(ctx, Endpoint{Mode: "listen", Network: "tcp", Bind: "127.0.0.1:0", KeepAlive: time.Second})
	if err != nil {
		t.Fatal(err)
	}
	listener, ok := source.(*listenSource)
	if !ok {
		t.Fatalf("expected listenSource, got %T", source)
	}
	return source, listener.ln.Addr().String()
}

func dialTestPeer(t *testing.T, address string) net.Conn {
	t.Helper()
	conn, err := net.DialTimeout("tcp", address, 2*time.Second)
	if err != nil {
		t.Fatal(err)
	}
	return conn
}

func waitPair(t *testing.T, ch <-chan pairResult) pairResult {
	t.Helper()
	select {
	case pair := <-ch:
		if pair.err != nil {
			t.Fatal(pair.err)
		}
		return pair
	case <-time.After(3 * time.Second):
		t.Fatal("pair acquisition timed out")
		return pairResult{}
	}
}

func waitCopy(t *testing.T, done <-chan error) {
	t.Helper()
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("copyDuplex returned error: %v", err)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("copyDuplex did not stop")
	}
}

func assertDuplexBytes(t *testing.T, fieldPeer, consumerPeer net.Conn) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	_ = fieldPeer.SetDeadline(deadline)
	_ = consumerPeer.SetDeadline(deadline)
	defer fieldPeer.SetDeadline(time.Time{})
	defer consumerPeer.SetDeadline(time.Time{})

	fieldPayload := []byte{0x01, 0x03, 0x00, 0x64, 0xff, 0x00, 0x7e}
	if _, err := fieldPeer.Write(fieldPayload); err != nil {
		t.Fatal(err)
	}
	gotAtConsumer := make([]byte, len(fieldPayload))
	if _, err := io.ReadFull(consumerPeer, gotAtConsumer); err != nil {
		t.Fatal(err)
	}
	if string(gotAtConsumer) != string(fieldPayload) {
		t.Fatalf("field->consumer bytes changed: got %x want %x", gotAtConsumer, fieldPayload)
	}

	consumerPayload := []byte{0x00, 0x01, 0x00, 0x00, 0x00, 0x06, 0x01, 0x03, 0x80, 0xff}
	if _, err := consumerPeer.Write(consumerPayload); err != nil {
		t.Fatal(err)
	}
	gotAtField := make([]byte, len(consumerPayload))
	if _, err := io.ReadFull(fieldPeer, gotAtField); err != nil {
		t.Fatal(err)
	}
	if string(gotAtField) != string(consumerPayload) {
		t.Fatalf("consumer->field bytes changed: got %x want %x", gotAtField, consumerPayload)
	}
}
