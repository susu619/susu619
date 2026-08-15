# Architecture

## Runtime topology

```text
Client UI / Input / Renderer
        │
        ├── HTTP ──> Gateway API ──> SQLite
        │
        └── WS ────> Realtime Server
                         │
                         └── 60Hz RoomClock
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

## Shared room
Target room capacity is seven players. Shared registries are authoritative for interaction-relevant state, while compatibility adapters remain measured technical debt until migration evidence is sufficient.

## Rendering
- Canvas2D baseline with WebGL2 compatibility/fallback layer.
- UI/HUD updates are separated from 60FPS simulation.
- Mobile DPR and compositor behavior are explicit performance budgets.

## Deployment
A/B slots are mandatory: candidate -> trial -> real-device acceptance -> promote, with rollback preserved until explicit promotion.
