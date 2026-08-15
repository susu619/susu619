const CACHE = 'super-mario-suyi-control-ui-3.8.0-1';
const VERSION = '3.8.0-world-rebuild-1';
const q = (path) => `${path}?v=${VERSION}`;
const STATIC = [
  '/', q('/styles.css'), q('/src/bootstrap.mjs'), q('/src/main.mjs'), q('/src/atlas.mjs'), q('/src/renderer.mjs'), q('/src/fixed-loop.mjs'),
  q('/src/input.mjs'), q('/src/map-runtime.mjs'), q('/src/core-render-pipeline.mjs'), q('/src/render-extension-host.mjs'), q('/src/latency-probe-worker.mjs'), q('/src/camera-follow.mjs'), q('/src/remote-avatar-interpolator.mjs'), q('/src/party-physics-predictor.mjs'), q('/src/mobile-shell.mjs'), q('/src/browser-compat.mjs'), q('/src/ui-settings.mjs'), q('/src/audio.mjs'), q('/src/network.mjs'), q('/src/game-view.mjs'),
  q('/manifest.webmanifest'), q('/assets/mario.theme.json'), q('/assets/first-level.json'),
  q('/assets/characters/characters.json'), q('/assets/characters/action-profiles.json'), q('/assets/characters/animation-profiles.json'), q('/assets/characters/previews/mario.png'), q('/assets/characters/previews/luigi.png'), q('/assets/characters/previews/peach.png'), q('/assets/characters/previews/doraemon.png'), q('/assets/characters/previews/ribbon.png'),
  q('/engine/sim-core.mjs'), '/engine/enemy-ai.mjs', '/engine/enemy-state.mjs',
  '/engine/kernel/constants.mjs', '/engine/kernel/math.mjs', '/engine/kernel/deterministic-rng.mjs', '/engine/kernel/command-buffer.mjs', '/engine/kernel/core-profile.mjs', '/engine/kernel/feature-host.mjs',
  '/engine/characters/action-state-machine.mjs', '/engine/characters/action-feature-adapter.mjs', '/engine/characters/combat-hitbox-runtime.mjs',
  q('/animation/index.mjs'), '/animation/clip-runtime.mjs', '/animation/visual-state-resolver.mjs', '/animation/frame-event-track.mjs', '/animation/attachment-runtime.mjs', '/animation/animation-controller.mjs',
  '/engine/world/world-graph.mjs', '/engine/world/area-state.mjs', '/engine/world/transition-system.mjs', '/engine/world/dynamic-world.mjs', '/engine/world/persistent-world-state.mjs', '/engine/world/life-randomizer.mjs',
  '/engine/expansion/gameplay-expansion.mjs', '/engine/mounts/mount-system.mjs', '/engine/domains/ice-domain.mjs', '/engine/actors/enemies/original-enemy-runtime.mjs',
  '/engine/echo/echo-system.mjs', '/engine/objectives/objective-system.mjs', '/engine/coop/revive-system.mjs', '/engine/ghost/ghost-challenge.mjs',
  '/engine/network/snapshot-schema.mjs', '/engine/network/reconciliation.mjs', q('/engine/net-protocol.mjs')
];
self.addEventListener('install', (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(STATIC)).then(() => self.skipWaiting())));
self.addEventListener('activate', (event) => event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== location.origin || /^\/(api|ws|health|metrics|internal)\b/.test(url.pathname)) return;
  if (/^\/assets\/mario-atlas\.(?:png|json)$/.test(url.pathname)) {
    event.respondWith(fetch(new Request(request, { cache: 'no-store' })));
    return;
  }
  const runtimeCacheKey = new Request(`${url.origin}${request.mode === 'navigate' ? '/' : url.pathname}`);
  const resolved = (async () => {
    const exact = await caches.match(request);
    if (exact) return { response:exact, cacheCopy:null };
    const normalized = await caches.match(runtimeCacheKey);
    if (normalized) return { response:normalized, cacheCopy:null };
    const response = await fetch(request);
    const cacheCopy = response.ok && response.type === 'basic' ? response.clone() : null;
    return { response, cacheCopy };
  });
  const responsePromise = resolved();
  event.respondWith(responsePromise.then(({ response }) => response).catch(async () => {
    if (request.mode === 'navigate') return caches.match('/');
    return Response.error();
  }));
  event.waitUntil(responsePromise.then(async ({ cacheCopy }) => {
    if (!cacheCopy) return;
    const cache = await caches.open(CACHE);
    await cache.put(runtimeCacheKey, cacheCopy);
  }).catch(() => {}));
});
