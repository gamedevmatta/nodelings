#!/usr/bin/env node
/**
 * Standalone session API test — no Puppeteer, no browser needed.
 * Requires the backend to be running: npm run server
 *
 * Usage: node scripts/test-session.mjs
 */

const BASE = 'http://localhost:3001';
let passed = 0;
let failed = 0;

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

async function run() {
  console.log('Session API Tests\n');

  // ── 1. Create session ──────────────────────────────────────────────────────
  console.log('1. POST /api/session');
  const sessionRes = await fetch(`${BASE}/api/session`, { method: 'POST' });
  assert('status 200', sessionRes.ok, `got ${sessionRes.status}`);
  const { token } = await sessionRes.json();
  assert('token is a non-empty string', typeof token === 'string' && token.length > 0, `got ${JSON.stringify(token)}`);
  const headers = { 'Content-Type': 'application/json', 'X-Session-Token': token };

  // ── 2. GET keys — empty initially ─────────────────────────────────────────
  console.log('\n2. GET /api/session/keys (empty)');
  const emptyRes = await fetch(`${BASE}/api/session/keys`, { headers });
  assert('status 200', emptyRes.ok, `got ${emptyRes.status}`);
  const emptyKeys = await emptyRes.json();
  assert('no anthropicKey flag', emptyKeys.anthropicKey !== true, `got ${JSON.stringify(emptyKeys)}`);
  assert('no geminiKey flag', emptyKeys.geminiKey !== true, `got ${JSON.stringify(emptyKeys)}`);

  // ── 3. PUT anthropic key ───────────────────────────────────────────────────
  console.log('\n3. PUT /api/session/keys {anthropicKey: "sk-test-fake-key"}');
  const putRes = await fetch(`${BASE}/api/session/keys`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ anthropicKey: 'sk-test-fake-key' }),
  });
  assert('status 200', putRes.ok, `got ${putRes.status}`);
  const putBody = await putRes.json();
  assert('ok: true', putBody.ok === true, `got ${JSON.stringify(putBody)}`);

  // ── 4. GET keys — anthropic present ───────────────────────────────────────
  console.log('\n4. GET /api/session/keys (after PUT)');
  const keysRes = await fetch(`${BASE}/api/session/keys`, { headers });
  assert('status 200', keysRes.ok, `got ${keysRes.status}`);
  const keys = await keysRes.json();
  assert('anthropicKey: true', keys.anthropicKey === true, `got ${JSON.stringify(keys)}`);

  // ── 5. GET /api/health — session key reflected ────────────────────────────
  console.log('\n5. GET /api/health (session key active)');
  const healthRes = await fetch(`${BASE}/api/health`, { headers });
  assert('status 200', healthRes.ok, `got ${healthRes.status}`);
  const health = await healthRes.json();
  assert('activeBackend: "anthropic"', health.activeBackend === 'anthropic', `got ${JSON.stringify(health.activeBackend)}`);
  assert('hasSessionAnthropicKey: true', health.hasSessionAnthropicKey === true, `got ${JSON.stringify(health.hasSessionAnthropicKey)}`);

  // ── 6. Clear anthropic key ─────────────────────────────────────────────────
  console.log('\n6. PUT /api/session/keys {anthropicKey: ""} (remove key)');
  const clearRes = await fetch(`${BASE}/api/session/keys`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ anthropicKey: '' }),
  });
  assert('status 200', clearRes.ok, `got ${clearRes.status}`);

  // ── 7. GET keys — empty again ──────────────────────────────────────────────
  console.log('\n7. GET /api/session/keys (after clear)');
  const afterClearRes = await fetch(`${BASE}/api/session/keys`, { headers });
  assert('status 200', afterClearRes.ok, `got ${afterClearRes.status}`);
  const afterClear = await afterClearRes.json();
  assert('anthropicKey not present', afterClear.anthropicKey !== true, `got ${JSON.stringify(afterClear)}`);

  // ── 8. Unauthenticated request → 401 ──────────────────────────────────────
  console.log('\n8. GET /api/session/keys (no token → expect 401)');
  const unauthRes = await fetch(`${BASE}/api/session/keys`);
  assert('status 401', unauthRes.status === 401, `got ${unauthRes.status}`);

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

run().catch(err => {
  console.error('\nFatal error:', err.message);
  process.exit(1);
});
