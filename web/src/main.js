const canvas = document.querySelector('#game');
const context = canvas.getContext('2d', { alpha: false });
const statusElement = document.querySelector('#status');
const hudElement = document.querySelector('#hud');
const lobbyElement = document.querySelector('#lobby');
const joinButton = document.querySelector('#join');
const nameInput = document.querySelector('#name');
const roomInput = document.querySelector('#room');
const serverInput = document.querySelector('#server');
const levelInput = document.querySelector('#level');
const fullscreenButton = document.querySelector('#fullscreen');

const UPSTREAM_COMMIT = '20eff8077f05690ebca00af42a906b82b37dde22';
const ASSET_ROOT = `https://raw.githubusercontent.com/ByteTuxiaobei/Mario/${UPSTREAM_COMMIT}/resources/graphics`;
const SPRITE_URLS = Object.freeze({
  mario: `${ASSET_ROOT}/mario_bros.png`,
  tiles: `${ASSET_ROOT}/tile_set.png`,
  enemies: `${ASSET_ROOT}/smb_enemies_sheet.png`,
  items: `${ASSET_ROOT}/item_objects.png`,
});

const input = { left: false, right: false, down: false, jump: false, run: false, fire: false };
const snapshots = [];
const images = new Map();
const playedEvents = new Set();
let socket = null;
let localPlayerId = null;
let inputSequence = 0;
let ping = 0;
let lastPingSent = 0;
let cameraX = 0;
let currentLevel = '1-1';
let serverProtocol = 2;
let audioContext = null;

function defaultServerUrl() {
  const secure = window.location.protocol === 'https:';
  const protocol = secure ? 'wss:' : 'ws:';
  if (window.location.port) return `${protocol}//${window.location.host}`;
  if (window.location.hostname && window.location.hostname !== 'localhost') return `${protocol}//${window.location.hostname}${secure ? '' : ':8080'}`;
  return 'ws://localhost:8080';
}

serverInput.value = defaultServerUrl();

function setStatus(text, state = '') {
  statusElement.textContent = text;
  statusElement.className = `status ${state}`.trim();
}

