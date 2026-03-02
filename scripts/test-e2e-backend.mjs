#!/usr/bin/env node
/**
 * Comprehensive E2E backend test suite for Nodelings.
 * Tests all API endpoints — designed to work without API keys.
 * Requires: backend server running on port 3001
 *
 * Usage: node scripts/test-e2e-backend.mjs
 */

import http from 'http';

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

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Wrap global fetch with rate-limit retry logic
const _origFetch = globalThis.fetch;
globalThis.fetch = async function rateLimitedFetch(url, options) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await _origFetch(url, options);
    if (res.status !== 429) return res;
    const waitMs = Math.pow(2, attempt) * 2000; // 2s, 4s, 8s, 16s
    console.log(`    (rate limited, waiting ${waitMs / 1000}s...)`);
    await sleep(waitMs);
  }
  return _origFetch(url, options); // final attempt
};

async function createSession() {
  const res = await fetch(`${BASE}/api/session`, { method: 'POST' });
  const body = await res.json();
  return { token: body.token, headers: { 'Content-Type': 'application/json', 'X-Session-Token': body.token } };
}

/** Pause between sections to stay under the rate limit */
async function sectionPause() {
  await sleep(4000);
}

/**
 * Open an SSE connection. Returns { events, close, statusCode }.
 * `events` is a live array that fills as events arrive.
 */
