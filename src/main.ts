import * as audio from "./audio";
import { dailyLabel, dailySeed } from "./lib/daily";
import { FINALE, KEYS, NIGHT, createGame, press, release, shareText, step, summarize, type Game, type Sound, type Summary } from "./lib/game";
import { buttonToKey, diffButtons, mergeButtons, padLabelMap } from "./lib/gamepad";
import { KINDS } from "./lib/kinds";
import { SHARE_FILE_NAME, SHARE_H, SHARE_SAVED_MESSAGE, SHARE_SCALE, SHARE_W, buildShareData, pickShareMode } from "./lib/share";
import {
  C,
  drawBackground,
  drawHud,
  drawParticles,
  drawResult,
  drawRules,
  drawSides,
  drawSilence,
  drawSleeper,
  drawSound,
  drawTitle,
  drawTouch,
  hitRadius,
  JP,
  placeOf,
  layout,
  soundPos,
  type Fx,
  type Layout,
  type Mood,
  type Particle,
} from "./render";

const canvas = document.querySelector<HTMLCanvasElement>("#game");
const ui = document.querySelector<HTMLDivElement>("#ui");
const btnStart = document.querySelector<HTMLButtonElement>("#start");
const btnDaily = document.querySelector<HTMLButtonElement>("#daily");
const btnAgain = document.querySelector<HTMLButtonElement>("#again");
const btnShare = document.querySelector<HTMLButtonElement>("#share");
const btnMute = document.querySelector<HTMLButtonElement>("#mute");
const toast = document.querySelector<HTMLDivElement>("#toast");
if (!canvas || !ui || !btnStart || !btnDaily || !btnAgain || !btnShare || !btnMute || !toast) throw new Error("画面の部品がありません");
const ctxOrNull = canvas.getContext("2d");
if (!ctxOrNull) throw new Error("2D の描画が使えません");
const ctx: CanvasRenderingContext2D = ctxOrNull;

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const showKeys = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

type Scene = "title" | "play" | "result";
let scene: Scene = "title";
let game: Game = createGame(Date.now() >>> 0);
let summary: Summary | null = null;
/** 今の夜が「今夜のお題」ならその日付（11/3）。ランダムなら null */
let dailyOf: string | null = null;
let resultLog: number[] = [];
let sceneTime = 0;
let time = 0;
let L: Layout = layout(window.innerWidth, window.innerHeight);
let particles: Particle[] = [];
let silenceAge = 99;
let shake = 0;
let flash = 0;
let flashColor = C.red;
let endDelay = -1;
let combo = 0;
let paused = false;
const pointers = new Map<number, { id: number; x: number; y: number }>();
const keysDown = new Map<string, number>();
/** ゲームパッド：前回のボタンの状態（つながっていなければ null）と、つながっているか */
let padPrev: boolean[] | null = null;
let padConnected = false;
const PAD_LABELS_MAP = padLabelMap();

// ---- 画面の大きさ ----
function resize(): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas!.width = Math.floor(window.innerWidth * dpr);
  canvas!.height = Math.floor(window.innerHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  L = layout(window.innerWidth, window.innerHeight);
  ui!.style.left = `${L.ox}px`;
  ui!.style.width = `${L.sw}px`;
  ui!.style.height = `${L.sh}px`;
  for (const b of [btnStart, btnAgain, btnShare]) b!.style.bottom = `${L.btnGap}px`;
  btnDaily!.style.bottom = `${L.btnGap + 56 + 12}px`;
}
window.addEventListener("resize", resize);
resize();

// ---- 音を消すボタン ----
const ICON_ON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>`;
const ICON_OFF = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M17 9l5 6M22 9l-5 6"/></svg>`;
function syncMute(): void {
  const m = audio.isMuted();
  btnMute!.innerHTML = m ? ICON_OFF : ICON_ON;
  btnMute!.setAttribute("aria-pressed", String(m));
  btnMute!.setAttribute("aria-label", m ? "音を出す" : "音を消す");
}
function toggleMute(): void {
  audio.unlock();
  audio.setMuted(!audio.isMuted());
  syncMute();
}
btnMute.addEventListener("click", toggleMute);
syncMute();

// ---- 場面の切り替え ----
function show(s: Scene): void {
  scene = s;
  sceneTime = 0;
  btnStart!.hidden = s !== "title";
  btnDaily!.hidden = s !== "title";
  btnAgain!.hidden = s !== "result";
  btnShare!.hidden = s !== "result";
}

