import Phaser from 'phaser';
import { BuffetEngine } from './engine';

const WIDTH = 800;
const HEIGHT = 620;
const INK = 0x33234d;
const PAPER = 0xfff9ee;
const YELLOW = 0xffe35a;
const ORANGE = 0xff8357;
const PURPLE = 0x9b9aff;
const MINT = 0xa5e3ba;
const SLOTS = [
  { x: 150, y: 185 }, { x: 400, y: 185 }, { x: 650, y: 185 },
  { x: 150, y: 300 }, { x: 400, y: 300 }, { x: 650, y: 300 },
];
const MOUTHS = { human: { x: 190, y: 470 }, ai: { x: 610, y: 470 } };
const FONT = '"PingFang SC", "Microsoft YaHei", sans-serif';

type Actor = BuffetEngine['state']['actors']['human'];
type Food = NonNullable<Actor['food']>;
type ActorId = 'human' | 'ai';
type FoodView = {
  root: Phaser.GameObjects.Container;
  plate: Phaser.GameObjects.Graphics;
  emoji: Phaser.GameObjects.Text;
  label: Phaser.GameObjects.Text;
  price: Phaser.GameObjects.Text;
  id: string;
};

const PHASE_LABELS: Record<Actor['phase'], string> = {
  idle: '筷子已经饥渴难耐',
  carrying: '正在搬运老板的心血',
  ready: '按住嘴巴，开始咀嚼',
  chewing: '绿区松手！',
  choked: '咳咳……战术性卡壳',
  burping: '嗝——胃正在扩容',
  stunned: '请解释每一粒米',
  reading: '正在阅读胃部条款',
};

/** The scene is only a view and input adapter; all rules live in the engine. */
class BuffetScene extends Phaser.Scene {
  private readonly engine: BuffetEngine;
  private readonly onFrame: () => void;
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private ink!: Phaser.GameObjects.Graphics;
  private plates: FoodView[] = [];
  private held!: FoodView;
  private robotHeld!: FoodView;
  private stageTitle!: Phaser.GameObjects.Text;
  private stageCaption!: Phaser.GameObjects.Text;
  private humanBubble!: Phaser.GameObjects.Text;
  private aiBubble!: Phaser.GameObjects.Text;
  private humanHint!: Phaser.GameObjects.Text;
  private aiHint!: Phaser.GameObjects.Text;
  private actorFoodText: Record<ActorId, Phaser.GameObjects.Text> = {} as Record<ActorId, Phaser.GameObjects.Text>;
  private mouthFoodText: Record<ActorId, Phaser.GameObjects.Text> = {} as Record<ActorId, Phaser.GameObjects.Text>;
  private pointer: { id: number; kind: 'drag' | 'chew'; x: number; y: number } | null = null;
  private deferredCancel = false;
  private lastStage = -1;
  private aiCarryId = '';
  private aiCarryStart = 0;
  private aiCarryOrigin = SLOTS[0];
  private removeListeners: (() => void) | null = null;

  constructor(engine: BuffetEngine, onFrame: () => void) {
    super({ key: 'buffet' });
    this.engine = engine;
    this.onFrame = onFrame;
  }

