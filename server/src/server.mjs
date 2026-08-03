import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';

export const TICK_RATE = 60;
export const SNAPSHOT_RATE = 20;
export const MAX_PLAYERS = 4;
export const WORLD = Object.freeze({ width: 8192, height: 720, groundY: 624 });

const PORT = Number.parseInt(process.env.PORT ?? '8080', 10);
const HOST = process.env.HOST ?? '0.0.0.0';
const rooms = new Map();

export function normalizeRoomCode(value) {
  const code = String(value ?? 'PUBLIC').toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 16);
  return code || 'PUBLIC';
}

export function normalizePlayerName(value) {
  const name = String(value ?? 'Player').trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 20);
  return name || 'Player';
}

export function createPlayer(id, name, slot = 0) {
  return {
    id,
    name: normalizePlayerName(name),
    slot,
    x: 128 + slot * 56,
    y: WORLD.groundY - 64,
    vx: 0,
    vy: 0,
    width: 32,
    height: 64,
    facing: 1,
    onGround: true,
    lastInputSeq: 0,
    input: { left: false, right: false, jump: false, run: false, fire: false },
  };
}

export function stepPlayer(player, dt) {
  const acceleration = player.input.run ? 1850 : 1200;
  const maxSpeed = player.input.run ? 360 : 240;
  const friction = player.onGround ? 1900 : 300;
  const gravity = 1850;
  const jumpVelocity = 680;

  const direction = Number(player.input.right) - Number(player.input.left);
  if (direction !== 0) {
    player.vx += direction * acceleration * dt;
    player.facing = direction;
  } else {
    const frictionStep = friction * dt;
    if (Math.abs(player.vx) <= frictionStep) player.vx = 0;
    else player.vx -= Math.sign(player.vx) * frictionStep;
  }

  player.vx = Math.max(-maxSpeed, Math.min(maxSpeed, player.vx));
  if (player.input.jump && player.onGround) {
    player.vy = -jumpVelocity;
    player.onGround = false;
  }

  player.vy += gravity * dt;
  player.x += player.vx * dt;
  player.y += player.vy * dt;

  player.x = Math.max(0, Math.min(WORLD.width - player.width, player.x));
  const floorY = WORLD.groundY - player.height;
  if (player.y >= floorY) {
    player.y = floorY;
    player.vy = 0;
    player.onGround = true;
  }
}

function getOrCreateRoom(code) {
  const normalized = normalizeRoomCode(code);
  let room = rooms.get(normalized);
  if (!room) {
    room = { code: normalized, tick: 0, players: new Map(), sockets: new Map() };
    rooms.set(normalized, room);
  }
  return room;
}

function send(socket, payload) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
}

function broadcast(room, payload) {
  const encoded = JSON.stringify(payload);
  for (const socket of room.sockets.values()) {
    if (socket.readyState === WebSocket.OPEN) socket.send(encoded);
  }
}

function snapshot(room) {
  return {
    type: 'snapshot',
    room: room.code,
    tick: room.tick,
    serverTime: Date.now(),
    world: WORLD,
    players: [...room.players.values()].map((player) => ({
      id: player.id,
      name: player.name,
      slot: player.slot,
      x: Math.round(player.x * 100) / 100,
      y: Math.round(player.y * 100) / 100,
      vx: Math.round(player.vx * 100) / 100,
      vy: Math.round(player.vy * 100) / 100,
      facing: player.facing,
      onGround: player.onGround,
      ack: player.lastInputSeq,
    })),
  };
}

function leave(socket) {
  const metadata = socket.metadata;
  if (!metadata) return;
  const room = rooms.get(metadata.roomCode);
  if (!room) return;
  room.players.delete(metadata.playerId);
  room.sockets.delete(metadata.playerId);
  broadcast(room, { type: 'player-left', playerId: metadata.playerId });
  if (room.players.size === 0) rooms.delete(room.code);
  socket.metadata = null;
}

