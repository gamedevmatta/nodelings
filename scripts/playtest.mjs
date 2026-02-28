#!/usr/bin/env node
/**
 * Headless Puppeteer playtesting for Nodelings.
 * Usage: node scripts/playtest.mjs [scenario]
 * Scenarios: basic, conversation, build, all (default: all)
 * Requires: dev server (port 5173) + backend (port 3001)
 */

import puppeteer from 'puppeteer';

const BASE_URL = 'http://localhost:5173';
const TIMEOUT = 15000;
const AI_TIMEOUT = 45000;

async function waitForGame(page) {
  await page.waitForFunction(() => window.game && window.game.world, { timeout: TIMEOUT });
}

async function waitForReply(page) {
  await page.waitForFunction(() => {
    const s = document.querySelector('.pp-status');
    return !s || !s.classList.contains('thinking');
  }, { timeout: AI_TIMEOUT });
}

async function getState(page) {
  return page.evaluate(() => {
    const msgs = document.querySelectorAll('.pp-msg');
    const opts = document.querySelectorAll('.pp-option-pill');
    const build = document.querySelector('.pp-build-row');
    const plan = document.querySelector('.pp-plan-summary');
    return {
      msgCount: msgs.length,
      lastMsg: msgs.length > 0 ? msgs[msgs.length - 1].textContent : '',
      options: Array.from(opts).map(o => o.textContent),
      hasBuild: !!(build && build.style.display !== 'none'),
      plan: plan ? plan.textContent : null,
    };
  });
}

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

// ── Scenarios ──────────────────────────────────────────────────────────────

async function testBasic(page) {
  console.log('\n[basic] Game loads with Sparky');
  await waitForGame(page);

  const nodelingCount = await page.evaluate(() => window.game.world.getNodelings().length);
  console.log(`  Nodelings: ${nodelingCount}`);
  assert(nodelingCount >= 1, `Expected >= 1 nodeling, got ${nodelingCount}`);
  console.log('[basic] PASS');
}

async function testConversation(page) {
  console.log('\n[conversation] Open panel, send message, get AI response with options');
  await waitForGame(page);

  // Select Sparky
  await page.evaluate(() => {
    const n = window.game.world.getNodelings();
    window.game.selectNodeling(n[0]);
  });
  await page.waitForFunction(() => {
    const el = document.querySelector('.prompt-panel');
    return el && el.style.display !== 'none';
  }, { timeout: 5000 });

  // Verify greeting
  const greeting = await page.evaluate(() => {
    const msgs = document.querySelectorAll('.pp-msg-sparky');
    return msgs.length > 0 ? msgs[0].textContent : null;
  });
  console.log(`  Greeting: "${greeting?.slice(0, 60)}"`);
  assert(greeting && greeting.includes('Sparky'), 'Greeting should mention Sparky');

  // Send a message
  const input = await page.waitForSelector('.pp-input');
  await input.type('Build a webhook to LLM pipeline');
  await page.click('.pp-submit');
  await waitForReply(page);

  const state = await getState(page);
  console.log(`  AI: "${state.lastMsg.slice(0, 80)}"`);
  console.log(`  Options: [${state.options.join(', ')}]`);
  assert(state.msgCount >= 3, `Expected >= 3 messages, got ${state.msgCount}`);
  assert(state.options.length > 0 || state.hasBuild, 'Expected options or build button');
  console.log('[conversation] PASS');
}

async function testBuild(page) {
  console.log('\n[build] Full conversation through to building a workflow');
  await waitForGame(page);

  const initialBuildings = await page.evaluate(() => window.game.world.getBuildings().length);

  // Select Sparky
  await page.evaluate(() => {
    const n = window.game.world.getNodelings();
    window.game.selectNodeling(n[0]);
  });
  await page.waitForFunction(() => {
    const el = document.querySelector('.prompt-panel');
    return el && el.style.display !== 'none';
  }, { timeout: 5000 });

  // Turn 1: initial request
  console.log('  Turn 1: sending request...');
  const input = await page.waitForSelector('.pp-input');
  await input.type('I want to get my Notion tasks and send them to Slack');
  await page.click('.pp-submit');
  await waitForReply(page);

  let state = await getState(page);
  console.log(`  AI: "${state.lastMsg.slice(0, 80)}"`);

  // Click through options until build button appears (max 4 turns)
  for (let turn = 2; turn <= 5; turn++) {
    if (state.hasBuild) break;

    const pills = await page.$$('.pp-option-pill');
    if (pills.length > 0) {
      const txt = await pills[0].evaluate(e => e.textContent);
      console.log(`  Turn ${turn}: clicking "${txt}"`);
      await pills[0].click();
    } else {
      console.log(`  Turn ${turn}: typing to nudge plan`);
      const inp = await page.waitForSelector('.pp-input');
      await inp.click({ clickCount: 3 });
      await inp.type('Sounds good, build it');
      await page.click('.pp-submit');
    }
    await waitForReply(page);
    state = await getState(page);
    console.log(`  AI: "${state.lastMsg.slice(0, 80)}"`);
  }

  assert(state.hasBuild, 'Build button should appear after conversation');
  console.log(`  Plan: ${state.plan}`);

  // Click Build it!
  await page.click('.pp-build-btn');

  // Wait for narration to start ("Starting — heading to...")
  await page.waitForFunction(() => {
    const msgs = document.querySelectorAll('.pp-msg-sparky');
    return Array.from(msgs).some(m => m.textContent.includes('Starting'));
  }, { timeout: 10000 });

  // Wait for workflow to complete — follow-up pills appear ("Run it again")
  await page.waitForFunction(() => {
    const pills = document.querySelectorAll('.pp-option-pill');
    return Array.from(pills).some(p => p.textContent.includes('Run it again'));
  }, { timeout: 90000 });

  const result = await page.evaluate(() => {
    const buildings = window.game.world.getBuildings();
    return { count: buildings.length, types: buildings.map(b => b.buildingType) };
  });

  const placed = result.count - initialBuildings;
  console.log(`  Built: ${result.types.join(' \u2192 ')} (${placed} buildings)`);
  assert(placed >= 2, `Expected >= 2 buildings, got ${placed}`);
  console.log('[build] PASS');
}

// ── Runner ─────────────────────────────────────────────────────────────────

const scenarios = { basic: testBasic, conversation: testConversation, build: testBuild };

async function run() {
  const arg = process.argv[2] || 'all';
  const toRun = arg === 'all' ? Object.keys(scenarios) : [arg];

  let browser;
  try {
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    page.on('console', msg => {
      if (msg.type() === 'error' && !msg.text().includes('favicon'))
        console.log(`  [browser] ${msg.text()}`);
    });

    console.log(`Navigating to ${BASE_URL}...`);
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });

    let passed = 0, failed = 0;
    for (const name of toRun) {
      const fn = scenarios[name];
      if (!fn) { console.error(`Unknown scenario: ${name}`); failed++; continue; }
      try { await fn(page); passed++; }
      catch (err) { console.error(`[${name}] FAIL: ${err.message}`); failed++; }
    }

    console.log(`\n${'='.repeat(40)}`);
    console.log(`Results: ${passed} passed, ${failed} failed`);
    process.exitCode = failed > 0 ? 1 : 0;
  } catch (err) {
    console.error('Fatal:', err.message);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
  }
}

run();
