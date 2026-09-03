package main

import (
	"flag"
	"fmt"
	"github.com/paulohspdev-cmyk/ProjetoGerador/gateway-umbrella/adapters/internal/wire"
	"go.bug.st/serial"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"
)

func main() {
	var id, portName, parityRaw, stopRaw, protocol string
	var baud, dataBits, timeoutMS int
	flag.StringVar(&id, "id", "serial-1", "adapter/session id")
	flag.StringVar(&portName, "port", "", "serial device, e.g. /dev/ttyUSB0")
	flag.IntVar(&baud, "baud", 9600, "baud rate")
	flag.IntVar(&dataBits, "data-bits", 8, "data bits 5..8")
	flag.StringVar(&parityRaw, "parity", "none", "none|odd|even|mark|space")
	flag.StringVar(&stopRaw, "stop-bits", "1", "1|1.5|2")
	flag.IntVar(&timeoutMS, "read-timeout-ms", 250, "serial read timeout in ms")
	flag.StringVar(&protocol, "protocol", "modbus_rtu", "protocol hint")
	flag.Parse()
	if portName == "" {
		fatal("-port is required")
	}
	parity, err := parseParity(parityRaw)
	if err != nil {
		fatal(err.Error())
	}
	stopBits, err := parseStopBits(stopRaw)
	if err != nil {
		fatal(err.Error())
	}
	if dataBits < 5 || dataBits > 8 {
		fatal("data-bits must be 5..8")
	}
	if baud <= 0 {
		fatal("baud must be >0")
	}
	mode := &serial.Mode{BaudRate: baud, DataBits: dataBits, Parity: parity, StopBits: stopBits, InitialStatusBits: &serial.ModemOutputBits{RTS: false, DTR: false}}
	port, err := serial.Open(portName, mode)
	if err != nil {
		fatal(fmt.Sprintf("open serial: %v", err))
	}
	defer port.Close()
	if timeoutMS > 0 {
		if err := port.SetReadTimeout(time.Duration(timeoutMS) * time.Millisecond); err != nil {
			fatal(fmt.Sprintf("read timeout: %v", err))
		}
	}
	out := wire.NewWriter(os.Stdout)
	signals := make(chan os.Signal, 1)
	signal.Notify(signals, syscall.SIGINT, syscall.SIGTERM)
	done := make(chan struct{})
	go func() { <-signals; _ = port.Close(); close(done) }()
	buf := make([]byte, 64*1024)
	for {
		n, err := port.Read(buf)
		if n > 0 {
			meta := map[string]any{"baudRate": baud, "dataBits": dataBits, "parity": strings.ToLower(parityRaw), "stopBits": stopRaw, "readOnly": true}
			if emitErr := out.EmitBytes(wire.Message{Kind: "observation", SessionID: id, Transport: "serial", RemoteAddr: portName, Protocol: protocol, Meta: meta}, buf[:n]); emitErr != nil {
				fatal(fmt.Sprintf("stdout: %v", emitErr))
			}
		}
		if err != nil {
			select {
			case <-done:
				return
			default:
				fatal(fmt.Sprintf("serial read: %v", err))
			}
		}
	}
}
func parseParity(v string) (serial.Parity, error) {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "none", "n":
		return serial.NoParity, nil
	case "odd", "o":
		return serial.OddParity, nil
	case "even", "e":
		return serial.EvenParity, nil
	case "mark", "m":
		return serial.MarkParity, nil
	case "space", "s":
		return serial.SpaceParity, nil
	default:
		return serial.NoParity, fmt.Errorf("invalid parity %q", v)
	}
}
func parseStopBits(v string) (serial.StopBits, error) {
	switch strings.TrimSpace(v) {
	case "1":
		return serial.OneStopBit, nil
	case "1.5":
		return serial.OnePointFiveStopBits, nil
	case "2":
		return serial.TwoStopBits, nil
	default:
		return serial.OneStopBit, fmt.Errorf("invalid stop bits %q", v)
	}
}
func fatal(msg string) { fmt.Fprintln(os.Stderr, msg); os.Exit(1) }
