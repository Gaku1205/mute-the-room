import { describe, expect, it } from "vitest";
import { dailyLabel, dailySeed } from "./daily";
import { createGame, step } from "./game";

describe("今夜のお題", () => {
  it("同じ日（日本時間）なら時刻が違っても同じ種", () => {
    expect(dailySeed(new Date("2026-11-03T00:00:00+09:00"))).toBe(dailySeed(new Date("2026-11-03T23:59:59+09:00")));
    expect(dailySeed(new Date("2026-11-02T15:00:00Z"))).toBe(dailySeed(new Date("2026-11-03T14:59:59Z")));
  });
  it("日付が変わると別の種", () => {
    expect(dailySeed(new Date("2026-11-03T12:00:00+09:00"))).not.toBe(dailySeed(new Date("2026-11-04T12:00:00+09:00")));
  });
  it("日本時間の0時をまたぐ境目で種が変わる", () => {
    const before = new Date("2026-11-03T14:59:59.999Z"); // 日本時間 23:59:59.999
    const after = new Date("2026-11-03T15:00:00.000Z"); // 日本時間 翌 0:00
    expect(dailySeed(before)).not.toBe(dailySeed(after));
    expect(dailyLabel(before)).toBe("11/3");
    expect(dailyLabel(after)).toBe("11/4");
  });
  it("月末・年末も正しい表示", () => {
    expect(dailyLabel(new Date("2026-12-31T15:00:00Z"))).toBe("1/1");
    expect(dailyLabel(new Date("2026-01-09T00:00:00+09:00"))).toBe("1/9");
  });
  it("同じ種の createGame は、何も押さなければ同じ順・場所で音が出る", () => {
    const seed = dailySeed(new Date("2026-11-03T12:00:00+09:00"));
    const trace = (): string[] => {
      const g = createGame(seed);
      const out: string[] = [];
      const seen = new Set<number>();
      for (let i = 0; i < 60 * 40; i++) {
        step(g, 1 / 60);
        for (const s of g.sounds) {
          if (seen.has(s.id)) continue;
          seen.add(s.id);
          out.push(`${s.kind}@${s.x.toFixed(4)},${s.y.toFixed(4)}`);
        }
      }
      return out;
    };
    const a = trace();
    expect(a.length).toBeGreaterThanOrEqual(2);
    expect(trace()).toEqual(a);
  });
});