function resizeCanvas() {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(640, Math.round(rect.width * ratio));
  const height = Math.max(360, Math.round(rect.height * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    context.imageSmoothingEnabled = false;
  }
}

function normalizeWebSocketUrl(value) {
  const raw = String(value || '').trim();
  if (/^wss?:\/\//i.test(raw)) return raw;
  if (/^https?:\/\//i.test(raw)) return raw.replace(/^http/i, 'ws');
  return `ws://${raw}`;
}

function send(payload) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
}

function connect() {
  if (socket) socket.close();
  snapshots.length = 0;
  playedEvents.clear();
  setStatus('连接中…');
  const url = normalizeWebSocketUrl(serverInput.value);
  serverInput.value = url;
  socket = new WebSocket(url);

  socket.addEventListener('open', () => {
    send({ type: 'join', room: roomInput.value, name: nameInput.value, level: levelInput.value });
  });

  socket.addEventListener('message', (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      setStatus('服务器消息格式错误', 'error');
      return;
    }
    if (message.type === 'welcome') {
      localPlayerId = message.playerId;
      currentLevel = message.level;
      serverProtocol = message.protocol ?? 2;
      levelInput.value = message.level;
      setStatus(`房间 ${message.room} · 关卡 ${message.level}`, 'online');
      lobbyElement.classList.add('hidden');
      enterImmersiveMode();
      return;
    }
    if (message.type === 'snapshot') {
      const snapshot = { receivedAt: performance.now(), ...message };
      snapshots.push(snapshot);
      if (snapshots.length > 30) snapshots.splice(0, snapshots.length - 30);
      playSnapshotEvents(snapshot);
      return;
    }
    if (message.type === 'pong') {
      ping = Math.max(0, Date.now() - Number(message.clientTime || Date.now()));
      return;
    }
    if (message.type === 'error') setStatus(message.message, 'error');
  });

  socket.addEventListener('close', () => {
    setStatus('连接已断开', 'error');
    localPlayerId = null;
    snapshots.length = 0;
    lobbyElement.classList.remove('hidden');
  });

  socket.addEventListener('error', () => setStatus('服务器连接失败', 'error'));
}

async function enterImmersiveMode() {
  try {
    if (document.documentElement.requestFullscreen && !document.fullscreenElement) await document.documentElement.requestFullscreen();
  } catch {}
  try {
    await screen.orientation?.lock?.('landscape');
  } catch {}
}

function setControl(control, active) {
  if (!(control in input)) return;
  input[control] = active;
}

const keyMap = new Map([
  ['ArrowLeft', 'left'],
  ['KeyA', 'left'],
  ['ArrowRight', 'right'],
  ['KeyD', 'right'],
  ['ArrowDown', 'down'],
  ['KeyS', 'down'],
  ['KeyX', 'jump'],
  ['Space', 'jump'],
  ['KeyZ', 'run'],
  ['ShiftLeft', 'run'],
  ['KeyC', 'fire'],
  ['ControlLeft', 'fire'],
]);

window.addEventListener('keydown', (event) => {
  const control = keyMap.get(event.code);
  if (!control) return;
  event.preventDefault();
  setControl(control, true);
});
window.addEventListener('keyup', (event) => {
  const control = keyMap.get(event.code);
  if (!control) return;
  event.preventDefault();
  setControl(control, false);
});
window.addEventListener('blur', () => Object.keys(input).forEach((key) => { input[key] = false; }));

for (const button of document.querySelectorAll('[data-control]')) {
  const control = button.dataset.control;
  const activate = (event) => {
    event.preventDefault();
    button.setPointerCapture?.(event.pointerId);
    button.classList.add('active');
    setControl(control, true);
    ensureAudio();
  };
  const deactivate = (event) => {
    event.preventDefault();
    button.classList.remove('active');
    setControl(control, false);
  };
  button.addEventListener('pointerdown', activate);
  button.addEventListener('pointerup', deactivate);
  button.addEventListener('pointercancel', deactivate);
  button.addEventListener('lostpointercapture', deactivate);
}

function interpolateCollection(olderItems, newerItems, alpha) {
  const previousById = new Map((olderItems ?? []).map((item) => [item.id, item]));
  return (newerItems ?? []).map((item) => {
    const previous = previousById.get(item.id) ?? item;
    return {
      ...item,
      x: previous.x + (item.x - previous.x) * alpha,
      y: previous.y + (item.y - previous.y) * alpha,
    };
  });
}

function selectRenderState(now) {
  if (snapshots.length === 0) return null;
  const renderTime = now - 100;
  let older = snapshots[0];
  let newer = snapshots[snapshots.length - 1];
  for (let index = 0; index < snapshots.length - 1; index += 1) {
    if (snapshots[index].receivedAt <= renderTime && snapshots[index + 1].receivedAt >= renderTime) {
      older = snapshots[index];
      newer = snapshots[index + 1];
      break;
    }
  }
  const span = Math.max(1, newer.receivedAt - older.receivedAt);
  const alpha = Math.max(0, Math.min(1, (renderTime - older.receivedAt) / span));
  const players = interpolateCollection(older.players, newer.players, alpha);
  const entities = interpolateCollection(older.entities, newer.entities, alpha);

  const latestLocal = snapshots.at(-1)?.players?.find((player) => player.id === localPlayerId);
  const localIndex = players.findIndex((player) => player.id === localPlayerId);
  if (latestLocal && localIndex >= 0) players[localIndex] = { ...players[localIndex], ...latestLocal };

  return {
    ...newer,
    players,
    entities,
    blocks: newer.blocks ?? [],
  };
}

function loadImage(name, url) {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    image.onload = () => {
      images.set(name, image);
      resolve(true);
    };
    image.onerror = () => resolve(false);
    image.src = url;
  });
}

async function loadSprites() {
  await Promise.all(Object.entries(SPRITE_URLS).map(([name, url]) => loadImage(name, url)));
}

function drawSprite(imageName, source, destination, options = {}) {
  const image = images.get(imageName);
  if (!image) return false;
  const { sx, sy, sw, sh } = source;
  const { x, y, width, height } = destination;
  context.save();
  context.imageSmoothingEnabled = false;
  if (options.filter) context.filter = options.filter;
  if (options.alpha !== undefined) context.globalAlpha = options.alpha;
  if (options.flip) {
    context.translate(x + width, y);
    context.scale(-1, 1);
    context.drawImage(image, sx, sy, sw, sh, 0, 0, width, height);
  } else {
    context.drawImage(image, sx, sy, sw, sh, x, y, width, height);
  }
  context.restore();
  return true;
}

