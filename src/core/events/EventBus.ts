/**
 * Typed publish/subscribe event bus — the only communication channel between
 * decoupled modules (see docs/TDD.md §2.4).
 *
 * Two channels:
 * - `emit`: synchronous, delivered immediately (intra-tick facts).
 * - `queue` + `drain`: deferred until end of tick, avoiding re-entrant cascades.
 */
export type EventHandler<T> = (payload: T) => void;

export class EventBus<M extends Record<string, unknown>> {
  private readonly handlers = new Map<keyof M, Set<EventHandler<never>>>();
  private queued: Array<{ name: keyof M; payload: M[keyof M] }> = [];

  /** Subscribe to an event. Returns an unsubscribe function. */
  on<K extends keyof M>(name: K, handler: EventHandler<M[K]>): () => void {
    let set = this.handlers.get(name);
    if (!set) {
      set = new Set();
      this.handlers.set(name, set);
    }
    set.add(handler as EventHandler<never>);
    return () => set!.delete(handler as EventHandler<never>);
  }

  /** Publish immediately to all current subscribers. */
  emit<K extends keyof M>(name: K, payload: M[K]): void {
    const set = this.handlers.get(name);
    if (!set) return;
    // Copy so that handlers subscribing/unsubscribing mid-emit are safe.
    for (const handler of [...set]) {
      (handler as EventHandler<M[K]>)(payload);
    }
  }

  /** Defer an event until the next `drain()` (called at end of sim tick). */
  queue<K extends keyof M>(name: K, payload: M[K]): void {
    this.queued.push({ name, payload: payload as M[keyof M] });
  }

  /**
   * Deliver all queued events in FIFO order. Events queued by handlers during
   * the drain are delivered in the same drain, bounded by a runaway guard.
   */
  drain(): void {
    let guard = 0;
    while (this.queued.length > 0) {
      if (++guard > 10_000) {
        throw new Error("EventBus.drain: runaway event cascade (>10000 events)");
      }
      const batch = this.queued;
      this.queued = [];
      for (const { name, payload } of batch) {
        this.emit(name, payload as M[typeof name]);
      }
    }
  }
}
