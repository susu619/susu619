import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import {
  LEVEL_NAMES,
  MAX_PLAYERS,
  SNAPSHOT_RATE,
  TICK_RATE,
  addPlayer,
  createGame,
  createPlayer,
  normalizeLevelName,
  parseMio,
  removePlayer,
  serializeGame,
  setPlayerInput,
  stepGame,
} from '../../shared/src/game.mjs';

const PORT = Number.parseInt(process.env.PORT ?? '8080', 10);
const HOST = process.env.HOST ?? '0.0.0.0';
const DIST_DIRECTORY = resolve(fileURLToPath(new URL('../../web/dist/', import.meta.url)));
const LEVEL_DIRECTORY = fileURLToPath(new URL('../../shared/levels/', import.meta.url));
const rooms = new Map();
const levelTemplates = new Map();

const CONTENT_TYPES = Object.freeze({
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
});

export function normalizeRoomCode(value) {
  const code = String(value ?? 'PUBLIC').toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 16);
  return code || 'PUBLIC';
}

export function normalizePlayerName(value) {
  const name = String(value ?? 'Player').trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 20);
  return name || 'Player';
}

export function loadLevel(levelName) {
  const normalizedName = normalizeLevelName(levelName);
  const source = readFileSync(join(LEVEL_DIRECTORY, `${normalizedName}.mio`), 'utf8');
  return parseMio(source, normalizedName);
}

function getLevelTemplate(levelName) {
  const normalizedName = normalizeLevelName(levelName);
  let template = levelTemplates.get(normalizedName);
  if (!template) {
    template = loadLevel(normalizedName);
    levelTemplates.set(normalizedName, template);
  }
  return template;
}

function cloneLevel(levelName) {
  const template = getLevelTemplate(levelName);
  return {
    ...template,
    spawn: { ...template.spawn },
    flag: { ...template.flag },
    blocks: template.blocks.map((block) => ({ ...block, costume: [...(block.costume ?? [])], spawnArgs: [...(block.spawnArgs ?? [])] })),
    entities: template.entities.map((entity) => ({ ...entity })),
  };
}

function getOrCreateRoom(code, levelName) {
  const normalizedCode = normalizeRoomCode(code);
  let room = rooms.get(normalizedCode);
  if (!room) {
    const level = cloneLevel(levelName);
    room = {
      code: normalizedCode,
      levelName: level.name,
      game: createGame(level, 0),
      sockets: new Map(),
      createdAt: Date.now(),
      resetAt: 0,
    };
    rooms.set(normalizedCode, room);
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
    serverTime: Date.now(),
    ...serializeGame(room.game),
  };
}

function leave(socket) {
  const metadata = socket.metadata;
  if (!metadata) return;
  const room = rooms.get(metadata.roomCode);
  if (!room) return;
  removePlayer(room.game, metadata.playerId);
  room.sockets.delete(metadata.playerId);
  broadcast(room, { type: 'player-left', playerId: metadata.playerId });
  if (room.game.players.size === 0) rooms.delete(room.code);
  socket.metadata = null;
}

function handleJoin(socket, message) {
  if (socket.metadata) throw new Error('already joined');
  const room = getOrCreateRoom(message.room, message.level);
  if (room.game.players.size >= MAX_PLAYERS) throw new Error('room is full');

  const playerId = randomUUID();
  const occupiedSlots = new Set([...room.game.players.values()].map((player) => player.slot));
  let slot = 0;
  while (occupiedSlots.has(slot)) slot += 1;

  const player = createPlayer(playerId, normalizePlayerName(message.name), slot, room.game.level.spawn);
  addPlayer(room.game, player);
  room.sockets.set(playerId, socket);
  socket.metadata = { roomCode: room.code, playerId, messagesThisSecond: 0, messageWindow: Date.now() };

  send(socket, {
    type: 'welcome',
    playerId,
    room: room.code,
    level: room.levelName,
    tickRate: TICK_RATE,
    snapshotRate: SNAPSHOT_RATE,
    maxPlayers: MAX_PLAYERS,
    availableLevels: LEVEL_NAMES,
  });
  broadcast(room, {
    type: 'player-joined',
    player: { id: player.id, name: player.name, slot: player.slot },
  });
  send(socket, snapshot(room));
}

function handleInput(socket, message) {
  const metadata = socket.metadata;
  if (!metadata) throw new Error('join a room first');
  const room = rooms.get(metadata.roomCode);
  const player = room?.game.players.get(metadata.playerId);
  if (!player) throw new Error('player is not active');
  setPlayerInput(player, message.seq, message.input);
}

