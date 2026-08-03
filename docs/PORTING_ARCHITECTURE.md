# Porting architecture

## Upstream constraints

The pinned upstream is a C++14 desktop game built around EGE. Its `main.cpp` owns a manual 120 FPS loop, while `Level::update()` advances game state from elapsed time and `Collider::calc()` performs acceleration, friction, gravity, collision reporting and camera following.

The port must preserve those gameplay calculations rather than replacing them with unrelated browser physics.

## Source preservation rule

1. Import the pinned upstream repository verbatim into `upstream/ByteTuxiaobei-Mario/`.
2. Never patch files in that directory.
3. Generate a disposable build mirror under `.tmp/wasm-src/`.
4. Apply platform substitutions only to the generated mirror.
5. Keep every generated substitution documented and deterministic.

This keeps upstream gameplay code auditable while allowing the Windows/EGE surface to be replaced.

## Browser runtime boundary

The WebAssembly module should expose a small C ABI:

```c
int mario_init(const char* asset_manifest_json);
int mario_load_level(const char* level_text);
void mario_set_player_input(int player_id, unsigned input_bits, unsigned sequence);
void mario_step(double fixed_delta_seconds);
int mario_write_snapshot(char* destination, int capacity);
void mario_shutdown(void);
```

The browser owns:

- Canvas and DOM rendering;
- image decoding and sprite-sheet uploads;
- Web Audio playback;
- keyboard, gamepad and touch input;
- fullscreen, orientation and lifecycle events;
- WebSocket transport.

The C++/Wasm core owns:

- level parsing;
- collider layers and collision reports;
- entity state transitions;
- item, enemy and player mechanics;
- score, timer and finish/death state;
- deterministic room simulation.

## EGE compatibility surface

The generated build mirror replaces EGE-dependent calls with an adapter that records render and audio commands rather than drawing directly:

- `initgraph`, `is_run`, `delay_fps` become browser lifecycle hooks;
- `getimage`, `putimage_withalpha`, `zoomImage`, `mirror_image` become asset/sprite commands;
- text and primitive drawing become Canvas command records;
- music operations become Web Audio events;
- keyboard polling is replaced by input bitfields supplied through the exported ABI.

No gameplay class should know whether its renderer is EGE or Canvas.

## Multiplayer model

Each room runs one authoritative simulation. Clients send only sequenced input frames. The room publishes snapshots at 20 Hz while stepping the core at 60 Hz. The browser interpolates remote players and may predict only its local player; server acknowledgements reconcile predicted input.

State-changing interactions such as damage, item collection, enemy kills, question-block activation, shell kicks, level completion and respawn are decided by the authoritative core.

## Delivery sequence

1. Materialize the exact upstream source and assets.
2. Build an EGE compatibility command recorder.
3. Compile the unchanged collider and level code into WebAssembly.
4. Add entity classes incrementally until native and browser snapshots match.
5. Move the same core module into the Node server through a Wasm runtime.
6. Add client prediction, reconciliation, late-join snapshots and reconnection.
7. Validate levels, timing, collision outcomes and item/enemy state against the native reference.
