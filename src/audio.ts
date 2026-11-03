import type { KindId } from "./lib/kinds";

// 音は全部 Web Audio で作る（外の音のファイルは使わない）。最初のタップ・キーで unlock() してから鳴る

interface Voice {
  out: GainNode;
  filter: BiquadFilterNode;
  pan: StereoPannerNode;
  next: number;
  stopDrone?: () => void;
}

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let muted = false;
const voices = new Map<number, Voice>();

export function unlock(): void {
  if (!ctx) {
    const AC = window.AudioContext;
    if (!AC) return;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.8;
    master.connect(comp).connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === "suspended") void ctx.resume();
}

export function setMuted(m: boolean): void {
  muted = m;
  if (ctx && master) master.gain.setTargetAtTime(m ? 0 : 0.8, ctx.currentTime, 0.02);
}

export function isMuted(): boolean {
  return muted;
}

function tone(dest: AudioNode, type: OscillatorType, f0: number, f1: number, t: number, dur: number, vol: number, attack = 0.005): void {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dest: AudioNode, t: number, dur: number, vol: number, freq: number, q: number, type: BiquadFilterType = "bandpass", attack = 0.005): void {
  if (!ctx || !noiseBuf) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(dest);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.02);
}

const PENTA = [523.25, 587.33, 659.25, 783.99, 880, 1046.5];

/** 種類ごとの「1回ぶん」の鳴り方と、次に鳴るまでの秒数 */
function pulse(kind: KindId, dest: AudioNode, t: number): number {
  switch (kind) {
    case "alarm":
    case "morning":
      for (let i = 0; i < 8; i++) tone(dest, "square", 1760, 1760, t + i * 0.045, 0.035, 0.18);
      return 0.42;
    case "phone":
      for (let i = 0; i < 14; i++) tone(dest, "sine", i % 2 ? 960 : 880, i % 2 ? 960 : 880, t + i * 0.055, 0.05, 0.4);
      return 1.3;
    case "dog":
      tone(dest, "sawtooth", 620, 260, t, 0.13, 0.35);
      noise(dest, t, 0.1, 0.25, 900, 2);
      tone(dest, "sawtooth", 600, 240, t + 0.2, 0.13, 0.35);
      noise(dest, t + 0.2, 0.1, 0.25, 900, 2);
      return 0.95;
    case "bell":
      tone(dest, "sine", 1318.5, 1318.5, t, 0.4, 0.45);
      tone(dest, "sine", 1046.5, 1046.5, t + 0.32, 0.9, 0.45);
      return 1.7;
    case "kettle":
      tone(dest, "sine", 2350, 2450, t, 0.62, 0.22, 0.05);
      return 0.55;
    case "voice":
      // 「ねえ・起きて」っぽい、こもった声の抑揚
      for (const [dt, f0, f1, d] of [
        [0, 230, 300, 0.22],
        [0.32, 260, 240, 0.12],
        [0.46, 300, 220, 0.2],
      ] as const) {
        tone(dest, "sawtooth", f0, f1, t + dt, d, 0.16, 0.02);
        noise(dest, t + dt, d, 0.08, 1100, 3, "bandpass", 0.02);
      }
      return 1.25;
    case "buzz":
      tone(dest, "sawtooth", 92, 88, t, 0.45, 0.4, 0.01);
      tone(dest, "sawtooth", 92, 88, t + 0.6, 0.45, 0.4, 0.01);
      return 1.6;
    case "lullaby": {
      const n = PENTA[Math.floor(Math.random() * PENTA.length)];
      tone(dest, "triangle", n, n, t, 0.9, 0.22, 0.04);
      tone(dest, "sine", n / 2, n / 2, t, 0.9, 0.1, 0.04);
      return 0.5;
    }
    case "breath":
      noise(dest, t, 1.4, 0.18, 700, 0.6, "lowpass", 0.6);
      return 2.0;
    case "rain":
      noise(dest, t, 1.2, 0.12, 4000, 0.4, "highpass", 0.3);
      return 0.9;
  }
}

