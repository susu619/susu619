export const TILE_SIZE = 48;
export const TICK_RATE = 60;
export const SNAPSHOT_RATE = 20;
export const MAX_PLAYERS = 4;
export const LEVEL_NAMES = Object.freeze(['1-1', '1-2', '1-3', '1-4']);

const TYPE = Object.freeze({ 4: 'brick', 5: 'chestnut', 9: 'question', 11: 'mushroom', 12: 'coin', 13: 'tortoise', 14: 'flower', 15: 'star' });
const GRAVITY = 2100;
const WALK_ACCEL = 1500;
const RUN_ACCEL = 2200;
const WALK_SPEED = 250;
const RUN_SPEED = 390;
const JUMP_SPEED = 720;
const ENEMY_SPEED = 92;
const SHELL_SPEED = 520;
const FIREBALL_SPEED = 560;
const EPS = 0.001;
let sequence = 1;

const id = (prefix) => `${prefix}-${sequence++}`;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const overlap = (a, b, inset = 0) => a.x + inset < b.x + b.width - inset && a.x + a.width - inset > b.x + inset && a.y + inset < b.y + b.height - inset && a.y + a.height - inset > b.y + inset;
const inputState = () => ({ left: false, right: false, down: false, jump: false, run: false, fire: false });

export function normalizeLevelName(value) {
  const name = String(value ?? '1-1').trim();
  return LEVEL_NAMES.includes(name) ? name : '1-1';
}

function entity(type, x, y, args = []) {
  const direction = args.at(-1) === -1 ? -1 : 1;
  const result = { id: id(type), type, x, y, width: type === 'coin' ? 28 : 42, height: type === 'tortoise' ? 56 : 42, vx: 0, vy: 0, direction, active: true, onGround: false, age: 0, state: 'idle' };
  if (type === 'chestnut' || type === 'tortoise') Object.assign(result, { vx: direction * ENEMY_SPEED, state: 'walking' });
  if (type === 'mushroom' || type === 'star') Object.assign(result, { vx: direction * ENEMY_SPEED, state: 'walking' });
  return result;
}

export function parseMio(source, levelName = '1-1') {
  const lines = String(source).replace(/\r/g, '').split('\n');
  let mapRange = 35;
  let limitTime = 300;
  let cursor = 0;
  for (; cursor < lines.length; cursor += 1) {
    const line = lines[cursor].trim();
    if (!line) continue;
    if (line === 'end') { cursor += 1; break; }
    const [key, value] = line.split(/\s+/);
    if (key === 'map_range') mapRange = Number(value) || mapRange;
    if (key === 'limit_time') limitTime = Number(value) || limitTime;
  }
  const blocks = [];
  const entities = [];
  for (; cursor < lines.length; cursor += 1) {
    const values = lines[cursor].trim().split(/\s+/).map(Number);
    if (values.length < 3 || values.some(Number.isNaN)) continue;
    const [gx, gy, command, ...args] = values;
    if (gx < 0 && gy < 0) break;
    const type = TYPE[command];
    if (!type) continue;
    const x = gx * TILE_SIZE;
    const y = gy * TILE_SIZE;
    if (type === 'brick' || type === 'question') {
      blocks.push({ id: id('block'), type, x, y, width: TILE_SIZE, height: TILE_SIZE, hidden: type === 'question' && args[0] === 1, used: false, broken: false, bump: 0, costume: args.slice(0, 2), spawnType: TYPE[args[1]] ?? 'coin', spawnArgs: args.slice(2) });
    } else entities.push(entity(type, x, y, args));
  }
  return {
    name: normalizeLevelName(levelName), mapRange, limitTime,
    width: Math.max(mapRange * TILE_SIZE, 28 * TILE_SIZE), height: 15 * TILE_SIZE,
    spawn: { x: 1.25 * TILE_SIZE, y: 11.9 * TILE_SIZE }, blocks, entities,
    flag: { id: 'flag', x: Math.max(12 * TILE_SIZE, (mapRange - 10) * TILE_SIZE), y: 3 * TILE_SIZE, width: 22, height: 10 * TILE_SIZE },
  };
}

export function createPlayer(playerId, name, slot = 0, spawn = { x: 60, y: 570 }) {
  return { id: playerId, type: 'player', name: String(name || 'Player').slice(0, 20), slot, x: spawn.x + slot * 34, y: spawn.y, width: 36, height: 48, vx: 0, vy: 0, facing: 1, onGround: false, crouching: false, power: 'small', score: 0, coins: 0, lives: 3, finished: false, deadUntil: 0, invulnerableUntil: 0, starUntil: 0, fireCooldownUntil: 0, lastInputSeq: 0, input: inputState(), previousInput: inputState() };
}

