package core

import (
	"context"
	"sync"
)

type Bus struct {
	ch   chan Event
	once sync.Once
}

func NewBus(buffer int) *Bus {
	if buffer < 1 {
		buffer = 1024
	}
	return &Bus{ch: make(chan Event, buffer)}
}

func (b *Bus) Publish(event Event) {
	b.ch <- event
}

func (b *Bus) Events() <-chan Event {
	return b.ch
}

func (b *Bus) Close() {
	b.once.Do(func() { close(b.ch) })
}

func (b *Bus) Run(ctx context.Context, handler func(Event)) {
	for {
		select {
		case <-ctx.Done():
			return
		case event, ok := <-b.ch:
			if !ok {
				return
			}
			handler(event)
		}
	}
}
