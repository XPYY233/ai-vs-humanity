import { createRandom, GAME_CONFIG } from './config';
import type { AgentPolicy, Food, GameAction, GameState } from './types';

/** A local strategy bot: no network requests, secret scores or special actions. */
export class LocalStrategyPolicy implements AgentPolicy {
  private readonly random: () => number;
  private targetChewMs = 700;

  constructor(seed: string) {
    this.random = createRandom(`${seed}:policy`);
  }

  decide(snapshot: Readonly<GameState>): GameAction | null {
    const actor = snapshot.actors.ai;
    if (snapshot.phase !== 'playing' || snapshot.paused) return null;
    if (actor.phase === 'carrying' && !actor.delivered) {
      return { actor: 'ai', type: 'deliver' };
    }
    if (actor.phase === 'ready') return { actor: 'ai', type: 'chew-start' };
    if (actor.phase === 'chewing' && actor.chewMs >= this.targetChewMs) {
      return { actor: 'ai', type: 'chew-release' };
    }
    if (actor.phase !== 'idle' || snapshot.foods.length === 0) return null;

    const utility = (food: Food): number => {
      if (food.effect === 'expansion') return actor.fullness >= 55 ? 150 : -1;
      if (food.effect === 'sauce') {
        return snapshot.actors.human.food && snapshot.actors.human.phase !== 'stunned'
          ? 65
          : -1;
      }
      const burpPenalty = actor.fullness + food.fullness >= GAME_CONFIG.fullnessMax ? 28 : 0;
      return food.value - burpPenalty;
    };
    const candidates = snapshot.foods.map((food) => ({ food, utility: utility(food) }));
    candidates.sort((a, b) => b.utility - a.utility || a.food.slot - b.food.slot);
    const target = candidates[0];
    if (!target || target.utility < 0) return null;
    this.targetChewMs = GAME_CONFIG.chewGreenStartMs + Math.floor(this.random() * 4) * 100;
    return { actor: 'ai', type: 'grab', foodId: target.food.id };
  }
}
