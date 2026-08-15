import { PacketType, decodePacket, encodeInputPacket, encodeJsonPacket, encodePingPacket } from '/engine/net-protocol.mjs?v=3.8.0-world-rebuild-1';

export class ApiClient {
  constructor() {
    this.session = null;
    this.version = null;
  }
  async request(path, options = {}) {
    const { timeoutMs = 12000, signal: callerSignal, ...requestOptions } = options;
    const headers = new Headers(requestOptions.headers ?? {});
    if (requestOptions.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
    if (this.session?.token) headers.set('authorization', `Bearer ${this.session.token}`);
    const controller = new AbortController();
    const abortFromCaller = () => controller.abort(callerSignal?.reason);
    if (callerSignal?.aborted) abortFromCaller();
    else callerSignal?.addEventListener?.('abort', abortFromCaller, { once:true });
    const requestedTimeout = Number(timeoutMs);
    const effectiveTimeout = Number.isFinite(requestedTimeout) ? Math.min(120000, Math.max(1000, requestedTimeout)) : 12000;
    const timeout = setTimeout(() => controller.abort(new DOMException('Request timed out', 'TimeoutError')), effectiveTimeout);
    try {
      const response = await fetch(path, { ...requestOptions, headers, signal:controller.signal });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
      return body;
    } catch (error) {
      if (controller.signal.aborted && !callerSignal?.aborted) throw new Error('请求超时，请检查网络后重试', { cause:error });
      throw error;
    } finally {
      clearTimeout(timeout);
      callerSignal?.removeEventListener?.('abort', abortFromCaller);
    }
  }
  async bootstrap(displayName) {
    this.version = await this.request('/api/version');
    const saved = sessionStorage.getItem('webgame.session');
    if (saved) {
      try { this.session = JSON.parse(saved); } catch { sessionStorage.removeItem('webgame.session'); }
    }
    const expiresAtMs = Date.parse(String(this.session?.expiresAt ?? ''));
    const storedSessionValid = Boolean(this.session?.token) && Number.isFinite(expiresAtMs) && expiresAtMs > Date.now();
    if (!storedSessionValid) {
      this.session = await this.request('/api/session/guest', {
        method: 'POST',
        body: JSON.stringify({ displayName, clientVersion: this.version.engineVersion })
      });
      sessionStorage.setItem('webgame.session', JSON.stringify(this.session));
    }
    return { version: this.version, session: this.session };
  }
  async updateProfile(displayName) {
    const result = await this.request('/api/profile', { method: 'PUT', body: JSON.stringify({ displayName }) });
    if (this.session) { this.session.displayName = result.displayName; sessionStorage.setItem('webgame.session', JSON.stringify(this.session)); }
    return result;
  }
  async joinPublicRoom({ loadout = [], skin = 'mario', seed = null, ghostId = null } = {}) {
    return this.request('/api/public-room/join', { method: 'POST', body: JSON.stringify({ loadout, skin, seed, ghostId }) });
  }
  async createRoom({ loadout = [], skin = 'mario', seed = null, ghostId = null } = {}) {
    return this.request('/api/rooms', { method: 'POST', body: JSON.stringify({ levelId: 'smb1-overworld-01', loadout, skin, seed, ghostId }) });
  }
  async joinRoom(roomId, { loadout = [], skin = 'mario', seed = null, ghostId = null } = {}) {
    return this.request(`/api/rooms/${encodeURIComponent(roomId)}/join`, { method: 'POST', body: JSON.stringify({ loadout, skin, seed, ghostId }) });
  }
  async daily() { return this.request('/api/daily'); }
  async getGhost(id) { return this.request(`/api/ghosts/${encodeURIComponent(id)}`); }
  async saveGhost(payload) { return this.request('/api/ghosts', { method: 'POST', body: JSON.stringify(payload) }); }
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export class RealtimeClient {
  constructor({ api, onHello, onSnapshot, onPartyState, onControlEvent, onStatus, onLatency, onError }) {
    this.api = api;
    this.onHello = onHello;
    this.onSnapshot = onSnapshot;
    this.onPartyState = onPartyState;
    this.onControlEvent = onControlEvent;
    this.onStatus = onStatus;
    this.onLatency = onLatency;
    this.onError = onError;
    this.socket = null;
    this.roomId = null;
    this.roomKey = 0;
    this.playerId = null;
    this.sequence = 0;
    this.closedByUser = false;
    this.reconnectTimer = null;
    this.connecting = false;
    this.pingTimer = null;
    this.pingSequence = 0;
    this.lastRttMs = null;
    this.smoothedRttMs = null;
    this.jitterMs = 0;
    this.latencySamples = [];
    this.networkProbeSamples = [];
    this.networkRttMs = null;
    this.networkJitterMs = 0;
    this.probeWorker = null;
    this.latencyMinSamples = 5;
    this.pendingPings = new Map();
    this.lastLongTaskAt = Number.NEGATIVE_INFINITY;
    this.reconnectAttempts = 0;
    this.longTaskObserver = null;
    try {
      if (typeof PerformanceObserver === 'function') {
        this.longTaskObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) this.lastLongTaskAt = Math.max(this.lastLongTaskAt, entry.startTime + entry.duration);
        });
        this.longTaskObserver.observe({ type: 'longtask', buffered: true });
      }
    } catch {}
    this.visibilityHandler = () => {
      this.resetLatencySamples();
      if (globalThis.document?.hidden) this.stopLatencyProbe();
      else if (this.socket?.readyState === WebSocket.OPEN) this.startLatencyProbe();
    };
    globalThis.document?.addEventListener?.('visibilitychange', this.visibilityHandler, { passive: true });
  }

  async enter(roomId = null, options = {}) {
    this.enterOptions = { ...options, loadout: Array.isArray(options.loadout) ? [...options.loadout] : [] }; // avoid structuredClone dependency on older Android WebView
    const result = roomId ? await this.api.joinRoom(roomId, options) : await this.api.joinPublicRoom(options);
    this.roomId = result.room.id;
    await this.connect(result.realtimeToken);
    return result.room;
  }

  websocketUrl(token) {
    const configured = this.api.version.realtimeUrl;
    if (configured) return `${configured}${configured.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
    const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${scheme}//${location.host}${this.api.version.realtimePath}?token=${encodeURIComponent(token)}`;
  }

  connect(token) {
    if (this.connecting) return Promise.reject(new Error('连接正在建立'));
    this.connecting = true;
    this.closedByUser = false;
    this.onStatus?.('connecting');
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(this.websocketUrl(token));
      socket.binaryType = 'arraybuffer';
      this.socket = socket;
      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          this.connecting = false;
          socket.close();
          reject(new Error('实时连接超时'));
        }
      }, 8000);
      socket.addEventListener('open', () => this.onStatus?.('socket-open'));
      socket.addEventListener('message', (event) => {
        try {
          const packet = decodePacket(event.data);
          if (packet.type === PacketType.HELLO) {
            this.roomKey = packet.json.roomKey;
            this.playerId = packet.json.playerId;
            this.sequence = 0;
            this.resetLatencySamples();
            this.onHello?.(packet.json);
            if (!resolved) {
              resolved = true;
              clearTimeout(timeout);
              this.connecting = false;
              this.reconnectAttempts = 0;
              this.onStatus?.('connected');
              this.startLatencyProbe();
              resolve(packet.json);
            }
          } else if (packet.type === PacketType.SNAPSHOT) {
            this.onSnapshot?.(packet.json);
          } else if (packet.type === PacketType.EVENT && packet.json?.type === 'party.state') {
            const partyEchoes = Array.isArray(packet.json.partyEchoes)
              ? packet.json.partyEchoes.map((row) => Array.isArray(row) ? ({
                  playerId: row[0], displayName: row[1], skin: row[2], areaId: row[3],
                  x: row[4], y: row[5], vx: row[6], vy: row[7], power: row[8],
                  facing: row[9], state: row[10], animationTick: row[11], w: row[12], h: row[13],
                  mount: row[14] ?? null, standingOnPlayerId: row[15] ?? null,
                  stackDepth: Number(row[16] ?? 0), partyHeadJumpTick: Number(row[17] ?? 0),
                  partyBodyContactTick: Number(row[18] ?? 0), dimension: Number(row[19] ?? 0),
                  gravityAxis: row[20] ?? 'y', gravityDir: Number(row[21] ?? 1), climbing: Boolean(row[22]),
                  vehicleId: row[23] ?? null, vehicleSeatId: row[24] ?? null, vehicleRole: row[25] ?? null,
                  actionState: Array.isArray(row[26]) ? { profileId:row[26][0] ?? 'character.compat.default', state:row[26][1] ?? 'idle', slot:row[26][2] ?? null, phase:row[26][3] ?? 'idle', elapsedTicks:Number(row[26][4] ?? 0), sequence:Number(row[26][5] ?? 0), actionId:row[26][6] ?? null } : null,
                  actionProfileId: Array.isArray(row[26]) ? (row[26][0] ?? 'character.compat.default') : 'character.compat.default',
                  iceDomainActive: Boolean(row[27]), iceDomainStartedTick: Number(row[28] ?? 0), iceDomainSerial: Number(row[29] ?? 0), connected: true
                }) : row)
              : [];
            this.onPartyState?.({ ...packet.json, partyEchoes });
          } else if (packet.type === PacketType.EVENT) {
            this.onControlEvent?.(packet.json ?? {});
          } else if (packet.type === PacketType.PONG) {
            this.handlePong(packet.timestamp);
          } else if (packet.type === PacketType.ERROR) {
            this.onError?.(new Error(packet.json?.error ?? '实时服务错误'));
          }
        } catch (error) {
          this.onError?.(error);
        }
      });
      socket.addEventListener('error', () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          this.connecting = false;
          reject(new Error('实时连接失败'));
        }
      });
      socket.addEventListener('close', () => {
        clearTimeout(timeout);
        this.stopLatencyProbe();
        this.connecting = false;
        this.onStatus?.('disconnected');
        if (!resolved) { resolved = true; reject(new Error('实时连接在握手前关闭')); }
        if (!this.closedByUser) this.scheduleReconnect();
      });
    });
  }

  resetLatencySamples() {
    this.lastRttMs = null;
    this.smoothedRttMs = null;
    this.jitterMs = 0;
    this.latencySamples.length = 0;
    this.networkProbeSamples.length = 0;
    this.networkRttMs = null;
    this.networkJitterMs = 0;
    this.latencyMinSamples = 5;
    this.pendingPings.clear();
    this.onLatency?.(null);
  }

  emitLatency() {
    const appRttMs = Number.isFinite(this.smoothedRttMs) ? this.smoothedRttMs : null;
    const networkRttMs = Number.isFinite(this.networkRttMs) ? this.networkRttMs : null;
    if (appRttMs == null && networkRttMs == null) return;
    const clientSchedulingMs = appRttMs != null && networkRttMs != null ? Math.max(0, appRttMs - networkRttMs) : null;
    this.onLatency?.({
      rttMs: this.lastRttMs,
      smoothedRttMs: appRttMs,
      appRttMs,
      networkRttMs,
      jitterMs: networkRttMs != null ? this.networkJitterMs : this.jitterMs,
      appJitterMs: this.jitterMs,
      networkJitterMs: this.networkJitterMs,
      clientSchedulingMs,
      sampleCount: this.latencySamples.length,
      networkSampleCount: this.networkProbeSamples.length,
      method: networkRttMs != null ? 'worker-realtime-health+ws-response' : 'ws-response-fallback'
    });
  }

  startNetworkProbe() {
    if (typeof Worker !== 'function' || globalThis.document?.hidden) return;
    try {
      if (!this.probeWorker) {
        this.probeWorker = new Worker(new URL('./latency-probe-worker.mjs?v=3.8.0-world-rebuild-1', import.meta.url), { type: 'module' });
        this.probeWorker.addEventListener('message', (event) => {
          const message = event.data ?? {};
          if (message.type !== 'probe' || !message.ok) return;
          const rtt = Number(message.rttMs);
          if (!Number.isFinite(rtt) || rtt < 0 || rtt > 5000) return;
          this.networkProbeSamples.push(rtt);
          if (this.networkProbeSamples.length > 7) this.networkProbeSamples.shift();
          if (this.networkProbeSamples.length < 3) return;
          const stable = median(this.networkProbeSamples);
          const deviations = this.networkProbeSamples.map((sample) => Math.abs(sample - stable));
          this.networkRttMs = Math.round(stable);
          this.networkJitterMs = Math.round(median(deviations));
          this.emitLatency();
        });
      }
      this.probeWorker.postMessage({ type: 'start', endpoint: '/health/realtime', intervalMs: 1500 });
    } catch {
      this.probeWorker?.terminate?.();
      this.probeWorker = null;
    }
  }

  stopNetworkProbe() {
    try { this.probeWorker?.postMessage?.({ type: 'stop' }); } catch {}
  }

  startLatencyProbe() {
    this.stopLatencyProbe();
    this.startNetworkProbe();
    const send = () => {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
      const timestamp = Date.now();
      const monotonic = globalThis.performance?.now?.() ?? timestamp;
      this.pingSequence += 1;
      this.pendingPings.set(timestamp, {
        monotonic,
        hidden: Boolean(globalThis.document?.hidden),
        longTaskMark: this.lastLongTaskAt
      });
      while (this.pendingPings.size > 8) this.pendingPings.delete(this.pendingPings.keys().next().value);
      this.socket.send(encodePingPacket({ room: this.roomKey, sequence: this.pingSequence, timestamp }));
    };
    send();
    this.pingTimer = setInterval(send, globalThis.document?.hidden ? 5000 : 1500);
  }

  stopLatencyProbe() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
    this.pendingPings.clear();
    this.stopNetworkProbe();
  }

  handlePong(timestamp) {
    const key = Number(timestamp);
    const pending = this.pendingPings.get(key);
    this.pendingPings.delete(key);
    if (!pending) return;
    const now = globalThis.performance?.now?.() ?? Date.now();
    const rtt = Math.max(0, now - pending.monotonic);
    const longTaskContaminated = this.lastLongTaskAt > pending.monotonic && this.lastLongTaskAt <= now + 1;
    if (!Number.isFinite(rtt) || rtt > 5000 || pending.hidden || globalThis.document?.hidden || longTaskContaminated) return;
    this.latencySamples.push(rtt);
    if (this.latencySamples.length > 9) this.latencySamples.shift();
    if (this.latencySamples.length < this.latencyMinSamples) return;
    const smoothed = median(this.latencySamples);
    const deviations = this.latencySamples.map((sample) => Math.abs(sample - smoothed));
    const jitter = median(deviations);
    this.lastRttMs = rtt;
    this.smoothedRttMs = Math.round(smoothed);
    this.jitterMs = Math.round(jitter);
    this.emitLatency();
  }

  sendDisplayName(displayName) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    this.pingSequence += 1;
    this.socket.send(encodeJsonPacket(PacketType.EVENT, { type: 'profile.displayName', displayName }, { room: this.roomKey, sequence: this.pingSequence }));
    return true;
  }

  sendSkin(skin) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    this.pingSequence += 1;
    this.socket.send(encodeJsonPacket(PacketType.EVENT, { type: 'profile.skin', skin }, { room: this.roomKey, sequence: this.pingSequence }));
    if (this.enterOptions) this.enterOptions.skin = skin;
    return true;
  }

  sendShopPurchase(itemId) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    this.pingSequence += 1;
    this.socket.send(encodeJsonPacket(PacketType.EVENT, { type: 'shop.purchase', itemId }, { room: this.roomKey, sequence: this.pingSequence }));
    return true;
  }

  sendCharacterAction(action) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    const request = String(action ?? '').trim();
    if (!request || request.length > 32) return false;
    this.pingSequence += 1;
    this.socket.send(encodeJsonPacket(PacketType.EVENT, { type:'character.action', action:request }, { room:this.roomKey, sequence:this.pingSequence }));
    return true;
  }

  sendDeveloperActivation(code) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    this.pingSequence += 1;
    this.socket.send(encodeJsonPacket(PacketType.EVENT, { type:'developer.activate', code:String(code ?? '') }, { room:this.roomKey, sequence:this.pingSequence }));
    return true;
  }

  sendDeveloperCommand(action, args = {}) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    this.pingSequence += 1;
    this.socket.send(encodeJsonPacket(PacketType.EVENT, { type:'developer.command', action:String(action ?? ''), args:args && typeof args === 'object' ? args : {} }, { room:this.roomKey, sequence:this.pingSequence }));
    return true;
  }

  sendInput(tick, inputMask) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return null;
    this.sequence += 1;
    const packet = encodeInputPacket({ room: this.roomKey, tick, sequence: this.sequence, inputMask });
    this.socket.send(packet);
    return this.sequence;
  }

  scheduleReconnect() {
    if (this.reconnectTimer || !this.roomId) return;
    this.onStatus?.('reconnecting');
    this.reconnectAttempts += 1;
    const baseDelay = Math.min(8000, 700 * (2 ** Math.min(this.reconnectAttempts - 1, 4)));
    const delay = Math.round(baseDelay * (0.82 + Math.random() * 0.36));
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        const result = await this.api.joinRoom(this.roomId, this.enterOptions ?? {});
        await this.connect(result.realtimeToken);
      } catch (error) {
        this.onError?.(error);
        this.scheduleReconnect();
      }
    }, delay);
  }

  close() {
    this.closedByUser = true;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.stopLatencyProbe();
    this.longTaskObserver?.disconnect?.();
    this.probeWorker?.terminate?.();
    this.probeWorker = null;
    globalThis.document?.removeEventListener?.('visibilitychange', this.visibilityHandler);
    this.socket?.close(1000, 'client close');
  }
}
