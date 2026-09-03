package security

import (
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"os"
)

func ServerTLS(certFile, keyFile, clientCAFile string, requireClientCert bool) (*tls.Config, error) {
	cert, err := tls.LoadX509KeyPair(certFile, keyFile)
	if err != nil {
		return nil, err
	}
	cfg := &tls.Config{MinVersion: tls.VersionTLS13, Certificates: []tls.Certificate{cert}}
	if clientCAFile != "" {
		raw, err := os.ReadFile(clientCAFile)
		if err != nil {
			return nil, err
		}
		pool := x509.NewCertPool()
		if !pool.AppendCertsFromPEM(raw) {
			return nil, fmt.Errorf("unable to parse client CA file")
		}
		cfg.ClientCAs = pool
	}
	if requireClientCert {
		cfg.ClientAuth = tls.RequireAndVerifyClientCert
	}
	return cfg, nil
}
func ClientTLS(serverName, certFile, keyFile, rootCAFile string, insecureSkipVerify bool) (*tls.Config, error) {
	cfg := &tls.Config{MinVersion: tls.VersionTLS13, ServerName: serverName, InsecureSkipVerify: insecureSkipVerify}
	if certFile != "" || keyFile != "" {
		if certFile == "" || keyFile == "" {
			return nil, fmt.Errorf("client cert and key must be supplied together")
		}
		cert, err := tls.LoadX509KeyPair(certFile, keyFile)
		if err != nil {
			return nil, err
		}
		cfg.Certificates = []tls.Certificate{cert}
	}
	if rootCAFile != "" {
		raw, err := os.ReadFile(rootCAFile)
		if err != nil {
			return nil, err
		}
		pool := x509.NewCertPool()
		if !pool.AppendCertsFromPEM(raw) {
			return nil, fmt.Errorf("unable to parse root CA file")
		}
		cfg.RootCAs = pool
	}
	return cfg, nil
}
