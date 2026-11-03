import { describe, expect, it } from "vitest";
import {
  NIGHT,
  PENALTY,
  SLEEP_MAX,
  clockLabel,
  createGame,
  holdNeeded,
  mutePoints,
  press,
  release,
  shareText,
  spawn,
  step,
  summarize,
  titleFor,
} from "./game";
import { makeRng } from "./rng";

function run(g: ReturnType<typeof createGame>, seconds: number, dt = 1 / 60): void {
  for (let t = 0; t < seconds; t += dt) step(g, dt);
}

describe("時計", () => {
  it("夜の始めは 23:00、終わりは 7:00", () => {
    expect(clockLabel(0)).toBe("23:00");
    expect(clockLabel(NIGHT)).toBe("7:00");
  });
  it("真ん中は 3:00", () => expect(clockLabel(NIGHT / 2)).toBe("3:00"));
  it("範囲の外は丸める", () => expect(clockLabel(NIGHT * 2)).toBe("7:00"));
});

describe("押さえる長さと点", () => {
  it("大きい音ほど長く押さえる", () => expect(holdNeeded(1)).toBeGreaterThan(holdNeeded(0.2)));
  it("小さいうちに止めるほど点が高い", () => expect(mutePoints(0.2)).toBeGreaterThan(mutePoints(1)));
});

describe("乱数", () => {
  it("同じ種なら同じ並び", () => {
    const a = makeRng(7);
    const b = makeRng(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});

describe("音を押さえる", () => {
  it("押さえ続けると止まり、点が入る", () => {
    const g = createGame(1);
    const s = spawn(g, "alarm", { x: 0.5, y: 0.5 });
    expect(press(g, s.id)).toBe("hold");
    run(g, holdNeeded(s.loud) + 0.05);
    expect(s.state).toBe("muted");
    expect(g.muted).toBe(1);
    expect(g.score).toBeGreaterThan(0);
  });

  it("途中で離すと止まらず、また大きくなる", () => {
    const g = createGame(1);
    const s = spawn(g, "dog", { x: 0.5, y: 0.5 });
    press(g, s.id);
    run(g, 0.1);
    release(g, s.id);
    const before = s.loud;
    run(g, 0.5);
    expect(s.state).toBe("live");
    expect(s.loud).toBeGreaterThan(before);
  });

  it("押しちゃダメな音を押すと、ねむりが減って間違いが増える", () => {
    const g = createGame(1);
    const s = spawn(g, "lullaby", { x: 0.5, y: 0.5 });
    expect(press(g, s.id)).toBe("penalty");
    expect(g.sleep).toBe(SLEEP_MAX - PENALTY);
    expect(g.mistakes).toBe(1);
  });

  it("最後の音を止めると「シーン」になる", () => {
    const g = createGame(1);
    const s = spawn(g, "phone", { x: 0.5, y: 0.5 });
    press(g, s.id);
    run(g, 1);
    expect(g.silences).toBe(1);
    expect(g.events.some((e) => e.type === "silence")).toBe(true);
  });
});

describe("夜の流れ", () => {
  it("放っておくと起きてしまう", () => {
    const g = createGame(3);
    run(g, NIGHT);
    expect(g.phase).toBe("over");
    expect(g.outcome).toBe("woke");
  });

  it("全部止め続けると朝になり、7:00 の目覚ましを押さなければ守りきる", () => {
    const g = createGame(5);
    const dt = 1 / 60;
    for (let t = 0; t < NIGHT + 5 && g.phase !== "over"; t += dt) {
      for (const s of g.sounds) {
        if (s.state === "live" && s.holders === 0 && s.kind !== "lullaby" && s.kind !== "breath" && s.kind !== "rain" && s.kind !== "morning") press(g, s.id);
      }
      step(g, dt);
    }
    expect(g.outcome).toBe("clear");
    expect(summarize(g).time).toBe("7:00");
  });

  it("7:00 の目覚ましを押すと寝坊", () => {
    const g = createGame(5);
    g.t = NIGHT - 0.01;
    g.sounds = [];
    step(g, 0.02);
    expect(g.phase).toBe("finale");
    const morning = g.sounds.find((s) => s.kind === "morning");
    expect(morning).toBeDefined();
    press(g, morning!.id);
    expect(g.outcome).toBe("oversleep");
  });
});

describe("結果", () => {
  it("称号は結末で変わる", () => {
    expect(titleFor("clear", NIGHT, 0, 90)).toBe("夜の番人");
    expect(titleFor("oversleep", NIGHT, 1, 90)).toBe("二度寝製造機");
    expect(titleFor("woke", 5, 0, 0)).toBe("うるさい部屋の住人");
  });

  it("共有の文に時刻・称号・URL が入る", () => {
    const g = createGame(2);
    run(g, NIGHT);
    const text = shareText(summarize(g), "https://example.com/");
    expect(text).toContain("mute-the-room");
    expect(text).toContain("称号「");
    expect(text).toContain("https://example.com/");
  });
});
