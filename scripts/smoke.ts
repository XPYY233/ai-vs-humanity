import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

// Run on the cloud runner after deployment, without starting local services.
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.clock.install();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const target = new URL(process.env.PLAYGROUND_URL ?? 'https://xpyy233.github.io/ai-vs-humanity/');
  target.searchParams.set('seed', 'production-smoke');
  await page.goto(target.toString(), { waitUntil: 'networkidle' });
  await page.locator('#start-game').waitFor();
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 60_000));
  await mkdir('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/online-homepage.png', fullPage: true });
  await page.locator('#start-game').click();
  await page.clock.runFor(100);
  await page.locator('#arena canvas').waitFor();
  await page.clock.runFor(250);
  await page.locator('.accessible-controls summary').click();
  const food = page.locator('#food-controls button:not([disabled])').filter({ hasText: /^[1-4] ·/ }).first();
  await food.click();
  await page.clock.runFor(450);
  await page.locator('#chew-button:not([disabled])').waitFor();
  await page.keyboard.down('Space');
  await page.clock.runFor(750);
  await page.keyboard.up('Space');
  await page.clock.runFor(150);
  assert.notEqual(await page.locator('#human-score').textContent(), '¥0', 'Online swallowing must score');
  await page.screenshot({ path: 'artifacts/online-game.png', fullPage: true });
  await page.locator('#pause-game').click();
  const paused = await page.locator('#timer').textContent();
  await page.clock.fastForward(1200);
  assert.equal(await page.locator('#timer').textContent(), paused, 'Pause must stop the clock');
  await page.locator('#resume-game').click();
  await page.clock.runFor(1300);
  assert.notEqual(await page.locator('#timer').textContent(), paused, 'Resume must restart the clock');
  assert.deepEqual(errors, [], 'Online game must have no uncaught browser errors');
  console.log('Deployed game verified: loading, food, swallow, score, pause and resume.');
} finally {
  await browser.close();
}
