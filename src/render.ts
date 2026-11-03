import { FINALE, KEYS, NIGHT, SLEEP_MAX, clockLabel, holdNeeded, type Game, type Sound, type Summary } from "./lib/game";
import { KINDS } from "./lib/kinds";

// 色・文字は docs/design.md に書いた物だけを使う
export const C = {
  night: "#0B0E1A",
  noisy: "#2A0E18",
  ink: "#F3F5FF",
  sub: "#8C93B0",
  line: "#E8ECF7",
  moon: "#BFD4FF",
  body: "#151A2E",
  blanket: "#121730",
  red: "#FF4D3D",
  yellow: "#FFE14D",
  dawn: "#FFF3C4",
  orange: "#FFB020",
};
export const JP = `"Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP","Noto Sans CJK JP","Yu Gothic","Meiryo",system-ui,sans-serif`;
export const MONO = `ui-monospace,"SF Mono","Roboto Mono","DejaVu Sans Mono",Menlo,Consolas,monospace`;

const BAD_COLORS = ["#FF4D3D", "#FFB020", "#FF7AB6", "#9B8CFF", "#5CE1E6", "#FFE14D", "#7CF29A"];

export interface Layout {
  W: number;
  H: number;
  /** 縦長の舞台（スマホでは画面いっぱい、PC では真ん中） */
  ox: number;
  sw: number;
  sh: number;
  /** 文字の倍率（390px 幅で 1） */
  s: number;
  fx: number;
  fy: number;
  fw: number;
  fh: number;
  /** 寝ている人の場所の上端 */
  bedY: number;
  /** 画面の下からボタンまでの間 */
  btnGap: number;
  /** ボタンの上端 */
  btnTop: number;
}

export function layout(W: number, H: number): Layout {
  const sw = Math.min(W, Math.round(H * 0.6));
  const ox = Math.round((W - sw) / 2);
  const s = Math.min(1.25, Math.max(0.8, Math.min(sw / 390, H / 800)));
  const bedY = Math.round(H * 0.79);
  const fy = Math.round(118 * s);
  const pad = 18 * s;
  // ボタン（高さ 56）は、寝ている人の上に置く。低い画面では結果の数字より下に収める
  const statsBottom = 562 * s;
  let btnGap = Math.max(26, H - bedY + 14);
  if (H - btnGap - 56 < statsBottom + 10) btnGap = Math.max(26, H - statsBottom - 10 - 56);
  return { W, H, ox, sw, sh: H, s, fx: ox + pad, fy, fw: sw - pad * 2, fh: bedY - fy - 18 * s, bedY, btnGap, btnTop: H - btnGap - 56 };
}

export function soundPos(L: Layout, snd: Pick<Sound, "x" | "y">): { x: number; y: number } {
  return { x: L.fx + snd.x * L.fw, y: L.fy + snd.y * L.fh };
}

/** 画面に描く位置。大きな文字が舞台からはみ出さないよう、横を寄せる（押す判定もこれを使う） */
export function placeOf(ctx: CanvasRenderingContext2D, L: Layout, snd: Sound): { x: number; y: number } {
  const p = soundPos(L, snd);
  const size = wordSize(L, snd);
  font(ctx, 900, size);
  spacing(ctx, "0px");
  const half = ctx.measureText(KINDS[snd.kind].word).width / 2 + 14 * L.s;
  const lo = L.ox + half;
  const hi = L.ox + L.sw - half;
  return { x: lo > hi ? L.ox + L.sw / 2 : Math.min(hi, Math.max(lo, p.x)), y: p.y };
}

/** 押さえているほど、文字の色が白へ抜ける */
function mix(hex: string, p: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const k = Math.min(1, p) * 0.75;
  const f = (c: number, w: number): number => Math.round(c + (w - c) * k);
  return `rgb(${f(r, 243)},${f(g, 245)},${f(b, 255)})`;
}

function font(ctx: CanvasRenderingContext2D, weight: number, px: number, family = JP): void {
  ctx.font = `${weight} ${Math.round(px)}px ${family}`;
}

function spacing(ctx: CanvasRenderingContext2D, v: string): void {
  if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = v;
}

export function wordSize(L: Layout, snd: Sound): number {
  const k = KINDS[snd.kind];
  if (snd.kind === "morning") return 44 * L.s;
  if (!k.bad) return 21 * L.s;
  return (19 + snd.loud * 30) * L.s;
}

