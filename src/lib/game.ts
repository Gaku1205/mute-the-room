import { BAD_KINDS, KINDS, SAFE_KINDS, type KindId } from "./kinds";
import { makeRng } from "./rng";

/** 夜の長さ（秒）。23:00 → 7:00 の 8 時間をこの秒数で進める */
export const NIGHT = 64;
/** 7:00 の目覚ましを、押さずに待つ秒数 */
export const FINALE = 3;
/** ねむりの最大 */
export const SLEEP_MAX = 100;
/** 押しちゃダメな音を押した時に減るねむり */
export const PENALTY = 20;
/** キーボードで押さえる時のキー */
export const KEYS = ["A", "S", "D", "F", "J", "K", "L", "G", "H"];

export type SoundState = "live" | "muted" | "gone" | "broken";

export interface Sound {
  id: number;
  kind: KindId;
  /** 遊ぶ場所の中の位置（0〜1） */
  x: number;
  y: number;
  age: number;
  /** 大きさ（0〜1）。放っておくと大きくなる */
  loud: number;
  /** 押さえた時間（秒） */
  hold: number;
  /** 押さえている指・キーの数 */
  holders: number;
  state: SoundState;
  /** 消えてから経った秒数（消える動きに使う） */
  since: number;
  key: string;
  /** 大きくなりきるまでの秒数 */
  grow: number;
  /** 押しちゃダメな音が鳴っている秒数 */
  life: number;
}

export type Outcome = "clear" | "woke" | "oversleep";

export type GameEvent =
  | { type: "spawn"; id: number; kind: KindId }
  | { type: "mute"; id: number; kind: KindId; points: number; x: number; y: number }
  | { type: "penalty"; id: number; kind: KindId; x: number; y: number }
  | { type: "silence" }
  | { type: "dawn" }
  | { type: "end"; outcome: Outcome };

export interface Game {
  t: number;
  rng: () => number;
  sounds: Sound[];
  sleep: number;
  phase: "play" | "finale" | "over";
  outcome: Outcome | null;
  /** 終わった時刻（夜の秒） */
  endT: number;
  finaleT: number;
  spawnIn: number;
  nextId: number;
  muted: number;
  mistakes: number;
  silences: number;
  score: number;
  /** 0.5 秒ごとのうるささ（0〜1）。結果の波形に使う */
  noiseLog: number[];
  logIn: number;
  /** 今のうるささ（0〜1） */
  noise: number;
  safeShown: number;
  events: GameEvent[];
}

export function createGame(seed: number): Game {
  return {
    t: 0,
    rng: makeRng(seed),
    sounds: [],
    sleep: SLEEP_MAX,
    phase: "play",
    outcome: null,
    endT: 0,
    finaleT: 0,
    spawnIn: 0.6,
    nextId: 1,
    muted: 0,
    mistakes: 0,
    silences: 0,
    score: 0,
    noiseLog: [],
    logIn: 0,
    noise: 0,
    safeShown: 0,
    events: [],
  };
}

const lerp = (a: number, b: number, p: number): number => a + (b - a) * p;

/** 夜の進み具合（0〜1）に応じた難しさ */
export function difficulty(t: number): { interval: number; grow: number; maxLive: number; safeChance: number } {
  const p = Math.min(1, Math.max(0, t / NIGHT));
  return {
    interval: lerp(1.45, 0.62, p),
    grow: lerp(4.2, 2.3, p),
    maxLive: 3 + Math.floor(p * 4),
    safeChance: t < 6 ? 0 : lerp(0.2, 0.3, p),
  };
}

