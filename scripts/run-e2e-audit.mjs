#!/usr/bin/env node
/**
 * E2E Audit Runner — orchestrates server startup, all test suites, and shutdown.
 * Usage: node scripts/run-e2e-audit.mjs
 */

import { spawn, execSync } from 'child_process';
import { existsSync, unlinkSync, rmSync } from 'fs';

const BACKEND_PORT = 3001;
const FRONTEND_PORT = 5173;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function waitForServer(url, maxRetries = 30, delayMs = 1000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {}
    await sleep(delayMs);
  }
  throw new Error(`Server at ${url} did not start within ${maxRetries * delayMs / 1000}s`);
}

function runScript(label, command, args = []) {
  return new Promise((resolve) => {
    console.log(`\n${'═'.repeat(50)}`);
    console.log(`  ${label}`);
    console.log(`${'═'.repeat(50)}\n`);

    const proc = spawn(command, args, {
      stdio: 'inherit',
      env: process.env,
      cwd: process.cwd(),
    });

    proc.on('close', (code) => {
      resolve(code || 0);
    });

    proc.on('error', (err) => {
      console.error(`  Failed to run: ${err.message}`);
      resolve(1);
    });
  });
}

async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║         Nodelings E2E Testing Audit             ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  const results = {};
  let serverProc = null;
  let viteProc = null;

  try {
    // ── Phase 0: Clean state ─────────────────────────────────────
    console.log('[Phase 0] Cleaning stale state...');
    for (const f of ['sessions.json', 'mcp-servers.json']) {
      if (existsSync(f)) { unlinkSync(f); console.log(`  Removed ${f}`); }
    }
    if (existsSync('server/data/rooms.snapshot.json')) {
      unlinkSync('server/data/rooms.snapshot.json');
      console.log('  Removed server/data/rooms.snapshot.json');
    }
    console.log('  State cleaned.\n');

    // ── Phase 1: TypeScript check ────────────────────────────────
    console.log('[Phase 1] TypeScript compilation check...');
    try {
      execSync('npx tsc --noEmit', { stdio: 'pipe' });
      console.log('  ✓ Frontend TypeScript: PASS\n');
      results['TypeScript'] = 'PASS';
    } catch (err) {
      const stderr = err.stderr?.toString() || err.stdout?.toString() || '';
      console.log('  ✗ Frontend TypeScript: FAIL');
      console.log(stderr.split('\n').slice(0, 20).join('\n'));
      results['TypeScript'] = 'FAIL';
    }

    // ── Phase 2: Start backend ───────────────────────────────────
    console.log('[Phase 2] Starting backend server...');
    serverProc = spawn('npx', ['tsx', 'server/index.ts'], {
      env: { ...process.env, PORT: String(BACKEND_PORT) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let serverOutput = '';
    serverProc.stdout.on('data', (d) => { serverOutput += d.toString(); });
    serverProc.stderr.on('data', (d) => { serverOutput += d.toString(); });

    try {
      await waitForServer(`http://localhost:${BACKEND_PORT}/api/health`);
      console.log('  ✓ Backend is ready.\n');
    } catch (err) {
      console.error('  ✗ Backend failed to start.');
      console.error('  Server output:', serverOutput);
      results['Backend Startup'] = 'FAIL';
      return;
    }
    results['Backend Startup'] = 'PASS';

    // ── Phase 3: Existing session tests ──────────────────────────
    const sessionCode = await runScript('Phase 3: Existing Session Tests', 'node', ['scripts/test-session.mjs']);
    results['Session Tests (existing)'] = sessionCode === 0 ? 'PASS' : 'FAIL';

    // Small delay to avoid rate limiting
    await sleep(2000);

    // ── Phase 4: Comprehensive backend tests ─────────────────────
    const backendCode = await runScript('Phase 4: Comprehensive Backend E2E Tests', 'node', ['scripts/test-e2e-backend.mjs']);
    results['Backend E2E Tests (comprehensive)'] = backendCode === 0 ? 'PASS' : 'FAIL';

    // ── Phase 5: Start frontend ──────────────────────────────────
    console.log('\n[Phase 5] Starting frontend dev server...');
    viteProc = spawn('npx', ['vite', '--host', '0.0.0.0'], {
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let viteOutput = '';
    viteProc.stdout.on('data', (d) => { viteOutput += d.toString(); });
    viteProc.stderr.on('data', (d) => { viteOutput += d.toString(); });

    try {
      await waitForServer(`http://localhost:${FRONTEND_PORT}`, 30, 1000);
      console.log('  ✓ Frontend is ready.\n');
      results['Frontend Startup'] = 'PASS';
    } catch {
      console.error('  ✗ Frontend failed to start.');
      console.error('  Vite output:', viteOutput);
      results['Frontend Startup'] = 'FAIL';
      // Skip Puppeteer tests but continue to report
      results['Puppeteer Tests'] = 'SKIP (frontend not running)';
    }

    // ── Phase 6: Puppeteer playtests ─────────────────────────────
    if (results['Frontend Startup'] === 'PASS') {
      // Set Puppeteer to use Playwright's Chromium if available
      const chromePath = '/root/.cache/ms-playwright/chromium-1194/chrome-linux/chrome';
      if (existsSync(chromePath)) {
        process.env.PUPPETEER_EXECUTABLE_PATH = chromePath;
      }

      const puppeteerCode = await runScript('Phase 6: Puppeteer Playtests', 'node', ['scripts/playtest.mjs']);
      results['Puppeteer Tests'] = puppeteerCode === 0 ? 'PASS' : 'FAIL';
    }

  } finally {
    // ── Cleanup ──────────────────────────────────────────────────
    console.log('\n[Cleanup] Shutting down servers...');
    if (serverProc) { serverProc.kill('SIGTERM'); console.log('  Backend stopped.'); }
    if (viteProc) { viteProc.kill('SIGTERM'); console.log('  Frontend stopped.'); }

    // Give processes time to clean up
    await sleep(1000);

    // ── Summary ──────────────────────────────────────────────────
    console.log('\n╔══════════════════════════════════════════════════╗');
    console.log('║              AUDIT SUMMARY                       ║');
    console.log('╚══════════════════════════════════════════════════╝\n');

    let anyFailed = false;
    for (const [test, result] of Object.entries(results)) {
      const icon = result === 'PASS' ? '✓' : result === 'FAIL' ? '✗' : '⊘';
      console.log(`  ${icon} ${test}: ${result}`);
      if (result === 'FAIL') anyFailed = true;
    }

    console.log(`\n${'─'.repeat(50)}`);
    if (anyFailed) {
      console.log('  Some tests FAILED. See details above.');
      process.exitCode = 1;
    } else {
      console.log('  All tests PASSED!');
    }
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