/** 押せる範囲の半径（指で押しやすいよう、最低でも直径 60px） */
export function hitRadius(ctx: CanvasRenderingContext2D, L: Layout, snd: Sound): number {
  const size = wordSize(L, snd);
  font(ctx, 900, size);
  spacing(ctx, "0px");
  const w = ctx.measureText(KINDS[snd.kind].word).width;
  return Math.max(30, w / 2 + 10 * L.s, size * 0.95);
}

export interface Fx {
  reduced: boolean;
  showKeys: boolean;
  /** ゲームパッドがつながっている間、キー文字の代わりに出すボタン名（キー文字 → 名前） */
  padLabels?: Record<string, string>;
  time: number;
}

/** 背景：夜の藍。うるさいほど赤みが差す */
export function drawBackground(ctx: CanvasRenderingContext2D, L: Layout, noise: number, dawn: number, fx: Fx): void {
  ctx.fillStyle = "#070912";
  ctx.fillRect(0, 0, L.W, L.H);
  ctx.fillStyle = C.night;
  ctx.fillRect(L.ox, 0, L.sw, L.sh);
  if (noise > 0) {
    ctx.globalAlpha = Math.min(1, noise * 0.9);
    ctx.fillStyle = C.noisy;
    ctx.fillRect(L.ox, 0, L.sw, L.sh);
    ctx.globalAlpha = 1;
  }
  if (dawn > 0) {
    const g = ctx.createLinearGradient(0, L.sh * 0.3, 0, L.sh);
    g.addColorStop(0, "rgba(255,243,196,0)");
    g.addColorStop(1, `rgba(255,176,32,${0.22 * dawn})`);
    ctx.fillStyle = g;
    ctx.fillRect(L.ox, 0, L.sw, L.sh);
  }
  // 細い縦の罫（部屋の壁紙）
  ctx.strokeStyle = "rgba(191,212,255,0.06)";
  ctx.lineWidth = 1;
  const n = 8;
  for (let i = 1; i < n; i++) {
    const x = Math.round(L.ox + (L.sw / n) * i) + 0.5;
    const wob = fx.reduced ? 0 : Math.sin(fx.time * 40 + i) * noise * 3;
    ctx.beginPath();
    ctx.moveTo(x + wob, L.fy - 10 * L.s);
    ctx.lineTo(x - wob, L.bedY);
    ctx.stroke();
  }
  // 四隅を沈める
  const v = ctx.createRadialGradient(L.ox + L.sw / 2, L.sh * 0.45, L.sw * 0.2, L.ox + L.sw / 2, L.sh * 0.45, Math.max(L.sw, L.sh) * 0.75);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(0,0,0,0.45)");
  ctx.fillStyle = v;
  ctx.fillRect(L.ox, 0, L.sw, L.sh);
}