function connectSSE(roomId, sessionToken, clientId, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${BASE}/api/realtime/rooms/${roomId}/events`);
    url.searchParams.set('sessionToken', sessionToken);
    url.searchParams.set('clientId', clientId);

    const req = http.get(url.toString(), (res) => {
      if (res.statusCode !== 200) {
        let body = '';
        res.on('data', (d) => { body += d; });
        res.on('end', () => {
          resolve({ events: [], close: () => {}, statusCode: res.statusCode, body });
        });
        return;
      }

      let buffer = '';
      const events = [];

      res.on('data', (chunk) => {
        buffer += chunk.toString();
        const parts = buffer.split('\n\n');
        buffer = parts.pop();
        for (const part of parts) {
          const dataLine = part.split('\n').find(l => l.startsWith('data: '));
          if (dataLine) {
            try { events.push(JSON.parse(dataLine.slice(6))); } catch {}
          }
        }
      });

      resolve({
        events,
        close: () => { req.destroy(); },
        statusCode: 200,
      });
    });

    req.on('error', reject);
    const timer = setTimeout(() => { req.destroy(); reject(new Error('SSE connection timeout')); }, timeout);
    req.on('close', () => clearTimeout(timer));
  });
}

async function run() {
  console.log('Comprehensive Backend E2E Tests\n');

  // ============================================================
  // SECTION 1: Health Endpoint
  // ============================================================
  console.log('1. Health Endpoint');

  const healthRes = await fetch(`${BASE}/api/health`);
  const health = await healthRes.json();
  assert('GET /api/health returns 200', healthRes.ok, `got ${healthRes.status}`);
  assert('health.ok === true', health.ok === true);
  assert('activeBackend is null (no keys)', health.activeBackend === null, `got ${JSON.stringify(health.activeBackend)}`);
  assert('hasAnthropicKey is false', health.hasAnthropicKey === false);
  assert('hasGeminiKey is false', health.hasGeminiKey === false);
  assert('mcpServers === 0', health.mcpServers === 0, `got ${health.mcpServers}`);
  assert('mcpTools === 0', health.mcpTools === 0, `got ${health.mcpTools}`);

  await sectionPause();

  // Health with session
  const sess = await createSession();
  const healthWithSession = await fetch(`${BASE}/api/health`, { headers: sess.headers });
  const healthS = await healthWithSession.json();
  assert('health with session: hasSessionAnthropicKey false', healthS.hasSessionAnthropicKey === false);
  assert('health with session: hasSessionGeminiKey false', healthS.hasSessionGeminiKey === false);
  assert('health with session: hasSessionNotionToken false', healthS.hasSessionNotionToken === false);

  await sectionPause();

  // ============================================================
  // SECTION 2: Session CRUD Lifecycle
  // ============================================================
  console.log('\n2. Session CRUD Lifecycle');

  // Create session
  const s1Res = await fetch(`${BASE}/api/session`, { method: 'POST' });
  const s1 = await s1Res.json();
  assert('POST /api/session returns 200', s1Res.ok);
  assert('token is UUID format', /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s1.token), `got ${s1.token}`);

  // Create second session (different token)
  const s2Res = await fetch(`${BASE}/api/session`, { method: 'POST' });
  const s2 = await s2Res.json();
  assert('second session has different token', s2.token !== s1.token);

  const h1 = { 'Content-Type': 'application/json', 'X-Session-Token': s1.token };
  const h2 = { 'Content-Type': 'application/json', 'X-Session-Token': s2.token };

  await sleep(2500);

  // Empty keys initially
  const emptyRes = await fetch(`${BASE}/api/session/keys`, { headers: h1 });
  const emptyKeys = await emptyRes.json();
  assert('keys empty initially', emptyKeys.anthropicKey !== true && emptyKeys.geminiKey !== true);

  // Save anthropicKey
  const putRes = await fetch(`${BASE}/api/session/keys`, {
    method: 'PUT', headers: h1,
    body: JSON.stringify({ anthropicKey: 'sk-test-123' }),
  });
  assert('PUT anthropicKey returns 200', putRes.ok);

  // Verify anthropicKey present
  const keysAfterPut = await fetch(`${BASE}/api/session/keys`, { headers: h1 });
  const keys1 = await keysAfterPut.json();
  assert('anthropicKey is true after save', keys1.anthropicKey === true);

  await sleep(2500);

  // Save geminiKey alongside
  await fetch(`${BASE}/api/session/keys`, {
    method: 'PUT', headers: h1,
    body: JSON.stringify({ geminiKey: 'AIza-test-456' }),
  });
  const keys2 = await (await fetch(`${BASE}/api/session/keys`, { headers: h1 })).json();
  assert('both keys present', keys2.anthropicKey === true && keys2.geminiKey === true);

  // Remove anthropicKey
  await fetch(`${BASE}/api/session/keys`, {
    method: 'PUT', headers: h1,
    body: JSON.stringify({ anthropicKey: '' }),
  });
  const keys3 = await (await fetch(`${BASE}/api/session/keys`, { headers: h1 })).json();
  assert('anthropicKey removed', keys3.anthropicKey !== true);
  assert('geminiKey still present', keys3.geminiKey === true);

  await sleep(2500);

  // Save notionToken
  await fetch(`${BASE}/api/session/keys`, {
    method: 'PUT', headers: h1,
    body: JSON.stringify({ notionToken: 'ntn_test_789' }),
  });
  const keys4 = await (await fetch(`${BASE}/api/session/keys`, { headers: h1 })).json();
  assert('notionToken present', keys4.notionToken === true);
  assert('geminiKey still present after notionToken save', keys4.geminiKey === true);

  // Session isolation
  const keys5 = await (await fetch(`${BASE}/api/session/keys`, { headers: h2 })).json();
  assert('session isolation: s2 has no keys from s1', keys5.anthropicKey !== true && keys5.geminiKey !== true && keys5.notionToken !== true);

  await sleep(2500);

  // Auth failures
  const noTokenRes = await fetch(`${BASE}/api/session/keys`);
  assert('no token → 401', noTokenRes.status === 401, `got ${noTokenRes.status}`);

  const badTokenRes = await fetch(`${BASE}/api/session/keys`, {
    headers: { 'X-Session-Token': 'invalid-token-that-does-not-exist' },
  });
  assert('invalid token → 401', badTokenRes.status === 401, `got ${badTokenRes.status}`);

  const putNoTokenRes = await fetch(`${BASE}/api/session/keys`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ anthropicKey: 'test' }),
  });
  assert('PUT without token → 401', putNoTokenRes.status === 401, `got ${putNoTokenRes.status}`);

  await sectionPause();

  // ============================================================
  // SECTION 3: Chat Endpoint
  // ============================================================
  console.log('\n3. Chat Endpoint');

  // Create a fresh session with no keys
  const chatSess = await createSession();

  // Without API keys → 503
  const chatNoKey = await fetch(`${BASE}/api/chat`, {
    method: 'POST', headers: chatSess.headers,
    body: JSON.stringify({ prompt: 'Hello', context: 'Test context' }),
  });
  assert('chat without keys → 503', chatNoKey.status === 503, `got ${chatNoKey.status}`);
  const chatNoKeyBody = await chatNoKey.json();
  assert('chat 503 error mentions API key', chatNoKeyBody.error?.includes('API key') || chatNoKeyBody.error?.includes('No AI'), `got: ${chatNoKeyBody.error}`);

  await sleep(2500);

  // Missing prompt → 400
  const chatNoPrompt = await fetch(`${BASE}/api/chat`, {
    method: 'POST', headers: chatSess.headers,
    body: JSON.stringify({ context: 'Test' }),
  });
  assert('chat missing prompt → 400', chatNoPrompt.status === 400, `got ${chatNoPrompt.status}`);

  // Empty prompt → 400
  const chatEmptyPrompt = await fetch(`${BASE}/api/chat`, {
    method: 'POST', headers: chatSess.headers,
    body: JSON.stringify({ prompt: '', context: 'Test' }),
  });
  assert('chat empty prompt → 400', chatEmptyPrompt.status === 400, `got ${chatEmptyPrompt.status}`);

  await sleep(2500);

  // With fake session key → should attempt API call and fail with 500
  await fetch(`${BASE}/api/session/keys`, {
    method: 'PUT', headers: chatSess.headers,
    body: JSON.stringify({ anthropicKey: 'sk-ant-api03-fake-key-for-testing' }),
  });
  const chatFakeKey = await fetch(`${BASE}/api/chat`, {
    method: 'POST', headers: chatSess.headers,
    body: JSON.stringify({ prompt: 'Hello', context: 'Test' }),
  });
  assert('chat with fake key → 500 (auth error)', chatFakeKey.status === 500, `got ${chatFakeKey.status}`);
  const chatFakeKeyBody = await chatFakeKey.json();
  assert('chat error is a string', typeof chatFakeKeyBody.error === 'string', `got ${typeof chatFakeKeyBody.error}`);
  // Clean up
  await fetch(`${BASE}/api/session/keys`, {
    method: 'PUT', headers: chatSess.headers,
    body: JSON.stringify({ anthropicKey: '' }),
  });

  await sectionPause();

  // ============================================================
  // SECTION 4: Process Endpoint
  // ============================================================
  console.log('\n4. Process Endpoint');

  const procSess = await createSession();

  // Invalid building type → 400
  const procInvalid = await fetch(`${BASE}/api/process`, {
    method: 'POST', headers: procSess.headers,
    body: JSON.stringify({ buildingType: 'invalid_type', inputPayload: 'test' }),
  });
  assert('process invalid building type → 400', procInvalid.status === 400, `got ${procInvalid.status}`);
  const procInvalidBody = await procInvalid.json();
  assert('error mentions building type', procInvalidBody.error?.includes('Invalid building type'), `got: ${procInvalidBody.error}`);

  await sleep(2500);

  // Missing buildingType → 400
  const procMissing = await fetch(`${BASE}/api/process`, {
    method: 'POST', headers: procSess.headers,
    body: JSON.stringify({ inputPayload: 'test' }),
  });
  assert('process missing buildingType → 400', procMissing.status === 400, `got ${procMissing.status}`);

  // XSS in buildingType → 400 with truncated error
  const procXss = await fetch(`${BASE}/api/process`, {
    method: 'POST', headers: procSess.headers,
    body: JSON.stringify({ buildingType: '<script>alert("xss")</script>__very_long_type_name_here', inputPayload: 'test' }),
  });
  assert('XSS buildingType → 400', procXss.status === 400, `got ${procXss.status}`);
  const procXssBody = await procXss.json();
  assert('error is truncated (≤ 100 chars)', procXssBody.error?.length <= 100, `error length: ${procXssBody.error?.length}`);

  await sleep(2500);

  // Valid building types without keys → 503
  const validTypes = ['desk', 'meeting_room', 'whiteboard', 'task_wall', 'break_room', 'server_rack', 'library', 'coffee_machine'];
  let all503 = true;
  for (const buildingType of validTypes) {
    const res = await fetch(`${BASE}/api/process`, {
      method: 'POST', headers: procSess.headers,
      body: JSON.stringify({ buildingType, inputPayload: 'test' }),
    });
    if (res.status !== 503) {
      all503 = false;
      assert(`process "${buildingType}" without keys → 503`, false, `got ${res.status}`);
    }
    await sleep(100);
  }
  if (all503) {
    assert(`all ${validTypes.length} valid building types → 503 without keys`, true);
  }

  await sectionPause();

  // ============================================================
  // SECTION 5: MCP Endpoints
  // ============================================================
  console.log('\n5. MCP Endpoints');

  // Status — no servers configured
  const mcpStatus = await fetch(`${BASE}/api/mcp/status`);
  assert('GET /api/mcp/status → 200', mcpStatus.ok, `got ${mcpStatus.status}`);
  const mcpStatusBody = await mcpStatus.json();
  assert('servers is an array', Array.isArray(mcpStatusBody.servers));
  assert('totalTools is a number', typeof mcpStatusBody.totalTools === 'number');

  await sleep(2500);

  // Connect missing fields → 400
  const mcpConnectNoCmd = await fetch(`${BASE}/api/mcp/connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'test' }),
  });
  assert('mcp connect missing command → 400', mcpConnectNoCmd.status === 400, `got ${mcpConnectNoCmd.status}`);

  const mcpConnectNoName = await fetch(`${BASE}/api/mcp/connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command: 'echo' }),
  });
  assert('mcp connect missing name → 400', mcpConnectNoName.status === 400, `got ${mcpConnectNoName.status}`);

  await sleep(2500);

  // Connect invalid command → 500
  const mcpConnectBad = await fetch(`${BASE}/api/mcp/connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'bad-test', command: 'nonexistent-command-xyz-12345', args: [] }),
  });
  assert('mcp connect invalid command → 500', mcpConnectBad.status === 500, `got ${mcpConnectBad.status}`);

  // Disconnect non-existent → 200 (no-op)
  const mcpDisconnect = await fetch(`${BASE}/api/mcp/disconnect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'nonexistent' }),
  });
  assert('mcp disconnect non-existent → 200', mcpDisconnect.ok, `got ${mcpDisconnect.status}`);

  // Remove non-existent → 200 (no-op)
  const mcpRemove = await fetch(`${BASE}/api/mcp/remove`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'nonexistent' }),
  });
  assert('mcp remove non-existent → 200', mcpRemove.ok, `got ${mcpRemove.status}`);

  await sleep(2500);

  // Call with no server → 500
  const mcpCall = await fetch(`${BASE}/api/mcp/call`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ server: 'nonexistent', tool: 'test', args: {} }),
  });
  assert('mcp call no server → 500', mcpCall.status === 500, `got ${mcpCall.status}`);
  const mcpCallBody = await mcpCall.json();
  assert('mcp call error mentions "not connected"', mcpCallBody.error?.includes('not connected'), `got: ${mcpCallBody.error}`);

  await sectionPause();

  // ============================================================
  // SECTION 6: Realtime Room Lifecycle
  // ============================================================
  console.log('\n6. Realtime Room Lifecycle');

  const rtSess = await createSession();
  const roomId = `test-room-${Date.now()}`;

  // Command without session → 401
  const cmdNoSession = await fetch(`${BASE}/api/realtime/rooms/${roomId}/command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId: 'test', command: { type: 'placeBuilding', payload: { buildingType: 'desk', gridX: 10, gridY: 10 } } }),
  });
  assert('command without session → 401', cmdNoSession.status === 401, `got ${cmdNoSession.status}`);

  await sleep(2500);

  // Command missing clientId → 400
  const cmdNoClient = await fetch(`${BASE}/api/realtime/rooms/${roomId}/command`, {
    method: 'POST', headers: rtSess.headers,
    body: JSON.stringify({ command: { type: 'placeBuilding', payload: { buildingType: 'desk', gridX: 10, gridY: 10 } } }),
  });
  assert('command missing clientId → 400', cmdNoClient.status === 400, `got ${cmdNoClient.status}`);

  // Command missing command → 400
  const cmdNoCmd = await fetch(`${BASE}/api/realtime/rooms/${roomId}/command`, {
    method: 'POST', headers: rtSess.headers,
    body: JSON.stringify({ clientId: 'test' }),
  });
  assert('command missing command → 400', cmdNoCmd.status === 400, `got ${cmdNoCmd.status}`);

  await sleep(2500);

  // placeBuilding → 200
  const placeRes = await fetch(`${BASE}/api/realtime/rooms/${roomId}/command`, {
    method: 'POST', headers: rtSess.headers,
    body: JSON.stringify({
      clientId: 'test-client',
      command: { type: 'placeBuilding', payload: { buildingType: 'desk', gridX: 10, gridY: 10 } },
    }),
  });
  assert('placeBuilding → 200', placeRes.ok, `got ${placeRes.status}`);
  const placeBody = await placeRes.json();
  assert('placeBuilding returns version', typeof placeBody.version === 'number' && placeBody.version > 0, `version: ${placeBody.version}`);

  // Duplicate placement (same position) → 200 (no-op)
  const placeDup = await fetch(`${BASE}/api/realtime/rooms/${roomId}/command`, {
    method: 'POST', headers: rtSess.headers,
    body: JSON.stringify({
      clientId: 'test-client',
      command: { type: 'placeBuilding', payload: { buildingType: 'whiteboard', gridX: 10, gridY: 10 } },
    }),
  });
  assert('duplicate placement → 200 (no-op)', placeDup.ok, `got ${placeDup.status}`);

  await sleep(2500);

  // moveNodeling → 200 (Sparky id=4)
  const moveRes = await fetch(`${BASE}/api/realtime/rooms/${roomId}/command`, {
    method: 'POST', headers: rtSess.headers,
    body: JSON.stringify({
      clientId: 'test-client',
      command: { type: 'moveNodeling', payload: { nodelingId: 4, targetX: 7, targetY: 7 } },
    }),
  });
  assert('moveNodeling → 200', moveRes.ok, `got ${moveRes.status}`);

  // Presence update → 200
  const presRes = await fetch(`${BASE}/api/realtime/rooms/${roomId}/presence`, {
    method: 'POST', headers: rtSess.headers,
    body: JSON.stringify({ clientId: 'test-client', cursorX: 5, cursorY: 5, status: 'active' }),
  });
  assert('presence update → 200', presRes.ok, `got ${presRes.status}`);

  // Presence without session → 401
  const presNoSess = await fetch(`${BASE}/api/realtime/rooms/${roomId}/presence`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId: 'test-client', cursorX: 5, cursorY: 5, status: 'active' }),
  });
  assert('presence without session → 401', presNoSess.status === 401, `got ${presNoSess.status}`);

  // Presence missing clientId → 400
  const presNoClient = await fetch(`${BASE}/api/realtime/rooms/${roomId}/presence`, {
    method: 'POST', headers: rtSess.headers,
    body: JSON.stringify({ cursorX: 5, cursorY: 5, status: 'active' }),
  });
  assert('presence missing clientId → 400', presNoClient.status === 400, `got ${presNoClient.status}`);

  await sectionPause();

  // ============================================================
  // SECTION 7: SSE Connection Tests
  // ============================================================
  console.log('\n7. SSE Connection Tests');

  const sseSess = await createSession();
  const sseRoom = `sse-test-${Date.now()}`;

  // SSE connect + join snapshot
  try {
    const sse = await connectSSE(sseRoom, sseSess.token, 'sse-client-1');
    assert('SSE connection returns 200', sse.statusCode === 200);

    // Wait a moment for the first event
    await sleep(1000);
    assert('SSE received at least 1 event', sse.events.length >= 1, `got ${sse.events.length} events`);

    if (sse.events.length > 0) {
      const first = sse.events[0];
      assert('first event is join snapshot', first.kind === 'snapshot' && first.reason === 'join', `got kind=${first.kind} reason=${first.reason}`);
      assert('snapshot has default buildings (3)', first.snapshot?.world?.buildings?.length === 3, `got ${first.snapshot?.world?.buildings?.length}`);
      assert('snapshot has Sparky nodeling', first.snapshot?.world?.nodelings?.[0]?.name === 'Sparky', `got ${first.snapshot?.world?.nodelings?.[0]?.name}`);
    }

    sse.close();
  } catch (err) {
    assert('SSE connection', false, err.message);
  }

  await sleep(2500);

  // SSE missing session → should fail
  try {
    const sseBad = await connectSSE(sseRoom, '', 'sse-client-bad');
    assert('SSE missing session token → non-200', sseBad.statusCode !== 200, `got ${sseBad.statusCode}`);
    sseBad.close();
  } catch (err) {
    assert('SSE missing session rejects', true);
  }

  // SSE missing clientId → should fail
  try {
    const sseNoClient = await connectSSE(sseRoom, sseSess.token, '');
    assert('SSE missing clientId → non-200', sseNoClient.statusCode !== 200, `got ${sseNoClient.statusCode}`);
    sseNoClient.close();
  } catch (err) {
    assert('SSE missing clientId rejects', true);
  }

  await sleep(1000);

  // SSE live updates
  console.log('\n8. SSE Live Updates');
  const liveRoom = `live-test-${Date.now()}`;

  try {
    // Reuse sseSess to avoid extra session creation hitting rate limit
    const sse = await connectSSE(liveRoom, sseSess.token, 'live-client');
    await sleep(2000);

    const initialEventCount = sse.events.length;

    // Send command using http module directly to bypass rate limiter
    await new Promise((resolve, reject) => {
      const postData = JSON.stringify({
        clientId: 'live-client',
        command: { type: 'placeBuilding', payload: { buildingType: 'library', gridX: 1, gridY: 1 } },
      });
      const req = http.request(`${BASE}/api/realtime/rooms/${liveRoom}/command`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Token': sseSess.token,
          'Content-Length': Buffer.byteLength(postData),
        },
      }, (res) => {
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => resolve({ status: res.statusCode, body }));
      });
      req.on('error', reject);
      req.write(postData);
      req.end();
    });

    await sleep(2000);

    assert('SSE received live update', sse.events.length > initialEventCount, `events: ${initialEventCount} → ${sse.events.length}`);

    if (sse.events.length > initialEventCount) {
      const latest = sse.events[sse.events.length - 1];
      assert('live update is command snapshot', latest.reason === 'command', `reason: ${latest.reason}`);
      const hasLibrary = latest.snapshot?.world?.buildings?.some(b => b.buildingType === 'library');
      assert('live update contains placed library', hasLibrary);
    }

    sse.close();
  } catch (err) {
    assert('SSE live updates', false, err.message);
  }

  await sectionPause();

  // ============================================================
  // SECTION 9: Building Processing Lifecycle
  // ============================================================
  console.log('\n9. Building Processing Lifecycle');

  // Reuse sseSess to avoid rate limit from session creation
  const lcRoom = `lifecycle-${Date.now()}`;

  try {
    const sse = await connectSSE(lcRoom, sseSess.token, 'lc-client');
    await sleep(1500);

    // Place a coffee_machine (30 ticks at 10/sec = 3 seconds — fastest building)
    // Use http module directly to avoid rate limiter
    const sendCmd = (command) => new Promise((resolve, reject) => {
      const postData = JSON.stringify({ clientId: 'lc-client', command });
      const req = http.request(`${BASE}/api/realtime/rooms/${lcRoom}/command`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Token': sseSess.token,
          'Content-Length': Buffer.byteLength(postData),
        },
      }, (res) => {
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => resolve({ status: res.statusCode, body }));
      });
      req.on('error', reject);
      req.write(postData);
      req.end();
    });

    await sendCmd({ type: 'placeBuilding', payload: { buildingType: 'coffee_machine', gridX: 1, gridY: 1 } });
    await sleep(1500);

    // Find the coffee_machine's ID from the latest snapshot
    const latestSnapshot = sse.events[sse.events.length - 1]?.snapshot;
    const cm = latestSnapshot?.world?.buildings?.find(b => b.buildingType === 'coffee_machine' && b.gridX === 1);
    assert('coffee_machine placed successfully', !!cm, `buildings: ${latestSnapshot?.world?.buildings?.map(b => b.buildingType).join(', ')}`);

    if (cm) {
      // Assign task
      await sendCmd({ type: 'assignTask', payload: { buildingId: cm.id, payload: 'Make a test coffee' } });
      await sleep(1000);

      // Check processing started
      const afterAssign = sse.events[sse.events.length - 1]?.snapshot;
      const cmProcessing = afterAssign?.world?.buildings?.find(b => b.id === cm.id);
      assert('coffee_machine is processing', cmProcessing?.processing === true, `processing: ${cmProcessing?.processing}`);

      // Wait for processing to complete (coffee_machine = 30 ticks at 10 ticks/sec = ~3 seconds, add buffer)
      console.log('  (waiting ~6s for coffee_machine processing to complete...)');
      await sleep(6000);

      const afterDone = sse.events[sse.events.length - 1]?.snapshot;
      const cmDone = afterDone?.world?.buildings?.find(b => b.id === cm.id);
      assert('coffee_machine finished processing', cmDone?.processing === false, `processing: ${cmDone?.processing}`);

      // Check for result item
      const resultItems = afterDone?.world?.items?.filter(i => i.itemType === 'result');
      assert('result item created', resultItems?.length > 0, `result items: ${resultItems?.length}`);
    }

    sse.close();
  } catch (err) {
    assert('building processing lifecycle', false, err.message);
  }

  await sectionPause();

  // ============================================================
  // SECTION 10: Edge Cases
  // ============================================================
  console.log('\n10. Edge Cases');

  // Room isolation
  const isoSess = await createSession();
  const roomA = `iso-a-${Date.now()}`;
  const roomB = `iso-b-${Date.now()}`;

  await fetch(`${BASE}/api/realtime/rooms/${roomA}/command`, {
    method: 'POST', headers: isoSess.headers,
    body: JSON.stringify({
      clientId: 'iso-client',
      command: { type: 'placeBuilding', payload: { buildingType: 'server_rack', gridX: 1, gridY: 1 } },
    }),
  });

  try {
    const sseB = await connectSSE(roomB, isoSess.token, 'iso-b-client');
    await sleep(2500);
    const bSnapshot = sseB.events[0]?.snapshot;
    const hasServerRack = bSnapshot?.world?.buildings?.some(b => b.buildingType === 'server_rack');
    assert('room isolation: room B has no server_rack from room A', !hasServerRack);
    sseB.close();
  } catch (err) {
    assert('room isolation', false, err.message);
  }

  await sleep(2500);

  // Wrong HTTP method
  const getSession = await fetch(`${BASE}/api/session`);
  assert('GET /api/session (should be POST) → 404', getSession.status === 404, `got ${getSession.status}`);

  // Place all 8 building types
  const allSess = await createSession();
  const allRoom = `all-buildings-${Date.now()}`;
  const allTypes = ['desk', 'meeting_room', 'whiteboard', 'task_wall', 'break_room', 'server_rack', 'library', 'coffee_machine'];
  for (let i = 0; i < allTypes.length; i++) {
    await fetch(`${BASE}/api/realtime/rooms/${allRoom}/command`, {
      method: 'POST', headers: allSess.headers,
      body: JSON.stringify({
        clientId: 'all-client',
        command: { type: 'placeBuilding', payload: { buildingType: allTypes[i], gridX: i, gridY: 0 } },
      }),
    });
    await sleep(100);
  }

  try {
    const allSSE = await connectSSE(allRoom, allSess.token, 'all-check');
    await sleep(2500);
    const allSnapshot = allSSE.events[allSSE.events.length - 1]?.snapshot;
    // Default world has 3 buildings + 8 placed = 11
    assert('all 8 building types placed (11 total)', allSnapshot?.world?.buildings?.length === 11, `got ${allSnapshot?.world?.buildings?.length}`);
    allSSE.close();
  } catch (err) {
    assert('place all building types', false, err.message);
  }

  // ============================================================
  // Summary
  // ============================================================
  console.log(`\n${'─'.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run().catch(err => {
  console.error('\nFatal error:', err.message);
  process.exit(1);
});