function levelPalette(levelName) {
  if (levelName === '1-2') return { skyTop: '#09091a', skyBottom: '#171735', hill: '#232348', cloud: '#515174' };
  if (levelName === '1-4') return { skyTop: '#160d18', skyBottom: '#331621', hill: '#4b2028', cloud: '#7f3f45' };
  if (levelName === '1-3') return { skyTop: '#4389eb', skyBottom: '#c9e4ff', hill: '#66b960', cloud: '#ffffffc9' };
  return { skyTop: '#5c94fc', skyBottom: '#b8d9ff', hill: '#45a449', cloud: '#ffffffd5' };
}

function drawBackground(width, height, scale, state) {
  const palette = levelPalette(state.level ?? currentLevel);
  const sky = context.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, palette.skyTop);
  sky.addColorStop(1, palette.skyBottom);
  context.fillStyle = sky;
  context.fillRect(0, 0, width, height);

  context.fillStyle = palette.hill;
  for (let i = -1; i < 9; i += 1) {
    const baseX = ((i * 390 - cameraX * 0.14) % (width + 500)) - 180;
    const baseY = height - 96 * scale;
    context.beginPath();
    context.moveTo(baseX, baseY);
    context.lineTo(baseX + 120 * scale, baseY - 145 * scale);
    context.lineTo(baseX + 250 * scale, baseY);
    context.closePath();
    context.fill();
  }

  if (!['1-2', '1-4'].includes(state.level ?? currentLevel)) {
    context.fillStyle = palette.cloud;
    for (let i = -1; i < 8; i += 1) {
      const x = ((i * 330 - cameraX * 0.22) % (width + 370)) - 90;
      const y = 78 * scale + (Math.abs(i) % 3) * 45 * scale;
      context.fillRect(x, y, 110 * scale, 24 * scale);
      context.fillRect(x + 24 * scale, y - 16 * scale, 60 * scale, 20 * scale);
    }
  }
}

function worldToScreenX(x, scale) {
  return (x - cameraX) * scale;
}

function drawFallbackBlock(block, x, y, size) {
  context.fillStyle = block.type === 'question' ? (block.used ? '#9a6a2f' : '#e7a735') : '#bd5632';
  context.fillRect(x, y, size, size);
  context.strokeStyle = '#6b2b1c';
  context.lineWidth = Math.max(1, size * 0.06);
  context.strokeRect(x, y, size, size);
  if (block.type === 'question' && !block.used) {
    context.fillStyle = '#fff4b5';
    context.font = `bold ${size * 0.62}px monospace`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('?', x + size / 2, y + size * 0.53);
  }
}

function drawBlock(block, scale) {
  if (block.broken || (block.hidden && !block.used)) return;
  const size = block.width * scale;
  const x = worldToScreenX(block.x, scale);
  const bumpOffset = block.bump > 0 ? Math.sin((block.bump / 0.18) * Math.PI) * 9 * scale : 0;
  const y = block.y * scale - bumpOffset;
  if (x + size < 0 || x > canvas.width) return;

  if (block.type === 'brick') {
    const row = Number(block.costume?.[0] ?? 0);
    const column = Number(block.costume?.[1] ?? 0);
    if (drawSprite('tiles', { sx: column * 16, sy: row * 16, sw: 16, sh: 16 }, { x, y, width: size, height: size })) return;
  } else if (block.type === 'question') {
    const frame = block.used ? 5 : Math.floor(performance.now() / 180) % 3;
    if (drawSprite('tiles', { sx: 384 + frame * 16, sy: block.used ? 16 : 0, sw: 16, sh: 16 }, { x, y, width: size, height: size })) return;
  }
  drawFallbackBlock(block, x, y, size);
}

function drawFlag(world, scale) {
  const flag = world?.flag;
  if (!flag) return;
  const x = worldToScreenX(flag.x, scale);
  if (x < -80 || x > canvas.width + 80) return;
  const poleWidth = Math.max(8, flag.width * scale);
  const poleHeight = flag.height * scale;
  const y = flag.y * scale;
  if (!drawSprite('tiles', { sx: 260, sy: 136, sw: 8, sh: 24 }, { x, y, width: poleWidth, height: poleHeight })) {
    context.fillStyle = '#e7e3c4';
    context.fillRect(x, y, poleWidth, poleHeight);
  }
  drawSprite('items', { sx: 128, sy: 0, sw: 16, sh: 16 }, { x: x - 28 * scale, y: y + 16 * scale, width: 48 * scale, height: 48 * scale });
}

