const canvas = document.querySelector('#game');
const context = canvas.getContext('2d', { alpha: false });
const statusElement = document.querySelector('#status');
const hudElement = document.querySelector('#hud');
const lobbyElement = document.querySelector('#lobby');
const joinButton = document.querySelector('#join');
const nameInput = document.querySelector('#name');
const roomInput = document.querySelector('#room');
const serverInput = document.querySelector('#server');

const input = { left: false, right: false, jump: false, run: false, fire: false };
const snapshots = [];
let socket = null;
let localPlayerId = null;
let inputSequence = 0;
let ping = 0;
let lastPingSent = 0;
let assetCount = 0;
let cameraX = 0;

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

function send(payload) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
}

function connect() {
  if (socket) socket.close();
  setStatus('连接中…');
  socket = new WebSocket(serverInput.value.trim());

  socket.addEventListener('open', () => {
    send({ type: 'join', room: roomInput.value, name: nameInput.value });
  });

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.type === 'welcome') {
      localPlayerId = message.playerId;
      setStatus(`房间 ${message.room}`, 'online');
      lobbyElement.classList.add('hidden');
      enterImmersiveMode();
      return;
    }
    if (message.type === 'snapshot') {
      snapshots.push({ receivedAt: performance.now(), ...message });
      if (snapshots.length > 20) snapshots.splice(0, snapshots.length - 20);
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
    if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    }
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
  ['KeyX', 'jump'],
  ['Space', 'jump'],
  ['KeyZ', 'run'],
  ['ShiftLeft', 'run'],
  ['KeyC', 'fire'],
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
  const previousById = new Map(older.players.map((player) => [player.id, player]));
  return {
    tick: newer.tick,
    world: newer.world,
    players: newer.players.map((player) => {
      const previous = previousById.get(player.id) ?? player;
      return {
        ...player,
        x: previous.x + (player.x - previous.x) * alpha,
        y: previous.y + (player.y - previous.y) * alpha,
      };
    }),
  };
}

function drawBackground(width, height, scale, world) {
  const sky = context.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, '#5c94fc');
  sky.addColorStop(1, '#b8d9ff');
  context.fillStyle = sky;
  context.fillRect(0, 0, width, height);

  context.fillStyle = '#ffffffbb';
  for (let i = -1; i < 8; i += 1) {
    const x = ((i * 310 - cameraX * 0.22) % (width + 310)) - 80;
    const y = 90 + (i % 3) * 45;
    context.fillRect(x, y, 110, 24);
    context.fillRect(x + 24, y - 16, 60, 20);
  }

  const groundY = world.groundY * scale;
  context.fillStyle = '#c96b32';
  context.fillRect(0, groundY, width, height - groundY);
  context.fillStyle = '#efb64b';
  context.fillRect(0, groundY, width, Math.max(8, 16 * scale));
  context.strokeStyle = '#7d3c20';
  context.lineWidth = Math.max(1, scale * 2);
  for (let x = -(cameraX % (32 * scale)); x < width; x += 32 * scale) {
    context.strokeRect(x, groundY, 32 * scale, 32 * scale);
  }
}

function drawPlayer(player, scale) {
  const x = (player.x - cameraX) * scale;
  const y = player.y * scale;
  const width = 32 * scale;
  const height = 64 * scale;
  const palette = ['#df2f2f', '#2f8f45', '#2969d9', '#e8a42a'];
  const color = palette[player.slot % palette.length];

  context.save();
  context.translate(x + width / 2, 0);
  context.scale(player.facing < 0 ? -1 : 1, 1);
  context.translate(-(x + width / 2), 0);
  context.fillStyle = '#f0b783';
  context.fillRect(x + width * 0.2, y + height * 0.14, width * 0.6, height * 0.28);
  context.fillStyle = color;
  context.fillRect(x + width * 0.08, y, width * 0.82, height * 0.18);
  context.fillRect(x + width * 0.12, y + height * 0.4, width * 0.76, height * 0.38);
  context.fillStyle = '#242424';
  context.fillRect(x + width * 0.08, y + height * 0.78, width * 0.34, height * 0.22);
  context.fillRect(x + width * 0.58, y + height * 0.78, width * 0.34, height * 0.22);
  context.restore();

  context.font = `${Math.max(12, 14 * scale)}px ui-monospace, monospace`;
  context.textAlign = 'center';
  context.fillStyle = player.id === localPlayerId ? '#fff' : '#f5f5f5';
  context.fillText(player.name, x + width / 2, y - 8);
}

function render(now) {
  resizeCanvas();
  const width = canvas.width;
  const height = canvas.height;
  const scale = height / 720;
  const state = selectRenderState(now) ?? { tick: 0, world: { width: 8192, height: 720, groundY: 624 }, players: [] };
  const localPlayer = state.players.find((player) => player.id === localPlayerId);
  if (localPlayer) {
    const target = Math.max(0, Math.min(state.world.width - width / scale, localPlayer.x - width / scale * 0.35));
    cameraX += (target - cameraX) * 0.12;
  }

  drawBackground(width, height, scale, state.world);
  for (const player of state.players) drawPlayer(player, scale);

  hudElement.textContent = `房间玩家 ${state.players.length}/4  ·  Tick ${state.tick}  ·  Ping ${ping}ms  ·  Upstream assets ${assetCount}`;
  requestAnimationFrame(render);
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

async function loadAssetManifest() {
  try {
    const response = await fetch('/upstream/asset-manifest.json', { cache: 'no-store' });
    if (!response.ok) return;
    const manifest = await response.json();
    assetCount = Array.isArray(manifest.files) ? manifest.files.length : 0;
  } catch {}
}

joinButton.addEventListener('click', connect);
window.addEventListener('resize', resizeCanvas);
loadAssetManifest();
requestAnimationFrame(render);
