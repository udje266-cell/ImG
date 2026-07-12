/**
 * Minimal pragmatic ECS (see docs/TDD.md §2.5).
 *
 * Entities are integers, components are plain data held in typed stores,
 * systems are scheduled functions (see Scheduler). Hot components will move
 * to SoA typed-array stores when the inhabitants phase lands.
 */
export type Entity = number;

export class ComponentStore<T> {
  private readonly data = new Map<Entity, T>();

  set(entity: Entity, value: T): void {
    this.data.set(entity, value);
  }

  get(entity: Entity): T | undefined {
    return this.data.get(entity);
  }

  has(entity: Entity): boolean {
    return this.data.has(entity);
  }

  remove(entity: Entity): boolean {
    return this.data.delete(entity);
  }

  get size(): number {
    return this.data.size;
  }

  /** Stable insertion-order iteration (determinism requirement). */
  *entries(): IterableIterator<[Entity, T]> {
    yield* this.data.entries();
  }
}

export class World {
  private nextEntity: Entity = 1;
  private readonly alive = new Set<Entity>();
  private readonly stores = new Map<string, ComponentStore<unknown>>();

  createEntity(): Entity {
    const entity = this.nextEntity++;
    this.alive.add(entity);
    return entity;
  }

  isAlive(entity: Entity): boolean {
    return this.alive.has(entity);
  }

  /** Destroys an entity and removes all of its components. */
  destroyEntity(entity: Entity): void {
    if (!this.alive.delete(entity)) return;
    for (const store of this.stores.values()) {
      store.remove(entity);
    }
  }

  get entityCount(): number {
    return this.alive.size;
  }

  /** Get (or lazily create) the component store registered under `key`. */
  store<T>(key: string): ComponentStore<T> {
    let store = this.stores.get(key);
    if (!store) {
      store = new ComponentStore<unknown>();
      this.stores.set(key, store);
    }
    return store as ComponentStore<T>;
  }
}
