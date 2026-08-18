let timer = null;
let generation = 0;

function stop() {
  generation += 1;
  if (timer !== null) clearTimeout(timer);
  timer = null;
}

function normalizeInterval(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1500;
  return Math.min(30000, Math.max(500, Math.round(parsed)));
}

function normalizeEndpoint(value) {
  const endpoint = String(value ?? '').trim();
  if (!endpoint.startsWith('/') || endpoint.startsWith('//')) return '/health/realtime';
  return endpoint;
}

async function probe(endpoint, currentGeneration) {
  const started = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'same-origin',
      signal: controller.signal
    });
    if (!response.ok || currentGeneration !== generation) return;
    const rttMs = Math.max(0, performance.now() - started);
    if (Number.isFinite(rttMs) && rttMs <= 5000) postMessage({ type: 'probe', ok: true, rttMs });
  } catch {
    // The websocket RTT remains the fallback when the health probe is unavailable.
  } finally {
    clearTimeout(timeout);
  }
}

function start(endpoint, intervalMs) {
  stop();
  const currentGeneration = generation;
  const safeEndpoint = normalizeEndpoint(endpoint);
  const safeInterval = normalizeInterval(intervalMs);
  const run = async () => {
    if (currentGeneration !== generation) return;
    await probe(safeEndpoint, currentGeneration);
    if (currentGeneration !== generation) return;
    timer = setTimeout(run, safeInterval);
  };
  run();
}

self.addEventListener('message', (event) => {
  const message = event.data ?? {};
  if (message.type === 'start') start(message.endpoint, message.intervalMs);
  else if (message.type === 'stop') stop();
});
