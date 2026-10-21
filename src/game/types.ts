export type ActorId = 'human' | 'ai';
export type StageId = 0 | 1 | 2;
export type ActorPhase =
  | 'idle'
  | 'carrying'
  | 'ready'
  | 'chewing'
  | 'choked'
  | 'burping'
  | 'stunned'
  | 'reading';

export interface Food {
  id: string;
  slot: number;
  kind: string;
  label: string;
  emoji: string;
  value: number;
  fullness: number;
  effect: 'sauce' | 'expansion' | null;
}

export interface ActorState {
  phase: ActorPhase;
  food: Food | null;
  score: number;
  portions: number;
  fullness: number;
  phaseRemainingMs: number;
  chewMs: number;
  delivered: boolean;
}

export interface ActorStats {
  score: number;
  portions: number;
  portionsPerMinute: number;
  title: string;
}

export interface GameResult {
  winner: ActorId | 'draw';
  human: ActorStats;
  ai: ActorStats;
}

export interface GameState {
  elapsedMs: number;
  tick: number;
  phase: 'ready' | 'playing' | 'finished';
  paused: boolean;
  seed: string;
  stage: StageId;
  actors: Record<ActorId, ActorState>;
  foods: Food[];
  result: GameResult | null;
}

export type GameAction =
  | { actor: ActorId; type: 'grab'; foodId: string }
  | {
      actor: ActorId;
      type: 'deliver' | 'cancel' | 'chew-start' | 'chew-release';
    };

/** Policies submit exactly the same legal inputs as the person playing. */
export interface AgentPolicy {
  decide(snapshot: Readonly<GameState>): GameAction | null;
}

export interface ReplayEntry {
  tick: number;
  action: GameAction;
}

export interface ReplayData {
  engineVersion: string;
  seed: string;
  started: boolean;
  finalTick: number;
  paused: boolean;
  actions: ReplayEntry[];
}