export function createGame(level, now = 0) {
  return { level, tick: 0, startedAt: now, now, players: new Map(), blocks: level.blocks.map((item) => ({ ...item })), entities: level.entities.map((item) => ({ ...item })), events: [] };
}

export function addPlayer(game, player) {
  player.x = game.level.spawn.x + player.slot * 34;
  player.y = game.level.spawn.y;
  game.players.set(player.id, player);
  return player;
}

export function removePlayer(game, playerId) {
  game.players.delete(playerId);
  game.entities = game.entities.filter((item) => item.ownerId !== playerId);
}

export function setPlayerInput(player, seq, raw = {}) {
  if (!Number.isSafeInteger(seq) || seq <= player.lastInputSeq) return false;
  player.lastInputSeq = seq;
  player.input = { left: raw.left === true, right: raw.right === true, down: raw.down === true, jump: raw.jump === true, run: raw.run === true, fire: raw.fire === true };
  return true;
}

function move(game, body, dx, dy, onHeadHit) {
  const collisions = { left: false, right: false, top: false, bottom: false };
  const solids = game.blocks.filter((block) => !block.broken);
  body.x += dx;
  for (const block of solids) {
    if (!overlap(body, block)) continue;
    if (dx > 0) { body.x = block.x - body.width - EPS; collisions.right = true; }
    if (dx < 0) { body.x = block.x + block.width + EPS; collisions.left = true; }
    body.vx = 0;
  }
  body.y += dy;
  body.onGround = false;
  for (const block of solids) {
    if (!overlap(body, block)) continue;
    if (dy > 0) { body.y = block.y - body.height - EPS; body.vy = 0; body.onGround = true; collisions.bottom = true; }
    if (dy < 0) { body.y = block.y + block.height + EPS; body.vy = 0; collisions.top = true; onHeadHit?.(block); }
  }
  body.x = clamp(body.x, 0, game.level.width - body.width);
  return collisions;
}

function resize(player, power) {
  const bottom = player.y + player.height;
  player.power = power;
  player.width = power === 'small' ? 36 : 38;
  player.height = power === 'small' ? 48 : (player.crouching ? 52 : 76);
  player.y = bottom - player.height;
}

function useBlock(game, player, block) {
  block.hidden = false;
  block.bump = 0.18;
  if (block.type === 'brick') {
    if (player.power !== 'small') { block.broken = true; player.score += 50; game.events.push({ type: 'brick-broken', playerId: player.id, blockId: block.id }); }
    return;
  }
  if (block.used) return;
  block.used = true;
  if (block.spawnType === 'coin') {
    player.coins += 1; player.score += 200;
    game.entities.push({ ...entity('coin', block.x + 10, block.y - 10), transient: true, ttl: 0.65, vy: -430 });
  } else {
    const item = entity(block.spawnType, block.x + 3, block.y + 4, block.spawnArgs);
    Object.assign(item, { state: 'emerging', emergeLeft: 0.72, emergeTargetY: block.y - item.height - 2, vx: 0 });
    game.entities.push(item);
  }
  game.events.push({ type: 'block-used', playerId: player.id, blockId: block.id, spawnType: block.spawnType });
}

function respawn(game, player) {
  Object.assign(player, { x: game.level.spawn.x + player.slot * 34, y: game.level.spawn.y, vx: 0, vy: 0, finished: false, deadUntil: 0, invulnerableUntil: game.now + 2, starUntil: 0, crouching: false });
  resize(player, 'small');
}

function die(game, player) {
  if (player.deadUntil > game.now || player.finished) return;
  player.lives -= 1; player.deadUntil = game.now + 2.2; player.vx = 0; player.vy = -520;
  game.events.push({ type: 'player-died', playerId: player.id, lives: player.lives });
}

function hurt(game, player) {
  if (player.invulnerableUntil > game.now || player.starUntil > game.now || player.deadUntil > game.now) return;
  if (player.power === 'fire') resize(player, 'big');
  else if (player.power === 'big') resize(player, 'small');
  else { die(game, player); return; }
  player.invulnerableUntil = game.now + 2.1;
}