function handleJoin(socket, message) {
  if (socket.metadata) throw new Error('already joined');
  const room = getOrCreateRoom(message.room);
  if (room.players.size >= MAX_PLAYERS) throw new Error('room is full');

  const playerId = randomUUID();
  const occupied = new Set([...room.players.values()].map((player) => player.slot));
  let slot = 0;
  while (occupied.has(slot)) slot += 1;
  const player = createPlayer(playerId, message.name, slot);
  room.players.set(playerId, player);
  room.sockets.set(playerId, socket);
  socket.metadata = { roomCode: room.code, playerId };

  send(socket, {
    type: 'welcome',
    playerId,
    room: room.code,
    tickRate: TICK_RATE,
    snapshotRate: SNAPSHOT_RATE,
    world: WORLD,
  });
  broadcast(room, { type: 'player-joined', player: { id: player.id, name: player.name, slot } });
  send(socket, snapshot(room));
}

function handleInput(socket, message) {
  const metadata = socket.metadata;
  if (!metadata) throw new Error('join a room first');
  const room = rooms.get(metadata.roomCode);
  const player = room?.players.get(metadata.playerId);
  if (!player) throw new Error('player is not active');

  const seq = Number.isSafeInteger(message.seq) ? message.seq : 0;
  if (seq <= player.lastInputSeq) return;
  player.lastInputSeq = seq;
  const input = message.input ?? {};
  player.input = {
    left: input.left === true,
    right: input.right === true,
    jump: input.jump === true,
    run: input.run === true,
    fire: input.fire === true,
  };
}

function handleMessage(socket, raw) {
  let message;
  try {
    message = JSON.parse(raw.toString());
    if (!message || typeof message.type !== 'string') throw new Error('invalid message');
    switch (message.type) {
      case 'join':
        handleJoin(socket, message);
        break;
      case 'input':
        handleInput(socket, message);
        break;
      case 'ping':
        send(socket, { type: 'pong', clientTime: message.clientTime, serverTime: Date.now() });
        break;
      default:
        throw new Error(`unsupported message type: ${message.type}`);
    }
  } catch (error) {
    send(socket, { type: 'error', message: error instanceof Error ? error.message : 'protocol error' });
  }
}

export function createMarioServer() {
  const httpServer = http.createServer((request, response) => {
    response.setHeader('access-control-allow-origin', '*');
    response.setHeader('content-type', 'application/json; charset=utf-8');
    if (request.url === '/health') {
      response.writeHead(200);
      response.end(JSON.stringify({ ok: true, rooms: rooms.size, players: [...rooms.values()].reduce((n, room) => n + room.players.size, 0) }));
      return;
    }
    response.writeHead(200);
    response.end(JSON.stringify({ service: 'mario-web-multiplayer', protocol: 1 }));
  });

  const webSocketServer = new WebSocketServer({ server: httpServer, maxPayload: 16 * 1024 });
  webSocketServer.on('connection', (socket) => {
    socket.metadata = null;
    socket.on('message', (raw) => handleMessage(socket, raw));
    socket.on('close', () => leave(socket));
    socket.on('error', () => leave(socket));
  });

  const tickTimer = setInterval(() => {
    const dt = 1 / TICK_RATE;
    for (const room of rooms.values()) {
      room.tick += 1;
      for (const player of room.players.values()) stepPlayer(player, dt);
    }
  }, 1000 / TICK_RATE);

  const snapshotTimer = setInterval(() => {
    for (const room of rooms.values()) broadcast(room, snapshot(room));
  }, 1000 / SNAPSHOT_RATE);

  httpServer.on('close', () => {
    clearInterval(tickTimer);
    clearInterval(snapshotTimer);
    webSocketServer.close();
  });

  return { httpServer, webSocketServer };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { httpServer } = createMarioServer();
  httpServer.listen(PORT, HOST, () => {
    console.log(`Mario multiplayer server listening on http://${HOST}:${PORT}`);
  });
}
