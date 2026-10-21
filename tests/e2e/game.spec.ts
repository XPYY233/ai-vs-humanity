import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { BuffetEngine, replayGame } from '../../src/game/engine';
import type { ReplayData } from '../../src/game/types';

const SEED = 'e2e-buffet';
const FIRST_MEAL = new BuffetEngine(SEED, { aiEnabled: false }).state.foods.find((food) => food.slot === 1)!;

async function openGame(page: Page, evidence?: { home: string; game: string }, trackBlurListeners = false): Promise<void> {
  if (trackBlurListeners) {
    await page.addInitScript(() => {
      const bubbling = new Set<EventListenerOrEventListenerObject>();
      const capturing = new Set<EventListenerOrEventListenerObject>();
      const originalAdd = window.addEventListener;
      const originalRemove = window.removeEventListener;
      const listenersFor = (options?: boolean | EventListenerOptions) =>
        (typeof options === 'boolean' ? options : options?.capture) ? capturing : bubbling;

      // Preserve native listener identity, options, receiver, and return value.
      // The app's blur listeners are ordinary add/remove registrations.
      window.addEventListener = function (this: Window, type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions): void {
        Reflect.apply(originalAdd, this, [type, listener, options]);
        if (this === window && type === 'blur' && listener) listenersFor(options).add(listener);
      } as typeof window.addEventListener;
      window.removeEventListener = function (this: Window, type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | EventListenerOptions): void {
        Reflect.apply(originalRemove, this, [type, listener, options]);
        if (this === window && type === 'blur' && listener) listenersFor(options).delete(listener);
      } as typeof window.removeEventListener;
      Object.defineProperty(window, '__buffetBlurListenerCount', {
        value: () => bubbling.size + capturing.size,
        writable: false,
        configurable: false,
      });
    });
  }
  await page.clock.install({ time: new Date('2026-10-21T12:00:00Z') });
  await page.goto(`/?seed=${SEED}`);
  await expect(page.locator('#start-game')).toBeVisible();
  // Keep slow cloud rendering from adding wall time to a 750 ms gesture.
  // Playwright's own actionability checks retain the original native RAF.
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 60_000));
  if (evidence) await page.screenshot({ path: evidence.home, fullPage: true });
  await page.locator('#start-game').click();
  await page.clock.runFor(80);
  await expect(page.locator('#game-view')).toBeVisible();
  await expect(page.locator('#game-view canvas')).toBeVisible();
  if (evidence) await page.screenshot({ path: evidence.game, fullPage: true });
}

async function blurListenerCount(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as Window & {
    readonly __buffetBlurListenerCount: () => number;
  }).__buffetBlurListenerCount());
}

async function holdChew(page: Page, milliseconds: number): Promise<void> {
  const button = page.locator('#chew-button');
  await button.scrollIntoViewIfNeeded();
  const bounds = await button.boundingBox();
  if (!bounds) throw new Error('Chew control is not visible');
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.clock.runFor(milliseconds);
  await page.mouse.up();
}

