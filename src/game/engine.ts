import { createRandom, ENGINE_VERSION, FOOD_DEFINITIONS, GAME_CONFIG, skinFood, stageAt } from './config';
import { LocalStrategyPolicy } from './policy';
import type { ActorId, ActorPhase, ActorState, ActorStats, AgentPolicy, Food, GameAction, GameResult, GameState, ReplayData, ReplayEntry } from './types';

const ACTORS: readonly ActorId[] = ['human', 'ai'];
const POLICY_TICKS = GAME_CONFIG.policyIntervalMs / GAME_CONFIG.tickMs;
const LAST_TICK = GAME_CONFIG.durationMs / GAME_CONFIG.tickMs;

interface SuspendedPhase {
  phase: ActorPhase;
  remainingMs: number;
}

function initialActor(): ActorState {
  return { phase: 'idle', food: null, score: 0, portions: 0, fullness: 0, phaseRemainingMs: 0, chewMs: 0, delivered: false };
}

export class BuffetEngine {
  readonly state: GameState;
  private readonly slotRandom: (() => number)[];
  private readonly policy: AgentPolicy | null;
  private readonly actions: ReplayEntry[] = [];
  private readonly refills: (number | null)[] = Array.from({ length: GAME_CONFIG.slots }, () => null);
  private readonly carriedMs: Record<ActorId, number> = { human: 0, ai: 0 };
  private readonly suspended: Record<ActorId, SuspendedPhase | null> = { human: null, ai: null };
  private accumulatorMs = 0;
  private nextFoodId = 1;
  private inStep = false;
  private pendingStuns: ActorId[] = [];

  constructor(seed: string, options: { aiEnabled?: boolean } = {}) {
    this.slotRandom = Array.from({ length: GAME_CONFIG.slots }, (_, slot) => createRandom(`${seed}:menu:${slot}`));
    this.policy = options.aiEnabled === false ? null : new LocalStrategyPolicy(seed);
    this.state = { seed, elapsedMs: 0, tick: 0, phase: 'ready', paused: false, stage: 0, actors: { human: initialActor(), ai: initialActor() }, foods: [], result: null };
    for (let slot = 0; slot < GAME_CONFIG.slots; slot += 1) {
      // Both contested tools are visible in the first course.
      this.spawn(slot, slot === 4 ? 'sauce' : slot === 5 ? 'expansion' : undefined);
    }
  }

  start(): void {
    if (this.state.phase !== 'ready') return;
    this.state.phase = 'playing';
    this.state.paused = false;
  }

  setPaused(paused: boolean): void {
    if (this.state.phase !== 'playing') return;
    this.state.paused = paused;
    this.accumulatorMs = 0;
  }

