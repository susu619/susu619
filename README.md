# Mario Web Multiplayer Port

This branch ports `ByteTuxiaobei/Mario` to the browser while keeping the upstream C++ source isolated and unmodified.

## Current status

Implemented in this branch:

- responsive Canvas browser client;
- keyboard and mobile touch controls;
- fullscreen and landscape entry;
- authoritative WebSocket rooms for up to four players;
- fixed-step server simulation, sequenced input and interpolated snapshots;
- server tests and production browser build configuration;
- reproducible importer pinned to upstream commit `20eff8077f05690ebca00af42a906b82b37dde22`.

Pending:

- execution of `tools/import-upstream.sh` to materialize the full C++ source and binary assets under `upstream/` and `web/public/upstream/`;
- EGE-to-browser rendering/audio compatibility or an equivalent WebAssembly bridge for full gameplay parity.

The repository's GitHub-hosted Actions jobs currently fail before any step is assigned to a runner. Therefore the importer and validation workflow have not executed on GitHub; the PR remains a draft.

## Repository layout

- `upstream/ByteTuxiaobei-Mario/` — generated exact snapshot of the pinned upstream commit after running the importer.
- `web/` — browser client, Canvas renderer, input adapter and network interpolation.
- `server/` — authoritative WebSocket room server.
- `tools/import-upstream.sh` — reproducible upstream import and asset-manifest generator.

## Import, run and build locally

```bash
bash tools/import-upstream.sh
npm install
npm test
npm run dev
```

Open the Vite URL shown in the terminal. The WebSocket server listens on `0.0.0.0:8080` by default.

For a production browser build:

```bash
npm run build
```

## Design boundary

The upstream physics, entity, level and asset data remain the reference implementation and are never edited in place. Browser/platform concerns live outside the imported tree. The multiplayer server is authoritative: clients send input frames and receive room snapshots rather than directly publishing coordinates.

## Licensing

The upstream project is GPL-3.0. This derivative port is distributed under GPL-3.0 as well. Nintendo-related names and assets contained in the upstream repository remain subject to their respective rights holders; this repository does not grant additional rights to those assets.
