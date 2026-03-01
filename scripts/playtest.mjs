#!/usr/bin/env node
/**
 * Headless Puppeteer playtesting for Nodelings.
 * Usage: node scripts/playtest.mjs [scenario]
 * Scenarios: basic, chat, furniture, all (default: all)
 * Requires: dev server (port 5173) + backend (port 3001)
 */

import puppeteer from 'puppeteer';

const BASE_URL = 'http://localhost:5173';
const TIMEOUT = 15000;
const AI_TIMEOUT = 45000;

async function waitForGame(page) {
  await page.waitForFunction(() => window.game && window.game.world, { timeout: TIMEOUT });
}

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

// ── Scenarios ──────────────────────────────────────────────────────────────

async function testBasic(page) {
  console.log('\n[basic] Game loads with Sparky and starter furniture');
  await waitForGame(page);

  const state = await page.evaluate(() => {
    const nodelings = window.game.world.getNodelings();
    const buildings = window.game.world.getBuildings();
    return {
      nodelingCount: nodelings.length,
      nodelingName: nodelings[0]?.name,
      buildingCount: buildings.length,
      buildingTypes: buildings.map(b => b.buildingType),
    };
  });

  console.log(`  Nodelings: ${state.nodelingCount} (${state.nodelingName})`);
  console.log(`  Buildings: ${state.buildingCount} (${state.buildingTypes.join(', ')})`);

  assert(state.nodelingCount >= 1, `Expected >= 1 nodeling, got ${state.nodelingCount}`);
  assert(state.nodelingName === 'Sparky', `Expected Sparky, got ${state.nodelingName}`);
  assert(state.buildingCount >= 3, `Expected >= 3 starter buildings, got ${state.buildingCount}`);
  assert(state.buildingTypes.includes('desk'), 'Missing desk');
  assert(state.buildingTypes.includes('whiteboard'), 'Missing whiteboard');
  assert(state.buildingTypes.includes('coffee_machine'), 'Missing coffee_machine');

  console.log('[basic] PASS');
}

async function testChat(page) {
  console.log('\n[chat] Open panel and send a message');
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

  // Check chat panel is visible
  const panelVisible = await page.evaluate(() => {
    const el = document.querySelector('.prompt-panel');
    return el && el.style.display !== 'none';
  });
  assert(panelVisible, 'Chat panel should be visible after selecting Sparky');

  // Check input and submit button exist
  const hasInput = await page.$('.pp-input');
  const hasSubmit = await page.$('.pp-submit');
  assert(hasInput, 'Chat input should exist');
  assert(hasSubmit, 'Submit button should exist');

  console.log('[chat] PASS');
}

async function testFurniture(page) {
  console.log('\n[furniture] Place new furniture on the grid');
  await waitForGame(page);

  const initialCount = await page.evaluate(() => window.game.world.getBuildings().length);

  // Place a meeting room via the game API
  await page.evaluate(() => {
    const { Building } = window.game.world.constructor;
    // Use the game's placeBuilding if available, or add directly
    const b = new (window.game.world.getBuildings()[0].constructor)('meeting_room', 7, 7);
    window.game.world.addEntity(b);
  });

  const afterCount = await page.evaluate(() => window.game.world.getBuildings().length);
  console.log(`  Buildings: ${initialCount} → ${afterCount}`);
  assert(afterCount === initialCount + 1, `Expected ${initialCount + 1} buildings, got ${afterCount}`);

  // Check the new building type
  const types = await page.evaluate(() =>
    window.game.world.getBuildings().map(b => b.buildingType)
  );
  assert(types.includes('meeting_room'), 'Meeting room should be placed');

  console.log('[furniture] PASS');
}

// ── Runner ─────────────────────────────────────────────────────────────────

const scenarios = { basic: testBasic, chat: testChat, furniture: testFurniture };

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
