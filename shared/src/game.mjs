export const TILE_SIZE = 48;
export const GRID_HEIGHT = 15;
export const TICK_RATE = 60;
export const SNAPSHOT_RATE = 20;
export const MAX_PLAYERS = 4;
export const LEVEL_NAMES = Object.freeze(['1-1', '1-2', '1-3', '1-4']);

export const ENTITY_TYPES = Object.freeze({
  4: 'brick',
  5: 'chestnut',
  9: 'question',
  11: 'mushroom',
  12: 'coin',
  13: 'tortoise',
  14: 'flower',
  15: 'star',
});

const EPSILON = 0.001;
const GRAVITY = 2100;
const PLAYER_ACCELERATION = 1500;
const PLAYER_RUN_ACCELERATION = 2200;
const PLAYER_MAX_SPEED = 250;
const PLAYER_RUN_SPEED = 390;
const PLAYER_GROUND_FRICTION = 2100;
const PLAYER_AIR_FRICTION = 260;
const PLAYER_JUMP_SPEED = 720;
const ENEMY_SPEED = 92;
const SHELL_SPEED = 520;
const FIREBALL_SPEED = 560;
const FIREBALL_BOUNCE = 420;

let nextEntityId = 1;

function uid(prefix = 'entity') {
  const value = nextEntityId;
  nextEntityId += 1;
  return `${prefix}-${value}`;
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function normalizeLevelName(value) {
  const requested = String(value ?? '1-1').trim();
  return LEVEL_NAMES.includes(requested) ? requested : '1-1';
}

function isFiniteNumber(value) {
  return Number.isFinite(value);
}

function parseNumbers(line) {
  return line.trim().split(/\s+/).map(Number).filter(isFiniteNumber);
}

export function parseMio(source, levelName = '1-1') {
  const lines = String(source ?? '').replace(/\r/g, '').split('\n');
  let mapRange = 35;
  let limitTime = 300;
  let cursor = 0;

  for (; cursor < lines.length; cursor += 1) {
    const line = lines[cursor].trim();
    if (!line || line.startsWith('//')) continue;
    if (line === 'end') {
      cursor += 1;
      break;
    }
    const [key, rawValue] = line.split(/\s+/);
    if (key === 'map_range' && Number.isFinite(Number(rawValue))) mapRange = Number(rawValue);
    if (key === 'limit_time' && Number.isFinite(Number(rawValue))) limitTime = Number(rawValue);
  }

  const blocks = [];
  const entities = [];
  for (; cursor < lines.length; cursor += 1) {
    const line = lines[cursor].trim();
    if (!line || line.startsWith('//')) continue;
    const values = parseNumbers(line);
    if (values.length < 2) continue;
    const [gridX, gridY, command, ...args] = values;
    if (gridX < 0 && gridY < 0) break;
    const type = ENTITY_TYPES[command];
    if (!type) continue;

    const x = gridX * TILE_SIZE;
    const y = gridY * TILE_SIZE;
    if (type === 'brick' || type === 'question') {
      const hidden = type === 'question' && args[0] === 1;
      const spawnCommand = type === 'question' ? args[1] : null;
      blocks.push({
        id: uid('block'),
        type,
        x,
        y,
        width: TILE_SIZE,
        height: TILE_SIZE,
        hidden,
        used: false,
        broken: false,
        bump: 0,
        costume: args.slice(0, 2),
        spawnType: ENTITY_TYPES[spawnCommand] ?? 'coin',
        spawnArgs: type === 'question' ? args.slice(2) : [],
      });
      continue;
    }

    entities.push(createLevelEntity(type, x, y, args));
  }

  const worldWidth = Math.max(mapRange * TILE_SIZE, TILE_SIZE * 28);
  const worldHeight = GRID_HEIGHT * TILE_SIZE;
  const flag = {
    id: 'flag',
    x: Math.max(TILE_SIZE * 12, (mapRange - 10) * TILE_SIZE),
    y: TILE_SIZE * 3,
    width: TILE_SIZE * 0.45,
    height: TILE_SIZE * 10,
  };

  return {
    name: normalizeLevelName(levelName),
    mapRange,
    limitTime,
    width: worldWidth,
    height: worldHeight,
    spawn: { x: TILE_SIZE * 1.25, y: TILE_SIZE * 11.9 },
    blocks,
    entities,
    flag,
  };
}

function createLevelEntity(type, x, y, args = []) {
  const direction = args.at(-1) === -1 ? -1 : 1;
  const common = {
    id: uid(type),
    type,
    x,
    y,
    width: type === 'coin' ? 28 : 42,
    height: type === 'tortoise' ? 56 : 42,
    vx: 0,
    vy: 0,
    direction,
    active: true,
    onGround: false,
    age: 0,
  };

  if (type === 'chestnut' || type === 'tortoise') {
    common.vx = direction * ENEMY_SPEED;
    common.state = 'walking';
  }
  if (type === 'mushroom' || type === 'star') {
    common.vx = direction * ENEMY_SPEED;
    common.state = 'emerging';
    common.emergeLeft = 0.65;
  }
  if (type === 'flower') {
    common.state = 'emerging';
    common.emergeLeft = 0.65;
    common.vx = 0;
  }
  if (type === 'coin') {
    common.vx = 0;
    common.vy = 0;
    common.floatPhase = (x + y) % 360;
  }
  return common;
}

export function createPlayer(id, name, slot = 0, spawn = { x: TILE_SIZE, y: TILE_SIZE * 11 }) {
  return {
    id,
    type: 'player',
    name: String(name ?? 'Player').slice(0, 20) || 'Player',
    slot,
    x: spawn.x + slot * 34,
    y: spawn.y,
    width: 36,
    height: 48,
    vx: 0,
    vy: 0,
    facing: 1,
    onGround: false,
    crouching: false,
    power: 'small',
    score: 0,
    coins: 0,
    lives: 3,
    finished: false,
    finishTime: 0,
    deadUntil: 0,
    invulnerableUntil: 0,
    starUntil: 0,
    fireCooldownUntil: 0,
    lastInputSeq: 0,
    input: defaultInput(),
    previousInput: defaultInput(),
  };
}

export function defaultInput() {
  return { left: false, right: false, down: false, jump: false, run: false, fire: false };
}

export function createGame(level, now = 0) {
  return {
    level,
    tick: 0,
    startedAt: now,
    now,
    players: new Map(),
    blocks: level.blocks.map((block) => ({ ...block })),
    entities: level.entities.map((entity) => ({ ...entity })),
    events: [],
  };
}

export function addPlayer(game, player) {
  const spawn = game.level.spawn;
  player.x = spawn.x + player.slot * 34;
  player.y = spawn.y;
  game.players.set(player.id, player);
  return player;
}

export function removePlayer(game, playerId) {
  game.players.delete(playerId);
  game.entities = game.entities.filter((entity) => entity.ownerId !== playerId);
}

export function setPlayerInput(player, sequence, rawInput) {
  if (!Number.isSafeInteger(sequence) || sequence <= player.lastInputSeq) return false;
  player.lastInputSeq = sequence;
  const input = rawInput ?? {};
  player.input = {
    left: input.left === true,
    right: input.right === true,
    down: input.down === true,
    jump: input.jump === true,
    run: input.run === true,
    fire: input.fire === true,
  };
  return true;
}

function aabb(a, b, inset = 0) {
  return a.x + inset < b.x + b.width - inset
    && a.x + a.width - inset > b.x + inset
    && a.y + inset < b.y + b.height - inset
    && a.y + a.height - inset > b.y + inset;
}

function solidBlocks(game) {
  return game.blocks.filter((block) => !block.broken && (!block.hidden || block.used));
}

function moveBody(game, body, dx, dy, hooks = {}) {
  const collisions = { left: null, right: null, top: null, bottom: null };
  const blocks = solidBlocks(game);

  body.x += dx;
  for (const block of blocks) {
    if (!aabb(body, block)) continue;
    if (dx > 0) {
      body.x = block.x - body.width - EPSILON;
      collisions.right = block;
    } else if (dx < 0) {
      body.x = block.x + block.width + EPSILON;
      collisions.left = block;
    }
    body.vx = 0;
  }

  body.y += dy;
  body.onGround = false;
  for (const block of blocks) {
    if (!aabb(body, block)) continue;
    if (dy > 0) {
      body.y = block.y - body.height - EPSILON;
      body.vy = 0;
      body.onGround = true;
      collisions.bottom = block;
    } else if (dy < 0) {
      body.y = block.y + block.height + EPSILON;
      body.vy = 0;
      collisions.top = block;
      hooks.onHeadHit?.(block);
    }
  }

  body.x = clamp(body.x, 0, Math.max(0, game.level.width - body.width));
  return collisions;
}

function resizePlayer(player, power) {
  const wasBottom = player.y + player.height;
  player.power = power;
  if (power === 'small') {
    player.width = 36;
    player.height = 48;
  } else {
    player.width = 38;
    player.height = player.crouching ? 52 : 76;
  }
  player.y = wasBottom - player.height;
}

function bumpBlock(game, player, block) {
  block.bump = 0.18;
  if (block.hidden) {
    block.hidden = false;
    block.used = true;
  }
  if (block.type === 'brick') {
    if (player.power !== 'small') {
      block.broken = true;
      player.score += 50;
      game.events.push({ type: 'brick-broken', blockId: block.id, playerId: player.id });
    }
    return;
  }
  if (block.type !== 'question' || block.used) return;
  block.used = true;
  const spawnType = block.spawnType || 'coin';
  if (spawnType === 'coin') {
    player.coins += 1;
    player.score += 200;
    game.entities.push({
      ...createLevelEntity('coin', block.x + 10, block.y - 10, []),
      id: uid('pop-coin'),
      transient: true,
      vy: -430,
      ttl: 0.65,
    });
  } else {
    const item = createLevelEntity(spawnType, block.x + 3, block.y - 4, block.spawnArgs);
    item.y = block.y + 4;
    item.state = 'emerging';
    item.emergeLeft = 0.72;
    item.emergeTargetY = block.y - item.height - 2;
    game.entities.push(item);
  }
  game.events.push({ type: 'block-used', blockId: block.id, spawnType, playerId: player.id });
}

function respawnPlayer(game, player) {
  const spawn = game.level.spawn;
  player.x = spawn.x + player.slot * 34;
  player.y = spawn.y;
  player.vx = 0;
  player.vy = 0;
  player.finished = false;
  player.deadUntil = 0;
  player.invulnerableUntil = game.now + 2;
  player.starUntil = 0;
  player.crouching = false;
  resizePlayer(player, 'small');
}

function killPlayer(game, player) {
  if (player.deadUntil > game.now || player.finished) return;
  player.lives -= 1;
  player.deadUntil = game.now + 2.2;
  player.vx = 0;
  player.vy = -520;
  game.events.push({ type: 'player-died', playerId: player.id, lives: player.lives });
}

function hurtPlayer(game, player) {
  if (player.invulnerableUntil > game.now || player.starUntil > game.now || player.deadUntil > game.now) return;
  if (player.power === 'fire') {
    resizePlayer(player, 'big');
    player.invulnerableUntil = game.now + 2.1;
  } else if (player.power === 'big') {
    resizePlayer(player, 'small');
    player.invulnerableUntil = game.now + 2.1;
  } else {
    killPlayer(game, player);
  }
}

function collectPowerup(game, player, entity) {
  if (!entity.active) return;
  entity.active = false;
  if (entity.type === 'mushroom') {
    if (player.power === 'small') resizePlayer(player, 'big');
    player.score += 1000;
  } else if (entity.type === 'flower') {
    resizePlayer(player, 'fire');
    player.score += 1000;
  } else if (entity.type === 'star') {
    player.starUntil = game.now + 10;
    player.score += 1000;
  } else if (entity.type === 'coin') {
    player.coins += 1;
    player.score += 200;
  }
  game.events.push({ type: 'collected', playerId: player.id, entityId: entity.id, entityType: entity.type });
}

function spawnFireball(game, player) {
  const owned = game.entities.filter((entity) => entity.active && entity.type === 'fireball' && entity.ownerId === player.id).length;
  if (owned >= 2 || player.fireCooldownUntil > game.now) return;
  player.fireCooldownUntil = game.now + 0.28;
  game.entities.push({
    id: uid('fireball'),
    type: 'fireball',
    ownerId: player.id,
    x: player.facing > 0 ? player.x + player.width - 4 : player.x - 20,
    y: player.y + player.height * 0.46,
    width: 22,
    height: 22,
    vx: player.facing * FIREBALL_SPEED,
    vy: -120,
    direction: player.facing,
    active: true,
    onGround: false,
    age: 0,
    ttl: 4,
  });
}

function updatePlayer(game, player, dt) {
  if (player.deadUntil > 0) {
    if (game.now >= player.deadUntil) {
      if (player.lives <= 0) player.lives = 3;
      respawnPlayer(game, player);
    } else {
      player.vy += GRAVITY * dt;
      player.y += player.vy * dt;
    }
    player.previousInput = { ...player.input };
    return;
  }
  if (player.finished) {
    player.vx *= 0.88;
    player.previousInput = { ...player.input };
    return;
  }

  const direction = Number(player.input.right) - Number(player.input.left);
  const acceleration = player.input.run ? PLAYER_RUN_ACCELERATION : PLAYER_ACCELERATION;
  const maxSpeed = player.input.run ? PLAYER_RUN_SPEED : PLAYER_MAX_SPEED;
  if (direction !== 0) {
    player.vx += direction * acceleration * dt;
    player.facing = direction;
  } else {
    const friction = (player.onGround ? PLAYER_GROUND_FRICTION : PLAYER_AIR_FRICTION) * dt;
    if (Math.abs(player.vx) <= friction) player.vx = 0;
    else player.vx -= Math.sign(player.vx) * friction;
  }
  player.vx = clamp(player.vx, -maxSpeed, maxSpeed);

  const jumpPressed = player.input.jump && !player.previousInput.jump;
  if (jumpPressed && player.onGround && !player.input.down) {
    player.vy = -PLAYER_JUMP_SPEED;
    player.onGround = false;
  }

  if (!player.input.jump && player.vy < -250) player.vy += GRAVITY * dt * 1.7;
  player.vy += GRAVITY * dt;

  const shouldCrouch = player.input.down && player.onGround && player.power !== 'small';
  if (shouldCrouch !== player.crouching) {
    player.crouching = shouldCrouch;
    resizePlayer(player, player.power);
  }

  moveBody(game, player, player.vx * dt, player.vy * dt, {
    onHeadHit: (block) => bumpBlock(game, player, block),
  });

  if (player.y > game.level.height + TILE_SIZE * 2) killPlayer(game, player);
  if (player.input.fire && !player.previousInput.fire && player.power === 'fire') spawnFireball(game, player);

  if (aabb(player, game.level.flag, 6)) {
    player.finished = true;
    player.finishTime = game.now;
    player.score += Math.max(100, Math.ceil(getTimeLeft(game)) * 10);
    game.events.push({ type: 'finished', playerId: player.id, level: game.level.name });
  }

  player.previousInput = { ...player.input };
}

function reverseEntity(entity) {
  entity.direction *= -1;
  entity.vx = Math.abs(entity.vx || ENEMY_SPEED) * entity.direction;
}

function updateEnemy(game, entity, dt) {
  if (entity.state === 'emerging') {
    entity.emergeLeft -= dt;
    const targetY = entity.emergeTargetY ?? entity.y - entity.height;
    entity.y += (targetY - entity.y) * Math.min(1, dt * 8);
    if (entity.emergeLeft <= 0) {
      entity.state = entity.type === 'flower' ? 'idle' : 'walking';
      entity.y = targetY;
      if (entity.type === 'mushroom' || entity.type === 'star') entity.vx = (entity.direction || 1) * ENEMY_SPEED;
    }
    return;
  }
  if (entity.type === 'flower' || entity.type === 'coin') return;
  if (entity.state === 'dead') {
    entity.ttl -= dt;
    if (entity.ttl <= 0) entity.active = false;
    return;
  }

  const isShell = entity.type === 'tortoise' && entity.state === 'shell';
  if (!isShell && (entity.type === 'chestnut' || entity.type === 'tortoise' || entity.type === 'mushroom' || entity.type === 'star')) {
    if (Math.abs(entity.vx) < 1) entity.vx = (entity.direction || 1) * ENEMY_SPEED;
  }
  entity.vy += GRAVITY * dt;
  const collisions = moveBody(game, entity, entity.vx * dt, entity.vy * dt);
  if (collisions.left || collisions.right) reverseEntity(entity);
  if (entity.y > game.level.height + TILE_SIZE * 2) entity.active = false;
}

function updateFireball(game, entity, dt) {
  entity.ttl -= dt;
  if (entity.ttl <= 0) {
    entity.active = false;
    return;
  }
  entity.vy += GRAVITY * dt;
  const collisions = moveBody(game, entity, entity.vx * dt, entity.vy * dt);
  if (collisions.left || collisions.right) entity.active = false;
  if (collisions.bottom) entity.vy = -FIREBALL_BOUNCE;
  if (entity.y > game.level.height + TILE_SIZE) entity.active = false;
}

function defeatEnemy(game, enemy, byPlayer, reason = 'stomp') {
  if (!enemy.active) return;
  if (enemy.type === 'tortoise' && reason === 'stomp' && enemy.state !== 'shell') {
    enemy.state = 'shell';
    enemy.height = 38;
    enemy.y += 18;
    enemy.vx = 0;
    enemy.vy = 0;
    byPlayer.score += 100;
    return;
  }
  enemy.state = 'dead';
  enemy.vx = 0;
  enemy.vy = -220;
  enemy.ttl = 0.45;
  byPlayer.score += reason === 'fire' ? 200 : 100;
}

function interactPlayersAndEntities(game) {
  const players = [...game.players.values()];
  const enemies = game.entities.filter((entity) => entity.active && ['chestnut', 'tortoise'].includes(entity.type));

  for (const player of players) {
    if (player.deadUntil > game.now || player.finished) continue;
    for (const entity of game.entities) {
      if (!entity.active || !aabb(player, entity, entity.type === 'coin' ? 2 : 5)) continue;
      if (['mushroom', 'flower', 'star', 'coin'].includes(entity.type)) {
        collectPowerup(game, player, entity);
        continue;
      }
      if (!['chestnut', 'tortoise'].includes(entity.type) || entity.state === 'dead') continue;

      if (player.starUntil > game.now) {
        defeatEnemy(game, entity, player, 'star');
        continue;
      }

      const playerBottomBefore = player.y + player.height - player.vy / TICK_RATE;
      const stomp = player.vy > 60 && playerBottomBefore <= entity.y + Math.min(16, entity.height * 0.35);
      if (stomp) {
        defeatEnemy(game, entity, player, 'stomp');
        player.vy = -430;
        player.y = entity.y - player.height - EPSILON;
        continue;
      }

      if (entity.type === 'tortoise' && entity.state === 'shell' && Math.abs(entity.vx) < 20) {
        entity.direction = player.x + player.width / 2 < entity.x + entity.width / 2 ? 1 : -1;
        entity.vx = entity.direction * SHELL_SPEED;
        entity.x += entity.direction * 8;
        player.score += 100;
        continue;
      }
      hurtPlayer(game, player);
    }
  }

  for (const shell of enemies.filter((enemy) => enemy.type === 'tortoise' && enemy.state === 'shell' && Math.abs(enemy.vx) > 100)) {
    for (const enemy of enemies) {
      if (enemy.id === shell.id || enemy.state === 'dead' || !aabb(shell, enemy, 3)) continue;
      const scorer = players[0];
      if (scorer) defeatEnemy(game, enemy, scorer, 'shell');
    }
  }

  for (const fireball of game.entities.filter((entity) => entity.active && entity.type === 'fireball')) {
    for (const enemy of enemies) {
      if (!enemy.active || enemy.state === 'dead' || !aabb(fireball, enemy, 2)) continue;
      const owner = game.players.get(fireball.ownerId);
      if (owner) defeatEnemy(game, enemy, owner, 'fire');
      fireball.active = false;
      break;
    }
  }
}

function updateBlockAnimations(game, dt) {
  for (const block of game.blocks) block.bump = Math.max(0, block.bump - dt);
}

export function stepGame(game, dt = 1 / TICK_RATE, now = game.now + dt) {
  game.now = now;
  game.tick += 1;
  game.events = [];
  updateBlockAnimations(game, dt);

  for (const player of game.players.values()) updatePlayer(game, player, dt);
  for (const entity of game.entities) {
    if (!entity.active) continue;
    entity.age += dt;
    if (entity.transient) {
      entity.ttl -= dt;
      entity.y += entity.vy * dt;
      entity.vy += GRAVITY * dt;
      if (entity.ttl <= 0) entity.active = false;
    } else if (entity.type === 'fireball') updateFireball(game, entity, dt);
    else updateEnemy(game, entity, dt);
  }
  interactPlayersAndEntities(game);
  game.entities = game.entities.filter((entity) => entity.active);

  if (getTimeLeft(game) <= 0) {
    for (const player of game.players.values()) killPlayer(game, player);
    game.startedAt = game.now;
  }
  return game;
}

export function getTimeLeft(game) {
  return Math.max(0, game.level.limitTime - (game.now - game.startedAt));
}

function round(value) {
  return Math.round(value * 100) / 100;
}

export function serializePlayer(player) {
  return {
    id: player.id,
    name: player.name,
    slot: player.slot,
    x: round(player.x),
    y: round(player.y),
    width: player.width,
    height: player.height,
    vx: round(player.vx),
    vy: round(player.vy),
    facing: player.facing,
    onGround: player.onGround,
    crouching: player.crouching,
    power: player.power,
    score: player.score,
    coins: player.coins,
    lives: player.lives,
    finished: player.finished,
    dead: player.deadUntil > 0,
    invulnerable: player.invulnerableUntil > 0,
    star: player.starUntil > 0,
    ack: player.lastInputSeq,
  };
}

export function serializeEntity(entity) {
  return {
    id: entity.id,
    type: entity.type,
    ownerId: entity.ownerId,
    x: round(entity.x),
    y: round(entity.y),
    width: entity.width,
    height: entity.height,
    vx: round(entity.vx),
    vy: round(entity.vy),
    direction: entity.direction,
    state: entity.state,
    age: round(entity.age),
  };
}

export function serializeBlock(block) {
  return {
    id: block.id,
    type: block.type,
    x: block.x,
    y: block.y,
    width: block.width,
    height: block.height,
    hidden: block.hidden,
    used: block.used,
    broken: block.broken,
    bump: round(block.bump),
    costume: block.costume,
  };
}

export function serializeGame(game) {
  return {
    tick: game.tick,
    level: game.level.name,
    timeLeft: round(getTimeLeft(game)),
    world: {
      width: game.level.width,
      height: game.level.height,
      tileSize: TILE_SIZE,
      flag: game.level.flag,
    },
    players: [...game.players.values()].map(serializePlayer),
    blocks: game.blocks.map(serializeBlock),
    entities: game.entities.map(serializeEntity),
    events: game.events,
  };
}