  advance(deltaMs: number): void {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0 || this.state.phase !== 'playing' || this.state.paused) return;
    this.accumulatorMs += deltaMs;
    while (this.accumulatorMs >= GAME_CONFIG.tickMs && this.state.phase === 'playing') {
      if (this.policy && this.state.tick % POLICY_TICKS === 0) {
        const action = this.policy.decide(this.state);
        if (action) this.dispatch(action);
      }
      this.accumulatorMs -= GAME_CONFIG.tickMs;
      this.step();
    }
  }

  dispatch(action: GameAction): boolean {
    if (this.state.phase !== 'playing' || this.state.paused || !ACTORS.includes(action.actor)) return false;
    const actor = this.state.actors[action.actor];
    let accepted = false;

    switch (action.type) {
      case 'grab': {
        if (actor.phase !== 'idle') break;
        const index = this.state.foods.findIndex((food) => food.id === action.foodId);
        if (index === -1) break;
        actor.food = this.state.foods.splice(index, 1)[0];
        this.refills[actor.food.slot] = GAME_CONFIG.refillMs;
        actor.phase = 'carrying';
        actor.phaseRemainingMs = GAME_CONFIG.carryMs;
        actor.delivered = false;
        actor.chewMs = 0;
        this.carriedMs[action.actor] = 0;
        accepted = true;
        break;
      }
      case 'deliver':
        if (actor.phase === 'carrying' && !actor.delivered) {
          actor.delivered = true;
          if (this.carriedMs[action.actor] >= GAME_CONFIG.carryMs) this.deliver(action.actor);
          accepted = true;
        }
        break;
      case 'cancel': {
        const suspendedCarry = actor.phase === 'stunned' && this.suspended[action.actor]?.phase === 'carrying';
        if ((actor.phase !== 'carrying' && !suspendedCarry) || !actor.food) break;
        const originalSlot = actor.food.slot;
        const slot = !this.state.foods.some((food) => food.slot === originalSlot)
          ? originalSlot
          : this.refills.findIndex((_, index) => !this.state.foods.some((food) => food.slot === index));
        // Cancelling never traps a player in carrying. Return the unconsumed
        // item when there is space; otherwise discard it without awarding food.
        if (slot >= 0) {
          this.state.foods.push({ ...actor.food, slot });
          this.state.foods.sort((a, b) => a.slot - b.slot);
          this.refills[slot] = null;
        }
        if (suspendedCarry) {
          actor.food = null;
          actor.chewMs = 0;
          actor.delivered = false;
          this.suspended[action.actor] = { phase: 'idle', remainingMs: 0 };
        } else this.clearFood(actor);
        this.carriedMs[action.actor] = 0;
        accepted = true;
        break;
      }
      case 'chew-start':
        if (actor.phase === 'ready' && actor.food) {
          actor.phase = 'chewing';
          actor.chewMs = 0;
          actor.phaseRemainingMs = GAME_CONFIG.chewMaxMs;
          accepted = true;
        }
        break;
      case 'chew-release':
        if (actor.phase === 'chewing' && actor.food) {
          if (actor.chewMs >= GAME_CONFIG.chewGreenStartMs && actor.chewMs <= GAME_CONFIG.chewGreenEndMs) {
            this.swallow(actor);
          } else {
            this.choke(actor);
          }
          accepted = true;
        }
        break;
    }

    if (accepted) this.actions.push({ tick: this.state.tick, action: { ...action } });
    return accepted;
  }

  getReplay(): ReplayData {
    return { engineVersion: ENGINE_VERSION, seed: this.state.seed, started: this.state.phase !== 'ready', finalTick: this.state.tick, paused: this.state.paused, actions: this.actions.map((entry) => ({ tick: entry.tick, action: { ...entry.action } })) };
  }

  private step(): void {
    this.state.tick += 1;
    this.state.elapsedMs = this.state.tick * GAME_CONFIG.tickMs;
    const nextStage = stageAt(this.state.elapsedMs);
    if (nextStage !== this.state.stage) {
      this.state.stage = nextStage;
      this.state.foods = this.state.foods.map((food) => skinFood(food, nextStage));
      for (const id of ACTORS) {
        const actor = this.state.actors[id];
        if (actor.food) actor.food = skinFood(actor.food, nextStage);
      }
    }
    // Resolve simultaneously delivered tools after both actors advance, so the
    // human-first iteration order never steals 20 ms from the bot's stun.
    this.inStep = true;
    for (const id of ACTORS) this.updateActor(id);
    this.inStep = false;
    for (const id of this.pendingStuns) this.stun(id);
    this.pendingStuns = [];
    for (let slot = 0; slot < GAME_CONFIG.slots; slot += 1) {
      const remaining = this.refills[slot];
      if (remaining === null) continue;
      this.refills[slot] = Math.max(0, remaining - GAME_CONFIG.tickMs);
      if (this.refills[slot] === 0) {
        this.spawn(slot);
        this.refills[slot] = null;
      }
    }
    if (this.state.tick >= LAST_TICK) {
      this.state.phase = 'finished';
      this.state.result = this.makeResult();
      this.accumulatorMs = 0;
    }
  }

  private updateActor(id: ActorId): void {
    const actor = this.state.actors[id];
    if (actor.phase === 'carrying') {
      this.carriedMs[id] += GAME_CONFIG.tickMs;
      actor.phaseRemainingMs = Math.max(0, GAME_CONFIG.carryMs - this.carriedMs[id]);
      if (actor.delivered && this.carriedMs[id] >= GAME_CONFIG.carryMs) this.deliver(id);
    } else if (actor.phase === 'chewing') {
      actor.chewMs += GAME_CONFIG.tickMs;
      actor.phaseRemainingMs = Math.max(0, GAME_CONFIG.chewMaxMs - actor.chewMs);
      if (actor.chewMs >= GAME_CONFIG.chewMaxMs) this.choke(actor);
    } else if (['choked', 'burping', 'stunned', 'reading'].includes(actor.phase)) {
      actor.phaseRemainingMs = Math.max(0, actor.phaseRemainingMs - GAME_CONFIG.tickMs);
      if (actor.phaseRemainingMs === 0) {
        if (actor.phase === 'stunned' && this.suspended[id]) {
          const resume = this.suspended[id];
          actor.phase = resume.phase;
          actor.phaseRemainingMs = resume.remainingMs;
          this.suspended[id] = null;
        } else if (actor.phase === 'choked') {
          actor.phase = 'ready';
          actor.chewMs = 0;
        } else {
          if (actor.phase === 'burping') actor.fullness /= 2;
          actor.phase = 'idle';
        }
      }
    }
  }

  private deliver(id: ActorId): void {
    const actor = this.state.actors[id];
    if (!actor.food) return;
    const effect = actor.food.effect;
    if (!effect) {
      actor.phase = 'ready';
      actor.phaseRemainingMs = 0;
      return;
    }
    this.clearFood(actor);
    if (effect === 'expansion') {
      actor.fullness = 0;
      actor.phase = 'reading';
      actor.phaseRemainingMs = GAME_CONFIG.readingMs;
    } else {
      const opponentId = id === 'human' ? 'ai' : 'human';
      if (this.inStep) this.pendingStuns.push(opponentId);
      else this.stun(opponentId);
    }
  }

  private stun(id: ActorId): void {
    const opponent = this.state.actors[id];
    if (opponent.phase !== 'stunned') {
      this.suspended[id] = { phase: opponent.phase, remainingMs: opponent.phaseRemainingMs };
    }
    opponent.phase = 'stunned';
    opponent.phaseRemainingMs = GAME_CONFIG.stunMs;
  }

  private clearFood(actor: ActorState): void {
    actor.food = null;
    actor.phase = 'idle';
    actor.phaseRemainingMs = 0;
    actor.chewMs = 0;
    actor.delivered = false;
  }

  private swallow(actor: ActorState): void {
    if (!actor.food) return;
    actor.score += actor.food.value;
    actor.portions += 1;
    actor.fullness = Math.min(GAME_CONFIG.fullnessMax, actor.fullness + actor.food.fullness);
    this.clearFood(actor);
    if (actor.fullness >= GAME_CONFIG.fullnessMax) {
      actor.phase = 'burping';
      actor.phaseRemainingMs = GAME_CONFIG.burpMs;
    }
  }

  private choke(actor: ActorState): void {
    actor.phase = 'choked';
    actor.phaseRemainingMs = GAME_CONFIG.chokeMs;
  }

  private spawn(slot: number, kind?: string): void {
    let definition = kind ? FOOD_DEFINITIONS.find((food) => food.kind === kind) : undefined;
    if (!definition) {
      const random = this.slotRandom[slot];
      const roll = random();
      const index = roll < 0.09 ? 5 : roll < 0.18 ? 6 : Math.floor(random() * 5);
      definition = FOOD_DEFINITIONS[index];
    }
    const food: Food = { id: `food-${this.nextFoodId++}`, slot, kind: definition.kind, ...definition.skins[this.state.stage], value: definition.value, fullness: definition.fullness, effect: definition.effect };
    this.state.foods.push(food);
    this.state.foods.sort((a, b) => a.slot - b.slot);
  }

  private makeResult(): GameResult {
    const human = this.state.actors.human;
    const ai = this.state.actors.ai;
    const difference = human.score - ai.score || human.portions - ai.portions;
    const stats = (actor: ActorState): ActorStats => ({
      score: actor.score,
      portions: actor.portions,
      portionsPerMinute: Math.round(actor.portions / (GAME_CONFIG.durationMs / 60_000) * 10) / 10,
      title: actor.portions === 0 ? '餐厅气氛组' : actor.score >= 1_800 ? '餐饮业终结者' : actor.score >= 800 ? '碳基清盘器' : '自助餐答辩冠军',
    });
    return { winner: difference > 0 ? 'human' : difference < 0 ? 'ai' : 'draw', human: stats(human), ai: stats(ai) };
  }
}

/** Replays every accepted input, including the bot's, without running its policy. */
export function replayGame(replay: ReplayData): GameState {
  if (replay.engineVersion !== ENGINE_VERSION) throw new Error('不兼容的录像版本');
  if (!Number.isInteger(replay.finalTick) || replay.finalTick < 0 || replay.finalTick > LAST_TICK) throw new Error('无效的录像时长');
  const engine = new BuffetEngine(replay.seed, { aiEnabled: false });
  if (!replay.started) {
    if (replay.finalTick || replay.actions.length) throw new Error('未开始的录像含有操作');
    return engine.state;
  }
  engine.start();
  let previousTick = -1;
  for (const entry of replay.actions) {
    if (!Number.isInteger(entry.tick) || entry.tick < previousTick || entry.tick > replay.finalTick) throw new Error('无效的录像操作顺序');
    previousTick = entry.tick;
    engine.advance((entry.tick - engine.state.tick) * GAME_CONFIG.tickMs);
    if (!engine.dispatch(entry.action)) throw new Error('录像包含无效操作');
  }
  engine.advance((replay.finalTick - engine.state.tick) * GAME_CONFIG.tickMs);
  if (replay.paused) engine.setPaused(true);
  return engine.state;
}
