import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tickMountPickups } from '../packages/sim-core/mounts/mount-system.mjs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const network = read('apps/client/public/src/network.mjs');
const sw = read('apps/client/public/sw.js');
const version = sw.match(/const VERSION = '([^']+)'/)?.[1];
assert.ok(version);

assert.match(network, /Number\.isFinite\(expiresAtMs\)/);
assert.match(network, /Boolean\(this\.session\?\.token\)/);
assert.match(network, /clearTimeout\(this\.reconnectTimer\);\s*this\.reconnectTimer = null;/);
assert.match(network, /configured\.includes\('\?'\) \? '&' : '\?'/);
assert.match(network, /resolved = true;\s*this\.connecting = false;\s*socket\.close\(\);/);

const world = { mountPickups:[{ id:'dragon-test', type:'dragon', available:false, respawnTicks:0, animationTick:0 }] };
tickMountPickups(world);
assert.equal(world.mountPickups[0].available, true);
assert.equal(world.mountPickups[0].respawnTicks, 0);

console.log(JSON.stringify({ test:'maintenance-audit-3.8.0', status:'passed', releaseToken:version, fixes:['session-expiry-validation','reconnect-close-reset','configured-ws-query','handshake-timeout-race','mount-respawn-self-heal'] }));
