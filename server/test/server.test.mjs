import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLevel, normalizePlayerName, normalizeRoomCode } from '../src/server.mjs';
import {
  addPlayer,
  createGame,
  createPlayer,
  parseMio,
  serializeGame,
  setPlayerInput,
  stepGame,
} from '../../shared/src/game.mjs';

test('normalizes room codes and player names', () => {
  assert.equal(normalizeRoomCode(' room 42! '), 'ROOM42');
  assert.equal(normalizeRoomCode(''), 'PUBLIC');
  assert.equal(normalizePlayerName('  Luigi\u0000  '), 'Luigi');
});

test('loads original mio level data into authoritative world', () => {
  const level = loadLevel('1-1');
  assert.equal(level.name, '1-1');
  assert.equal(level.mapRange, 35);
  assert.equal(level.limitTime, 120);
  assert.ok(level.blocks.length > 40);
  assert.ok(level.entities.some((item) => item.type === 'chestnut'));
  assert.ok(level.entities.some((item) => item.type === 'tortoise'));
});

test('authoritative simulation moves and lands a player', () => {
  const level = loadLevel('1-1');
  const game = createGame(level, 0);
  const player = createPlayer('p1', 'Mario', 0, level.spawn);
  addPlayer(game, player);
  setPlayerInput(player, 1, { right: true, run: true });
  for (let tick = 0; tick < 90; tick += 1) stepGame(game, 1 / 60, (tick + 1) / 60);
  assert.ok(player.x > level.spawn.x);
  assert.equal(player.onGround, true);
  assert.ok(player.vx <= 390);
});

test('hidden question blocks remain solid and reveal on head hit', () => {
  const level = parseMio('map_range 20\nlimit_time 120\nend\n2 10 9 1 12\n0 13 4 0 0\n1 13 4 0 0\n2 13 4 0 0\n3 13 4 0 0\n-1 -1\n', '1-1');
  const game = createGame(level, 0);
  const player = createPlayer('p1', 'Mario', 0, { x: 2 * 48 + 6, y: 11 * 48 });
  addPlayer(game, player);
  player.x = 2 * 48 + 6;
  player.y = 11 * 48;
  player.onGround = true;
  setPlayerInput(player, 1, { jump: true });
  for (let tick = 0; tick < 30; tick += 1) stepGame(game, 1 / 60, (tick + 1) / 60);
  assert.equal(game.blocks[0].hidden, false);
  assert.equal(game.blocks[0].used, true);
  assert.equal(player.coins, 1);
});

test('snapshot exposes game entities without internal timers', () => {
  const level = loadLevel('1-1');
  const game = createGame(level, 0);
  addPlayer(game, createPlayer('p1', 'Mario', 0, level.spawn));
  const snapshot = serializeGame(game);
  assert.equal(snapshot.level, '1-1');
  assert.ok(Array.isArray(snapshot.blocks));
  assert.ok(Array.isArray(snapshot.entities));
  assert.equal(snapshot.players[0].dead, false);
});
