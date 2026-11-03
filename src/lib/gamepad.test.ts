import { describe, expect, it } from "vitest";
import { KEYS } from "./game";
import { PAD_LABELS, buttonToKey, diffButtons, keyToLabel, mergeButtons, padLabelMap, readButtons } from "./gamepad";

const pad = (mapping: string, down: number[]) => ({ mapping, buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: down.includes(i) })) });

describe("buttonToKey", () => {
  it("ボタン0〜8 を KEYS の先頭から順に割り当てる", () => {
    for (let i = 0; i < 9; i++) expect(buttonToKey(i)).toBe(KEYS[i]);
    expect(buttonToKey(0)).toBe("A");
    expect(buttonToKey(8)).toBe("H");
  });
  it("範囲外は null", () => {
    expect(buttonToKey(-1)).toBeNull();
    expect(buttonToKey(9)).toBeNull();
    expect(buttonToKey(1.5)).toBeNull();
  });
});

describe("ラベル", () => {
  it("キー文字からボタン名が引ける", () => {
    expect(keyToLabel("A")).toBe("A");
    expect(keyToLabel("J")).toBe("LB");
    expect(keyToLabel("H")).toBe("戻");
    expect(keyToLabel("Z")).toBeNull();
    expect(Object.keys(padLabelMap())).toHaveLength(PAD_LABELS.length);
  });
});

describe("readButtons / mergeButtons", () => {
  it("標準配置だけ読む", () => {
    expect(readButtons(pad("", [0]))).toBeNull();
    expect(readButtons(null)).toBeNull();
    expect(readButtons(pad("standard", [0, 8, 12]))).toEqual([true, false, false, false, false, false, false, false, true]);
  });
  it("複数のパッドは合わせる", () => {
    const m = mergeButtons([pad("standard", [1]), null, pad("", [2]), pad("standard", [3])]);
    expect(m?.[1]).toBe(true);
    expect(m?.[2]).toBe(false);
    expect(m?.[3]).toBe(true);
    expect(mergeButtons([null, pad("", [])])).toBeNull();
  });
});

describe("diffButtons", () => {
  it("押した・離したを出す", () => {
    expect(diffButtons([false, true, false], [true, true, false])).toEqual({ pressed: [0], released: [] });
    expect(diffButtons([true, true], [false, true])).toEqual({ pressed: [], released: [0] });
    expect(diffButtons([true, false], [false, true])).toEqual({ pressed: [1], released: [0] });
  });
  it("変わらなければ空。長さが違っても扱える", () => {
    expect(diffButtons([true], [true])).toEqual({ pressed: [], released: [] });
    expect(diffButtons([], [false, true])).toEqual({ pressed: [1], released: [] });
    expect(diffButtons([true, true], [])).toEqual({ pressed: [], released: [0, 1] });
  });
});