function collect(game, player, item) {
  item.active = false;
  if (item.type === 'mushroom') { if (player.power === 'small') resize(player, 'big'); player.score += 1000; }
  if (item.type === 'flower') { resize(player, 'fire'); player.score += 1000; }
  if (item.type === 'star') { player.starUntil = game.now + 10; player.score += 1000; }
  if (item.type === 'coin') { player.coins += 1; player.score += 200; }
  game.events.push({ type: 'collected', playerId: player.id, entityId: item.id, entityType: item.type });
}

function fire(game, player) {
  if (player.power !== 'fire' || player.fireCooldownUntil > game.now) return;
  if (game.entities.filter((item) => item.type === 'fireball' && item.ownerId === player.id && item.active).length >= 2) return;
  player.fireCooldownUntil = game.now + 0.28;
  game.entities.push({ id: id('fireball'), type: 'fireball', ownerId: player.id, x: player.facing > 0 ? player.x + player.width - 4 : player.x - 20, y: player.y + player.height * 0.46, width: 22, height: 22, vx: player.facing * FIREBALL_SPEED, vy: -120, direction: player.facing, active: true, onGround: false, age: 0, ttl: 4 });
}

function updatePlayer(game, player, dt) {
  if (player.deadUntil > 0) {
    if (game.now >= player.deadUntil) { if (player.lives <= 0) player.lives = 3; respawn(game, player); }
    else { player.vy += GRAVITY * dt; player.y += player.vy * dt; }
    player.previousInput = { ...player.input }; return;
  }
  if (player.finished) { player.vx *= 0.88; player.previousInput = { ...player.input }; return; }
  const direction = Number(player.input.right) - Number(player.input.left);
  if (direction) { player.vx += direction * (player.input.run ? RUN_ACCEL : WALK_ACCEL) * dt; player.facing = direction; }
  else {
    const friction = (player.onGround ? 2100 : 260) * dt;
    player.vx = Math.abs(player.vx) <= friction ? 0 : player.vx - Math.sign(player.vx) * friction;
  }
  player.vx = clamp(player.vx, -(player.input.run ? RUN_SPEED : WALK_SPEED), player.input.run ? RUN_SPEED : WALK_SPEED);
  if (player.input.jump && !player.previousInput.jump && player.onGround && !player.input.down) { player.vy = -JUMP_SPEED; player.onGround = false; }
  if (!player.input.jump && player.vy < -250) player.vy += GRAVITY * dt * 1.7;
  player.vy += GRAVITY * dt;
  const crouch = player.input.down && player.onGround && player.power !== 'small';
  if (crouch !== player.crouching) { player.crouching = crouch; resize(player, player.power); }
  move(game, player, player.vx * dt, player.vy * dt, (block) => useBlock(game, player, block));
  if (player.y > game.level.height + TILE_SIZE * 2) die(game, player);
  if (player.input.fire && !player.previousInput.fire) fire(game, player);
  if (overlap(player, game.level.flag, 6)) { player.finished = true; player.score += Math.max(100, Math.ceil(timeLeft(game)) * 10); game.events.push({ type: 'finished', playerId: player.id, level: game.level.name }); }
  player.previousInput = { ...player.input };
}

function reverse(item) { item.direction *= -1; item.vx = Math.abs(item.vx || ENEMY_SPEED) * item.direction; }

function updateEntity(game, item, dt) {
  item.age += dt;
  if (item.transient) { item.ttl -= dt; item.y += item.vy * dt; item.vy += GRAVITY * dt; if (item.ttl <= 0) item.active = false; return; }
  if (item.state === 'emerging') {
    item.emergeLeft -= dt; item.y += ((item.emergeTargetY ?? item.y) - item.y) * Math.min(1, dt * 8);
    if (item.emergeLeft <= 0) { item.y = item.emergeTargetY; item.state = item.type === 'flower' ? 'idle' : 'walking'; if (item.type !== 'flower') item.vx = item.direction * ENEMY_SPEED; }
    return;
  }
  if (item.type === 'coin' || item.type === 'flower') return;
  if (item.state === 'dead') { item.ttl -= dt; if (item.ttl <= 0) item.active = false; return; }
  if (item.type === 'fireball') {
    item.ttl -= dt; item.vy += GRAVITY * dt;
    const hit = move(game, item, item.vx * dt, item.vy * dt);
    if (hit.left || hit.right || item.ttl <= 0) item.active = false;
    if (hit.bottom) item.vy = -420;
    return;
  }
  item.vy += GRAVITY * dt;
  const hit = move(game, item, item.vx * dt, item.vy * dt);
  if (hit.left || hit.right) reverse(item);
  if (item.y > game.level.height + TILE_SIZE * 2) item.active = false;
}

