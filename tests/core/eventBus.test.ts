import { describe, expect, it } from "vitest";
import { EventBus } from "../../src/core/events/EventBus";

type TestEvents = {
  ping: { value: number };
  pong: { value: number };
};

describe("EventBus", () => {
  it("delivers emitted events to subscribers", () => {
    const bus = new EventBus<TestEvents>();
    const received: number[] = [];
    bus.on("ping", (p) => received.push(p.value));
    bus.emit("ping", { value: 1 });
    bus.emit("ping", { value: 2 });
    expect(received).toEqual([1, 2]);
  });

  it("does not deliver to other event names", () => {
    const bus = new EventBus<TestEvents>();
    const received: number[] = [];
    bus.on("pong", (p) => received.push(p.value));
    bus.emit("ping", { value: 1 });
    expect(received).toEqual([]);
  });

  it("stops delivering after unsubscribe", () => {
    const bus = new EventBus<TestEvents>();
    const received: number[] = [];
    const off = bus.on("ping", (p) => received.push(p.value));
    bus.emit("ping", { value: 1 });
    off();
    bus.emit("ping", { value: 2 });
    expect(received).toEqual([1]);
  });

  it("holds queued events until drain, then delivers FIFO", () => {
    const bus = new EventBus<TestEvents>();
    const received: number[] = [];
    bus.on("ping", (p) => received.push(p.value));
    bus.queue("ping", { value: 1 });
    bus.queue("ping", { value: 2 });
    expect(received).toEqual([]);
    bus.drain();
    expect(received).toEqual([1, 2]);
  });

  it("delivers events queued by handlers within the same drain", () => {
    const bus = new EventBus<TestEvents>();
    const received: string[] = [];
    bus.on("ping", (p) => {
      received.push(`ping:${p.value}`);
      if (p.value === 1) bus.queue("pong", { value: 99 });
    });
    bus.on("pong", (p) => received.push(`pong:${p.value}`));
    bus.queue("ping", { value: 1 });
    bus.drain();
    expect(received).toEqual(["ping:1", "pong:99"]);
  });

  it("throws on a runaway event cascade instead of hanging", () => {
    const bus = new EventBus<TestEvents>();
    bus.on("ping", (p) => bus.queue("ping", p));
    bus.queue("ping", { value: 0 });
    expect(() => bus.drain()).toThrow(/runaway/);
  });
});
