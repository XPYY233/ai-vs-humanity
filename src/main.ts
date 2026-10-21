import './style.css';
import { heroArt } from './art';
import { BuffetEngine } from './game/engine';
import { mountArena } from './game/scene';
import { challengeUrl, createReport, downloadBlob } from './report';

const repository = 'https://github.com/XPYY233/ai-vs-humanity';
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <header class="site-header wrap">
    <a class="wordmark" href="${import.meta.env.BASE_URL}" aria-label="AI 大战人类首页"><span class="brand-icon">人<span>vs</span>机</span><span>AI 大战人类<small>一本正经地胡思乱想</small></span></a>
    <nav aria-label="主导航"><a href="#universe" id="universe-link">宇宙实验室</a><a href="${repository}" target="_blank" rel="noopener noreferrer" class="github-link">GitHub <span aria-hidden="true">↗</span></a></nav>
  </header>

  <main>
    <section id="lobby" class="wrap">
      <div class="hero">
        <div class="hero-copy">
          <p class="experiment-label"><span class="live-dot"></span> 第 001 号实验 · 碳硅同桌</p>
          <h1>自助餐，<br>老板先输了。</h1>
          <p class="hero-description">人类靠手速。机器人靠策略。<br>老板靠祈祷。</p>
          <p class="english-note">Buffet <span>/bəˈfeɪ/</span> <span>自助餐</span></p>
          <div class="hero-actions"><button id="start-game" class="button primary big">开饭！挑战机器人 <span aria-hidden="true">↗</span></button><button id="how-to-play" class="button quiet">怎么玩？</button></div>
          <p class="entry-note">90 秒一局 · 无需注册 · 本地策略机器人</p>
          <p id="challenge-note" class="challenge-note" hidden>你收到了一份战书：同一道菜单，看看谁更能吃。</p>
          <p id="best-record" class="best-record"></p>
        </div>
        <div class="hero-art">${heroArt}<span class="art-caption">人类的最后一道防线，是扶墙出去。</span></div>
      </div>
      <div class="restaurant-ticker"><span>餐厅营业中 <i></i></span><span>模型状态：饿了</span><span>老板状态：不太好</span><span class="ticker-last">智能含量，以实际饭量为准。</span></div>
      <section class="universe" id="universe" aria-labelledby="universe-title">
        <div class="section-intro"><div><p class="small-label">离谱，但有下一集</p><h2 id="universe-title">这个宇宙，还饿着。</h2></div><a href="${repository}/issues/new?template=idea.yml" target="_blank" rel="noopener noreferrer" class="text-link">投喂一个鬼点子 ↗</a></div>
        <div class="experiment-grid">
          <article class="experiment-card current"><span class="experiment-icon" aria-hidden="true">🍴</span><div><span class="tag">正在发生</span><h3>自助餐，老板先输了</h3><p>这场科技革命，从抢最后一只虾开始。</p></div><button class="card-play" id="card-start" aria-label="开始自助餐游戏">↗</button></article>
          <article class="experiment-card"><span class="experiment-icon" aria-hidden="true">🛌</span><div><span class="tag muted">实验提案 · 待开发</span><h3>人类大战 AI 抢被子</h3><p>它说全局最优解，是你睡地板。</p></div></article>
          <article class="experiment-card"><span class="experiment-icon" aria-hidden="true">💭</span><div><span class="tag muted">实验提案 · 待开发</span><h3>谁在梦里插广告</h3><p>梦境共享成功，但跳过需要等五秒。</p></div></article>
        </div>
      </section>
    </section>

    <section id="game-view" class="wrap game-view" hidden aria-labelledby="game-title">
      <div class="game-heading"><div><p class="small-label" id="stage-label">第一阶段 · 正常开席</p><h1 id="game-title">筷子准备，碳基上桌。</h1></div><button id="pause-game" class="button quiet small">暂停 <kbd>P</kbd></button></div>
      <div class="scoreboard">
        <div class="score-side human-score"><span>碳基选手 · 你</span><strong id="human-score">¥0</strong><div class="belly-line"><span>胃容量</span><meter id="human-fullness" min="0" max="100" value="0" aria-label="人类胃容量"></meter></div><small id="human-portions">0 份 · 0.0 份/分钟</small></div>
        <div class="round-clock"><span>距离老板关门</span><strong id="timer">90</strong><small>秒</small></div>
        <div class="score-side ai-score"><span>本地策略机器人</span><strong id="ai-score">¥0</strong><div class="belly-line"><span>胃容量</span><meter id="ai-fullness" min="0" max="100" value="0" aria-label="机器人胃容量"></meter></div><small id="ai-portions">0 份 · 0.0 份/分钟</small></div>
      </div>
      <div class="arena-frame"><div class="arena-topline"><span>今日自助 · 回本不限量</span><span id="menu-id"></span></div><div id="arena" role="group" aria-label="自助餐战场：拖动食物到左边人类嘴里"></div></div>
      <div class="player-console"><div><strong id="action-hint" aria-live="polite">先把菜拖进左边的嘴里。</strong><span id="action-detail">鼠标 / 手指拖菜 · 键盘 1–6 直接拿菜</span></div><button id="chew-button" class="button primary chew-button" disabled>按住咀嚼 · 绿区松手 <kbd>空格</kbd></button></div>
      <details class="accessible-controls"><summary>点按拿菜 / 键盘辅助 <span>1–6 选菜，空格咀嚼</span></summary><div id="food-controls"></div></details>
      <p class="fairness-note">同桌、同规则、同胃容量。对手为本地策略机器人，未接入真实大模型。</p>
    </section>
  </main>
  <footer class="site-footer wrap"><span>有用的技术。没用的胜负欲。</span><a href="${repository}/issues/new?template=idea.yml" target="_blank" rel="noopener noreferrer">收集人类的奇思怪想 ↗</a></footer>

  <dialog id="instructions-dialog" class="paper-dialog"><button class="close-dialog" aria-label="关闭玩法说明">×</button><span class="dialog-sticker">入场须知</span><h2>吃饭，也得讲操作。</h2><ol class="instruction-steps"><li><strong>拖菜入口</strong><span>把桌上的食物拖进左边人类的嘴。也可用辅助按钮或数字键 1–6。</span></li><li><strong>按住咀嚼</strong><span>按住嘴巴、下方咀嚼按钮或空格，等指针进入绿色区域。</span></li><li><strong>绿区松手</strong><span>600–900 毫秒松开成功吞咽；太早太晚卡壳一秒。吃撑会打嗝三秒。</span></li></ol><p class="dialog-note">抢到蘸料，让对手答辩两秒；抢到扩容条款，腾空胃部，但先读两秒免责声明。道具入口即生效。</p><p class="dialog-note">90 秒后比回本金额，同分比饭量。只在游戏里吃垮老板。</p><button class="button primary" id="instructions-start">懂了，开饭</button></dialog>
  <dialog id="pause-dialog" class="paper-dialog pause-dialog"><span class="dialog-sticker">中场打嗝</span><h2>老板去拿计算器了。</h2><p>已暂停，饭还热着。</p><button id="resume-game" class="button primary">继续开饭</button><button id="back-home" class="button quiet">离席，回实验室</button></dialog>
  <dialog id="result-dialog" class="paper-dialog result-dialog"><span class="receipt-tear" aria-hidden="true"></span><p class="small-label">碳硅文明进食报告</p><h2 id="result-title">获胜物种：人类</h2><p class="loser-stamp">实际受害者：老板。</p><div class="result-comparison" id="result-stats"></div><p id="result-award" class="result-award"></p><div class="result-actions"><button id="play-again" class="button primary">同菜单再战</button><button id="download-report" class="button secondary">下载战报图片</button><button id="share-challenge" class="button secondary">复制挑战链接</button></div><label class="share-link-label" for="share-link">把这道菜单发给下一位饭友<input id="share-link" readonly aria-label="挑战链接"></label><div class="result-bottom"><button id="download-replay" class="text-button">保存对局记录</button><button id="result-home" class="text-button">回实验室</button></div><p class="result-disclaimer">本地策略对手 · 仅保存本机纪录 · 没有虚构的全球排名</p></dialog>
  <div id="toast" class="toast" role="status" aria-live="polite" hidden></div>