function defeat(game, enemy, player, cause) {
  if (enemy.type === 'tortoise' && cause === 'stomp' && enemy.state !== 'shell') { enemy.state = 'shell'; enemy.height = 38; enemy.y += 18; enemy.vx = 0; player.score += 100; return; }
  Object.assign(enemy, { state: 'dead', vx: 0, vy: -220, ttl: 0.45 });
  player.score += cause === 'fire' ? 200 : 100;
}

function interactions(game) {
  const players = [...game.players.values()];
  const enemies = game.entities.filter((item) => item.active && ['chestnut', 'tortoise'].includes(item.type));
  for (const player of players) {
    if (player.deadUntil > game.now || player.finished) continue;
    for (const item of game.entities) {
      if (!item.active || !overlap(player, item, 4)) continue;
      if (['mushroom', 'flower', 'star', 'coin'].includes(item.type)) { collect(game, player, item); continue; }
      if (!['chestnut', 'tortoise'].includes(item.type) || item.state === 'dead') continue;
      if (player.starUntil > game.now) { defeat(game, item, player, 'star'); continue; }
      const stomp = player.vy > 60 && player.y + player.height - player.vy / TICK_RATE <= item.y + Math.min(16, item.height * 0.35);
      if (stomp) { defeat(game, item, player, 'stomp'); player.vy = -430; player.y = item.y - player.height - EPS; continue; }
      if (item.type === 'tortoise' && item.state === 'shell' && Math.abs(item.vx) < 20) { item.direction = player.x < item.x ? 1 : -1; item.vx = item.direction * SHELL_SPEED; item.x += item.direction * 8; continue; }
      hurt(game, player);
    }
  }
  for (const shot of game.entities.filter((item) => item.active && item.type === 'fireball')) {
    for (const enemy of enemies) if (enemy.active && enemy.state !== 'dead' && overlap(shot, enemy, 2)) { const owner = game.players.get(shot.ownerId); if (owner) defeat(game, enemy, owner, 'fire'); shot.active = false; break; }
  }
  for (const shell of enemies.filter((item) => item.type === 'tortoise' && item.state === 'shell' && Math.abs(item.vx) > 100)) {
    for (const enemy of enemies) if (enemy.id !== shell.id && enemy.state !== 'dead' && overlap(shell, enemy, 3)) { const player = players[0]; if (player) defeat(game, enemy, player, 'shell'); }
  }
}

export function stepGame(game, dt = 1 / TICK_RATE, now = game.now + dt) {
  game.now = now; game.tick += 1; game.events = [];
  for (const block of game.blocks) block.bump = Math.max(0, block.bump - dt);
  for (const player of game.players.values()) updatePlayer(game, player, dt);
  for (const item of game.entities) if (item.active) updateEntity(game, item, dt);
  interactions(game);
  game.entities = game.entities.filter((item) => item.active);
  if (timeLeft(game) <= 0) { for (const player of game.players.values()) die(game, player); game.startedAt = game.now; }
  return game;
}

export const timeLeft = (game) => Math.max(0, game.level.limitTime - (game.now - game.startedAt));
const round = (value) => Math.round(value * 100) / 100;
const publicBody = (body) => ({ id: body.id, type: body.type, ownerId: body.ownerId, x: round(body.x), y: round(body.y), width: body.width, height: body.height, vx: round(body.vx), vy: round(body.vy), direction: body.direction, state: body.state, age: round(body.age ?? 0) });

export function serializeGame(game) {
  return {
    tick: game.tick, level: game.level.name, timeLeft: round(timeLeft(game)),
    world: { width: game.level.width, height: game.level.height, tileSize: TILE_SIZE, flag: game.level.flag },
    players: [...game.players.values()].map((player) => ({ id: player.id, name: player.name, slot: player.slot, x: round(player.x), y: round(player.y), width: player.width, height: player.height, vx: round(player.vx), vy: round(player.vy), facing: player.facing, onGround: player.onGround, crouching: player.crouching, power: player.power, score: player.score, coins: player.coins, lives: player.lives, finished: player.finished, dead: player.deadUntil > game.now, invulnerable: player.invulnerableUntil > game.now, star: player.starUntil > game.now, ack: player.lastInputSeq })),
    blocks: game.blocks.map((block) => ({ id: block.id, type: block.type, x: block.x, y: block.y, width: block.width, height: block.height, hidden: block.hidden, used: block.used, broken: block.broken, bump: round(block.bump), costume: block.costume })),
    entities: game.entities.map(publicBody), events: game.events,
  };
}
