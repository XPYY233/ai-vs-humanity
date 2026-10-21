import { describe, expect, it } from 'vitest';
import { ENGINE_VERSION, GAME_CONFIG } from '../src/game/config';
import { BuffetEngine, replayGame } from '../src/game/engine';
import type { ActorId, Food } from '../src/game/types';

function game(seed = 'buffet-test'): BuffetEngine {
  const engine = new BuffetEngine(seed, { aiEnabled: false });
  engine.start();
  return engine;
}

function ordinary(engine: BuffetEngine): Food {
  const food = engine.state.foods.find((item) => !item.effect);
  if (!food) throw new Error('Test menu has no ordinary food');
  return food;
}

function deliver(engine: BuffetEngine, food: Food, actor: ActorId = 'human'): void {
  expect(engine.dispatch({ actor, type: 'grab', foodId: food.id })).toBe(true);
  expect(engine.dispatch({ actor, type: 'deliver' })).toBe(true);
  engine.advance(GAME_CONFIG.carryMs);
}

function eat(engine: BuffetEngine, food: Food, actor: ActorId = 'human'): void {
  deliver(engine, food, actor);
  expect(engine.dispatch({ actor, type: 'chew-start' })).toBe(true);
  engine.advance(GAME_CONFIG.chewGreenStartMs);
  expect(engine.dispatch({ actor, type: 'chew-release' })).toBe(true);
}

