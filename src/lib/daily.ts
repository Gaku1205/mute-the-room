/** 「今夜のお題」：日本時間（Asia/Tokyo）の暦日から、全員が同じ夜になる種を作る */
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 日本時間の年・月・日 */
export function jstParts(date: Date): { year: number; month: number; day: number } {
  const d = new Date(date.getTime() + JST_OFFSET_MS);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** 日本時間の暦日が同じなら同じ数、日が変わると別の数を返す */
export function dailySeed(date: Date): number {
  const { year, month, day } = jstParts(date);
  let h = (year * 10000 + month * 100 + day) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** 表示用の「11/3」 */
export function dailyLabel(date: Date): string {
  const { month, day } = jstParts(date);
  return `${month}/${day}`;
}
