export interface BattleReport {
  seed: string;
  winner: 'human' | 'ai' | 'draw';
  human: { score: number; portions: number; portionsPerMinute: number; title: string };
  ai: { score: number; portions: number; portionsPerMinute: number; title: string };
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function challengeUrl(seed: string): string {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('seed', seed);
  return url.toString();
}

export async function createReport(report: BattleReport): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1360;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('当前浏览器无法生成图片');
  const ink = '#33234d';
  ctx.fillStyle = '#fff9ee';
  ctx.fillRect(0, 0, 1080, 1360);
  ctx.fillStyle = '#ffe35a';
  ctx.fillRect(0, 0, 1080, 345);
  ctx.fillStyle = ink;
  ctx.textAlign = 'left';
  ctx.font = '700 30px sans-serif';
  ctx.fillText('AI 大战人类 / 第 001 号实验', 70, 82);
  ctx.font = '900 76px sans-serif';
  ctx.fillText('自助餐，', 65, 188);
  ctx.fillText('老板先输了。', 65, 278);
  ctx.font = '700 29px sans-serif';
  ctx.fillText('90 秒碳硅文明进食报告', 70, 410);
  const winner = report.winner === 'human' ? '获胜物种：人类' : report.winner === 'ai' ? '获胜物种：机器人' : '获胜物种：平局';
  ctx.fillStyle = report.winner === 'ai' ? '#9b9aff' : '#ff8357';
  ctx.fillRect(65, 450, 950, 100);
  ctx.fillStyle = ink;
  ctx.font = '900 48px sans-serif';
  ctx.fillText(winner, 95, 516);
  const columns = [{ x: 80, name: '碳基选手 · 你', stats: report.human }, { x: 585, name: '本地策略机器人', stats: report.ai }];
  for (const col of columns) {
    ctx.font = '700 27px sans-serif';
    ctx.fillText(col.name, col.x, 630);
    ctx.font = '900 67px sans-serif';
    ctx.fillText(`¥${col.stats.score}`, col.x, 724);
    ctx.font = '400 29px sans-serif';
    ctx.fillText(`吃下 ${col.stats.portions} 份`, col.x, 788);
    ctx.fillText(`${col.stats.portionsPerMinute.toFixed(1)} 份 / 分钟`, col.x, 837);
    ctx.font = '700 29px sans-serif';
    ctx.fillText(col.stats.title, col.x, 912);
  }
  ctx.strokeStyle = ink;
  ctx.lineWidth = 3;
  ctx.setLineDash([8, 10]);
  ctx.beginPath();
  ctx.moveTo(65, 970);
  ctx.lineTo(1015, 970);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = '900 43px sans-serif';
  ctx.fillText('实际受害者：老板。', 80, 1045);
  ctx.font = '400 24px sans-serif';
  ctx.fillText(`菜单编号：${report.seed}`, 80, 1110);
  ctx.fillText('同一道菜单，再战一局。', 80, 1152);
  const link = challengeUrl(report.seed);
  ctx.font = '400 18px sans-serif';
  // Long local development URLs are wrapped instead of clipped.
  const chunks = link.match(/.{1,78}/g) ?? [];
  chunks.slice(0, 3).forEach((chunk, index) => ctx.fillText(chunk, 80, 1197 + index * 27));
  ctx.font = '400 20px sans-serif';
  ctx.fillText('本地策略对手 · 游戏分数不代表真实大模型能力', 80, 1310);
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('图片生成失败')), 'image/png'));
}