function refreshDaily(): void {
  btnDaily!.textContent = `今夜のお題 ${dailyLabel(new Date())}`;
}
refreshDaily();

/** daily が true なら今日（日本時間）のお題、false ならランダムな夜で始める */
function startGame(daily = false): void {
  audio.unlock();
  audio.stopAll();
  audio.sfxStart();
  const now = new Date();
  dailyOf = daily ? dailyLabel(now) : null;
  game = createGame(daily ? dailySeed(now) : (Date.now() ^ (Math.random() * 1e9)) >>> 0);
  particles = [];
  pointers.clear();
  keysDown.clear();
  silenceAge = 99;
  endDelay = -1;
  combo = 0;
  paused = false;
  show("play");
  canvas!.focus();
}

function toResult(): void {
  summary = summarize(game, dailyOf ?? undefined);
  resultLog = game.noiseLog.slice();
  show("result");
  btnAgain!.focus({ preventScroll: true });
}

btnStart.addEventListener("click", () => startGame(false));
btnDaily.addEventListener("click", () => startGame(true));
btnAgain.addEventListener("click", () => startGame(dailyOf !== null));
/** 結果の1枚を、画面の大きさに関係なく固定の大きさ（780×1400）で PNG にする */
function renderResultImage(sum: Summary, log: number[]): Promise<Blob | null> {
  try {
    const off = document.createElement("canvas");
    off.width = SHARE_W * SHARE_SCALE;
    off.height = SHARE_H * SHARE_SCALE;
    const c = off.getContext("2d");
    if (!c) return Promise.resolve(null);
    c.scale(SHARE_SCALE, SHARE_SCALE);
    const SL = layout(SHARE_W, SHARE_H);
    const fx: Fx = { reduced: true, showKeys: false, time: 0 };
    const mood: Mood = sum.outcome === "clear" ? "happy" : sum.outcome === "oversleep" ? "sleep" : "awake";
    drawBackground(c, SL, 0, sum.outcome === "clear" ? 1 : 0, fx);
    drawResult(c, SL, sum, log, 99, fx);
    drawSleeper(c, SL, mood, sum.outcome === "woke" ? 0 : 100, fx, 0.9);
    return new Promise((resolve) => {
      try {
        off.toBlob((b) => resolve(b), "image/png");
      } catch {
        resolve(null);
      }
    });
  } catch {
    return Promise.resolve(null);
  }
}

function shareTextOnly(text: string): void {
  if (navigator.share) {
    navigator.share({ text }).catch(() => undefined);
  } else {
    navigator.clipboard
      ?.writeText(text)
      .then(() => showToast("結果をコピーしました"))
      .catch(() => showToast("コピーできませんでした"));
  }
}

function downloadImage(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = SHARE_FILE_NAME;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
  showToast(SHARE_SAVED_MESSAGE);
}

let sharing = false;
btnShare.addEventListener("click", () => {
  if (!summary || sharing) return;
  sharing = true;
  const text = shareText(summary, location.origin + location.pathname);
  renderResultImage(summary, resultLog)
    .then((blob) => {
      if (!blob) {
        shareTextOnly(text);
        return undefined;
      }
      const file = new File([blob], SHARE_FILE_NAME, { type: "image/png" });
      const canShare = typeof navigator.canShare === "function" ? (d: { files: File[] }) => navigator.canShare(d) : undefined;
      const data = buildShareData(text, file, canShare);
      if (pickShareMode(true, data) === "share-file" && navigator.share) {
        return navigator.share(data).catch(() => undefined);
      }
      downloadImage(blob);
      return undefined;
    })
    .catch(() => shareTextOnly(text))
    .finally(() => {
      sharing = false;
    });
});
let toastTimer = 0;
function showToast(msg: string): void {
  toast!.textContent = msg;
  toast!.classList.add("on");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast!.classList.remove("on"), 1800);
}

// ---- 入力 ----
function hit(x: number, y: number): Sound | null {
  let best: Sound | null = null;
  let bestD = Infinity;
  for (const s of game.sounds) {
    if (s.state !== "live") continue;
    const p = placeOf(ctx, L, s);
    const d = Math.hypot(p.x - x, p.y - y);
    const r = hitRadius(ctx, L, s) + 8;
    // 押しちゃダメな音は、少し狭く（うっかりを減らす）
    const rr = KINDS[s.kind].bad ? r : r * 0.85;
    if (d < rr && d / rr < bestD) {
      bestD = d / rr;
      best = s;
    }
  }
  return best;
}

function doPress(s: Sound): void {
  const r = press(game, s.id);
  if (r === "hold") {
    audio.sfxPress();
    if (!reduced) shake = Math.max(shake, 2);
  }
}

