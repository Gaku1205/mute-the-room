import { KEYS } from "./game";

/** 標準配置のボタン 0〜8 の名前（KEYS の先頭から順に割り当てる） */
export const PAD_LABELS = ["A", "B", "X", "Y", "LB", "RB", "LT", "RT", "戻"];

/** ボタン番号 → キー文字（割り当てが無ければ null） */
export function buttonToKey(index: number): string | null {
  if (!Number.isInteger(index) || index < 0 || index >= PAD_LABELS.length) return null;
  return KEYS[index] ?? null;
}

/** キー文字 → ボタン名（割り当てが無ければ null） */
export function keyToLabel(key: string): string | null {
  const i = KEYS.indexOf(key);
  if (i < 0 || i >= PAD_LABELS.length) return null;
  return PAD_LABELS[i];
}

/** キー文字 → ボタン名 の表（描画用） */
export function padLabelMap(): Record<string, string> {
  const m: Record<string, string> = {};
  for (let i = 0; i < PAD_LABELS.length && i < KEYS.length; i++) m[KEYS[i]] = PAD_LABELS[i];
  return m;
}

export interface PadLike {
  mapping: string;
  buttons: ReadonlyArray<{ pressed: boolean }>;
}

/** 標準配置のゲームパッドだけを対象に、ボタン 0〜8 の押している状態を返す（対象外は null） */
export function readButtons(pad: PadLike | null | undefined): boolean[] | null {
  if (!pad || pad.mapping !== "standard") return null;
  const out: boolean[] = [];
  for (let i = 0; i < PAD_LABELS.length; i++) out.push(pad.buttons[i]?.pressed === true);
  return out;
}

/** 複数のゲームパッドのうち、標準配置のものを合わせる（どれか1つでも押していれば押している） */
export function mergeButtons(pads: ReadonlyArray<PadLike | null | undefined>): boolean[] | null {
  let merged: boolean[] | null = null;
  for (const p of pads) {
    const b = readButtons(p);
    if (!b) continue;
    merged = merged ? merged.map((v, i) => v || b[i]) : b;
  }
  return merged;
}

/** 前回と今回のボタンの状態から、押した・離したボタン番号を出す */
export function diffButtons(prev: ReadonlyArray<boolean>, next: ReadonlyArray<boolean>): { pressed: number[]; released: number[] } {
  const pressed: number[] = [];
  const released: number[] = [];
  const n = Math.max(prev.length, next.length);
  for (let i = 0; i < n; i++) {
    const a = prev[i] === true;
    const b = next[i] === true;
    if (!a && b) pressed.push(i);
    else if (a && !b) released.push(i);
  }
  return { pressed, released };
}
