import { TILE } from '../kernel/constants.mjs';

const VALID_TYPES = new Set(['dragon']);

function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function createMountPickups(level) {
  return (level?.dynamicWorld?.mountSpawns ?? []).map((item) => {
    const type = String(item.type ?? '');
    if (!VALID_TYPES.has(type)) throw new Error(`unsupported mount type: ${type}`);
    const maximumHealth = Math.max(1, Math.min(9, Math.trunc(Number(item.health ?? 3))));
    return {
      id: String(item.id), type, areaId: String(item.areaId ?? 'main'),
      x: Math.trunc(Number(item.x ?? 0) * TILE), y: Math.trunc(Number(item.y ?? 0) * TILE),
      w: Math.trunc(Number(item.width ?? 2) * TILE), h: Math.trunc(Number(item.height ?? 2) * TILE),
      maximumHealth, available: true, respawnTicks: 0, animationTick: 0
    };
  });
}

export function tickMountPickups(world) {
  for (const pickup of world.mountPickups ?? []) {
    pickup.animationTick = (pickup.animationTick ?? 0) + 1;
    if (pickup.available) continue;
    pickup.respawnTicks = Math.max(0, Number(pickup.respawnTicks ?? 0) - 1);
    if (pickup.respawnTicks <= 0) pickup.available = true;
  }
}

export function tryCollectMount(world, player, emit) {
  if (player.state !== 'active' || player.mount) return false;
  for (const pickup of world.mountPickups ?? []) {
    if (!pickup.available || pickup.areaId !== (player.areaId ?? 'main')) continue;
    if (!overlaps(player, pickup)) continue;
    player.mount = { type:pickup.type, health:pickup.maximumHealth, maximumHealth:pickup.maximumHealth, skillCooldownTicks:0, rollTicks:0, hurtTicks:0, animationTick:0 };
    pickup.available = false;
    pickup.respawnTicks = 60 * 25;
    emit?.('mount.collected', { playerId:player.id, mountId:pickup.id, mountType:pickup.type, health:pickup.maximumHealth, areaId:player.areaId, x:player.x, y:player.y });
    return true;
  }
  return false;
}

export function tickPlayerMount(player) {
  if (player.mountDismount) {
    player.mountDismount.ticks = Math.max(0, (player.mountDismount.ticks ?? 0) - 1);
    if (player.mountDismount.ticks <= 0) player.mountDismount = null;
  }
  const mount = player.mount;
  if (!mount) return;
  mount.animationTick = (mount.animationTick ?? 0) + 1;
  mount.skillCooldownTicks = Math.max(0, (mount.skillCooldownTicks ?? 0) - 1);
  mount.rollTicks = Math.max(0, (mount.rollTicks ?? 0) - 1);
  mount.hurtTicks = Math.max(0, (mount.hurtTicks ?? 0) - 1);
}

export function activateMountSkill(player, callbacks = {}) {
  const mount = player.mount;
  if (!mount || (mount.skillCooldownTicks ?? 0) > 0) return false;
  if (mount.type === 'dragon') {
    mount.skillCooldownTicks = 42;
    callbacks.spawnDragonFire?.();
    callbacks.emit?.('mount.dragon.fire', { playerId:player.id, areaId:player.areaId, x:player.x, y:player.y, direction:player.facing || 1 });
    return true;
  }
  return false;
}

export function mountJumpScale(player) { return player.mount?.type === 'dragon' ? 1.28 : 1; }
export function mountMovementScale(player) { return player.mount?.type === 'dragon' ? 1.08 : 1; }

export function absorbMountDamage(player, source, emit) {
  const mount = player.mount;
  if (!mount) return false;
  if ((mount.hurtTicks ?? 0) > 0) return true;
  mount.health = Math.max(0, Number(mount.health ?? mount.maximumHealth ?? 1) - 1);
  mount.hurtTicks = 48;
  player.invulnerabilityTicks = Math.max(player.invulnerabilityTicks ?? 0, 36);
  emit?.('mount.damaged', { playerId:player.id, mountType:mount.type, source, health:mount.health, maximumHealth:mount.maximumHealth, areaId:player.areaId, x:player.x, y:player.y });
  if (mount.health <= 0) {
    const type = mount.type;
    player.mountDismount = { type, ticks:48, maximumTicks:48, facing:player.facing || 1 };
    player.mount = null;
    player.vy = Math.min(player.vy ?? 0, -420);
    emit?.('mount.destroyed', { playerId:player.id, mountType:type, source, areaId:player.areaId, x:player.x, y:player.y });
  }
  return true;
}

export function mountHashValues(player) {
  const mount = player?.mount;
  const dismount = player?.mountDismount;
  return [mount?.type ?? '', mount?.health ?? 0, mount?.maximumHealth ?? 0, mount?.skillCooldownTicks ?? 0, mount?.rollTicks ?? 0, mount?.hurtTicks ?? 0, dismount?.type ?? '', dismount?.ticks ?? 0, dismount?.maximumTicks ?? 0, dismount?.facing ?? 0];
}

export function mountPickupHashValues(pickups) {
  const values = [];
  for (const item of pickups ?? []) values.push(item.id, item.type, item.areaId, item.available ? 1 : 0, item.respawnTicks ?? 0, item.animationTick ?? 0);
  return values;
}
