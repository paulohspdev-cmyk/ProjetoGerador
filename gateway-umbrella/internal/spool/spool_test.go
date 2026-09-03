package spool

import (
	"github.com/paulohspdev-cmyk/ProjetoGerador/gateway-umbrella/internal/core"
	"testing"
	"time"
)

func TestAppendAndRead(t *testing.T) {
	dir := t.TempDir()
	w, err := New(dir, 1024, 1)
	if err != nil {
		t.Fatal(err)
	}
	rec := core.Record{Schema: 1, NodeID: "gw", Sequence: 1, Kind: core.EventObservation, Quality: core.QualityGood, ReceivedAt: time.Now().UTC()}
	if err := w.Append(rec); err != nil {
		t.Fatal(err)
	}
	if err := w.Close(); err != nil {
		t.Fatal(err)
	}
	paths, err := SegmentPaths(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(paths) != 1 {
		t.Fatalf("expected 1 segment, got %d", len(paths))
	}
	count := 0
	if err := ReadSegment(paths[0], func(got core.Record) error {
		count++
		if got.NodeID != "gw" {
			t.Fatalf("unexpected node: %s", got.NodeID)
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatalf("expected 1 record, got %d", count)
	}
}
