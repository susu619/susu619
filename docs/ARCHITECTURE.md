# Architecture

## Runtime topology

```text
Client UI / Input / Renderer
        │
        ├── HTTP ──> Gateway API ──> SQLite
        │
        └── WS ────> Realtime Server
                         │
                         └── Fixed-step RoomClock
                                ├── Sim Core
                                ├── Shared Player Registry
                                ├── Shared Enemy Registry
                                ├── Dynamic World
                                └── Snapshot / Event Stream
```

## Deterministic simulation
- Fixed-point gameplay coordinates where deterministic state requires it.
- Seeded RNG for gameplay state.
- State hash coverage for players, enemies, moving platforms, mounts and world state.
- Replay and snapshot compatibility gates.

## Networking
- Server authoritative gameplay.
- Lightweight avatar motion stream plus slower world snapshots.
- Local-only reconciliation; the client never rewinds/replays the whole world for one player correction.
- Bounded pending-input replay.
- Worker-based RTT health probe separated from browser-main-thread scheduling delay.

## Room capacity model
There is **no universal engine-wide player-count constant presented as the architectural limit**. Room capacity is a deployment policy that must be selected from measured performance on the target hardware and network profile.

Capacity is affected by at least:
- single-core CPU performance and worst-case simulation time per tick;
- core count, worker/thread model and how multiple rooms are scheduled across cores;
- number and complexity of players, enemies, projectiles, moving platforms and collision pairs;
- memory availability, allocation rate and garbage-collection pressure;
- uplink/downlink bandwidth, RTT, jitter, packet loss and WebSocket buffering;
- avatar send rate, snapshot rate, snapshot size and delta-compression strategy;
- number of simultaneous rooms and other services sharing the same host.

A deployment may intentionally configure a conservative room cap to protect latency and tick deadlines. Such a value is a **profile-specific guardrail**, not a permanent limitation of the engine. Any higher-capacity profile must be validated with repeatable load, latency and simulation-budget tests before being advertised as supported.

Shared registries remain authoritative for interaction-relevant state, while compatibility adapters are treated as measured technical debt until migration evidence is sufficient.

## Rendering
- Canvas2D baseline with WebGL2 compatibility/fallback layer.
- UI/HUD updates are separated from 60FPS simulation.
- Mobile DPR and compositor behavior are explicit performance budgets.

## Deployment
A/B slots are mandatory: candidate -> trial -> real-device acceptance -> promote, with rollback preserved until explicit promotion.
