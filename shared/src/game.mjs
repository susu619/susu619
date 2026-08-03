import * as core from './game-v2.mjs';

export const {
  TILE_SIZE,
  TICK_RATE,
  SNAPSHOT_RATE,
  MAX_PLAYERS,
  LEVEL_NAMES,
  normalizeLevelName,
  createPlayer,
  createGame,
  addPlayer,
  removePlayer,
  setPlayerInput,
  stepGame,
  timeLeft,
  serializeGame,
} = core;

let finishBlockId = 1;

function addFinishStructure(level) {
  const existing = new Set(level.blocks.map((block) => `${block.x}:${block.y}`));
  const addBlock = (gridX, gridY, costume = [0, 0], structure = 'finish') => {
    const x = gridX * TILE_SIZE;
    const y = gridY * TILE_SIZE;
    const key = `${x}:${y}`;
    if (existing.has(key)) return;
    existing.add(key);
    level.blocks.push({
      id: `finish-block-${finishBlockId++}`,
      type: 'brick',
      x,
      y,
      width: TILE_SIZE,
      height: TILE_SIZE,
      hidden: false,
      used: false,
      broken: false,
      bump: 0,
      costume,
      structure,
      spawnType: 'coin',
      spawnArgs: [],
    });
  };

  for (let offset = 1; offset <= 10; offset += 1) {
    addBlock(level.mapRange - offset, 13, [0, 0], 'finish-ground');
    addBlock(level.mapRange - offset, 14, [0, 0], 'finish-ground');
  }
  addBlock(level.mapRange - 10, 12, [1, 0], 'flag-base');

  for (let offset = 1; offset <= 5; offset += 1) {
    addBlock(level.mapRange - offset, 11, [0, 2], 'castle');
    addBlock(level.mapRange - offset, 12, [0, 2], 'castle');
    addBlock(level.mapRange - offset, 10, [0, 0], 'castle');
    if (offset >= 2 && offset <= 4) addBlock(level.mapRange - offset, 8, [0, 0], 'castle');
  }
  for (let offset = 2; offset <= 4; offset += 1) addBlock(level.mapRange - offset, 9, [0, 5 - offset], 'castle');

  level.flag = {
    id: 'flag',
    x: (level.mapRange - 10) * TILE_SIZE + TILE_SIZE * 0.28,
    y: 3 * TILE_SIZE,
    width: TILE_SIZE * 0.45,
    height: 10 * TILE_SIZE,
  };
  return level;
}

export function parseMio(source, levelName = '1-1') {
  return addFinishStructure(core.parseMio(source, levelName));
}
