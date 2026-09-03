package main

import (
	"context"
	"flag"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/paulohspdev-cmyk/ProjetoGerador/gateway-umbrella/internal/config"
	"github.com/paulohspdev-cmyk/ProjetoGerador/gateway-umbrella/internal/gateway"
)

func main() {
	configPath := flag.String("config", "configs/gateway.example.json", "path to gateway JSON config")
	flag.Parse()

	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	cfg, err := config.Load(*configPath)
	if err != nil {
		logger.Error("configuration failed", "error", err)
		os.Exit(2)
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	logger.Info("gateway starting", "nodeId", cfg.NodeID, "listeners", len(cfg.Listeners))
	if err := gateway.New(cfg, logger).Run(ctx); err != nil {
		logger.Error("gateway stopped with error", "error", err)
		os.Exit(1)
	}
	logger.Info("gateway stopped")
}
