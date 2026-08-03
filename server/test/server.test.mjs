import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlayer, normalizePlayerName, normalizeRoomCode, stepPlayer, WORLD } from '../src/server.mjs';

test('normalizes room codes and player names', () => {
  assert.equal(normalizeRoomCode(' room 42! '), 'ROOM42');
  assert.equal(normalizeRoomCode(''), 'PUBLIC');
  assert.equal(normalizePlayerName('  Luigi\u0000  '), 'Luigi');
});

test('authoritative step accelerates and clamps player to the floor', () => {
  const player = createPlayer('p1', 'Mario');
  player.input.right = true;
  for (let i = 0; i < 60; i += 1) stepPlayer(player, 1 / 60);
  assert.ok(player.x > 128);
  assert.equal(player.y, WORLD.groundY - player.height);
  assert.equal(player.onGround, true);
});

test('jump is initiated only while grounded', () => {
  const player = createPlayer('p1', 'Mario');
  player.input.jump = true;
  stepPlayer(player, 1 / 60);
  assert.ok(player.vy < 0);
  assert.equal(player.onGround, false);
  const firstVelocity = player.vy;
  stepPlayer(player, 1 / 60);
  assert.ok(player.vy > firstVelocity);
});