  create(): void {
    this.drawRoom();
    this.plates = SLOTS.map(() => this.makeFoodView());
    this.ink = this.add.graphics().setDepth(5);
    this.held = this.makeFoodView(30);
    this.robotHeld = this.makeFoodView(25);
    this.stageTitle = this.text(400, 39, '', 27, 'bold').setOrigin(0.5);
    this.stageCaption = this.text(400, 73, '', 16).setOrigin(0.5);
    this.humanBubble = this.text(190, 375, '', 18, 'bold').setOrigin(0.5).setDepth(10);
    this.aiBubble = this.text(610, 375, '', 18, 'bold').setOrigin(0.5).setDepth(10);
    this.humanHint = this.text(190, 603, '碳基选手 · 你', 19, 'bold').setOrigin(0.5).setDepth(10);
    this.aiHint = this.text(610, 603, '硅基选手 · 本地策略', 19, 'bold').setOrigin(0.5).setDepth(10);
    this.actorFoodText.human = this.text(190, 548, '', 27).setOrigin(0.5).setDepth(9);
    this.actorFoodText.ai = this.text(610, 548, '', 27).setOrigin(0.5).setDepth(9);
    this.mouthFoodText.human = this.text(190, 472, '', 29).setOrigin(0.5).setDepth(8);
    this.mouthFoodText.ai = this.text(610, 472, '', 29).setOrigin(0.5).setDepth(8);
    this.bindPointer();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.removeListeners?.());
    this.paint();
    this.onFrame();
  }

  update(_time: number, delta: number): void {
    if (this.deferredCancel && this.engine.state.phase === 'playing' && !this.engine.state.paused) {
      this.engine.dispatch({ actor: 'human', type: 'cancel' });
      this.deferredCancel = false;
    }
    this.engine.advance(delta);
    if (this.engine.state.paused || this.engine.state.phase !== 'playing') this.cancelPointer(true);
    this.paint();
    this.onFrame();
  }

  private text(x: number, y: number, value: string, size: number, style = 'normal'): Phaser.GameObjects.Text {
    return this.add.text(x, y, value, {
      fontFamily: FONT, fontSize: `${size}px`, fontStyle: style,
      color: '#33234d', padding: { x: 2, y: 3 },
    });
  }

  private drawRoom(): void {
    const g = this.add.graphics();
    g.fillStyle(PAPER).fillRect(0, 0, WIDTH, HEIGHT);
    g.fillStyle(0xe9e0cf, 0.65);
    for (let x = 16; x < WIDTH; x += 28) {
      for (let y = 15; y < HEIGHT; y += 28) g.fillCircle(x, y, 1.3);
    }
    g.fillStyle(0xffe9b5).fillRoundedRect(18, 103, 764, 273, 26);
    g.fillStyle(INK).fillRoundedRect(27, 116, 748, 257, 23);
    g.fillStyle(0xffd7b5).fillRoundedRect(22, 108, 748, 257, 23);
    g.lineStyle(4, INK).strokeRoundedRect(22, 108, 748, 257, 23);
    g.lineStyle(2, 0xd3987f, 0.55);
    for (let x = 60; x < 760; x += 50) g.lineBetween(x, 112, x - 17, 359);
    g.fillStyle(PAPER).fillRoundedRect(306, 347, 188, 26, 10);
    g.lineStyle(2, INK).strokeRoundedRect(306, 347, 188, 26, 10);
    this.text(400, 360, '菜单价格含老板的眼泪', 12, 'bold').setOrigin(0.5);
    this.text(46, 26, '营业中', 17, 'bold').setAngle(-7);
    this.text(747, 27, 'NO. 001', 16, 'bold').setOrigin(1, 0).setAngle(5);
    g.lineStyle(2, INK, 0.2).lineBetween(400, 405, 400, 580);
    this.text(400, 501, 'VS', 30, 'bold').setOrigin(0.5).setAlpha(0.4);
  }

  private makeFoodView(depth = 3): FoodView {
    const plate = this.add.graphics();
    plate.fillStyle(INK, 0.16).fillEllipse(3, 9, 142, 77);
    plate.fillStyle(0xffffff).fillEllipse(0, 0, 142, 77);
    plate.lineStyle(3, INK).strokeEllipse(0, 0, 142, 77);
    plate.lineStyle(1.5, 0xd8ccd9).strokeEllipse(0, 0, 124, 61);
    const emoji = this.text(0, -15, '', 43).setOrigin(0.5);
    const label = this.text(0, 29, '', 18, 'bold').setOrigin(0.5);
    const price = this.text(0, 51, '', 16, 'bold').setOrigin(0.5);
    const root = this.add.container(0, 0, [plate, emoji, label, price]).setDepth(depth);
    root.setVisible(false);
    return { root, plate, emoji, label, price, id: '' };
  }

  private showFood(view: FoodView, food: Food | null, x: number, y: number, held = false): void {
    view.root.setVisible(!!food);
    if (!food) { view.id = ''; return; }
    const signature = `${food.id}\0${food.label}\0${food.emoji}\0${food.value}\0${food.effect}`;
    if (view.id !== signature) {
      view.id = signature;
      view.emoji.setText(food.emoji);
      view.label.setText(food.label);
      view.price.setText(food.effect === 'sauce' ? '✦ 对手答辩 2 秒' : food.effect === 'expansion' ? '✦ 胃部腾空' : `¥${food.value} / 份`);
      view.price.setColor(food.effect ? '#7056ab' : '#ae503b');
    }
    view.root.setPosition(x, y).setScale(held ? 0.74 : 1);
    view.plate.setAlpha(held ? 0.88 : 1);
  }

  private paint(): void {
    const state = this.engine.state;
    if (state.stage !== this.lastStage) {
      this.lastStage = state.stage;
      const titles = ['第一口，是对老板的尊重', '餐厅反击：餐盘也算一道菜', '碳硅决战：开始吞食商业模式'];
      const captions = ['拖菜进嘴 → 按住咀嚼 → 绿区松手', '友情提示：老板的利润不含膳食纤维', '文明可以重启，这顿必须回本'];
      this.stageTitle.setText(titles[state.stage]);
      this.stageCaption.setText(captions[state.stage]);
    }
    for (let slot = 0; slot < SLOTS.length; slot++) {
      const food = state.foods.find((item) => item.slot === slot) ?? null;
      this.showFood(this.plates[slot], food, SLOTS[slot].x, SLOTS[slot].y);
    }
    this.ink.clear();
    this.drawActor('human', state.actors.human);
    this.drawActor('ai', state.actors.ai);
    this.paintHeldFood();
    this.humanBubble.setText(state.actors.human.phase === 'carrying' && !this.pointer
      ? '手中有菜 · 点嘴送入' : PHASE_LABELS[state.actors.human.phase]);
    const robotLines = ['正在计算最优虾路径', '该餐厅缺乏护城河', '商业模式：味道不错'];
    this.aiBubble.setText(state.actors.ai.phase === 'idle' || state.actors.ai.phase === 'ready'
      ? robotLines[state.stage] : PHASE_LABELS[state.actors.ai.phase]);
    const active = state.phase === 'playing' && !state.paused;
    this.humanHint.setText(active && state.actors.human.phase === 'ready' ? '按住嘴巴 · 绿区松手' : '碳基选手 · 你');
    this.aiHint.setText('硅基选手 · 本地策略');
    const canvas = this.game.canvas;
    canvas.style.cursor = !active ? 'default' : this.pointer?.kind === 'drag' ? 'grabbing' : 'grab';
  }

  private drawActor(id: ActorId, actor: Actor): void {
    const g = this.ink;
    const { x, y } = MOUTHS[id];
    const human = id === 'human';
    const base = human ? ORANGE : PURPLE;
    const mechanical = this.engine.state.stage === 2;
    const chewing = actor.phase === 'chewing';
    const bounce = this.reducedMotion ? 0 : chewing ? Math.sin(actor.chewMs / 43) * 4 : Math.sin(this.engine.state.elapsedMs / 360 + (human ? 0 : 2)) * 1.3;
    const hit = actor.phase === 'choked' || actor.phase === 'stunned';
    const burp = actor.phase === 'burping';
    const headY = y - 16 + bounce;

    // Transparent stomach and limbs stay visually separate from the eating target.
    g.lineStyle(11, INK).lineBetween(x - 32, 566, x - 44, 584).lineBetween(x + 32, 566, x + 44, 584);
    g.lineStyle(6, base).lineBetween(x - 32, 566, x - 44, 583).lineBetween(x + 32, 566, x + 44, 583);
    g.fillStyle(base, 0.22).fillRoundedRect(x - 59, 497, 118, 84, 32);
    g.lineStyle(3.5, INK).strokeRoundedRect(x - 59, 497, 118, 84, 32);
    g.fillStyle(base, 0.35).fillEllipse(x, 546, 90, 57);
    g.lineStyle(2, INK, 0.38).strokeEllipse(x, 546, 90, 57);
    g.fillStyle(PAPER, 0.65).fillEllipse(x - 23, 532, 14, 24);
    g.fillStyle(INK, 0.12).fillRoundedRect(x - 39, 563, 78, 6, 3);
    g.fillStyle(burp ? YELLOW : base).fillRoundedRect(x - 39, 563, 78 * Math.max(0, Math.min(actor.fullness / 100, 1)), 6, 3);
    const foodBits = ['🍤', '🥩', '🦞', '🍽️', '📈'];
    this.actorFoodText[id].setText(actor.portions ? foodBits[(actor.portions - 1) % foodBits.length] : '· · ·');
    this.actorFoodText[id].setAlpha(actor.portions ? 0.85 : 0.3);

    g.fillStyle(INK, 0.12).fillEllipse(x + 4, headY + 12, 163, 119);
    g.fillStyle(base);
    if (human) g.fillEllipse(x, headY, 165, 135);
    else g.fillRoundedRect(x - 82, headY - 63, 164, 130, 27);
    g.lineStyle(4, INK);
    if (human) g.strokeEllipse(x, headY, 165, 135);
    else g.strokeRoundedRect(x - 82, headY - 63, 164, 130, 27);

    // Hair versus antenna: equal appetites, different hardware.
    if (human) {
      g.fillStyle(INK).fillTriangle(x - 62, headY - 42, x - 38, headY - 82, x - 17, headY - 56);
      g.fillTriangle(x - 31, headY - 55, x - 1, headY - 86, x + 24, headY - 54);
      g.fillTriangle(x + 7, headY - 54, x + 40, headY - 76, x + 58, headY - 41);
    } else {
      g.lineStyle(4, INK).lineBetween(x, headY - 64, x, headY - 84);
      g.fillStyle(YELLOW).fillCircle(x, headY - 88, 8);
      g.lineStyle(3, INK).strokeCircle(x, headY - 88, 8);
      g.fillStyle(0x756fc2).fillRoundedRect(x - 96, headY - 17, 13, 35, 5).fillRoundedRect(x + 83, headY - 17, 13, 35, 5);
    }
    const eyeY = headY - 23;
    g.fillStyle(PAPER).fillEllipse(x - 34, eyeY, 40, 39).fillEllipse(x + 34, eyeY, 40, 39);
    g.lineStyle(3, INK).strokeEllipse(x - 34, eyeY, 40, 39).strokeEllipse(x + 34, eyeY, 40, 39);
    if (hit) {
      g.lineStyle(4, INK);
      for (const offset of [-34, 34]) {
        g.lineBetween(x + offset - 7, eyeY - 7, x + offset + 7, eyeY + 7);
        g.lineBetween(x + offset + 7, eyeY - 7, x + offset - 7, eyeY + 7);
      }
    } else {
      const gaze = actor.phase === 'carrying' ? -3 : 3;
      g.fillStyle(INK).fillEllipse(x - 34 + gaze, eyeY + 3, human ? 13 : 17, human ? 20 : 15);
      g.fillEllipse(x + 34 + gaze, eyeY + 3, human ? 13 : 17, human ? 20 : 15);
      g.fillStyle(0xffffff).fillCircle(x - 34 + gaze - 3, eyeY, 3).fillCircle(x + 34 + gaze - 3, eyeY, 3);
    }
    g.fillStyle(0xf56b74, 0.48).fillEllipse(x - 59, headY + 8, 23, 10).fillEllipse(x + 59, headY + 8, 23, 10);
    const mouthHeight = hit ? 19 : chewing ? 36 + bounce * 2 : burp ? 62 : 45;
    g.fillStyle(INK).fillEllipse(x, y + bounce, 109, mouthHeight);
    g.lineStyle(3, INK).strokeEllipse(x, y + bounce, 109, mouthHeight);
    if (!hit) {
      g.fillStyle(PAPER).fillRoundedRect(x - 35, y - mouthHeight / 2 + 4 + bounce, 70, 10, 3);
      g.fillStyle(0xf7909e).fillEllipse(x + 3, y + mouthHeight / 2 - 8 + bounce, 48, 13);
      g.lineStyle(1, INK, 0.3);
      for (const shift of [-17, 0, 17]) g.lineBetween(x + shift, y - mouthHeight / 2 + 5 + bounce, x + shift, y - mouthHeight / 2 + 12 + bounce);
    }
    if (mechanical) {
      g.lineStyle(8, INK).lineBetween(x - 78, y - 3, x - 71, y + 47).lineBetween(x + 78, y - 3, x + 71, y + 47).lineBetween(x - 71, y + 47, x + 71, y + 47);
      g.lineStyle(4, YELLOW).lineBetween(x - 78, y - 3, x - 71, y + 47).lineBetween(x + 78, y - 3, x + 71, y + 47).lineBetween(x - 71, y + 47, x + 71, y + 47);
      for (const boltX of [x - 77, x + 77]) {
        g.fillStyle(PAPER).fillCircle(boltX, y + 4, 8);
        g.lineStyle(3, INK).strokeCircle(boltX, y + 4, 8);
      }
    }
    // Speech card.
    g.fillStyle(PAPER).fillRoundedRect(x - 123, 356, 246, 38, 14);
    g.lineStyle(2.5, INK).strokeRoundedRect(x - 123, 356, 246, 38, 14);
    g.fillStyle(PAPER).fillTriangle(x - 14, 393, x, 404, x + 11, 393);
    g.lineStyle(2.5, INK).lineBetween(x - 14, 393, x, 404).lineBetween(x, 404, x + 11, 393);

    if (human && this.pointer?.kind === 'drag') {
      const inside = this.inMouth(this.pointer.x, this.pointer.y);
      g.lineStyle(5, inside ? MINT : YELLOW, 0.95).strokeEllipse(x, y, 140, 81);
      if (inside) g.fillStyle(MINT, 0.13).fillEllipse(x, y, 140, 81);
    }
    if (chewing) this.drawTiming(x, actor.chewMs);
    if (burp && !this.reducedMotion) {
      g.lineStyle(2.5, 0x7ca888, 0.8);
      const rise = (this.engine.state.elapsedMs % 650) / 650;
      for (let i = 0; i < 3; i++) g.strokeCircle(x + 60 + i * 14, y - 20 - rise * 30 - i * 10, 5 + i * 2);
    }
  }

  private drawTiming(x: number, chewMs: number): void {
    const g = this.ink;
    const left = x - 90;
    const top = 516;
    const width = 180;
    g.fillStyle(PAPER).fillRoundedRect(left - 5, top - 5, width + 10, 23, 8);
    g.lineStyle(2, INK).strokeRoundedRect(left - 5, top - 5, width + 10, 23, 8);
    g.fillStyle(0xe4d9d6).fillRoundedRect(left, top, width, 13, 5);
    g.fillStyle(MINT).fillRect(left + width * 0.5, top, width * 0.25, 13);
    const marker = left + width * Math.min(chewMs / 1200, 1);
    g.fillStyle(INK).fillTriangle(marker - 5, top - 6, marker + 5, top - 6, marker, top + 1);
    g.fillStyle(INK).fillRoundedRect(marker - 2, top, 4, 15, 2);
  }

  private paintHeldFood(): void {
    const state = this.engine.state;
    const human = state.actors.human;
    const ai = state.actors.ai;
    if (human.food && human.phase === 'carrying') {
      this.showFood(this.held, human.food, this.pointer?.kind === 'drag' ? this.pointer.x : 80,
        this.pointer?.kind === 'drag' ? this.pointer.y - 20 : 530, true);
    } else this.held.root.setVisible(false);
    if (ai.phase === 'carrying' && ai.food) {
      if (this.aiCarryId !== ai.food.id) {
        this.aiCarryId = ai.food.id;
        this.aiCarryStart = state.elapsedMs;
        this.aiCarryOrigin = SLOTS[ai.food.slot] ?? SLOTS[0];
      }
      const progress = Math.min(1, Math.max(0, (state.elapsedMs - this.aiCarryStart) / 400));
      const eased = progress * progress * (3 - 2 * progress);
      const x = this.aiCarryOrigin.x + (610 - this.aiCarryOrigin.x) * eased;
      const y = this.aiCarryOrigin.y + (465 - this.aiCarryOrigin.y) * eased - (this.reducedMotion ? 0 : Math.sin(progress * Math.PI) * 45);
      this.ink.lineStyle(14, INK).lineBetween(688, 528, x + 20, y + 15);
      this.ink.lineStyle(8, PURPLE).lineBetween(688, 528, x + 20, y + 15);
      this.ink.fillStyle(YELLOW).fillCircle(x + 20, y + 15, 13);
      this.ink.lineStyle(3, INK).strokeCircle(x + 20, y + 15, 13);
      this.showFood(this.robotHeld, ai.food, x, y, true);
    } else {
      this.aiCarryId = '';
      this.robotHeld.root.setVisible(false);
    }
    for (const id of ['human', 'ai'] as const) {
      const actor = state.actors[id];
      const visible = !!actor.food && (actor.phase === 'ready' || actor.phase === 'chewing');
      this.mouthFoodText[id].setVisible(visible);
      if (visible && actor.food) {
        this.mouthFoodText[id].setText(actor.food.emoji);
        this.mouthFoodText[id].setScale(actor.phase === 'chewing' ? 1 - Math.min(actor.chewMs / 1200, 1) * 0.45 : 1);
      }
      if (actor.food && (actor.phase === 'ready' || actor.phase === 'chewing')) {
        const { x, y } = MOUTHS[id];
        this.ink.fillStyle(YELLOW).fillCircle(x + 73, y - 4, 15);
        this.ink.lineStyle(2, INK).strokeCircle(x + 73, y - 4, 15);
      }
    }
  }

  private inMouth(x: number, y: number): boolean {
    return ((x - MOUTHS.human.x) / 96) ** 2 + ((y - MOUTHS.human.y) / 65) ** 2 <= 1;
  }

  private bindPointer(): void {
    const canvas = this.game.canvas;
    canvas.style.touchAction = 'none';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', '自助餐对战游戏区。拖食物到左边嘴巴，按住嘴巴咀嚼，在绿色区域松手吞咽。也可使用下方键盘操作。');
    const point = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect();
      return { x: (event.clientX - bounds.left) * WIDTH / bounds.width, y: (event.clientY - bounds.top) * HEIGHT / bounds.height };
    };
    const down = (event: PointerEvent) => {
      if (event.button !== 0 || this.pointer || this.engine.state.phase !== 'playing' || this.engine.state.paused) return;
      const { x, y } = point(event);
      const actor = this.engine.state.actors.human;
      if (actor.phase === 'chewing' && actor.food && this.inMouth(x, y)) {
        // A pause releases native pointer capture, but it does not reset or
        // release the simulated bite. Reattach without restarting the timer.
        this.pointer = { id: event.pointerId, kind: 'chew', x, y };
      } else if (actor.phase === 'ready' && this.inMouth(x, y)) {
        if (this.engine.dispatch({ actor: 'human', type: 'chew-start' })) this.pointer = { id: event.pointerId, kind: 'chew', x, y };
      } else if (actor.phase === 'carrying' && actor.food) {
        if (this.inMouth(x, y)) {
          this.engine.dispatch({ actor: 'human', type: 'deliver' });
          event.preventDefault();
        } else this.pointer = { id: event.pointerId, kind: 'drag', x, y };
      } else if (actor.phase === 'idle') {
        const food = this.engine.state.foods
          .filter((candidate) => Math.hypot(x - SLOTS[candidate.slot].x, y - SLOTS[candidate.slot].y) <= 75)
          .sort((a, b) => Math.hypot(x - SLOTS[a.slot].x, y - SLOTS[a.slot].y) - Math.hypot(x - SLOTS[b.slot].x, y - SLOTS[b.slot].y))[0];
        if (food && this.engine.dispatch({ actor: 'human', type: 'grab', foodId: food.id })) {
          this.pointer = { id: event.pointerId, kind: 'drag', x, y };
        }
      }
      if (this.pointer) { event.preventDefault(); canvas.setPointerCapture(event.pointerId); }
    };
    const move = (event: PointerEvent) => {
      if (this.pointer?.id !== event.pointerId) return;
      Object.assign(this.pointer, point(event));
      event.preventDefault();
    };
    const up = (event: PointerEvent) => {
      if (this.pointer?.id !== event.pointerId) return;
      const { x, y } = point(event);
      const kind = this.pointer.kind;
      this.pointer = null;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      if (!this.engine.state.paused && this.engine.state.phase === 'playing') {
        this.engine.dispatch({ actor: 'human', type: kind === 'chew' ? 'chew-release' : this.inMouth(x, y) ? 'deliver' : 'cancel' });
      } else if (this.engine.state.phase === 'playing' && kind === 'drag') {
        this.deferredCancel = true;
      }
      event.preventDefault();
    };
    const cancel = () => this.cancelPointer(this.engine.state.paused);
    const blur = () => this.cancelPointer(true);
    const context = (event: Event) => event.preventDefault();
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', cancel);
    canvas.addEventListener('lostpointercapture', cancel);
    canvas.addEventListener('contextmenu', context);
    window.addEventListener('blur', blur);
    this.removeListeners = () => {
      this.cancelPointer();
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', cancel);
      canvas.removeEventListener('lostpointercapture', cancel);
      canvas.removeEventListener('contextmenu', context);
      window.removeEventListener('blur', blur);
    };
  }

  private cancelPointer(preserveChew = false): void {
    if (!this.pointer) return;
    const pointer = this.pointer;
    this.pointer = null;
    if (this.game.canvas.hasPointerCapture(pointer.id)) this.game.canvas.releasePointerCapture(pointer.id);
    if (pointer.kind === 'chew') {
      if (!preserveChew && !this.engine.state.paused) this.engine.dispatch({ actor: 'human', type: 'chew-release' });
    } else if (this.engine.state.paused) this.deferredCancel = true;
    else this.engine.dispatch({ actor: 'human', type: 'cancel' });
  }
}

export function mountArena(parent: HTMLElement, engine: BuffetEngine, onFrame: () => void): { destroy: () => void } {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: WIDTH,
    height: HEIGHT,
    backgroundColor: '#fff9ee',
    transparent: false,
    antialias: true,
    banner: false,
    scene: new BuffetScene(engine, onFrame),
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: WIDTH, height: HEIGHT },
    render: { antialias: true, roundPixels: false },
    audio: { noAudio: true },
  });
  return { destroy: () => game.destroy(true) };
}