function enforceMessageRate(socket) {
  if (!socket.metadata) return;
  const now = Date.now();
  if (now - socket.metadata.messageWindow >= 1000) {
    socket.metadata.messageWindow = now;
    socket.metadata.messagesThisSecond = 0;
  }
  socket.metadata.messagesThisSecond += 1;
  if (socket.metadata.messagesThisSecond > 180) throw new Error('message rate exceeded');
}

function handleMessage(socket, raw) {
  try {
    if (raw.length > 16 * 1024) throw new Error('message too large');
    enforceMessageRate(socket);
    const message = JSON.parse(raw.toString());
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

function healthPayload() {
  const activeRooms = [...rooms.values()];
  return {
    ok: true,
    service: 'mario-web-multiplayer',
    protocol: 2,
    rooms: activeRooms.length,
    players: activeRooms.reduce((total, room) => total + room.game.players.size, 0),
    levels: LEVEL_NAMES,
    uptime: Math.round(process.uptime()),
  };
}

function writeJson(response, status, payload) {
  response.writeHead(status, {
    'access-control-allow-origin': '*',
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(payload));
}

function tryServeStatic(request, response) {
  if (!existsSync(DIST_DIRECTORY)) return false;
  const requestPath = new URL(request.url ?? '/', 'http://localhost').pathname;
  const requestedFile = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '');
  const normalizedFile = normalize(requestedFile).replace(/^(\.\.[/\\])+/, '');
  let absolutePath = resolve(DIST_DIRECTORY, normalizedFile);
  if (!absolutePath.startsWith(DIST_DIRECTORY)) return false;
  if (!existsSync(absolutePath) || statSync(absolutePath).isDirectory()) absolutePath = join(DIST_DIRECTORY, 'index.html');
  if (!existsSync(absolutePath)) return false;

  response.writeHead(200, {
    'cache-control': absolutePath.endsWith('index.html') ? 'no-cache' : 'public, max-age=86400',
    'content-type': CONTENT_TYPES[extname(absolutePath)] ?? 'application/octet-stream',
  });
  response.end(readFileSync(absolutePath));
  return true;
}

function resetRoom(room) {
  const previousPlayers = [...room.game.players.values()];
  const level = cloneLevel(room.levelName);
  room.game = createGame(level, room.game.now);
  for (const player of previousPlayers) {
    const replacement = createPlayer(player.id, player.name, player.slot, level.spawn);
    replacement.score = player.score;
    replacement.coins = player.coins;
    replacement.lives = Math.max(1, player.lives);
    addPlayer(room.game, replacement);
  }
  room.resetAt = 0;
}

export function createMarioServer() {
  const httpServer = http.createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
    if (pathname === '/health' || pathname === '/healthz') {
      writeJson(response, 200, healthPayload());
      return;
    }
    if (pathname === '/api/levels') {
      writeJson(response, 200, { levels: LEVEL_NAMES });
      return;
    }
    if (tryServeStatic(request, response)) return;
    writeJson(response, 200, healthPayload());
  });

  const webSocketServer = new WebSocketServer({ server: httpServer, maxPayload: 16 * 1024 });
  webSocketServer.on('connection', (socket) => {
    socket.metadata = null;
    socket.isAlive = true;
    socket.on('pong', () => { socket.isAlive = true; });
    socket.on('message', (raw) => handleMessage(socket, raw));
    socket.on('close', () => leave(socket));
    socket.on('error', () => leave(socket));
  });

  const tickTimer = setInterval(() => {
    const dt = 1 / TICK_RATE;
    for (const room of rooms.values()) {
      stepGame(room.game, dt, room.game.now + dt);
      const players = [...room.game.players.values()];
      const allFinished = players.length > 0 && players.every((player) => player.finished);
      if (allFinished && room.resetAt === 0) room.resetAt = room.game.now + 5;
      if (room.resetAt > 0 && room.game.now >= room.resetAt) resetRoom(room);
    }
  }, 1000 / TICK_RATE);

  const snapshotTimer = setInterval(() => {
    for (const room of rooms.values()) broadcast(room, snapshot(room));
  }, 1000 / SNAPSHOT_RATE);

  const heartbeatTimer = setInterval(() => {
    for (const socket of webSocketServer.clients) {
      if (!socket.isAlive) {
        socket.terminate();
        continue;
      }
      socket.isAlive = false;
      socket.ping();
    }
  }, 30_000);

  httpServer.on('close', () => {
    clearInterval(tickTimer);
    clearInterval(snapshotTimer);
    clearInterval(heartbeatTimer);
    webSocketServer.close();
  });

  return { httpServer, webSocketServer, rooms };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { httpServer } = createMarioServer();
  httpServer.listen(PORT, HOST, () => {
    console.log(`Mario multiplayer server listening on http://${HOST}:${PORT}`);
  });
}
