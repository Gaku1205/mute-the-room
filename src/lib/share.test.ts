import { describe, expect, it } from "vitest";
import { SHARE_FILE_NAME, SHARE_H, SHARE_SCALE, SHARE_W, buildShareData, pickShareMode } from "./share";

const file = new File([new Uint8Array([1])], SHARE_FILE_NAME, { type: "image/png" });

describe("結果の画像", () => {
  it("大きさは 780×1400", () => {
    expect(SHARE_W * SHARE_SCALE).toBe(780);
    expect(SHARE_H * SHARE_SCALE).toBe(1400);
  });
  it("ファイル共有ができれば files を付ける", () => {
    const d = buildShareData("文", file, () => true);
    expect(d.files).toEqual([file]);
    expect(d.text).toBe("文");
  });
  it("ファイル共有ができなければ文だけ", () => {
    expect(buildShareData("文", file, () => false)).toEqual({ text: "文" });
  });
  it("canShare が無い・画像が無い・例外でも文だけ", () => {
    expect(buildShareData("文", file, undefined)).toEqual({ text: "文" });
    expect(buildShareData("文", null, () => true)).toEqual({ text: "文" });
    const boom = (): boolean => {
      throw new Error("x");
    };
    expect(buildShareData("文", file, boom)).toEqual({ text: "文" });
  });
  it("渡し方を選ぶ", () => {
    expect(pickShareMode(false, { text: "a" })).toBe("text");
    expect(pickShareMode(true, { text: "a" })).toBe("download");
    expect(pickShareMode(true, { text: "a", files: [file] })).toBe("share-file");
  });
});