describe('shared buffet rules', () => {
  it('requires start, reserves shared food and enforces the minimum carry time', () => {
    const engine = new BuffetEngine('carry', { aiEnabled: false });
    const food = ordinary(engine);
    expect(engine.dispatch({ actor: 'human', type: 'grab', foodId: food.id })).toBe(false);
    engine.advance(90_000);
    expect(engine.state.tick).toBe(0);
    engine.start();
    expect(engine.dispatch({ actor: 'human', type: 'grab', foodId: food.id })).toBe(true);
    expect(engine.dispatch({ actor: 'ai', type: 'grab', foodId: food.id })).toBe(false);
    expect(engine.state.foods).not.toContainEqual(food);
    expect(engine.dispatch({ actor: 'human', type: 'deliver' })).toBe(true);
    engine.advance(380);
    expect(engine.state.actors.human.phase).toBe('carrying');
    expect(engine.dispatch({ actor: 'human', type: 'chew-start' })).toBe(false);
    engine.advance(20);
    expect(engine.state.actors.human.phase).toBe('ready');
  });

  it.each([600, 700, 900])('scores a swallow at %i ms and adds the declared fullness', (holdMs) => {
    const engine = game();
    const food = ordinary(engine);
    deliver(engine, food);
    engine.dispatch({ actor: 'human', type: 'chew-start' });
    engine.advance(holdMs);
    expect(engine.dispatch({ actor: 'human', type: 'chew-release' })).toBe(true);
    expect(engine.state.actors.human).toMatchObject({ score: food.value, portions: 1, fullness: food.fullness, phase: 'idle', food: null });
  });

  it.each([580, 920])('chokes for one second after an invalid %i ms swallow, then permits retry', (holdMs) => {
    const engine = game();
    const food = ordinary(engine);
    deliver(engine, food);
    engine.dispatch({ actor: 'human', type: 'chew-start' });
    engine.advance(holdMs);
    engine.dispatch({ actor: 'human', type: 'chew-release' });
    expect(engine.state.actors.human).toMatchObject({ phase: 'choked', score: 0, portions: 0, fullness: 0, phaseRemainingMs: 1_000, food });
    engine.advance(980);
    expect(engine.state.actors.human.phase).toBe('choked');
    engine.advance(20);
    expect(engine.state.actors.human.phase).toBe('ready');
    engine.dispatch({ actor: 'human', type: 'chew-start' });
    engine.advance(600);
    engine.dispatch({ actor: 'human', type: 'chew-release' });
    expect(engine.state.actors.human.score).toBe(food.value);
  });

  it('automatically chokes at the maximum hold duration', () => {
    const engine = game();
    deliver(engine, ordinary(engine));
    engine.dispatch({ actor: 'human', type: 'chew-start' });
    engine.advance(1_200);
    expect(engine.state.actors.human).toMatchObject({ phase: 'choked', phaseRemainingMs: 1_000, score: 0 });
    expect(engine.dispatch({ actor: 'human', type: 'chew-release' })).toBe(false);
  });

  it('fills the stomach, burps for three seconds, and releases exactly half', () => {
    const engine = game('burping');
    let score = 0;
    let portions = 0;
    while (engine.state.actors.human.phase !== 'burping') {
      let food = engine.state.foods.filter((item) => !item.effect).sort((a, b) => b.fullness - a.fullness)[0];
      if (!food) {
        engine.advance(1_100);
        food = ordinary(engine);
      }
      eat(engine, food);
      score += food.value;
      portions += 1;
      if (portions > 25) throw new Error('Stomach never became full');
    }
    expect(engine.state.actors.human).toMatchObject({ fullness: 100, score, portions, phaseRemainingMs: 3_000 });
    expect(engine.dispatch({ actor: 'human', type: 'grab', foodId: ordinary(engine).id })).toBe(false);
    engine.advance(2_980);
    expect(engine.state.actors.human.phase).toBe('burping');
    engine.advance(20);
    expect(engine.state.actors.human).toMatchObject({ phase: 'idle', fullness: 50 });
  });

  it('returns a cancelled reservation and safely discards it when the table has refilled', () => {
    const engine = game();
    const food = ordinary(engine);
    engine.dispatch({ actor: 'human', type: 'grab', foodId: food.id });
    expect(engine.dispatch({ actor: 'human', type: 'cancel' })).toBe(true);
    expect(engine.state.foods).toHaveLength(6);
    expect(engine.state.foods).toContainEqual(food);
    engine.dispatch({ actor: 'human', type: 'grab', foodId: food.id });
    engine.advance(1_100);
    expect(engine.state.foods).toHaveLength(6);
    expect(engine.dispatch({ actor: 'human', type: 'cancel' })).toBe(true);
    expect(engine.state.actors.human).toMatchObject({ food: null, phase: 'idle', score: 0, portions: 0, fullness: 0 });
    expect(engine.state.foods).toHaveLength(6);
    expect(engine.state.foods.some((item) => item.id === food.id)).toBe(false);
    expect(engine.dispatch({ actor: 'human', type: 'grab', foodId: ordinary(engine).id })).toBe(true);
    expect(replayGame(engine.getReplay())).toEqual(engine.state);
  });

  it('rejects unknown and out-of-order actions without recording them', () => {
    const engine = game();
    expect(engine.dispatch({ actor: 'human', type: 'deliver' })).toBe(false);
    expect(engine.dispatch({ actor: 'ai', type: 'chew-release' })).toBe(false);
    expect(engine.dispatch({ actor: 'human', type: 'grab', foodId: 'not-on-the-menu' })).toBe(false);
    expect(engine.getReplay().actions).toEqual([]);
  });
});

