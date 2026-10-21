import type { Food, StageId } from './types';

export const ENGINE_VERSION = '1.0.0';

export const GAME_CONFIG = Object.freeze({
  tickMs: 20,
  durationMs: 90_000,
  stageMs: 30_000,
  slots: 6,
  carryMs: 400,
  chewMaxMs: 1_200,
  chewGreenStartMs: 600,
  chewGreenEndMs: 900,
  chokeMs: 1_000,
  fullnessMax: 100,
  burpMs: 3_000,
  stunMs: 2_000,
  readingMs: 2_000,
  refillMs: 1_100,
  policyIntervalMs: 100,
  passiveFullnessDecay: 0,
});

export const STAGES = [
  { id: 0, label: '正常自助餐', announcement: '请文明用餐。文明稍后会用到。' },
  { id: 1, label: '餐厅开始反击', announcement: '老板急了：菜单也算一道菜。' },
  { id: 2, label: '碳硅文明决战', announcement: '请把餐饮行业放进嘴里。' },
] as const;

interface FoodDefinition {
  kind: string;
  value: number;
  fullness: number;
  effect: Food['effect'];
  skins: readonly { label: string; emoji: string }[];
}

/** The skins get stranger; their prices and stomach costs never change. */
export const FOOD_DEFINITIONS: readonly FoodDefinition[] = [
  {
    kind: 'lobster', value: 120, fullness: 28, effect: null,
    skins: [{ label: '波士顿龙虾', emoji: '🦞' }, { label: '老板的利润', emoji: '💸' }, { label: '餐厅商业模式', emoji: '📈' }],
  },
  {
    kind: 'steak', value: 90, fullness: 22, effect: null,
    skins: [{ label: '战斧牛排', emoji: '🥩' }, { label: '可食用餐盘', emoji: '🍽️' }, { label: '整条供应链', emoji: '🚛' }],
  },
  {
    kind: 'sushi', value: 45, fullness: 10, effect: null,
    skins: [{ label: '三文鱼寿司', emoji: '🍣' }, { label: '今日菜单', emoji: '📋' }, { label: '行业护城河', emoji: '🌊' }],
  },
  {
    kind: 'dumpling', value: 30, fullness: 7, effect: null,
    skins: [{ label: '流心小笼包', emoji: '🥟' }, { label: '桌号 008', emoji: '🔢' }, { label: '融资计划书', emoji: '📑' }],
  },
  {
    kind: 'watermelon', value: 18, fullness: 5, effect: null,
    skins: [{ label: '回本西瓜', emoji: '🍉' }, { label: '老板的眼泪', emoji: '💧' }, { label: '餐饮业的未来', emoji: '🔮' }],
  },
  {
    kind: 'sauce', value: 0, fullness: 0, effect: 'sauce',
    skins: [{ label: '提示词蘸料', emoji: '🌶️' }, { label: '提示词蘸料', emoji: '🌶️' }, { label: '提示词蘸料', emoji: '🌶️' }],
  },
  {
    kind: 'expansion', value: 0, fullness: 0, effect: 'expansion',
    skins: [{ label: '胃部扩容条款', emoji: '📜' }, { label: '胃部扩容条款', emoji: '📜' }, { label: '胃部扩容条款', emoji: '📜' }],
  },
];

export function stageAt(elapsedMs: number): StageId {
  return Math.min(2, Math.floor(elapsedMs / GAME_CONFIG.stageMs)) as StageId;
}

export function skinFood(food: Food, stage: StageId): Food {
  const definition = FOOD_DEFINITIONS.find((item) => item.kind === food.kind);
  if (!definition) return food;
  return { ...food, ...definition.skins[stage] };
}

/** Stable, independent RNG streams keep policy choices out of the menu RNG. */
export function createRandom(seed: string): () => number {
  let state = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    state = Math.imul(state ^ seed.charCodeAt(index), 16777619);
  }
  state >>>= 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}
