# Mario Web Multiplayer Port

This branch ports `ByteTuxiaobei/Mario` to the browser while keeping the upstream C++ source isolated and unmodified.

## Repository layout

- `upstream/ByteTuxiaobei-Mario/` — an exact snapshot of upstream commit `20eff8077f05690ebca00af42a906b82b37dde22`.
- `web/` — browser client, Canvas renderer, input adapter and network interpolation.
- `server/` — authoritative WebSocket room server.
- `tools/import-upstream.sh` — reproducible upstream import and asset-manifest generator.

## Run locally

```bash
npm install
npm run dev
```

Open the Vite URL shown in the terminal. The WebSocket server listens on `0.0.0.0:8080` by default.

## Build

```bash
npm run build
npm test
```

## Design boundary

The upstream physics, entity, level and asset data are retained as the reference implementation. Browser/platform concerns are implemented outside that tree. The multiplayer server is authoritative: clients send input frames and receive room snapshots rather than directly publishing coordinates.

## Licensing

The upstream project is GPL-3.0. This derivative port is distributed under GPL-3.0 as well. Nintendo-related names and assets contained in the upstream repository remain subject to their respective rights holders; this repository does not grant additional rights to those assets.