describe('contested tools', () => {
  it('can cancel food held when stunned without cancelling the two-second penalty', () => {
    const engine = game();
    const food = ordinary(engine);
    engine.dispatch({ actor: 'human', type: 'grab', foodId: food.id });
    const sauce = engine.state.foods.find((item) => item.effect === 'sauce')!;
    deliver(engine, sauce, 'ai');
    expect(engine.state.actors.human).toMatchObject({ phase: 'stunned', food, phaseRemainingMs: 2_000 });
    expect(engine.dispatch({ actor: 'human', type: 'cancel' })).toBe(true);
    expect(engine.state.actors.human).toMatchObject({ phase: 'stunned', food: null, phaseRemainingMs: 2_000, score: 0 });
    expect(engine.state.foods).toContainEqual(food);
    engine.advance(2_000);
    expect(engine.state.actors.human.phase).toBe('idle');
    expect(engine.dispatch({ actor: 'human', type: 'grab', foodId: food.id })).toBe(true);
    expect(replayGame(engine.getReplay())).toEqual(engine.state);
  });

  it('sauce interrupts a chewing opponent for exactly two seconds, preserving their food and progress', () => {
    const engine = game();
    const food = ordinary(engine);
    deliver(engine, food, 'ai');
    engine.dispatch({ actor: 'ai', type: 'chew-start' });
    const sauce = engine.state.foods.find((item) => item.effect === 'sauce')!;
    deliver(engine, sauce);
    expect(engine.state.actors.ai).toMatchObject({ phase: 'stunned', chewMs: 400, food, phaseRemainingMs: 2_000 });
    expect(engine.state.actors.human).toMatchObject({ score: 0, portions: 0, fullness: 0, food: null, phase: 'idle' });
    engine.advance(1_980);
    expect(engine.state.actors.ai.phase).toBe('stunned');
    expect(engine.dispatch({ actor: 'ai', type: 'chew-release' })).toBe(false);
    engine.advance(20);
    expect(engine.state.actors.ai).toMatchObject({ phase: 'chewing', chewMs: 400 });
    engine.advance(200);
    engine.dispatch({ actor: 'ai', type: 'chew-release' });
    expect(engine.state.actors.ai.score).toBe(food.value);
  });

  it('expansion empties the stomach and costs two seconds of reading, without scoring', () => {
    const engine = game();
    eat(engine, ordinary(engine));
    const before = { ...engine.state.actors.human };
    const expansion = engine.state.foods.find((item) => item.effect === 'expansion')!;
    deliver(engine, expansion);
    expect(engine.state.actors.human).toMatchObject({ phase: 'reading', phaseRemainingMs: 2_000, fullness: 0, score: before.score, portions: before.portions });
    engine.advance(2_000);
    expect(engine.state.actors.human.phase).toBe('idle');
  });
});

describe('clock, stages and results', () => {
  it('changes food skins at 30/60 seconds without changing value, fullness or identity', () => {
    const engine = game();
    const original = structuredClone(engine.state.foods);
    engine.advance(29_980);
    expect(engine.state.stage).toBe(0);
    engine.advance(20);
    expect(engine.state.stage).toBe(1);
    engine.advance(30_000);
    expect(engine.state.stage).toBe(2);
    for (const food of original) {
      const current = engine.state.foods.find((item) => item.id === food.id)!;
      expect(current.value).toBe(food.value);
      expect(current.fullness).toBe(food.fullness);
      if (!food.effect) expect(current.label).not.toBe(food.label);
    }
  });

  it('pauses food, actors, AI and clock and does not accept paused inputs', () => {
    const engine = new BuffetEngine('pause-ai');
    engine.start();
    const food = ordinary(engine);
    deliver(engine, food);
    engine.dispatch({ actor: 'human', type: 'chew-start' });
    engine.advance(300);
    engine.setPaused(true);
    const frozen = structuredClone(engine.state);
    engine.advance(60_000);
    expect(engine.dispatch({ actor: 'human', type: 'chew-release' })).toBe(false);
    expect(engine.state).toEqual(frozen);
    engine.setPaused(false);
    engine.advance(300);
    engine.dispatch({ actor: 'human', type: 'chew-release' });
    expect(engine.state.actors.human.score).toBe(food.value);
  });

  it('finishes exactly at 90 seconds even for a large advance and reports real speed', () => {
    const engine = game();
    const food = ordinary(engine);
    eat(engine, food);
    engine.advance(200_000);
    expect(engine.state).toMatchObject({ phase: 'finished', tick: 4_500, elapsedMs: 90_000 });
    expect(engine.state.result).toMatchObject({ winner: 'human', human: { score: food.value, portions: 1, portionsPerMinute: 0.7 }, ai: { score: 0, portions: 0 } });
    const frozen = structuredClone(engine.state);
    engine.advance(90_000);
    engine.start();
    expect(engine.dispatch({ actor: 'human', type: 'chew-start' })).toBe(false);
    expect(engine.state).toEqual(frozen);
  });

  it('reports a complete tie as a draw', () => {
    const engine = game();
    engine.advance(90_000);
    expect(engine.state.result).toMatchObject({ winner: 'draw', human: { score: 0, portions: 0 }, ai: { score: 0, portions: 0 } });
  });

  it('breaks equal prices using swallowed portions', () => {
    let engine: BuffetEngine | undefined;
    for (let seed = 0; seed < 1_000; seed += 1) {
      const candidate = game(`tie-${seed}`);
      if (candidate.state.foods.some((food) => food.kind === 'steak') && candidate.state.foods.filter((food) => food.kind === 'sushi').length >= 2) {
        engine = candidate;
        break;
      }
    }
    expect(engine).toBeDefined();
    const steak = engine!.state.foods.find((food) => food.kind === 'steak')!;
    const sushi = engine!.state.foods.filter((food) => food.kind === 'sushi').slice(0, 2);
    eat(engine!, steak, 'human');
    eat(engine!, sushi[0], 'ai');
    eat(engine!, sushi[1], 'ai');
    engine!.advance(90_000);
    expect(engine!.state.result).toMatchObject({ winner: 'ai', human: { score: 90, portions: 1 }, ai: { score: 90, portions: 2 } });
  });
});

