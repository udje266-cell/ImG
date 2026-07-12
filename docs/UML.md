# ImG — Diagrammes UML

> Diagrammes en [Mermaid](https://mermaid.js.org/) — rendus nativement par GitHub.

## 1. Diagramme de composants (couches et dépendances)

Les flèches indiquent le **seul** sens de dépendance autorisé (vérifié par test d'architecture).

```mermaid
flowchart TD
    subgraph app["app (composition root)"]
        MAIN[main.ts]
        LOOP[GameLoop]
    end
    subgraph ui["ui"]
        HUD[Hud]
        INPUT[InputController]
    end
    subgraph render["render"]
        CAM[Camera2D]
        TR[TerrainRenderer]
        DNO[DayNightOverlay]
    end
    subgraph sim["sim (logique métier pure)"]
        SIMROOT[Simulation]
        WG[WorldGenerator]
        TG[TerrainGrid]
        PW[PowerSystem + FaithSystem]
        FUT["weather / ecology / agents /<br/>economy / religion / tech / diplomacy<br/>(phases 2+)"]
    end
    subgraph core["core (noyau générique)"]
        BUS[EventBus]
        ECS[World ECS]
        RNG[Rng]
        NOISE[Noise fBm]
        CLOCK[GameClock]
    end

    MAIN --> LOOP
    LOOP --> ui
    LOOP --> render
    ui --> render
    ui -. "intents via EventBus" .-> BUS
    render --> sim
    sim --> core
    PW --> TG
    WG --> TG
    SIMROOT --> WG & TG & PW
```

## 2. Diagramme de classes — noyau et MVP

```mermaid
classDiagram
    direction LR

    class EventBus~EventMap~ {
        +on(name, handler) unsubscribe
        +emit(name, payload) void
        +queue(name, payload) void
        +drain() void
    }

    class Rng {
        -state: number
        +constructor(seed)
        +next() number
        +float() number
        +int(min, max) number
        +fork(streamName) Rng
    }

    class GameClock {
        +tick: number
        +timeOfDay: number
        +season: Season
        +year: number
        +advance(bus) void
    }

    class World {
        -nextEntity: number
        +createEntity() Entity
        +destroyEntity(e) void
        +store~T~(key) ComponentStore~T~
    }

    class ComponentStore~T~ {
        +set(e, value) void
        +get(e) T
        +remove(e) void
        +entities() iterator
    }

    class Simulation {
        +clock: GameClock
        +terrain: TerrainGrid
        +faith: FaithSystem
        +powers: PowerSystem
        +world: World
        +bus: EventBus
        +step() void
    }

    class TerrainGrid {
        +width, height: number
        +seaLevel: number
        -heightMap: Float32Array
        -temperature: Float32Array
        -moisture: Float32Array
        -biomes: Uint8Array
        +heightAt(x,y) number
        +biomeAt(x,y) Biome
        +modifyHeight(x,y,delta) void
        +consumeDirtyChunks() ChunkId[]
    }

    class WorldGenerator {
        +generate(config) TerrainGrid
    }

    class FaithSystem {
        +current: number
        +max: number
        +trySpend(amount) boolean
        +update() void
    }

    class Power {
        <<interface>>
        +id: PowerId
        +cost(params) number
        +apply(sim, params) void
    }

    class PowerSystem {
        -registry: Map~PowerId, Power~
        +invoke(sim, id, params) void
    }

    class TerraformPower {
        +id = "terraform"
        +cost(sim, params) number
        +apply(sim, params) void
    }

    class FlattenPower {
        +id = "flatten"
        +cost(sim, params) number
        +apply(sim, params) void
    }

    class ProgressionSystem {
        +devotion: number
        +isUnlocked(power) boolean
        +addDevotion(amount) void
        +restoreDevotion(value) void
    }

    Simulation *-- GameClock
    Simulation *-- TerrainGrid
    Simulation *-- FaithSystem
    Simulation *-- PowerSystem
    Simulation *-- World
    Simulation o-- EventBus
    World *-- ComponentStore
    WorldGenerator ..> TerrainGrid : crée
    WorldGenerator ..> Rng : utilise
    PowerSystem o-- Power
    Power <|.. TerraformPower
    Power <|.. FlattenPower
    TerraformPower ..> TerrainGrid : modifie
    FlattenPower ..> TerrainGrid : modifie
    PowerSystem ..> FaithSystem : débite
    PowerSystem ..> ProgressionSystem : vérifie déblocage
    ProgressionSystem ..> EventBus : écoute power_invoked
    Simulation *-- ProgressionSystem
```

## 3. Diagramme de séquence — un tick de simulation

```mermaid
sequenceDiagram
    participant RAF as requestAnimationFrame
    participant Loop as GameLoop (app)
    participant Sim as Simulation (sim)
    participant Bus as EventBus (core)
    participant Rend as Renderer (render)

    RAF->>Loop: frame(now)
    Loop->>Loop: accumulator += elapsed × speed
    loop tant que accumulator ≥ SIM_DT
        Loop->>Sim: step()
        Sim->>Sim: clock.advance() → time:dayStarted ?
        Sim->>Sim: powers (intents en attente)
        Sim->>Sim: faith.update()
        Sim->>Sim: systèmes futurs (météo, écologie, agents…)
        Sim->>Bus: drain() (événements différés)
    end
    Loop->>Rend: render(interpolation)
    Rend->>Sim: lecture seule (terrain, clock, faith)
    Rend->>Rend: redessine uniquement les chunks dirty
```

## 4. Diagramme de séquence — invocation d'un pouvoir divin

```mermaid
sequenceDiagram
    participant User as Joueur
    participant Input as InputController (ui)
    participant Bus as EventBus
    participant PS as PowerSystem (sim)
    participant FS as FaithSystem (sim)
    participant TG as TerrainGrid (sim)
    participant TR as TerrainRenderer (render)

    User->>Input: clic maintenu sur la carte
    Input->>Bus: queue("intent:invokePower", {id:"terraform", x, y, ...})
    Note over Bus,PS: au tick suivant
    Bus->>PS: intent:invokePower
    PS->>FS: trySpend(cost)
    alt Foi suffisante
        FS-->>PS: true
        PS->>TG: apply → modifyHeight(...) × N
        TG->>Bus: emit("terrain:modified", {chunkIds})
        PS->>Bus: emit("power:invoked", {...})
    else Foi insuffisante
        FS-->>PS: false
        PS->>Bus: emit("power:rejected", {reason:"insufficient-faith"})
    end
    Note over TR: à la frame suivante
    TR->>TG: consumeDirtyChunks()
    TR->>TR: re-rend uniquement ces chunks
```

## 5. Diagramme d'états — agent habitant (phase 4, cadrage)

```mermaid
stateDiagram-v2
    [*] --> Idle
    Idle --> ChooseGoal: tick de décision (Utility AI)
    ChooseGoal --> Satisfy: besoin dominant (faim, soif…)
    ChooseGoal --> Work: profession (récolter, bâtir…)
    ChooseGoal --> Social: socialiser / prier
    ChooseGoal --> Flee: danger perçu
    Satisfy --> Idle: besoin comblé
    Work --> Idle: tâche finie / interrompue
    Social --> Idle
    Flee --> Idle: sécurité retrouvée
    Idle --> Dead: besoins vitaux à zéro / violence
    Dead --> [*]
```