/** PC の横長の画面で、舞台の両脇に出す説明 */
export function drawSides(ctx: CanvasRenderingContext2D, L: Layout, scene: "title" | "play" | "result"): void {
  const side = L.ox;
  if (side < 180) return;
  ctx.save();
  ctx.textBaseline = "alphabetic";
  // 左：縦に大きくサービス名
  spacing(ctx, "0px");
  font(ctx, 900, 100, JP);
  const fit = Math.min(side * 0.5, (100 * L.H * 0.86) / ctx.measureText("MUTE THE ROOM").width);
  font(ctx, 900, fit, JP);
  ctx.fillStyle = "rgba(191,212,255,0.07)";
  ctx.save();
  ctx.translate(side * 0.5 + fit * 0.35, L.H / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = "center";
  ctx.fillText("MUTE THE ROOM", 0, 0);
  ctx.restore();
  // 右：遊び方
  const x = L.ox + L.sw + 48;
  ctx.textAlign = "left";
  font(ctx, 700, 14, MONO);
  spacing(ctx, "0.2em");
  ctx.fillStyle = C.sub;
  ctx.fillText("HOW TO", x, L.H / 2 - 92);
  spacing(ctx, "0.04em");
  const lines: [string, string][] =
    scene === "result"
      ? [
          ["R", "もう一度"],
          ["M", "音を消す・出す"],
        ]
      : [
          ["クリック", "音を押さえ続けて止める"],
          [KEYS.slice(0, 7).join(" "), "音の横の文字のキーで押さえる"],
          ["♪ 青白い音", "押しちゃダメ"],
          ["M", "音を消す・出す"],
        ];
  lines.forEach(([k, d], i) => {
    const y = L.H / 2 - 52 + i * 46;
    font(ctx, 700, 14, MONO);
    ctx.fillStyle = C.ink;
    ctx.fillText(k, x, y);
    font(ctx, 500, 14, JP);
    ctx.fillStyle = C.sub;
    ctx.fillText(d, x, y + 20);
  });
  ctx.restore();
  spacing(ctx, "0px");
}

/** 音を1つ描く */
export function drawSound(ctx: CanvasRenderingContext2D, L: Layout, snd: Sound, fx: Fx, finaleLeft = 0): void {
  const k = KINDS[snd.kind];
  const { x, y } = placeOf(ctx, L, snd);
  const size = wordSize(L, snd);
  const r = hitRadius(ctx, L, snd);
  const held = snd.holders > 0;
  const prog = k.bad ? Math.min(1, snd.hold / holdNeeded(snd.loud)) : 0;
  const t = fx.time;

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  spacing(ctx, "0px");

  if (snd.state === "muted") {
    const p = Math.min(1, snd.since / 0.9);
    // 押しつぶされて「・・・」が浮く
    ctx.globalAlpha = Math.max(0, 1 - p * 1.6);
    font(ctx, 900, size);
    ctx.translate(x, y);
    ctx.scale(1 + p * 0.5, Math.max(0.05, 0.4 - p * 0.4));
    ctx.fillStyle = k.color;
    ctx.fillText(k.word, 0, 0);
    ctx.restore();
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.globalAlpha = Math.max(0, 1 - p);
    font(ctx, 900, 22 * L.s);
    ctx.fillStyle = k.color;
    ctx.fillText("・・・", x, y - 10 * L.s - p * 46 * L.s);
    ctx.restore();
    return;
  }
  if (snd.state === "gone") {
    ctx.globalAlpha = Math.max(0, 1 - snd.since / 0.6);
  }
  if (snd.state === "broken") {
    const p = Math.min(1, snd.since / 1.1);
    ctx.globalAlpha = Math.max(0, 1 - p);
    const sh = fx.reduced ? 0 : Math.sin(snd.since * 70) * 8 * (1 - p);
    font(ctx, 900, size);
    ctx.fillStyle = k.color;
    ctx.fillText(k.word, x + sh, y);
    ctx.strokeStyle = C.red;
    ctx.lineWidth = 5 * L.s;
    ctx.lineCap = "round";
    const a = r * 0.75;
    ctx.beginPath();
    ctx.moveTo(x - a, y - a);
    ctx.lineTo(x + a, y + a);
    ctx.moveTo(x + a, y - a);
    ctx.lineTo(x - a, y + a);
    ctx.stroke();
    font(ctx, 900, 30 * L.s);
    ctx.fillStyle = C.red;
    ctx.fillText("ダメ！", x, y - r - 18 * L.s - p * 20 * L.s);
    ctx.restore();
    return;
  }

  const ringing = k.bad || snd.kind === "morning";
  font(ctx, 900, size);
  const ww = ctx.measureText(k.word).width;
  const rx = ww / 2 + 12 * L.s;
  const ry = size * 0.62 + 12 * L.s;
  const loud = snd.kind === "morning" ? 0.8 : snd.loud;

  // 音の波（輪が外へ広がる）と、マンガの効果線
  if (ringing) {
    const waves = held ? 1 : 2;
    for (let i = 0; i < waves; i++) {
      const ph = fx.reduced ? 0.5 : (t * (0.8 + loud * 1.2) + i / waves) % 1;
      const grow = 1 + ph * (0.35 + loud * 0.9);
      ctx.globalAlpha = (1 - ph) * (held ? 0.1 : 0.14 + loud * 0.24) * (snd.state === "gone" ? 0 : 1);
      ctx.strokeStyle = k.color;
      ctx.lineWidth = 1.5 + loud * 2;
      ctx.beginPath();
      ctx.ellipse(x, y, rx * grow, ry * grow + ph * 18 * L.s, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = snd.state === "gone" ? Math.max(0, 1 - snd.since / 0.6) : 1;
    if (!held) {
      const n = 8 + Math.round(loud * 10);
      const frame = fx.reduced ? 0 : Math.floor(t * 14);
      ctx.strokeStyle = k.color;
      ctx.lineCap = "round";
      ctx.lineWidth = 2.5 * L.s;
      for (let i = 0; i < n; i++) {
        const h = Math.sin((i + 1) * 12.9898 + snd.id * 78.233 + frame * 3.1) * 43758.5453;
        const rnd = h - Math.floor(h);
        const ang = (i / n) * Math.PI * 2 + rnd * 0.4;
        const k0 = 1 + rnd * 0.1;
        const len = (6 + loud * 16 + rnd * 8) * L.s;
        const cx0 = Math.cos(ang);
        const cy0 = Math.sin(ang);
        ctx.beginPath();
        ctx.moveTo(x + cx0 * rx * k0, y + cy0 * ry * k0);
        ctx.lineTo(x + cx0 * (rx * k0 + len), y + cy0 * (ry * k0 + len));
        ctx.stroke();
      }
    }
  } else {
    // 押しちゃダメな音：点線の輪がゆっくり回る
    ctx.setLineDash([3 * L.s, 7 * L.s]);
    ctx.lineDashOffset = fx.reduced ? 0 : -t * 12;
    ctx.strokeStyle = k.color;
    ctx.globalAlpha *= 0.7;
    ctx.lineWidth = 2;
    ctx.beginPath();
    const wob = fx.reduced ? 0 : Math.sin(t * 2) * 3;
    ctx.ellipse(x, y, rx + 6 * L.s + wob, ry + 6 * L.s + wob, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha /= 0.7;
    // やわらかい面（止める音には面を敷かない＝とがって見える）
    ctx.fillStyle = k.color;
    const a0 = ctx.globalAlpha;
    ctx.globalAlpha = a0 * 0.09;
    ctx.beginPath();
    ctx.ellipse(x, y, rx + 6 * L.s, ry + 6 * L.s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = a0;
  }
  const base = ctx.globalAlpha;

  // 文字（マンガの描き文字：夜の色でふちどる）
  font(ctx, 900, size);
  ctx.lineJoin = "round";
  const jit = fx.reduced || held ? 0 : loud * 3.2 * L.s;
  const jx = ringing ? Math.sin(t * 61 + snd.id) * jit : fx.reduced ? 0 : Math.sin(t * 1.3 + snd.id) * 3;
  const jy = ringing ? Math.cos(t * 53 + snd.id * 3) * jit : fx.reduced ? 0 : Math.cos(t * 1.1 + snd.id) * 3;
  ctx.save();
  ctx.translate(x + jx, y + jy);
  if (held) ctx.scale(1 + prog * 0.18, 1 - prog * 0.45);
  if (ringing && !held && !fx.reduced) {
    // 上下にずれた写し（鳴って震えている）
    const off = (3 + loud * 7) * L.s;
    ctx.globalAlpha = base * (0.3 + loud * 0.3);
    ctx.strokeStyle = k.color;
    ctx.lineWidth = 1.5 * L.s;
    ctx.strokeText(k.word, -off * 0.4, -off);
    ctx.strokeText(k.word, off * 0.4, off);
    ctx.globalAlpha = base;
  }
  if (ringing) {
    ctx.strokeStyle = C.night;
    ctx.lineWidth = Math.max(4, size * 0.2);
    ctx.strokeText(k.word, 0, 0);
  }
  ctx.fillStyle = held ? mix(k.color, prog) : k.color;
  ctx.fillText(k.word, 0, 0);
  ctx.restore();

  // 押さえている間の、満ちていく輪
  if (held || prog > 0) {
    const ex = rx + 10 * L.s;
    const ey = ry + 10 * L.s;
    ctx.strokeStyle = "rgba(243,245,255,0.18)";
    ctx.lineWidth = 6 * L.s;
    ctx.beginPath();
    ctx.ellipse(x, y, ex, ey, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = C.ink;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.ellipse(x, y, ex, ey, 0, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * prog);
    ctx.stroke();
  }

  // 押しちゃダメな音には、何の音かと「押さないで」を添える
  if (!k.bad) {
    font(ctx, 700, 14);
    spacing(ctx, "0.08em");
    ctx.fillStyle = k.color;
    ctx.globalAlpha = base * 0.95;
    const label = snd.kind === "morning" ? "7:00 の目覚まし｜押さないで" : `${k.source}｜押さないで`;
    ctx.fillText(label, x, y + ry + 26 * L.s);
    spacing(ctx, "0px");
    if (snd.kind === "morning" && finaleLeft > 0) {
      ctx.strokeStyle = C.dawn;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(x, y, rx + 34 * L.s, ry + 34 * L.s, 0, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (finaleLeft / FINALE));
      ctx.stroke();
    }
  } else if (fx.showKeys && snd.key) {
    // キーボードで押さえるキー
    const kx = x + rx;
    const ky = y - ry;
    ctx.fillStyle = C.night;
    ctx.strokeStyle = k.color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(kx - 13, ky - 13, 26, 26, 6);
    ctx.fill();
    ctx.stroke();
    font(ctx, 700, 14, MONO);
    ctx.fillStyle = k.color;
    ctx.fillText(fx.padLabels?.[snd.key] ?? snd.key, kx, ky + 1);
  }
  ctx.restore();
}

export type Mood = "sleep" | "uneasy" | "awake" | "happy";

/** 画面の下に寝ている人 */
export function drawSleeper(ctx: CanvasRenderingContext2D, L: Layout, mood: Mood, sleep: number, fx: Fx, alpha = 1): void {
  const cx = L.ox + L.sw / 2;
  const breathe = fx.reduced ? 0 : Math.sin(fx.time * 1.7) * 2.2 * L.s;
  const hr = Math.min(L.sw * 0.13, (L.sh - L.bedY) * 0.42);
  const cy = L.bedY + hr * 1.05 + breathe * 0.5;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  // まくら
  ctx.fillStyle = "#1A2038";
  ctx.strokeStyle = "rgba(232,236,247,0.45)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(cx - L.sw * 0.3, cy - hr * 0.55, L.sw * 0.6, hr * 1.4, hr * 0.6);
  ctx.fill();
  ctx.stroke();

  // 頭
  const blush = Math.max(0, 1 - sleep / 45);
  ctx.fillStyle = C.body;
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 2.6 * L.s;
  ctx.beginPath();
  ctx.arc(cx, cy, hr, 0, Math.PI * 2);
  ctx.fill();
  if (blush > 0 && mood !== "happy") {
    ctx.fillStyle = `rgba(255,77,61,${0.28 * blush})`;
    ctx.fill();
  }
  ctx.stroke();
  // 前髪
  ctx.beginPath();
  ctx.arc(cx, cy, hr, Math.PI * 1.08, Math.PI * 1.92);
  ctx.quadraticCurveTo(cx + hr * 0.2, cy - hr * 0.45, cx - hr * 0.1, cy - hr * 0.62);
  ctx.quadraticCurveTo(cx - hr * 0.5, cy - hr * 0.45, cx - hr * 0.94, cy - hr * 0.36);
  ctx.fillStyle = C.night;
  ctx.fill();
  ctx.stroke();

  // 目
  const ex = hr * 0.4;
  const ey = cy + hr * 0.08;
  const ew = hr * 0.2;
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 2.6 * L.s;
  const tremble = mood === "uneasy" && !fx.reduced ? Math.sin(fx.time * 45) * 1.2 : 0;
  for (const side of [-1, 1]) {
    const x = cx + side * ex;
    ctx.beginPath();
    if (mood === "awake") {
      ctx.fillStyle = C.line;
      ctx.arc(x, ey, ew * 0.75, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, ey, ew * 0.25, 0, Math.PI * 2);
      ctx.fill();
      // 怒った眉
      ctx.beginPath();
      ctx.moveTo(x - side * ew, ey - ew * 1.5);
      ctx.lineTo(x + side * ew * 0.9, ey - ew * 0.95);
      ctx.stroke();
    } else if (mood === "happy") {
      ctx.arc(x, ey + ew * 0.3, ew * 0.8, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    } else {
      const sag = mood === "uneasy" ? 0.15 : 0.55;
      ctx.moveTo(x - ew, ey + tremble);
      ctx.quadraticCurveTo(x, ey + ew * sag * 2 + tremble, x + ew, ey + tremble);
      ctx.stroke();
      if (mood === "uneasy") {
        ctx.beginPath();
        ctx.moveTo(x - side * ew * 0.9, ey - ew * 1.3);
        ctx.lineTo(x + side * ew * 0.8, ey - ew * 1.0);
        ctx.stroke();
      }
    }
  }
  // 口
  ctx.beginPath();
  if (mood === "awake") {
    ctx.moveTo(cx - hr * 0.16, cy + hr * 0.5);
    ctx.lineTo(cx + hr * 0.16, cy + hr * 0.46);
    ctx.stroke();
  } else if (mood === "happy") {
    ctx.arc(cx, cy + hr * 0.38, hr * 0.16, 0.1, Math.PI - 0.1);
    ctx.stroke();
  } else {
    const o = hr * (0.07 + (fx.reduced ? 0.02 : (Math.sin(fx.time * 1.7) + 1) * 0.025));
    ctx.ellipse(cx, cy + hr * 0.48, o * 0.8, o, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // ふとん
  const by = cy + hr * 0.62;
  ctx.fillStyle = C.blanket;
  ctx.strokeStyle = "rgba(232,236,247,0.55)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(L.ox - 4, L.sh + 4);
  ctx.lineTo(L.ox - 4, by + 20 * L.s);
  const segs = 6;
  for (let i = 0; i <= segs; i++) {
    const x = L.ox + (L.sw / segs) * i;
    const yy = by + (i % 2 ? -6 : 6) * L.s + breathe;
    ctx.quadraticCurveTo(x - L.sw / segs / 2, yy - 8 * L.s, x, yy);
  }
  ctx.lineTo(L.ox + L.sw + 4, L.sh + 4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // ふとんの模様（細い斜線）
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = "rgba(191,212,255,0.07)";
  ctx.lineWidth = 6;
  for (let x = L.ox - L.sh; x < L.ox + L.sw; x += 22) {
    ctx.beginPath();
    ctx.moveTo(x, L.sh);
    ctx.lineTo(x + (L.sh - by), by);
    ctx.stroke();
  }
  ctx.restore();

  // Zzz
  if (mood === "sleep" || mood === "uneasy") {
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    for (let i = 0; i < 3; i++) {
      const ph = fx.reduced ? i / 3 : (fx.time * 0.35 + i / 3) % 1;
      const a = Math.sin(ph * Math.PI) * (mood === "uneasy" ? 0.35 : 0.85);
      ctx.globalAlpha = alpha * a;
      font(ctx, 900, (14 + ph * 16) * L.s);
      ctx.fillStyle = C.moon;
      ctx.fillText("Z", cx + hr * 0.9 + ph * 34 * L.s, cy - hr * 0.7 - ph * 46 * L.s);
    }
    ctx.globalAlpha = alpha;
  }
  if (mood === "awake") {
    font(ctx, 900, 40 * L.s);
    ctx.textAlign = "center";
    ctx.fillStyle = C.red;
    ctx.fillText("！", cx + hr * 1.4, cy - hr * 0.1);
  }
  ctx.restore();
}

/** 遊んでいる間の上の帯：時計・ねむり・黙らせた数 */
export function drawHud(ctx: CanvasRenderingContext2D, L: Layout, g: Game, fx: Fx): void {
  const pad = 20 * L.s;
  const x0 = L.ox + pad;
  ctx.save();
  // 夜の進み（いちばん上の細い線）
  ctx.fillStyle = "rgba(191,212,255,0.12)";
  ctx.fillRect(L.ox, 0, L.sw, 3);
  ctx.fillStyle = C.moon;
  ctx.fillRect(L.ox, 0, L.sw * Math.min(1, g.t / NIGHT), 3);

  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  font(ctx, 800, 34 * L.s, MONO);
  spacing(ctx, "-0.02em");
  ctx.fillStyle = g.phase === "finale" ? C.dawn : C.ink;
  ctx.fillText(clockLabel(g.t), x0, 50 * L.s);
  const cw = ctx.measureText(clockLabel(g.t)).width;
  spacing(ctx, "0.12em");
  font(ctx, 700, 14, JP);
  ctx.fillStyle = C.sub;
  ctx.fillText(g.t < NIGHT * (1 / 8) ? "PM" : "AM", x0 + cw + 8, 50 * L.s);
  ctx.fillText(`黙らせた ${g.muted}`, x0 + cw + 46 * L.s, 50 * L.s);

  // ねむり
  const by = 80 * L.s;
  spacing(ctx, "0.12em");
  font(ctx, 700, 14, JP);
  ctx.fillStyle = C.sub;
  ctx.fillText("ねむり", x0, by + 5);
  const bx = x0 + 64;
  const bw = L.sw - pad * 2 - 64;
  const p = g.sleep / SLEEP_MAX;
  const low = p < 0.3;
  ctx.fillStyle = "rgba(191,212,255,0.14)";
  ctx.beginPath();
  ctx.roundRect(bx, by - 4, bw, 8, 4);
  ctx.fill();
  const blink = low && !fx.reduced ? 0.6 + Math.sin(fx.time * 14) * 0.4 : 1;
  ctx.globalAlpha = blink;
  ctx.fillStyle = low ? C.red : C.moon;
  ctx.beginPath();
  ctx.roundRect(bx, by - 4, Math.max(6, bw * p), 8, 4);
  ctx.fill();
  ctx.restore();
  spacing(ctx, "0px");
}

/** 全部止めた瞬間の「シーン」 */
export function drawSilence(ctx: CanvasRenderingContext2D, L: Layout, age: number, fx: Fx): void {
  if (age > 1.6) return;
  const p = age / 1.6;
  ctx.save();
  ctx.globalAlpha = Math.sin(Math.min(1, p * 1.4) * Math.PI) * 0.9;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  font(ctx, 900, 64 * L.s * (fx.reduced ? 1 : 1 + p * 0.08));
  spacing(ctx, "0.3em");
  ctx.fillStyle = C.moon;
  ctx.fillText("シーン", L.ox + L.sw / 2 + 0.15 * 64 * L.s, L.fy + L.fh * 0.5);
  ctx.restore();
  spacing(ctx, "0px");
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  text?: string;
}

export function drawParticles(ctx: CanvasRenderingContext2D, L: Layout, ps: Particle[]): void {
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineCap = "round";
  for (const p of ps) {
    const a = Math.max(0, p.life / p.max);
    ctx.globalAlpha = a;
    if (p.text) {
      font(ctx, 800, 16 * L.s, MONO);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y);
    } else {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 3 * L.s;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** 指が触れている所の輪 */
export function drawTouch(ctx: CanvasRenderingContext2D, L: Layout, x: number, y: number): void {
  ctx.save();
  ctx.strokeStyle = "rgba(243,245,255,0.55)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 22 * L.s, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** タイトル画面の文字 */
export function drawTitle(ctx: CanvasRenderingContext2D, L: Layout): void {
  const cx = L.ox + L.sw / 2;
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  font(ctx, 700, 14, MONO);
  spacing(ctx, "0.32em");
  ctx.fillStyle = C.sub;
  ctx.fillText("MUTE THE ROOM", cx + 2, 56 * L.s);
  spacing(ctx, "0.02em");
  font(ctx, 900, 56 * L.s);
  ctx.fillStyle = C.ink;
  ctx.fillText("鳴ったら、", cx, 128 * L.s);
  ctx.fillText("押さえろ。", cx, 192 * L.s);
  spacing(ctx, "0.06em");
  font(ctx, 500, 15 * L.s);
  ctx.fillStyle = C.sub;
  ctx.fillText("23:00 から 7:00 まで、寝かせておけ。", cx, 230 * L.s);
  ctx.restore();
  spacing(ctx, "0px");
}

/** タイトルの、遊び方の2行 */
export function drawRules(ctx: CanvasRenderingContext2D, L: Layout): void {
  const cx = L.ox + L.sw / 2;
  const y = L.btnTop - (50 + 68) * L.s;
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  spacing(ctx, "0.04em");
  font(ctx, 700, 15 * L.s);
  ctx.fillStyle = C.ink;
  ctx.fillText("うるさい音は、指で押さえ続けて止める", cx, y);
  ctx.fillStyle = C.moon;
  ctx.fillText("青白い音（子守唄・寝息・雨）は押しちゃダメ", cx, y + 26 * L.s);
  ctx.restore();
  spacing(ctx, "0px");
}

/** 結果の1枚 */
export function drawResult(ctx: CanvasRenderingContext2D, L: Layout, sum: Summary, log: number[], appear: number, fx: Fx): void {
  const cx = L.ox + L.sw / 2;
  const pad = 22 * L.s;
  const s = L.s;
  const ease = (v: number): number => 1 - Math.pow(1 - Math.min(1, Math.max(0, v)), 3);
  const a1 = fx.reduced ? 1 : ease(appear / 0.5);
  const a2 = fx.reduced ? 1 : ease((appear - 0.25) / 0.5);
  const a3 = fx.reduced ? 1 : ease((appear - 0.5) / 0.6);
  ctx.save();
  ctx.textBaseline = "alphabetic";

  // 見出し
  ctx.textAlign = "left";
  font(ctx, 700, 14, MONO);
  spacing(ctx, "0.24em");
  ctx.fillStyle = C.sub;
  ctx.fillText("MUTE THE ROOM", L.ox + pad, 44 * s);
  ctx.textAlign = "right";
  spacing(ctx, "0.1em");
  font(ctx, 700, 14, JP);
  ctx.fillText("今夜の記録", L.ox + L.sw - pad - 52, 44 * s);

  // 大きな時刻
  ctx.globalAlpha = a1;
  ctx.textAlign = "left";
  const timeColor = sum.outcome === "clear" ? C.dawn : sum.outcome === "oversleep" ? C.orange : C.red;
  font(ctx, 800, 108 * s, MONO);
  spacing(ctx, "-0.04em");
  ctx.fillStyle = timeColor;
  ctx.fillText(sum.time, L.ox + pad - 4 * s, 150 * s + (1 - a1) * 20);
  spacing(ctx, "0.04em");
  font(ctx, 800, 20 * s);
  ctx.fillStyle = C.ink;
  ctx.fillText(sum.headline, L.ox + pad, 188 * s);
  if (sum.daily) {
    spacing(ctx, "0.1em");
    font(ctx, 700, 14, JP);
    ctx.fillStyle = C.sub;
    ctx.fillText(`今夜のお題 ${sum.daily}`, L.ox + pad, 212 * s);
  }
  ctx.globalAlpha = 1;

  // 称号の帯（斜め。縁に音の色が並ぶ）
  ctx.save();
  ctx.beginPath();
  ctx.rect(L.ox, 0, L.sw, L.sh);
  ctx.clip();
  ctx.translate(cx, 262 * s);
  ctx.rotate((-6 * Math.PI) / 180);
  const bw = L.sw + 120;
  const bh = 74 * s;
  const slide = (1 - a2) * -bw;
  ctx.translate(slide, 0);
  ctx.fillStyle = C.ink;
  ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
  const seg = 18 * s;
  for (let i = 0; i * seg < bw; i++) {
    ctx.fillStyle = BAD_COLORS[i % BAD_COLORS.length];
    ctx.fillRect(-bw / 2 + i * seg, -bh / 2 - 6 * s, seg, 4 * s);
    ctx.fillRect(-bw / 2 + i * seg, bh / 2 + 2 * s, seg, 4 * s);
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  spacing(ctx, "0.18em");
  font(ctx, 700, 14);
  ctx.fillStyle = "#4A5070";
  ctx.fillText("称号", 0, -bh * 0.27);
  spacing(ctx, "0.06em");
  font(ctx, 900, Math.min(36 * s, (L.sw - 40) / (sum.title.length + 1)));
  ctx.fillStyle = C.night;
  ctx.fillText(`「${sum.title}」`, 0, bh * 0.12);
  ctx.restore();

  // 今夜のうるささ（音の波形のように）
  ctx.globalAlpha = a3;
  const gy = 394 * s;
  const gh = 72 * s;
  const gx = L.ox + pad;
  const gw = L.sw - pad * 2;
  ctx.textAlign = "left";
  spacing(ctx, "0.12em");
  font(ctx, 700, 14);
  ctx.fillStyle = C.sub;
  ctx.fillText("今夜のうるささ", gx, gy - gh / 2 - 12 * s);
  // 2 つずつまとめて 64 本の棒にする。いちばん大きい所が枠いっぱいになるよう伸ばす
  const n = NIGHT;
  const bwid = gw / n;
  let peak = 0.3;
  for (const v of log) peak = Math.max(peak, v);
  for (let i = 0; i < n; i++) {
    const a = log[i * 2];
    const b = log[i * 2 + 1];
    const x = gx + i * bwid;
    if (a === undefined) {
      ctx.fillStyle = "rgba(191,212,255,0.14)";
      ctx.beginPath();
      ctx.arc(x + bwid / 2, gy, 1.2, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    const v = Math.max(a, b ?? a);
    const h = Math.max(4, (v / peak) * gh);
    ctx.fillStyle = v > 0.55 ? C.red : v > 0.25 ? C.orange : C.moon;
    ctx.beginPath();
    ctx.roundRect(x + 0.5, gy - h / 2, Math.max(1.5, bwid - 2), h, 2);
    ctx.fill();
  }
  if (sum.outcome === "woke") {
    const ex = gx + Math.min(Math.ceil(log.length / 2), n) * bwid;
    ctx.strokeStyle = C.red;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ex, gy - gh / 2 - 4);
    ctx.lineTo(ex, gy + gh / 2 + 4);
    ctx.stroke();
  }
  font(ctx, 700, 14, MONO);
  spacing(ctx, "0px");
  ctx.fillStyle = C.sub;
  ctx.fillText("23:00", gx, gy + gh / 2 + 20 * s);
  ctx.textAlign = "right";
  ctx.fillText("7:00", gx + gw, gy + gh / 2 + 20 * s);

  // 数字3つ
  const sy = 528 * s;
  const cols: [string, string][] = [
    [String(sum.muted), "黙らせた音"],
    [String(sum.silences), "シーン"],
    [String(sum.mistakes), "押しちゃった"],
  ];
  cols.forEach(([v, label], i) => {
    const x = gx + (gw / 3) * i;
    ctx.textAlign = "left";
    ctx.strokeStyle = "rgba(191,212,255,0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, sy - 46 * s);
    ctx.lineTo(x + gw / 3 - 10 * s, sy - 46 * s);
    ctx.stroke();
    font(ctx, 800, 38 * s, MONO);
    ctx.fillStyle = i === 2 && sum.mistakes > 0 ? C.red : C.ink;
    ctx.fillText(v, x, sy);
    font(ctx, 700, 14);
    spacing(ctx, "0.06em");
    ctx.fillStyle = C.sub;
    ctx.fillText(label, x, sy + 24 * s);
    spacing(ctx, "0px");
  });
  ctx.restore();
  spacing(ctx, "0px");
}