function entityFrame(entity) {
  return Math.floor((entity.age ?? 0) * 7) % 2;
}

function drawEntity(entity, scale) {
  const x = worldToScreenX(entity.x, scale);
  let y = entity.y * scale;
  const width = entity.width * scale;
  const height = entity.height * scale;
  if (x + width < -20 || x > canvas.width + 20) return;
  const flip = entity.direction < 0;
  const frame = entityFrame(entity);
  let drawn = false;

  if (entity.type === 'chestnut') {
    drawn = drawSprite('enemies', { sx: frame * 30, sy: 4, sw: 16, sh: 16 }, { x, y, width, height }, { flip });
  } else if (entity.type === 'tortoise') {
    if (entity.state === 'shell') drawn = drawSprite('enemies', { sx: 90 + 4 * 30, sy: 0, sw: 16, sh: 24 }, { x, y, width, height }, { flip });
    else drawn = drawSprite('enemies', { sx: 90 + frame * 30, sy: 0, sw: 16, sh: 24 }, { x, y, width, height }, { flip });
  } else if (entity.type === 'mushroom') {
    drawn = drawSprite('items', { sx: 0, sy: 0, sw: 16, sh: 16 }, { x, y, width, height });
  } else if (entity.type === 'flower') {
    drawn = drawSprite('items', { sx: frame * 16, sy: 32, sw: 16, sh: 16 }, { x, y, width, height });
  } else if (entity.type === 'star') {
    drawn = drawSprite('items', { sx: frame * 16, sy: 48, sw: 16, sh: 16 }, { x, y, width, height });
  } else if (entity.type === 'coin') {
    y += Math.sin((entity.age ?? 0) * 8) * 4 * scale;
    drawn = drawSprite('tiles', { sx: 384 + frame * 16, sy: 16, sw: 16, sh: 16 }, { x, y, width, height });
  } else if (entity.type === 'fireball') {
    drawn = drawSprite('enemies', { sx: 360 + frame * 30, sy: 184, sw: 16, sh: 16 }, { x, y, width, height }, { flip });
  }

  if (drawn) return;
  const colors = {
    chestnut: '#9b542d', tortoise: '#43a047', mushroom: '#e23d35', flower: '#ffb436', star: '#ffd83d', coin: '#ffd33d', fireball: '#ff6f22',
  };
  context.fillStyle = colors[entity.type] ?? '#ffffff';
  context.fillRect(x, y, width, height);
  context.strokeStyle = '#111b';
  context.strokeRect(x, y, width, height);
}

function marioSource(player, now) {
  const moving = Math.abs(player.vx) > 20;
  let frame = 0;
  if (!player.onGround) frame = 5;
  else if (player.crouching) frame = 13;
  else if (moving) frame = 1 + Math.floor(now / 100) % 3;
  const small = player.power === 'small';
  return {
    sx: 80 + frame * 16,
    sy: small ? 32 : (player.power === 'fire' ? 48 : 0),
    sw: 16,
    sh: small ? 16 : 32,
  };
}

function drawPlayer(player, scale, now) {
  const x = worldToScreenX(player.x, scale);
  const y = player.y * scale;
  const width = player.width * scale;
  const height = player.height * scale;
  if (x + width < -40 || x > canvas.width + 40) return;

  const hue = player.slot === 0 ? 0 : [105, 215, 45][(player.slot - 1) % 3];
  const blink = player.invulnerable && Math.floor(now / 90) % 2 === 0;
  const filterParts = [];
  if (hue) filterParts.push(`hue-rotate(${hue}deg)`);
  if (player.star) filterParts.push(`hue-rotate(${Math.floor(now / 40) % 360}deg) saturate(2)`);
  const filter = filterParts.join(' ') || undefined;
  const source = marioSource(player, now);
  const drawn = !blink && drawSprite('mario', source, { x, y, width, height }, {
    flip: player.facing < 0,
    filter,
    alpha: player.dead ? 0.65 : 1,
  });

  if (!drawn && !blink) {
    const palette = ['#df2f2f', '#2f8f45', '#2969d9', '#e8a42a'];
    context.fillStyle = palette[player.slot % palette.length];
    context.fillRect(x, y, width, height);
  }

  context.font = `${Math.max(12, 14 * scale)}px ui-monospace, monospace`;
  context.textAlign = 'center';
  context.textBaseline = 'bottom';
  context.fillStyle = player.id === localPlayerId ? '#fff' : '#f5f5f5';
  context.strokeStyle = '#000';
  context.lineWidth = 3;
  context.strokeText(player.name, x + width / 2, y - 5 * scale);
  context.fillText(player.name, x + width / 2, y - 5 * scale);
}

