package spool

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/paulohspdev-cmyk/ProjetoGerador/gateway-umbrella/internal/core"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"
)

type Writer struct {
	mu              sync.Mutex
	dir             string
	maxSegmentBytes int64
	syncEvery       int
	file            *os.File
	writer          *bufio.Writer
	size            int64
	pending         int
}

func New(dir string, maxSegmentBytes int64, syncEvery int) (*Writer, error) {
	if dir == "" {
		return nil, errors.New("spool dir is required")
	}
	if maxSegmentBytes <= 0 {
		maxSegmentBytes = 64 << 20
	}
	if syncEvery <= 0 {
		syncEvery = 1
	}
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return nil, err
	}
	w := &Writer{dir: dir, maxSegmentBytes: maxSegmentBytes, syncEvery: syncEvery}
	if err := w.rotateLocked(); err != nil {
		return nil, err
	}
	return w, nil
}
func (w *Writer) Append(record core.Record) error {
	w.mu.Lock()
	defer w.mu.Unlock()
	raw, err := json.Marshal(record)
	if err != nil {
		return err
	}
	raw = append(raw, '\n')
	if w.file == nil || w.size+int64(len(raw)) > w.maxSegmentBytes {
		if err := w.rotateLocked(); err != nil {
			return err
		}
	}
	n, err := w.writer.Write(raw)
	if err != nil {
		return err
	}
	w.size += int64(n)
	w.pending++
	if w.pending >= w.syncEvery {
		return w.flushLocked()
	}
	return nil
}
func (w *Writer) flushLocked() error {
	if w.writer == nil || w.file == nil {
		return nil
	}
	if err := w.writer.Flush(); err != nil {
		return err
	}
	if err := w.file.Sync(); err != nil {
		return err
	}
	w.pending = 0
	return nil
}
func (w *Writer) rotateLocked() error {
	if w.file != nil {
		if err := w.flushLocked(); err != nil {
			return err
		}
		if err := w.file.Close(); err != nil {
			return err
		}
	}
	name := fmt.Sprintf("segment-%s-%d.jsonl", time.Now().UTC().Format("20060102T150405.000000000Z"), time.Now().UnixNano())
	path := filepath.Join(w.dir, name)
	f, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o640)
	if err != nil {
		return err
	}
	w.file = f
	w.writer = bufio.NewWriterSize(f, 128*1024)
	w.size = 0
	w.pending = 0
	return nil
}
func (w *Writer) Close() error {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.file == nil {
		return nil
	}
	if err := w.flushLocked(); err != nil {
		return err
	}
	err := w.file.Close()
	w.file = nil
	w.writer = nil
	return err
}
func SegmentPaths(dir string) ([]string, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	var out []string
	for _, e := range entries {
		if !e.IsDir() && filepath.Ext(e.Name()) == ".jsonl" {
			out = append(out, filepath.Join(dir, e.Name()))
		}
	}
	sort.Strings(out)
	return out, nil
}
func ReadSegment(path string, fn func(core.Record) error) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	buf := make([]byte, 64*1024)
	sc.Buffer(buf, 4<<20)
	for sc.Scan() {
		var r core.Record
		if err := json.Unmarshal(sc.Bytes(), &r); err != nil {
			return fmt.Errorf("%s: %w", path, err)
		}
		if err := fn(r); err != nil {
			return err
		}
	}
	return sc.Err()
}