`;

function element<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}
let engine: BuffetEngine | null = null;
let arena: ReturnType<typeof mountArena> | null = null;
let lastUiTick = -1;
let lastHumanPhase = '';
let lastTray = '';
let resultShown = false;
let heldChew = false;
let toastTimer = 0;
let currentSeed = initialSeed();
const phaseLabels = ['第一阶段 · 正常开席', '第二阶段 · 餐厅开始反击', '第三阶段 · 碳硅文明决战'];
const phaseTitles = ['筷子准备，碳基上桌。', '菜单也能吃？那我不客气了。', '请停止吞食本餐厅商业模式。'];

function initialSeed(): string {
  const candidate = new URLSearchParams(window.location.search).get('seed');
  if (candidate && /^[a-zA-Z0-9_-]{1,48}$/.test(candidate)) return candidate;
  return `buffet-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`;
}

function toast(message: string): void {
  element('toast').textContent = message;
  element('toast').hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { element('toast').hidden = true; }, 3200);
}

function showBest(): void {
  try {
    const value: unknown = JSON.parse(localStorage.getItem('ai-vs-humanity:best:v1') ?? 'null');
    if (value && typeof value === 'object' && 'score' in value && typeof value.score === 'number' && Number.isFinite(value.score)) {
      element('best-record').textContent = `你的本机最高回本：¥${Math.max(0, value.score)}`;
    }
  } catch { /* Storage may be unavailable in private browsing. */ }
}

function startRound(): void {
  for (const dialog of document.querySelectorAll<HTMLDialogElement>('dialog[open]')) dialog.close();
  arena?.destroy();
  arena = null;
  engine = new BuffetEngine(currentSeed);
  lastUiTick = -1;
  lastHumanPhase = '';
  lastTray = '';
  resultShown = false;
  heldChew = false;
  element('lobby').hidden = true;
  document.body.classList.add('is-playing');
  element('game-view').hidden = false;
  element('universe-link').hidden = true;
  element('menu-id').textContent = `菜单 ${currentSeed}`;
  window.history.replaceState(null, '', challengeUrl(currentSeed));
  engine.start();
  arena = mountArena(element('arena'), engine, renderGame);
  renderGame();
  window.scrollTo({ top: 0, behavior: 'instant' });
  element('pause-game').focus({ preventScroll: true });
}

function home(): void {
  for (const dialog of document.querySelectorAll<HTMLDialogElement>('dialog[open]')) dialog.close();
  arena?.destroy();
  arena = null;
  engine = null;
  element('arena').replaceChildren();
  element('game-view').hidden = true;
  element('lobby').hidden = false;
  document.body.classList.remove('is-playing');
  element('universe-link').hidden = false;
  // Leaving a challenge keeps its menu; a new browser visit without a seed gets a fresh one.
  showBest();
  element('start-game').focus({ preventScroll: true });
}

function pause(): void {
  if (!engine || engine.state.phase !== 'playing' || engine.state.paused) return;
  engine.setPaused(true);
  arena?.setSleeping(true);
  heldChew = false;
  element<HTMLDialogElement>('pause-dialog').showModal();
}

function resume(): void {
  element<HTMLDialogElement>('pause-dialog').close();
  engine?.setPaused(false);
  arena?.setSleeping(false);
  element('pause-game').focus({ preventScroll: true });
}

function beginChew(): void {
  if (!engine || engine.state.paused) return;
  heldChew = engine.state.actors.human.phase === 'chewing' || engine.dispatch({ actor: 'human', type: 'chew-start' });
  renderGame(true);
}

function releaseChew(): void {
  if (!heldChew || !engine || engine.state.paused) return;
  heldChew = false;
  engine.dispatch({ actor: 'human', type: 'chew-release' });
  renderGame(true);
}

function takeSlot(slot: number): void {
  if (!engine || engine.state.paused) return;
  const food = engine.state.foods.find((item) => item.slot === slot);
  if (food && engine.dispatch({ actor: 'human', type: 'grab', foodId: food.id })) {
    engine.dispatch({ actor: 'human', type: 'deliver' });
    renderGame(true);
  }
}

function renderGame(force = false): void {
  if (!engine) return;
  const state = engine.state;
  if (!force && state.tick === lastUiTick) return;
  if (!force && lastUiTick >= 0 && state.tick - lastUiTick < 5 && state.phase !== 'finished'
    && state.actors.human.phase !== 'chewing' && state.actors.human.phase === lastHumanPhase) return;
  lastUiTick = state.tick;
  lastHumanPhase = state.actors.human.phase;
  for (const actor of ['human', 'ai'] as const) {
    const stats = state.actors[actor];
    element(`${actor}-score`).textContent = `¥${stats.score}`;
    element<HTMLMeterElement>(`${actor}-fullness`).value = stats.fullness;
    const rate = state.elapsedMs ? stats.portions / (state.elapsedMs / 60_000) : 0;
    element(`${actor}-portions`).textContent = `${stats.portions} 份 · ${rate.toFixed(1)} 份/分钟`;
  }
  element('timer').textContent = String(Math.max(0, Math.ceil((90_000 - state.elapsedMs) / 1000)));
  element('timer').classList.toggle('urgent', state.elapsedMs >= 75_000);
  element('stage-label').textContent = phaseLabels[state.stage];
  element('game-title').textContent = phaseTitles[state.stage];
  const human = state.actors.human;
  const hints: Record<string, [string, string]> = {
    idle: ['先把菜拖进左边的嘴里。', '鼠标 / 手指拖菜 · 键盘 1–6 直接拿菜'],
    carrying: ['端稳了，送到嘴边。', '拖到左边大嘴里松开；正在拿取的菜不会被抢走。'],
    ready: ['到嘴边了，按住咀嚼！', '按住嘴巴、下方按钮或空格，绿区松手。'],
    chewing: ['盯住绿区，准备松手！', '600–900 毫秒松开，才算真正吃进肚子。'],
    choked: ['卡壳了！嘴在重新连接。', '歇一秒，下次绿区再松手。'],
    burping: ['嗝——这是文明的声音。', '胃满了，打嗝三秒后释放一半容量。'],
    stunned: ['请解释每一粒米。', '中了提示词蘸料，正在答辩两秒。'],
    reading: ['胃已扩容，请阅读免责声明。', '条款还有两秒，老板正在撤回这个决定。'],
  };
  const hint = hints[human.phase] ?? hints.idle;
  element('action-hint').textContent = hint[0];
  element('action-detail').textContent = hint[1];
  const chewButton = element<HTMLButtonElement>('chew-button');
  chewButton.disabled = !['ready', 'chewing'].includes(human.phase) || state.paused || state.phase !== 'playing';
  chewButton.classList.toggle('is-chewing', human.phase === 'chewing');
  chewButton.classList.toggle('is-green', human.phase === 'chewing' && human.chewMs >= 600 && human.chewMs <= 900);
  const trayKey = `${state.stage}:${state.foods.map((item) => item.id).join(',')}:${human.phase}`;
  if (lastTray !== trayKey) {
    lastTray = trayKey;
    const tray = element('food-controls');
    tray.replaceChildren();
    for (let slot = 0; slot < 6; slot++) {
      const food = state.foods.find((item) => item.slot === slot);
      const button = document.createElement('button');
      button.className = 'food-control';
      button.dataset.slot = String(slot);
      button.disabled = !food || human.phase !== 'idle';
      button.textContent = food ? `${slot + 1} · ${food.emoji} ${food.label}` : `${slot + 1} · 备菜中`;
      button.setAttribute('aria-label', food ? `拿取 ${food.label}` : '备菜中');
      button.addEventListener('click', () => takeSlot(slot));
      tray.append(button);
    }
  }
  if (state.phase === 'finished' && !resultShown) finishRound();
}

function finishRound(): void {
  if (!engine?.state.result) return;
  resultShown = true;
  arena?.setSleeping(true);
  heldChew = false;
  const result = engine.state.result;
  element('result-title').textContent = result.winner === 'human' ? '获胜物种：人类' : result.winner === 'ai' ? '获胜物种：机器人' : '获胜物种：平局';
  const stats = element('result-stats');
  stats.replaceChildren();
  for (const actor of ['human', 'ai'] as const) {
    const column = document.createElement('div');
    const label = document.createElement('span');
    label.textContent = actor === 'human' ? '碳基选手 · 你' : '本地策略机器人';
    const money = document.createElement('strong');
    money.textContent = `¥${result[actor].score}`;
    const portions = document.createElement('small');
    portions.textContent = `${result[actor].portions} 份 · ${result[actor].portionsPerMinute.toFixed(1)} 份/分钟`;
    column.append(label, money, portions);
    stats.append(column);
  }
  element('result-award').textContent = `本局称号：${result.human.title}`;
  element<HTMLInputElement>('share-link').value = challengeUrl(engine.state.seed);
  try {
    const old = JSON.parse(localStorage.getItem('ai-vs-humanity:best:v1') ?? 'null') as { score?: number } | null;
    if (!old || typeof old.score !== 'number' || result.human.score > old.score) {
      localStorage.setItem('ai-vs-humanity:best:v1', JSON.stringify({ score: result.human.score, portions: result.human.portions }));
    }
  } catch { /* A blocked localStorage must never block the result. */ }
  element<HTMLDialogElement>('pause-dialog').close();
  element<HTMLDialogElement>('result-dialog').showModal();
}

element('start-game').addEventListener('click', startRound);
element('card-start').addEventListener('click', startRound);
element('instructions-start').addEventListener('click', startRound);
element('how-to-play').addEventListener('click', () => element<HTMLDialogElement>('instructions-dialog').showModal());
document.querySelector('.close-dialog')!.addEventListener('click', () => element<HTMLDialogElement>('instructions-dialog').close());
element('pause-game').addEventListener('click', pause);
element('resume-game').addEventListener('click', resume);
element('back-home').addEventListener('click', home);
element('result-home').addEventListener('click', home);
element('play-again').addEventListener('click', startRound);
element<HTMLDialogElement>('pause-dialog').addEventListener('cancel', (event) => { event.preventDefault(); resume(); });
element<HTMLDialogElement>('result-dialog').addEventListener('cancel', (event) => { event.preventDefault(); home(); });

const chewButton = element<HTMLButtonElement>('chew-button');
chewButton.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  event.preventDefault();
  chewButton.setPointerCapture(event.pointerId);
  beginChew();
});
chewButton.addEventListener('pointerup', releaseChew);
chewButton.addEventListener('pointercancel', releaseChew);
chewButton.addEventListener('lostpointercapture', releaseChew);
document.addEventListener('keydown', (event) => {
  if (!engine || engine.state.phase !== 'playing' || /INPUT|TEXTAREA/.test((event.target as HTMLElement)?.tagName)) return;
  if (event.code === 'KeyP' || event.code === 'Escape') {
    event.preventDefault();
    if (engine.state.paused) resume(); else pause();
    return;
  }
  if (engine.state.paused || event.repeat) return;
  if (/^[1-6]$/.test(event.key)) takeSlot(Number(event.key) - 1);
  if (event.code === 'Space') { event.preventDefault(); beginChew(); }
});
document.addEventListener('keyup', (event) => {
  if (event.code === 'Space' && engine?.state.phase === 'playing') { event.preventDefault(); releaseChew(); }
});
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
window.addEventListener('blur', pause);

element('share-challenge').addEventListener('click', async () => {
  const input = element<HTMLInputElement>('share-link');
  try {
    await navigator.clipboard.writeText(input.value);
    toast('挑战链接已复制。请下一位饭友上桌。');
  } catch {
    input.focus();
    input.select();
    toast('链接已选中，请长按或复制后分享。');
  }
});
element('download-report').addEventListener('click', async () => {
  if (!engine?.state.result) return;
  const button = element<HTMLButtonElement>('download-report');
  button.disabled = true;
  try {
    downloadBlob(await createReport({ ...engine.state.result, seed: engine.state.seed }), `buffet-${engine.state.seed}.png`);
    toast('战报已出炉。老板不愿出镜。');
  } catch { toast('图片生成失败，请稍后再试。'); }
  finally { button.disabled = false; }
});
element('download-replay').addEventListener('click', () => {
  if (!engine) return;
  downloadBlob(new Blob([JSON.stringify(engine.getReplay(), null, 2)], { type: 'application/json' }), `buffet-${engine.state.seed}-replay.json`);
});

element('challenge-note').hidden = !new URLSearchParams(window.location.search).has('seed');
showBest();
// Keep the validated seed stable for replay and sharing; never inject URL text as markup.
currentSeed = currentSeed.slice(0, 48);
