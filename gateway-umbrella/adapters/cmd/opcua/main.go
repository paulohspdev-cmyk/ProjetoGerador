package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/gopcua/opcua"
	"github.com/gopcua/opcua/ua"
	"github.com/paulohspdev-cmyk/ProjetoGerador/gateway-umbrella/adapters/internal/wire"
)

func main() {
	endpoint := flag.String("endpoint", "", "OPC UA endpoint, for example opc.tcp://10.0.0.10:4840")
	nodesCSV := flag.String("nodes", "", "comma-separated OPC UA Node IDs")
	interval := flag.Duration("interval", time.Second, "read interval")
	policy := flag.String("policy", "", "OPC UA security policy")
	mode := flag.String("mode", "", "OPC UA security mode")
	certFile := flag.String("cert", "", "client certificate path")
	keyFile := flag.String("key", "", "client private key path")
	allowInsecure := flag.Bool("allow-insecure", false, "allow SecurityMode None")
	flag.Parse()

	if *endpoint == "" {
		log.Fatal("-endpoint is required")
	}
	nodeNames := splitNonEmpty(*nodesCSV)
	if len(nodeNames) == 0 {
		log.Fatal("-nodes requires at least one Node ID")
	}
	if *interval <= 0 {
		log.Fatal("-interval must be greater than zero")
	}

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	endpoints, err := opcua.GetEndpoints(ctx, *endpoint)
	if err != nil {
		log.Fatalf("discover OPC UA endpoints: %v", err)
	}
	ep, err := opcua.SelectEndpoint(endpoints, *policy, ua.MessageSecurityModeFromString(*mode))
	if err != nil {
		log.Fatalf("select OPC UA endpoint: %v", err)
	}
	if ep.SecurityMode == ua.MessageSecurityModeNone && !*allowInsecure {
		log.Fatal("refusing OPC UA SecurityMode None without -allow-insecure")
	}
	if ep.SecurityMode != ua.MessageSecurityModeNone && (*certFile == "" || *keyFile == "") {
		log.Fatal("secure OPC UA endpoint requires -cert and -key")
	}

	opts := []opcua.Option{
		opcua.SecurityPolicy(*policy),
		opcua.SecurityModeString(*mode),
		opcua.AuthAnonymous(),
		opcua.SecurityFromEndpoint(ep, ua.UserTokenTypeAnonymous),
	}
	if *certFile != "" {
		opts = append(opts, opcua.CertificateFile(*certFile))
	}
	if *keyFile != "" {
		opts = append(opts, opcua.PrivateKeyFile(*keyFile))
	}

	client, err := opcua.NewClient(ep.EndpointURL, opts...)
	if err != nil {
		log.Fatalf("create OPC UA client: %v", err)
	}
	if err := client.Connect(ctx); err != nil {
		log.Fatalf("connect OPC UA: %v", err)
	}
	defer client.Close(context.Background())

	nodeIDs := make([]*ua.NodeID, 0, len(nodeNames))
	for _, raw := range nodeNames {
		id, err := ua.ParseNodeID(raw)
		if err != nil {
			log.Fatalf("invalid Node ID %q: %v", raw, err)
		}
		nodeIDs = append(nodeIDs, id)
	}

	out := wire.NewWriter(os.Stdout)
	readAll := func() {
		for i, id := range nodeIDs {
			value, err := client.Node(id).Value(ctx)
			if err != nil {
				_ = out.EmitBytes(wire.Message{
					Kind:       "data",
					SessionID:  *endpoint,
					Transport:  "opc.tcp",
					RemoteAddr: *endpoint,
					Protocol:   "opcua",
					Meta: map[string]any{
						"nodeId":  nodeNames[i],
						"quality": "BAD",
						"error":   err.Error(),
					},
				}, nil)
				continue
			}
			payload, err := json.Marshal(map[string]any{"value": value.Value()})
			if err != nil {
				payload = []byte(fmt.Sprint(value.Value()))
			}
			if err := out.EmitBytes(wire.Message{
				Kind:       "data",
				SessionID:  *endpoint,
				Transport:  "opc.tcp",
				RemoteAddr: *endpoint,
				Protocol:   "opcua",
				Meta: map[string]any{
					"nodeId":  nodeNames[i],
					"quality": "GOOD",
				},
			}, payload); err != nil {
				log.Fatalf("emit OPC UA value: %v", err)
			}
		}
	}

	readAll()
	ticker := time.NewTicker(*interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			readAll()
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
