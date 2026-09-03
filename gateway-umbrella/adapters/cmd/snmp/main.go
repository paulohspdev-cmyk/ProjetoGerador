package main

import (
	"context"
	"encoding/json"
	"flag"
	"log"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/gosnmp/gosnmp"
	"github.com/paulohspdev-cmyk/ProjetoGerador/gateway-umbrella/adapters/internal/wire"
)

func main() {
	target := flag.String("target", "", "SNMP target host")
	port := flag.Uint("port", 161, "SNMP UDP port")
	version := flag.String("version", "2c", "SNMP version: 2c or 3")
	oidsCSV := flag.String("oids", "", "comma-separated OIDs")
	interval := flag.Duration("interval", 5*time.Second, "poll interval")
	timeout := flag.Duration("timeout", 2*time.Second, "request timeout")
	retries := flag.Int("retries", 1, "request retries")
	flag.Parse()

	if *target == "" {
		log.Fatal("-target is required")
	}
	oids := splitNonEmpty(*oidsCSV)
	if len(oids) == 0 {
		log.Fatal("-oids requires at least one OID")
	}
	if *port == 0 || *port > 65535 {
		log.Fatal("-port must be between 1 and 65535")
	}
	if *interval <= 0 || *timeout <= 0 {
		log.Fatal("-interval and -timeout must be greater than zero")
	}

	client := &gosnmp.GoSNMP{
		Target:  *target,
		Port:    uint16(*port),
		Timeout: *timeout,
		Retries: *retries,
	}

	switch strings.ToLower(strings.TrimSpace(*version)) {
	case "2c", "v2c":
		community := os.Getenv("RC_SNMP_COMMUNITY")
		if community == "" {
			log.Fatal("SNMPv2c requires RC_SNMP_COMMUNITY")
		}
		client.Version = gosnmp.Version2c
		client.Community = community
	case "3", "v3":
		user := os.Getenv("RC_SNMP_V3_USER")
		authPass := os.Getenv("RC_SNMP_V3_AUTH_PASSWORD")
		privPass := os.Getenv("RC_SNMP_V3_PRIV_PASSWORD")
		if user == "" || authPass == "" || privPass == "" {
			log.Fatal("SNMPv3 requires RC_SNMP_V3_USER, RC_SNMP_V3_AUTH_PASSWORD and RC_SNMP_V3_PRIV_PASSWORD")
		}
		client.Version = gosnmp.Version3
		client.SecurityModel = gosnmp.UserSecurityModel
		client.MsgFlags = gosnmp.AuthPriv
		client.SecurityParameters = &gosnmp.UsmSecurityParameters{
			UserName:                 user,
			AuthenticationProtocol:   gosnmp.SHA256,
			PrivacyProtocol:          gosnmp.AES,
			AuthenticationPassphrase: authPass,
			PrivacyPassphrase:        privPass,
		}
	default:
		log.Fatalf("unsupported SNMP version %q", *version)
	}

	if err := client.Connect(); err != nil {
		log.Fatalf("connect SNMP: %v", err)
	}
	defer client.Conn.Close()

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	out := wire.NewWriter(os.Stdout)

	poll := func() {
		packet, err := client.Get(oids)
		if err != nil {
			_ = out.EmitBytes(wire.Message{
				Kind:       "data",
				SessionID:  *target,
				Transport:  "udp",
				RemoteAddr: *target,
				Protocol:   "snmp",
				Meta: map[string]any{
					"quality": "BAD",
					"error":   err.Error(),
				},
			}, nil)
			return
		}
		for _, variable := range packet.Variables {
			payload, err := json.Marshal(map[string]any{
				"type":  int(variable.Type),
				"value": variable.Value,
			})
			if err != nil {
				log.Printf("encode SNMP OID %s: %v", variable.Name, err)
				continue
			}
			if err := out.EmitBytes(wire.Message{
				Kind:       "data",
				SessionID:  *target,
				Transport:  "udp",
				RemoteAddr: *target,
				Protocol:   "snmp",
				Meta: map[string]any{
					"oid":     variable.Name,
					"quality": "GOOD",
				},
			}, payload); err != nil {
				log.Fatalf("emit SNMP value: %v", err)
			}
		}
	}

	poll()
	ticker := time.NewTicker(*interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			poll()
		}
	}
}

func splitNonEmpty(raw string) []string {
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part != "" {
			out = append(out, part)
		}
	}
	return out
}