canvas.addEventListener("pointerdown", (e) => {
  audio.unlock();
  e.preventDefault();
  if (scene !== "play") return;
  paused = false;
  canvas.setPointerCapture(e.pointerId);
  const s = hit(e.clientX, e.clientY);
  pointers.set(e.pointerId, { id: s ? s.id : -1, x: e.clientX, y: e.clientY });
  if (s) doPress(s);
  else audio.sfxTap();
});
canvas.addEventListener("pointermove", (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  p.x = e.clientX;
  p.y = e.clientY;
  if (p.id < 0) return;
  const s = game.sounds.find((v) => v.id === p.id);
  if (!s || s.state !== "live") return;
  const pos = placeOf(ctx, L, s);
  // 指が大きく外れたら離したことにする
  if (Math.hypot(pos.x - p.x, pos.y - p.y) > hitRadius(ctx, L, s) * 1.8) {
    release(game, p.id);
    p.id = -1;
  }
});
function endPointer(e: PointerEvent): void {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  if (p.id >= 0) release(game, p.id);
  pointers.delete(e.pointerId);
}
canvas.addEventListener("pointerup", endPointer);
canvas.addEventListener("pointercancel", endPointer);
canvas.addEventListener("contextmenu", (e) => e.preventDefault());

window.addEventListener("keydown", (e) => {
  audio.unlock();
  const k = e.key.toUpperCase();
  if (k === "M") {
    toggleMute();
    return;
  }
  if (scene === "title" && (e.key === "Enter" || e.key === " ") && document.activeElement !== btnStart && document.activeElement !== btnDaily) {
    e.preventDefault();
    startGame(false);
    return;
  }
  if (scene === "result" && k === "R") {
    startGame(dailyOf !== null);
    return;
  }
  if (scene !== "play" || e.repeat) return;
  pressKey(k);
});
window.addEventListener("keyup", (e) => releaseKey(e.key.toUpperCase()));
window.addEventListener("blur", () => releaseAllKeys());

/** キー（A S D F …）で音を押さえる。キーボードもゲームパッドもここを通る */
function pressKey(k: string): void {
  if (!KEYS.includes(k)) return;
  paused = false;
  const s = game.sounds.find((v) => v.state === "live" && v.key === k);
  if (!s) return;
  keysDown.set(k, s.id);
  doPress(s);
}
function releaseKey(k: string): void {
  const id = keysDown.get(k);
  if (id !== undefined) {
    release(game, id);
    keysDown.delete(k);
  }
}
function releaseAllKeys(): void {
  for (const id of keysDown.values()) release(game, id);
  keysDown.clear();
}

// ---- ゲームパッド（標準配置のボタン 0〜8 を KEYS の順に割り当てる） ----
window.addEventListener("gamepaddisconnected", () => pollGamepad());
window.addEventListener("gamepadconnected", () => pollGamepad());

function pollGamepad(): void {
  let now: boolean[] | null = null;
  try {
    if (typeof navigator.getGamepads === "function") now = mergeButtons(Array.from(navigator.getGamepads()));
  } catch {
    now = null;
  }
  if (!now) {
    // 抜かれた：押さえている音を離す
    if (padPrev) releaseAllKeys();
    padPrev = null;
    padConnected = false;
    return;
  }
  padConnected = true;
  // つないだ直後は、押しっぱなしのボタンを「押した」と数えない
  const prev = padPrev ?? now;
  padPrev = now;
  const { pressed, released } = diffButtons(prev, now);
  for (const b of released) {
    const k = buttonToKey(b);
    if (k) releaseKey(k);
  }
  if (pressed.length === 0) return;
  audio.unlock();
  if (scene === "title") {
    startGame(false);
  } else if (scene === "result") {
    startGame(dailyOf !== null);
  } else if (scene === "play") {
    for (const b of pressed) {
      const k = buttonToKey(b);
      if (k) pressKey(k);
    }
  }
}

// ---- できごと（音・光・揺れ） ----
function burst(x: number, y: number, color: string, n: number): void {
  if (reduced) return;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.3;
    const sp = 260 + Math.random() * 260;
    particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.35, max: 0.35, color });
  }
}