export function startVoice(id: number, kind: KindId, x: number): void {
  if (!ctx || !master) return;
  const out = ctx.createGain();
  out.gain.value = 0;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 12000;
  const pan = ctx.createStereoPanner();
  pan.pan.value = (x - 0.5) * 1.4;
  out.connect(filter).connect(pan).connect(master);
  voices.set(id, { out, filter, pan, next: ctx.currentTime + 0.02 });
}

/** 毎フレーム呼ぶ。loud は 0〜1、held なら押さえられてこもる */
export function updateVoice(id: number, kind: KindId, loud: number, held: boolean): void {
  const v = voices.get(id);
  if (!v || !ctx) return;
  const now = ctx.currentTime;
  v.out.gain.setTargetAtTime(held ? loud * 0.18 : 0.08 + loud * 0.55, now, 0.04);
  v.filter.frequency.setTargetAtTime(held ? 380 : 12000, now, 0.03);
  while (v.next < now + 0.12) {
    v.next = Math.max(v.next, now) + pulse(kind, v.out, Math.max(v.next, now));
  }
}

export function stopVoice(id: number, fade = 0.05): void {
  const v = voices.get(id);
  if (!v || !ctx) return;
  voices.delete(id);
  const now = ctx.currentTime;
  v.out.gain.cancelScheduledValues(now);
  v.out.gain.setTargetAtTime(0, now, fade);
  const out = v.out;
  window.setTimeout(() => out.disconnect(), 1500);
}

export function stopAll(): void {
  for (const id of [...voices.keys()]) stopVoice(id, 0.2);
}

function sfxDest(): AudioNode | null {
  return master;
}

/** 止めた音。「ぽすっ」と沈む */
export function sfxMute(x: number, combo: number): void {
  const d = sfxDest();
  if (!ctx || !d) return;
  const t = ctx.currentTime;
  const p = ctx.createStereoPanner();
  p.pan.value = (x - 0.5) * 1.2;
  p.connect(d);
  tone(p, "sine", 220, 55, t, 0.18, 0.7);
  noise(p, t, 0.06, 0.25, 300, 1, "lowpass");
  const n = 1046.5 * Math.pow(2, Math.min(combo, 8) / 12);
  tone(p, "sine", n, n, t + 0.05, 0.25, 0.08, 0.01);
}

/** 押さえ始めの手応え */
export function sfxPress(): void {
  const d = sfxDest();
  if (!ctx || !d) return;
  tone(d, "sine", 140, 90, ctx.currentTime, 0.08, 0.35);
}

/** 押しちゃダメな音を押した */
export function sfxPenalty(): void {
  const d = sfxDest();
  if (!ctx || !d) return;
  const t = ctx.currentTime;
  tone(d, "square", 160, 110, t, 0.28, 0.3);
  tone(d, "square", 169, 116, t, 0.28, 0.25);
}

/** 部屋が静かになった */
export function sfxSilence(): void {
  const d = sfxDest();
  if (!ctx || !d) return;
  const t = ctx.currentTime + 0.12;
  tone(d, "sine", 1568, 1568, t, 1.6, 0.06, 0.02);
  tone(d, "sine", 2093, 2093, t + 0.08, 1.4, 0.04, 0.02);
}

export function sfxStart(): void {
  const d = sfxDest();
  if (!ctx || !d) return;
  const t = ctx.currentTime;
  [392, 523.25, 659.25].forEach((f, i) => tone(d, "triangle", f, f, t + i * 0.09, 0.5, 0.18, 0.01));
}

export function sfxWake(): void {
  const d = sfxDest();
  if (!ctx || !d) return;
  const t = ctx.currentTime;
  [659.25, 523.25, 392, 261.63].forEach((f, i) => tone(d, "square", f, f * 0.98, t + i * 0.12, 0.22, 0.14));
}

export function sfxClear(): void {
  const d = sfxDest();
  if (!ctx || !d) return;
  const t = ctx.currentTime;
  [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => tone(d, "triangle", f, f, t + i * 0.1, 0.8, 0.2, 0.01));
}

export function sfxTap(): void {
  const d = sfxDest();
  if (!ctx || !d) return;
  tone(d, "sine", 600, 400, ctx.currentTime, 0.05, 0.08);
}