describe('seeded local policy and portable replay', () => {
  it('makes the same seeded game independent of render-frame sizes', () => {
    const first = new BuffetEngine('repeatable-menu');
    const second = new BuffetEngine('repeatable-menu');
    expect(first.state).toEqual(second.state);
    first.start();
    second.start();
    first.advance(90_000);
    for (let elapsed = 0; elapsed < 90_000; elapsed += 75) second.advance(75);
    expect(second.state).toEqual(first.state);
    expect(first.state.actors.ai.portions).toBeGreaterThan(0);
    expect(first.getReplay().actions.some((entry) => entry.action.actor === 'ai')).toBe(true);
    expect(new BuffetEngine('different-menu').state.foods).not.toEqual(first.state.foods);
  });

  it('uses an independent refill stream for each table slot', () => {
    const first = game('slot-stream');
    const second = game('slot-stream');
    const slot0 = first.state.foods.find((food) => food.slot === 0)!;
    const slot1 = first.state.foods.find((food) => food.slot === 1)!;
    first.dispatch({ actor: 'human', type: 'grab', foodId: slot0.id });
    first.dispatch({ actor: 'ai', type: 'grab', foodId: slot1.id });
    second.dispatch({ actor: 'human', type: 'grab', foodId: slot1.id });
    first.advance(1_100);
    second.advance(1_100);
    const a = first.state.foods.find((food) => food.slot === 1)!;
    const b = second.state.foods.find((food) => food.slot === 1)!;
    expect(a.kind).toBe(b.kind);
    expect(a.value).toBe(b.value);
  });

  it('recreates the complete final state from seed and accepted human/AI inputs', () => {
    const engine = new BuffetEngine('portable-replay');
    engine.start();
    for (let tick = 0; tick < 250; tick += 1) {
      const actor = engine.state.actors.human;
      if (actor.phase === 'idle') {
        const food = engine.state.foods.find((item) => !item.effect);
        if (food) engine.dispatch({ actor: 'human', type: 'grab', foodId: food.id });
      } else if (actor.phase === 'carrying' && !actor.delivered) {
        engine.dispatch({ actor: 'human', type: 'deliver' });
      } else if (actor.phase === 'ready') {
        engine.dispatch({ actor: 'human', type: 'chew-start' });
      } else if (actor.phase === 'chewing' && actor.chewMs >= 700) {
        engine.dispatch({ actor: 'human', type: 'chew-release' });
      }
      engine.advance(20);
    }
    engine.setPaused(true);
    engine.advance(20_000);
    engine.setPaused(false);
    engine.advance(90_000);
    const portable = JSON.parse(JSON.stringify(engine.getReplay()));
    expect(portable.engineVersion).toBe(ENGINE_VERSION);
    expect(replayGame(portable)).toEqual(engine.state);
  });

  it('also replays a paused in-progress game and a game that has not started', () => {
    const unstarted = new BuffetEngine('not-started');
    expect(replayGame(unstarted.getReplay())).toEqual(unstarted.state);
    const engine = game('paused-replay');
    eat(engine, ordinary(engine));
    engine.setPaused(true);
    expect(replayGame(engine.getReplay())).toEqual(engine.state);
  });

  it('rejects incompatible or impossible recordings', () => {
    const replay = game().getReplay();
    expect(() => replayGame({ ...replay, engineVersion: 'future' })).toThrow();
    expect(() => replayGame({ ...replay, finalTick: -1 })).toThrow();
    expect(() => replayGame({ ...replay, actions: [{ tick: 0, action: { actor: 'human', type: 'chew-release' } }] })).toThrow();
  });
});