function handleEvents(): void {
  for (const ev of game.events) {
    switch (ev.type) {
      case "spawn": {
        const s = game.sounds.find((v) => v.id === ev.id);
        if (s) audio.startVoice(s.id, s.kind, s.x);
        break;
      }
      case "mute": {
        audio.stopVoice(ev.id, 0.03);
        combo++;
        audio.sfxMute(ev.x, combo);
        const ms = game.sounds.find((v) => v.id === ev.id);
        const p = ms ? placeOf(ctx, L, ms) : soundPos(L, ev);
        burst(p.x, p.y, KINDS[ev.kind].color, 12);
        particles.push({ x: p.x, y: p.y - 40 * L.s, vx: 0, vy: -60, life: 0.9, max: 0.9, color: C.ink, text: `+${ev.points}` });
        shake = Math.max(shake, reduced ? 0 : 5);
        for (const [pid, ptr] of pointers) if (ptr.id === ev.id) pointers.set(pid, { ...ptr, id: -1 });
        break;
      }
      case "penalty": {
        audio.stopVoice(ev.id, 0.02);
        audio.sfxPenalty();
        combo = 0;
        shake = reduced ? 0 : 16;
        flash = 0.5;
        flashColor = C.red;
        if (navigator.vibrate) navigator.vibrate(80);
        break;
      }
      case "silence":
        silenceAge = 0;
        audio.sfxSilence();
        break;
      case "dawn":
        for (const s of game.sounds) audio.stopVoice(s.id, 0.3);
        flash = 0.4;
        flashColor = C.dawn;
        break;
      case "end":
        audio.stopAll();
        if (ev.outcome === "clear") {
          audio.sfxClear();
          flash = 0.5;
          flashColor = C.dawn;
        } else {
          audio.sfxWake();
          flash = 0.6;
          flashColor = ev.outcome === "woke" ? C.red : C.orange;
          shake = reduced ? 0 : 20;
        }
        endDelay = 1.5;
        break;
    }
  }
  game.events.length = 0;
  for (const s of game.sounds) {
    if (s.state !== "live") {
      audio.stopVoice(s.id, 0.15);
      continue;
    }
    audio.updateVoice(s.id, s.kind, s.kind === "morning" ? 0.7 : s.loud, s.holders > 0);
  }
  // 少しでも鳴りっぱなしの音があれば、連続は途切れる
  if (game.sounds.some((s) => s.state === "live" && KINDS[s.kind].bad && s.loud > 0.7)) combo = 0;
}

// ---- 場面を直接開く（?scene=play・?scene=result） ----
function demoSound(id: number, kind: Sound["kind"], x: number, y: number, loud: number, key = ""): Sound {
  return { id, kind, x, y, age: 1, loud, hold: 0, holders: 0, state: "live", since: 0, key, grow: 3, life: 99 };
}

function botNight(seed: number, giveUpAt: number): Game {
  const g = createGame(seed);
  const dt = 1 / 30;
  for (let i = 0; i < (NIGHT + 6) * 30 && g.phase !== "over"; i++) {
    for (const s of g.sounds) {
      if (s.state !== "live" || s.holders > 0) continue;
      const slow = g.t < giveUpAt ? 0.35 + (s.id % 3) * 0.3 : 3;
      if (KINDS[s.kind].bad && s.age > slow) press(g, s.id);
      if (giveUpAt < NIGHT && s.id === 9 && !KINDS[s.kind].bad) press(g, s.id);
    }
    step(g, dt);
  }
  return g;
}

const params = new URLSearchParams(location.search);
const want = params.get("scene");
if (want === "play") {
  game = createGame(42);
  game.t = 26.5;
  game.sleep = 54;
  game.muted = 13;
  game.silences = 4;
  game.sounds = [
    demoSound(1, "alarm", 0.26, 0.14, 0.95, "A"),
    demoSound(2, "dog", 0.74, 0.3, 0.55, "S"),
    demoSound(3, "phone", 0.36, 0.5, 0.35, "D"),
    demoSound(4, "lullaby", 0.72, 0.62, 0.5),
    demoSound(5, "voice", 0.34, 0.86, 0.72, "F"),
  ];
  game.sounds[2].holders = 1;
  game.sounds[2].hold = 0.27;
  game.nextId = 6;
  game.spawnIn = 2;
  paused = true;
  show("play");
  const p = placeOf(ctx, L, game.sounds[2]);
  pointers.set(-99, { id: 3, x: p.x + 6, y: p.y + 4 });
} else if (want === "result") {
  const outcome = params.get("end");
  game = outcome === "clear" ? botNight(11, 999) : botNight(7, 40);
  if (params.get("daily")) dailyOf = dailyLabel(new Date());
  if (outcome === "clear" && game.outcome !== "clear") game.outcome = "clear";
  toResult();
  sceneTime = 5;
} else {
  show("title");
}

