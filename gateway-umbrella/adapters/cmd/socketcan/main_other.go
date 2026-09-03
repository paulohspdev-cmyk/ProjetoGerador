//go:build !linux

package main

import (
	"fmt"
	"os"
)

func main() { fmt.Fprintln(os.Stderr, "SocketCAN adapter requires Linux"); os.Exit(2) }