test('food controls, green-window swallowing, pause, and background pause work', async ({ page, isMobile }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openGame(page);

  // Check an ordinary meal through the public UI; the bot competes for the table.
  expect(FIRST_MEAL.effect).toBeNull();
  const meal = page.locator('#food-controls button[data-slot="1"]');
  await expect(meal).toBeEnabled();
  await expect(meal).toHaveAttribute('aria-label', `拿取 ${FIRST_MEAL.label}`);
  if (isMobile) {
    const canvas = page.locator('#game-view canvas');
    await canvas.scrollIntoViewIfNeeded();
    const bounds = await canvas.boundingBox();
    if (!bounds) throw new Error('Arena canvas is not visible');
    // A real touch tap picks up then cancels outside the mouth. Capture must
    // release cleanly so the next native touch can use the food controls.
    await page.touchscreen.tap(bounds.x + bounds.width / 2, bounds.y + 185 / 620 * bounds.height);
    await page.clock.runFor(60);
    await expect(page.locator('#action-hint')).toContainText('先把菜拖进');
    await page.locator('.accessible-controls summary').tap();
    await meal.tap();
  }
  else await page.keyboard.press('2');
  await page.clock.runFor(450);
  await expect(page.locator('#chew-button')).toBeEnabled();
  await holdChew(page, 750);
  await expect(page.locator('#human-score')).toHaveText(`¥${FIRST_MEAL.value}`);

  await page.locator('#pause-game').click();
  await expect(page.locator('#pause-dialog')).toBeVisible();
  const pausedTimer = await page.locator('#timer').textContent();
  await page.clock.runFor(5_000);
  await expect(page.locator('#timer')).toHaveText(pausedTimer ?? '');
  if (isMobile) await page.locator('#resume-game').tap();
  else await page.keyboard.press('p');
  await expect(page.locator('#pause-dialog')).not.toBeVisible();
  await page.clock.runFor(1_100);
  await expect(page.locator('#timer')).not.toHaveText(pausedTimer ?? '');

  // Simulate the browser's visibility lifecycle, without app test hooks.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('#pause-dialog')).toBeVisible();
  const backgroundTimer = await page.locator('#timer').textContent();
  await page.clock.runFor(3_000);
  await expect(page.locator('#timer')).toHaveText(backgroundTimer ?? '');
  await page.evaluate(() => {
    delete (document as unknown as Record<string, unknown>).hidden;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.locator('#resume-game').click();
  await expect(page.locator('#pause-dialog')).not.toBeVisible();
  expect(errors).toEqual([]);
});

test('canvas drag and mouth hold use the same scoring rules', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openGame(page);
  const canvas = page.locator('#game-view canvas');
  await canvas.scrollIntoViewIfNeeded();
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error('Arena canvas is not visible');
  const toPage = (x: number, y: number) => ({
    x: bounds.x + x / 800 * bounds.width,
    y: bounds.y + y / 620 * bounds.height,
  });
  const food = toPage(400, 185);
  const mouth = toPage(190, 470);
  await page.mouse.move(food.x, food.y);
  await page.mouse.down();
  await page.mouse.move(mouth.x, mouth.y, { steps: 12 });
  await page.clock.runFor(450);
  await page.mouse.up();
  await expect(page.locator('#chew-button')).toBeEnabled();
  await page.mouse.down();
  await page.clock.runFor(750);
  await page.mouse.up();
  await expect(page.locator('#human-score')).toHaveText(`¥${FIRST_MEAL.value}`);
  expect(errors).toEqual([]);
});

test('a full match reaches all stages, exports real results, shares a seed, and restarts', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openGame(page, { home: testInfo.outputPath('homepage.png'), game: testInfo.outputPath('game.png') }, true);
  const firstRoundBlurListeners = await blurListenerCount(page);
  expect(firstRoundBlurListeners).toBeGreaterThan(0);

  // Skip unattended animation frames, then render each clock checkpoint.
  await page.clock.fastForward(31_000);
  await page.clock.runFor(80);
  await expect(page.locator('#stage-label')).toContainText('餐厅开始反击');
  await page.clock.fastForward(30_000);
  await page.clock.runFor(80);
  await expect(page.locator('#stage-label')).toContainText('碳硅文明决战');
  await page.clock.fastForward(35_000);
  await page.clock.runFor(80);
  await expect(page.locator('#result-dialog')).toBeVisible();
  await expect(page.locator('#timer')).toHaveText('0');
  await expect(page.locator('#result-dialog')).toContainText('老板');
  await page.screenshot({ path: testInfo.outputPath('result.png'), fullPage: true });

  const pngPromise = page.waitForEvent('download');
  await page.locator('#download-report').click();
  const png = await pngPromise;
  expect(png.suggestedFilename()).toMatch(/\.png$/);
  const pngPath = await png.path();
  if (!pngPath) throw new Error('PNG download is missing');
  const pngBytes = await readFile(pngPath);
  expect([...pngBytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(pngBytes.readUInt32BE(16)).toBe(1080);
  expect(pngBytes.readUInt32BE(20)).toBe(1360);

  const replayPromise = page.waitForEvent('download');
  await page.locator('#download-replay').click();
  const recording = await replayPromise;
  expect(recording.suggestedFilename()).toMatch(/\.json$/);
  const replayPath = await recording.path();
  if (!replayPath) throw new Error('Replay download is missing');
  const replay = JSON.parse(await readFile(replayPath, 'utf8')) as ReplayData;
  expect(replay.seed).toBe(SEED);
  expect(replay.finalTick).toBe(4_500);
  expect(replay.actions.some(({ action }) => action.actor === 'ai')).toBe(true);
  const reproduced = replayGame(replay);
  expect(reproduced.phase).toBe('finished');
  expect(reproduced.result).not.toBeNull();
  await expect(page.locator('#human-score')).toHaveText(`¥${reproduced.result?.human.score}`);
  await expect(page.locator('#ai-score')).toHaveText(`¥${reproduced.result?.ai.score}`);
  await expect(page.locator('#result-stats strong')).toHaveText([
    `¥${reproduced.result?.human.score}`, `¥${reproduced.result?.ai.score}`,
  ]);

  await page.locator('#share-challenge').click();
  await expect(page.locator('#share-link')).toHaveValue(new URL(`?seed=${SEED}`, page.url()).toString());

  await page.locator('#play-again').click();
  await page.clock.runFor(80);
  await expect(page.locator('#result-dialog')).not.toBeVisible();
  await expect(page.locator('#game-view canvas')).toHaveCount(1);
  await expect.poll(() => blurListenerCount(page)).toBe(firstRoundBlurListeners);
  await expect(page.locator('#timer')).toHaveText('90');
  await expect(page.locator('#human-score')).toHaveText('¥0');
  await expect(page.locator('#ai-score')).toHaveText('¥0');
  await expect(page).toHaveURL(new RegExp(`seed=${SEED}`));
  for (let restart = 0; restart < 2; restart += 1) {
    await page.locator('#pause-game').click();
    await page.locator('#back-home').click();
    await expect(page.locator('#best-record')).toContainText('¥0');
    await page.locator('#start-game').click();
    await page.clock.runFor(80);
    await expect(page.locator('#game-view canvas')).toHaveCount(1);
    await expect.poll(() => blurListenerCount(page)).toBe(firstRoundBlurListeners);
    await expect(page.locator('#human-score')).toHaveText('¥0');
  }
  expect(errors).toEqual([]);
});

test('pausing a partial chew and cancelling a long drag cannot trap the player', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openGame(page);
  await page.keyboard.press('2');
  await page.clock.runFor(450);
  await page.keyboard.down('Space');
  await page.clock.runFor(300);
  await page.keyboard.press('p');
  await page.keyboard.up('Space');
  await expect(page.locator('#pause-dialog')).toBeVisible();
  await page.clock.runFor(1_500);
  await page.keyboard.press('p');
  await page.keyboard.down('Space');
  await page.clock.runFor(400);
  await page.keyboard.up('Space');
  await expect(page.locator('#human-score')).toHaveText(`¥${FIRST_MEAL.value}`);

  await page.locator('#pause-game').click();
  await page.locator('#back-home').click();
  await page.locator('#start-game').click();
  await page.clock.runFor(80);
  const canvas = page.locator('#game-view canvas');
  await canvas.scrollIntoViewIfNeeded();
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error('Arena canvas is not visible');
  const x = bounds.x + 400 / 800 * bounds.width;
  const y = bounds.y + 185 / 620 * bounds.height;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 30, y + 15);
  await page.clock.runFor(1_500); // The reserved slot has had time to refill.
  await page.keyboard.press('p');
  await page.clock.runFor(100);
  await page.mouse.up();
  await expect(page.locator('#pause-dialog')).toBeVisible();
  await page.keyboard.press('p');
  await page.clock.runFor(2_200);
  await expect(page.locator('#action-hint')).toContainText('先把菜拖进');
  await expect(page.locator('#human-score')).toHaveText('¥0');
  await expect(page.locator('#chew-button')).toBeDisabled();
  expect(errors).toEqual([]);
});