// ---- 描く ----
function titleDemo(): void {
  const cyc = time % 3;
  const alarm = demoSound(101, "alarm", 0.32, 0.33, Math.min(1, 0.45 + cyc * 0.4));
  if (cyc > 0.9 && cyc < 1.7) {
    alarm.holders = 1;
    alarm.loud = 0.81;
    alarm.hold = (cyc - 0.9) * 0.82;
  } else if (cyc >= 1.7) {
    alarm.state = "muted";
    alarm.since = cyc - 1.7;
  }
  const fx: Fx = { reduced, showKeys: false, time };
  const sounds = [alarm, demoSound(102, "dog", 0.74, 0.44, 0.55), demoSound(103, "lullaby", 0.28, 0.52, 0.5)];
  for (const s of sounds) drawSound(ctx, L, s, fx);
  if (alarm.holders > 0) {
    const p = placeOf(ctx, L, alarm);
    drawTouch(ctx, L, p.x + 4, p.y + 6);
  }
}

function moodFor(): Mood {
  if (scene === "result" && summary) {
    if (summary.outcome === "clear") return "happy";
    if (summary.outcome === "oversleep") return "sleep";
    return "awake";
  }
  if (scene === "play") {
    if (game.phase === "over") return game.outcome === "clear" ? "happy" : game.outcome === "oversleep" ? "sleep" : "awake";
    if (game.sleep < 35) return "uneasy";
  }
  return "sleep";
}

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  pollGamepad();
  time += dt;
  sceneTime += dt;

  if (scene === "play") {
    if (!paused) step(game, dt);
    handleEvents();
    silenceAge += dt;
    if (endDelay > 0) {
      endDelay -= dt;
      if (endDelay <= 0) toResult();
    }
  }
  for (const p of particles) {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.9;
    p.vy *= 0.9;
  }
  particles = particles.filter((p) => p.life > 0);

  const fx: Fx = { reduced, showKeys: showKeys || padConnected, padLabels: padConnected ? PAD_LABELS_MAP : undefined, time };
  const noise = scene === "play" ? game.noise : 0;
  const dawn = scene === "play" && game.phase !== "play" && game.outcome !== "woke" ? Math.min(1, game.finaleT / 1 + 0.3) : scene === "result" && summary?.outcome === "clear" ? 1 : 0;

  ctx.save();
  const sh = reduced ? 0 : shake + noise * 4;
  if (sh > 0.1) ctx.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);
  shake *= Math.pow(0.002, dt);
  drawBackground(ctx, L, noise, dawn, fx);
  drawSides(ctx, L, scene);

  if (scene === "title") {
    drawTitle(ctx, L);
    titleDemo();
    drawRules(ctx, L);
    drawSleeper(ctx, L, "sleep", 100, fx);
  } else if (scene === "play") {
    drawSleeper(ctx, L, moodFor(), game.sleep, fx);
    for (const s of game.sounds) drawSound(ctx, L, s, fx, game.phase === "finale" ? FINALE - game.finaleT : 0);
    drawSilence(ctx, L, silenceAge, fx);
    drawParticles(ctx, L, particles);
    for (const p of pointers.values()) if (p.id >= 0) drawTouch(ctx, L, p.x, p.y);
    drawHud(ctx, L, game, fx);
    if (game.phase === "finale") {
      ctx.save();
      ctx.textAlign = "center";
      ctx.fillStyle = C.dawn;
      ctx.font = `900 ${Math.round(26 * L.s)}px ${JP}`;
      ctx.fillText("朝だ。これは止めないで", L.ox + L.sw / 2, L.fy + L.fh * 0.2);
      ctx.restore();
    }
  } else if (scene === "result" && summary) {
    drawResult(ctx, L, summary, resultLog, sceneTime, fx);
    drawSleeper(ctx, L, moodFor(), summary.outcome === "woke" ? 0 : 100, fx, 0.9);
  }

  if (flash > 0) {
    ctx.globalAlpha = Math.min(1, flash) * 0.45;
    ctx.fillStyle = flashColor;
    ctx.fillRect(0, 0, L.W, L.H);
    ctx.globalAlpha = 1;
    flash -= dt * 1.6;
  }
  ctx.restore();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// 画面を離れたら音を止める
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    for (const p of pointers.values()) if (p.id >= 0) release(game, p.id);
    pointers.clear();
    for (const id of keysDown.values()) release(game, id);
    keysDown.clear();
    if (scene === "play" && game.phase !== "over") paused = true;
  }
});