/** 夜の秒を時計の文字にする（0 → "23:00"、NIGHT → "7:00"） */
export function clockLabel(t: number): string {
  const clamped = Math.min(NIGHT, Math.max(0, t));
  const total = 23 * 60 + Math.floor((clamped / NIGHT) * 480);
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

/** 止めるのに押さえ続ける秒数。大きい音ほど長い */
export function holdNeeded(loud: number): number {
  return 0.22 + 0.5 * loud;
}

/** 止めた時の点。小さいうちに止めるほど高い */
export function mutePoints(loud: number): number {
  return 100 + Math.round((1 - loud) * 100);
}

/** 1つの止める音が、1秒あたりに減らすねむり */
export function drainRate(loud: number, held: boolean): number {
  const r = 2 + 9 * Math.pow(loud, 1.5);
  return held ? r * 0.2 : r;
}

function liveBad(g: Game): Sound[] {
  return g.sounds.filter((s) => s.state === "live" && KINDS[s.kind].bad);
}

function freeKey(g: Game): string {
  const used = new Set(g.sounds.filter((s) => s.state === "live").map((s) => s.key));
  return KEYS.find((k) => !used.has(k)) ?? "";
}

function place(g: Game): { x: number; y: number } {
  let best = { x: 0.5, y: 0.5 };
  let bestD = -1;
  for (let i = 0; i < 14; i++) {
    const c = { x: 0.16 + g.rng() * 0.68, y: 0.1 + g.rng() * 0.8 };
    let d = Infinity;
    for (const s of g.sounds) {
      if (s.state !== "live") continue;
      d = Math.min(d, Math.hypot((s.x - c.x) * 0.6, s.y - c.y));
    }
    if (d > 0.3) return c;
    if (d > bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

/** 音を1つ出す（kind を省くと夜の進み具合で選ぶ） */
export function spawn(g: Game, kind?: KindId, at?: { x: number; y: number }): Sound {
  const d = difficulty(g.t);
  let k = kind;
  if (!k) {
    const safe = g.rng() < d.safeChance || (g.safeShown === 0 && g.t > 9);
    // 夜の最初は分かりやすい音だけ
    const bads = g.t < 10 ? BAD_KINDS.slice(0, 3) : BAD_KINDS;
    const pool = safe ? SAFE_KINDS : bads;
    k = pool[Math.floor(g.rng() * pool.length)];
  }
  const pos = at ?? place(g);
  const s: Sound = {
    id: g.nextId++,
    kind: k,
    x: pos.x,
    y: pos.y,
    age: 0,
    loud: KINDS[k].bad ? 0.2 : 0.5,
    hold: 0,
    holders: 0,
    state: "live",
    since: 0,
    key: freeKey(g),
    grow: d.grow * (0.85 + g.rng() * 0.3),
    life: 4.2 + g.rng() * 1.2,
  };
  if (!KINDS[k].bad) g.safeShown++;
  g.sounds.push(s);
  g.events.push({ type: "spawn", id: s.id, kind: k });
  return s;
}

function end(g: Game, outcome: Outcome): void {
  if (g.phase === "over") return;
  g.phase = "over";
  g.outcome = outcome;
  g.endT = Math.min(g.t, NIGHT);
  for (const s of g.sounds) {
    if (s.state === "live") {
      s.state = "gone";
      s.since = 0;
    }
  }
  g.events.push({ type: "end", outcome });
}

function muteSound(g: Game, s: Sound): void {
  const points = mutePoints(s.loud);
  s.state = "muted";
  s.since = 0;
  s.holders = 0;
  g.muted++;
  g.score += points;
  g.events.push({ type: "mute", id: s.id, kind: s.kind, points, x: s.x, y: s.y });
  if (g.phase === "play" && liveBad(g).length === 0) {
    g.silences++;
    g.events.push({ type: "silence" });
  }
}

/** 指・キーで音を押さえ始める。押しちゃダメな音なら罰 */
export function press(g: Game, id: number): "hold" | "penalty" | null {
  if (g.phase === "over") return null;
  const s = g.sounds.find((v) => v.id === id && v.state === "live");
  if (!s) return null;
  if (!KINDS[s.kind].bad) {
    s.state = "broken";
    s.since = 0;
    g.mistakes++;
    g.events.push({ type: "penalty", id: s.id, kind: s.kind, x: s.x, y: s.y });
    if (s.kind === "morning") {
      end(g, "oversleep");
    } else {
      g.sleep = Math.max(0, g.sleep - PENALTY);
      if (g.sleep <= 0) end(g, "woke");
    }
    return "penalty";
  }
  s.holders++;
  return "hold";
}

/** 押さえるのをやめる */
export function release(g: Game, id: number): void {
  const s = g.sounds.find((v) => v.id === id);
  if (s && s.holders > 0) s.holders--;
}

/** 時間を dt 秒進める */
export function step(g: Game, dt: number): void {
  for (const s of g.sounds) {
    if (s.state !== "live") s.since += dt;
  }
  g.sounds = g.sounds.filter((s) => s.state === "live" || s.since < 1.4);
  if (g.phase === "over") return;

  g.t += dt;
  const d = difficulty(g.t);

  for (const s of g.sounds) {
    if (s.state !== "live") continue;
    s.age += dt;
    const bad = KINDS[s.kind].bad;
    if (bad) {
      if (s.holders > 0) {
        s.hold += dt;
        if (s.hold >= holdNeeded(s.loud)) muteSound(g, s);
      } else {
        s.hold = Math.max(0, s.hold - dt * 1.5);
        s.loud = Math.min(1, s.loud + (dt / s.grow) * 0.8);
      }
    } else if (s.kind !== "morning" && s.age > s.life) {
      s.state = "gone";
      s.since = 0;
    }
  }

  const bads = liveBad(g);
  let noise = 0;
  if (g.phase === "play") {
    let drain = 0;
    for (const s of bads) {
      drain += drainRate(s.loud, s.holders > 0);
      noise += s.holders > 0 ? s.loud * 0.3 : s.loud;
    }
    if (bads.length === 0) g.sleep = Math.min(SLEEP_MAX, g.sleep + 4 * dt);
    else g.sleep = Math.max(0, g.sleep - drain * dt);
  }
  g.noise = Math.min(1, noise / 2.5);

  g.logIn -= dt;
  if (g.logIn <= 0 && g.phase === "play") {
    g.noiseLog.push(g.noise);
    g.logIn += 0.5;
  }

  if (g.phase === "play") {
    if (g.sleep <= 0) {
      end(g, "woke");
      return;
    }
    if (g.t >= NIGHT) {
      // 朝。残った音は朝の光で消え、7:00 の目覚ましだけが鳴る
      g.phase = "finale";
      for (const s of g.sounds) {
        if (s.state === "live") {
          s.state = "gone";
          s.since = 0;
        }
      }
      g.events.push({ type: "dawn" });
      spawn(g, "morning", { x: 0.5, y: 0.48 });
      return;
    }
    g.spawnIn -= dt;
    if (g.spawnIn <= 0) {
      const live = g.sounds.filter((s) => s.state === "live").length;
      if (live < d.maxLive) spawn(g);
      g.spawnIn = d.interval * (0.75 + g.rng() * 0.5);
    }
  } else if (g.phase === "finale") {
    g.finaleT += dt;
    if (g.finaleT >= FINALE) end(g, "clear");
  }
}

/** 結果の画面と共有に使う、その回のまとめ */
export interface Summary {
  outcome: Outcome;
  time: string;
  muted: number;
  mistakes: number;
  silences: number;
  score: number;
  title: string;
  headline: string;
  /** 「今夜のお題」で遊んだ回だけ、日付（例：11/3） */
  daily?: string;
}

export function titleFor(outcome: Outcome, endT: number, mistakes: number, sleep: number): string {
  if (outcome === "oversleep") return "二度寝製造機";
  if (outcome === "clear") {
    if (mistakes === 0 && sleep >= 60) return "夜の番人";
    if (mistakes === 0) return "静寂の職人";
    return "ぎりぎりの子守り";
  }
  const p = endT / NIGHT;
  if (p < 0.25) return "うるさい部屋の住人";
  if (p < 0.5) return "うたた寝の見張り";
  if (p < 0.8) return "夜ふかしの守り手";
  return "朝まであと一歩";
}

export function headlineFor(outcome: Outcome): string {
  if (outcome === "clear") return "まで守りきった";
  if (outcome === "oversleep") return "の目覚ましを止めて寝坊させた";
  return "に起きちゃった";
}

export function summarize(g: Game, daily?: string): Summary {
  const outcome = g.outcome ?? "woke";
  const endT = outcome === "woke" ? g.endT : NIGHT;
  return {
    outcome,
    time: clockLabel(endT),
    muted: g.muted,
    mistakes: g.mistakes,
    silences: g.silences,
    score: g.score,
    title: titleFor(outcome, endT, g.mistakes, g.sleep),
    headline: headlineFor(outcome),
    ...(daily ? { daily } : {}),
  };
}

export function shareText(s: Summary, url: string): string {
  return [
    `🤫 mute-the-room`,
    ...(s.daily ? [`今夜のお題 ${s.daily}`] : []),
    `${s.time} ${s.headline}`,
    `黙らせた音 ${s.muted}｜シーン ${s.silences}回｜押しちゃった ${s.mistakes}`,
    `称号「${s.title}」`,
    url,
  ].join("\n");
}
