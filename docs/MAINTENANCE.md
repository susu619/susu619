# Maintenance and Quality

## Pre-public audit — 2026-08-15

Before publishing this source snapshot, the project was re-audited rather than uploading the existing archive unchanged.

### Logic fixes
1. Invalid browser sessions with missing/invalid expiry are no longer treated as reusable forever.
2. `RealtimeClient.close()` clears the reconnect-timer sentinel so the object can be reused safely.
3. Configured WebSocket URLs with existing query parameters append auth token correctly.
4. Handshake timeout state is finalized before socket close to avoid a close/reject race.
5. Unavailable mount pickups with a zero respawn timer self-heal instead of disappearing forever.
6. Legacy tests no longer pin an obsolete 3.7.1 service-worker version string; they validate the active release token.

### Regression results
- 95/95 executable dependency-light gates passed in the audit environment.
- Three independent two-client integration runs passed the 8ms P95 server budget; measured P95 values were approximately 1.81ms, 1.90ms and 2.11ms.
- 2400-tick deterministic simulation passed.

Ajv/Matter dependency-backed tests require `npm ci`; unavailable dependencies are never relabeled as passed.

Every meaningful code/content change should include a regression or update an existing invariant. Test failures are fixed at source; historical assertions are not weakened merely to make a new release green.
