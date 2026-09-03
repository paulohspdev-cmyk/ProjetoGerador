package main

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"flag"
	"fmt"
	"net/url"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/eclipse/paho.golang/autopaho"
	"github.com/eclipse/paho.golang/paho"
	"github.com/paulohspdev-cmyk/ProjetoGerador/gateway-umbrella/adapters/internal/wire"
)

type inbound struct {
	payload  []byte
	topic    string
	qos      byte
	retained bool
}

func main() {
	var id, broker, clientID, topicsCSV, userEnv, passEnv, caFile, certFile, keyFile string
	var qos, queue int
	flag.StringVar(&id, "id", "mqttv5-1", "adapter id")
	flag.StringVar(&broker, "broker", "", "MQTT v5 broker URI: mqtt://, tls://, ws:// or wss://")
	flag.StringVar(&clientID, "client-id", "rc-gateway-umbrella-v5", "MQTT v5 client id")
	flag.StringVar(&topicsCSV, "topics", "#", "comma-separated subscription topics")
	flag.IntVar(&qos, "qos", 1, "subscription QoS 0..2")
	flag.IntVar(&queue, "queue", 8192, "bounded inbound queue")
	flag.StringVar(&userEnv, "username-env", "", "environment variable containing username")
	flag.StringVar(&passEnv, "password-env", "", "environment variable containing password")
	flag.StringVar(&caFile, "ca-file", "", "optional CA PEM")
	flag.StringVar(&certFile, "client-cert", "", "optional mTLS client cert PEM")
	flag.StringVar(&keyFile, "client-key", "", "optional mTLS client key PEM")
	flag.Parse()

	if broker == "" {
		fatal("-broker is required")
	}
	if qos < 0 || qos > 2 {
		fatal("qos must be 0..2")
	}
	if queue < 1 {
		fatal("queue must be >0")
	}
	if (certFile == "") != (keyFile == "") {
		fatal("client-cert and client-key must be supplied together")
	}
	topics := splitNonEmpty(topicsCSV)
	if len(topics) == 0 {
		fatal("at least one subscription topic is required")
	}
	u, err := url.Parse(broker)
	if err != nil {
		fatal(fmt.Sprintf("invalid broker URI: %v", err))
	}

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	out := wire.NewWriter(os.Stdout)
	messages := make(chan inbound, queue)
	fatalCh := make(chan error, 1)

	cfg := autopaho.ClientConfig{
		ServerUrls:                    []*url.URL{u},
		KeepAlive:                     20,
		CleanStartOnInitialConnection: false,
		SessionExpiryInterval:         86400,
		ConnectTimeout:                15 * time.Second,
		ClientConfig: paho.ClientConfig{
			ClientID: clientID,
			OnPublishReceived: []func(paho.PublishReceived) (bool, error){
				func(pr paho.PublishReceived) (bool, error) {
					item := inbound{
						payload:  append([]byte(nil), pr.Packet.Payload...),
						topic:    pr.Packet.Topic,
						qos:      pr.Packet.QoS,
						retained: pr.Packet.Retain,
					}
					select {
					case messages <- item:
						return true, nil
					default:
						err := fmt.Errorf("MQTT v5 inbound queue saturated (%d); refusing silent data loss", queue)
						select {
						case fatalCh <- err:
						default:
						}
						return false, err
					}
				},
			},
			OnClientError: func(err error) {
				fmt.Fprintf(os.Stderr, "mqttv5 client error: %v\n", err)
			},
		},
	}
	cfg.OnConnectionUp = func(cm *autopaho.ConnectionManager, _ *paho.Connack) {
		subs := make([]paho.SubscribeOptions, 0, len(topics))
		for _, topic := range topics {
			subs = append(subs, paho.SubscribeOptions{Topic: topic, QoS: byte(qos)})
		}
		if _, err := cm.Subscribe(context.Background(), &paho.Subscribe{Subscriptions: subs}); err != nil {
			select {
			case fatalCh <- fmt.Errorf("MQTT v5 subscribe: %w", err):
			default:
			}
		}
	}
	cfg.OnConnectError = func(err error) {
		fmt.Fprintf(os.Stderr, "mqttv5 connect error: %v\n", err)
	}
	if userEnv != "" {
		cfg.ConnectUsername = os.Getenv(userEnv)
		if cfg.ConnectUsername == "" {
			fatal("username env is empty")
		}
	}
	if passEnv != "" {
		password := os.Getenv(passEnv)
		if password == "" {
			fatal("password env is empty")
		}
		cfg.ConnectPassword = []byte(password)
	}
	if u.Scheme == "tls" || u.Scheme == "wss" || caFile != "" || certFile != "" {
		tlsCfg, err := tlsConfig(caFile, certFile, keyFile)
		if err != nil {
			fatal(err.Error())
		}
		cfg.TlsCfg = tlsCfg
	}

	manager, err := autopaho.NewConnection(ctx, cfg)
	if err != nil {
		fatal(fmt.Sprintf("MQTT v5 connection manager: %v", err))
	}
	if err := manager.AwaitConnection(ctx); err != nil {
		fatal(fmt.Sprintf("MQTT v5 initial connection: %v", err))
	}

	for {
		select {
		case <-ctx.Done():
			<-manager.Done()
			return
		case err := <-fatalCh:
			cancel()
			<-manager.Done()
			fatal(err.Error())
		case msg := <-messages:
			meta := map[string]any{
				"topic":    msg.topic,
				"qos":      msg.qos,
				"retained": msg.retained,
				"clientId": clientID,
				"mqtt":     5,
				"readOnly": true,
			}
			if err := out.EmitBytes(wire.Message{
				Kind:       "observation",
				SessionID:  id,
				Transport:  "mqtt",
				RemoteAddr: broker,
				Protocol:   "mqtt5",
				Meta:       meta,
			}, msg.payload); err != nil {
				cancel()
				<-manager.Done()
				fatal(fmt.Sprintf("stdout: %v", err))
			}
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

func tlsConfig(caFile, certFile, keyFile string) (*tls.Config, error) {
	cfg := &tls.Config{MinVersion: tls.VersionTLS13}
	if caFile != "" {
		raw, err := os.ReadFile(caFile)
		if err != nil {
			return nil, err
		}
		pool := x509.NewCertPool()
		if !pool.AppendCertsFromPEM(raw) {
			return nil, fmt.Errorf("unable to parse CA PEM")
		}
		cfg.RootCAs = pool
	}
	if certFile != "" {
		cert, err := tls.LoadX509KeyPair(certFile, keyFile)
		if err != nil {
			return nil, err
		}
		cfg.Certificates = []tls.Certificate{cert}
	}
	return cfg, nil
}

func fatal(msg string) {
	fmt.Fprintln(os.Stderr, msg)
	os.Exit(1)
}