function drawStartHint(state, scale) {
  if (state.players.length > 0) return;
  context.fillStyle = '#0009';
  context.fillRect(canvas.width * 0.26, canvas.height * 0.4, canvas.width * 0.48, canvas.height * 0.16);
  context.fillStyle = '#fff';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = `bold ${Math.max(18, 28 * scale)}px system-ui`;
  context.fillText('连接房间后开始游戏', canvas.width / 2, canvas.height / 2);
}

function render(now) {
  resizeCanvas();
  const width = canvas.width;
  const height = canvas.height;
  const scale = height / 720;
  const state = selectRenderState(now) ?? {
    tick: 0,
    level: currentLevel,
    timeLeft: 0,
    world: { width: 1680, height: 720, tileSize: 48, flag: null },
    players: [], blocks: [], entities: [],
  };

  const localPlayer = state.players.find((player) => player.id === localPlayerId);
  if (localPlayer) {
    const viewportWidth = width / scale;
    const target = Math.max(0, Math.min(Math.max(0, state.world.width - viewportWidth), localPlayer.x - viewportWidth * 0.34));
    cameraX += (target - cameraX) * 0.15;
  }

  drawBackground(width, height, scale, state);
  for (const block of state.blocks) drawBlock(block, scale);
  drawFlag(state.world, scale);
  for (const entity of state.entities) drawEntity(entity, scale);
  for (const player of state.players) drawPlayer(player, scale, now);
  drawStartHint(state, scale);

  const local = localPlayer ?? { score: 0, coins: 0, lives: 0, power: 'small' };
  hudElement.innerHTML = `关卡 <b>${state.level}</b>　时间 <b>${Math.ceil(state.timeLeft)}</b>　分数 <b>${local.score}</b>　金币 <b>${local.coins}</b>　生命 <b>${local.lives}</b><br><span>玩家 ${state.players.length}/4 · ${ping}ms · Tick ${state.tick} · 协议 ${serverProtocol}</span>`;
  requestAnimationFrame(render);
}

function ensureAudio() {
  if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
  if (audioContext.state === 'suspended') audioContext.resume();
}

function tone(frequency, duration = 0.08, type = 'square', gainValue = 0.035) {
  ensureAudio();
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(gainValue, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + duration);
}

function playSnapshotEvents(snapshot) {
  for (const event of snapshot.events ?? []) {
    const key = `${snapshot.tick}:${event.type}:${event.playerId ?? ''}:${event.entityId ?? event.blockId ?? ''}`;
    if (playedEvents.has(key)) continue;
    playedEvents.add(key);
    if (playedEvents.size > 300) playedEvents.delete(playedEvents.values().next().value);
    if (event.type === 'collected') tone(event.entityType === 'coin' ? 1100 : 760, 0.09);
    else if (event.type === 'block-used') tone(520, 0.08);
    else if (event.type === 'brick-broken') tone(170, 0.12, 'sawtooth');
    else if (event.type === 'player-died') tone(110, 0.45, 'sawtooth');
    else if (event.type === 'finished') {
      tone(660, 0.12);
      setTimeout(() => tone(880, 0.18), 120);
    }
  }
}

setInterval(() => {
  if (socket?.readyState !== WebSocket.OPEN || !localPlayerId) return;
  inputSequence += 1;
  send({ type: 'input', seq: inputSequence, input });
  const now = Date.now();
  if (now - lastPingSent > 2000) {
    lastPingSent = now;
    send({ type: 'ping', clientTime: now });
  }
}, 1000 / 60);

joinButton.addEventListener('click', () => {
  ensureAudio();
  connect();
});
fullscreenButton.addEventListener('click', enterImmersiveMode);
window.addEventListener('resize', resizeCanvas);
loadSprites();
requestAnimationFrame(render);
