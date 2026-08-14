import { describe, expect, it } from "vitest";
import { rotateDir, type Dir } from "../src/core/grid";
import { Input } from "../src/view/input";

/**
 * カメラを回しても、倒した向きと歩く向きが噛み合うようにする(issue #463)。
 *
 * カメラは`focus + (sin(yaw), _, cos(yaw)) * 距離`に置かれて`focus`を見るので、
 * 画面の奥(プレイヤーが「上」と感じる向き)はワールドでは:
 *
 *   yaw=0(初期)   → 北(Dir 0)
 *   yaw=90度      → 西(Dir 6)
 *   yaw=180度     → 南(Dir 4)
 *   yaw=270度     → 東(Dir 2)
 *
 * `Dir`は北を0とした時計回りなので、90度ごとに2つぶん戻る関係になる。
 */
function makeInput(quadrant: number): Input {
  const input = new Input(new EventTarget());
  input.cameraQuadrant = quadrant;
  return input;
}

describe("core/grid.ts: rotateDir", () => {
  it("0を渡せばそのまま", () => {
    expect(rotateDir(0, 0)).toBe(0);
    expect(rotateDir(5, 0)).toBe(5);
  });

  it("時計回りに回る(正の値)", () => {
    expect(rotateDir(0, 2)).toBe(2); // 北 → 東
    expect(rotateDir(0, 1)).toBe(1); // 北 → 北東
  });

  it("反時計回りに回る(負の値)", () => {
    expect(rotateDir(0, -2)).toBe(6); // 北 → 西
    expect(rotateDir(2, -2)).toBe(0); // 東 → 北
  });

  it("8を超えても一周して収まる", () => {
    expect(rotateDir(0, 8)).toBe(0);
    expect(rotateDir(3, 16)).toBe(3);
    expect(rotateDir(0, -8)).toBe(0);
    expect(rotateDir(1, -10)).toBe(7);
  });

  it("どの入力でも0〜7の範囲に収まる", () => {
    for (let dir = 0; dir < 8; dir++) {
      for (let e = -20; e <= 20; e++) {
        const out = rotateDir(dir as Dir, e);
        expect(out).toBeGreaterThanOrEqual(0);
        expect(out).toBeLessThanOrEqual(7);
      }
    }
  });
});

describe("view/input.ts: カメラの向きに合わせた方向補正 (#463)", () => {
  it("回していなければ、これまでどおりワールド方角そのまま", () => {
    const input = makeInput(0);
    input.press("ArrowUp");
    expect(input.direction()).toBe(0); // 北
  });

  it("90度回すと、画面奥(↑)は西になる", () => {
    const input = makeInput(1);
    input.press("ArrowUp");
    expect(input.direction()).toBe(6);
  });

  it("180度回すと、画面奥(↑)は南になる", () => {
    const input = makeInput(2);
    input.press("ArrowUp");
    expect(input.direction()).toBe(4);
  });

  it("270度回すと、画面奥(↑)は東になる", () => {
    const input = makeInput(3);
    input.press("ArrowUp");
    expect(input.direction()).toBe(2);
  });

  it("画面の右(→)も同じだけ回る", () => {
    const right: Dir[] = [2, 0, 6, 4];
    for (let q = 0; q < 4; q++) {
      const input = makeInput(q);
      input.press("ArrowRight");
      expect(input.direction()).toBe(right[q]);
    }
  });

  it("斜め(↑→)も同じだけ回る", () => {
    const input = makeInput(1);
    input.press("ArrowUp");
    input.press("ArrowRight");
    expect(input.direction()).toBe(7); // 北東 → 北西
  });

  it("テンキーも同じ補正を受ける(矢印と同じ経路)", () => {
    const input = makeInput(1);
    input.press("Numpad8"); // 画面奥
    expect(input.direction()).toBe(6);
  });

  it("何も押していなければ、回転していてもnullのまま", () => {
    expect(makeInput(2).direction()).toBeNull();
  });

  it("補正しても8方向のどれかであり続ける(全方向×全象限)", () => {
    const codes = ["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft"];
    for (let q = 0; q < 4; q++) {
      for (const code of codes) {
        const input = makeInput(q);
        input.press(code);
        const dir = input.direction();
        expect(dir).not.toBeNull();
        expect(dir).toBeGreaterThanOrEqual(0);
        expect(dir).toBeLessThanOrEqual(7);
      }
    }
  });

  it("カメラを1周回すと元に戻る", () => {
    const input = makeInput(0);
    input.press("ArrowUp");
    const atStart = input.direction();
    input.cameraQuadrant = 4 % 4;
    expect(input.direction()).toBe(atStart);
  });

  it("押しっぱなしのままカメラを回すと、行き先も一緒に回る", () => {
    // 回転ジェスチャはパッドを倒したまま起きうる。倒し直さなくても
    // 画面基準で正しい向きへ歩き続けてほしい
    const input = makeInput(0);
    input.press("ArrowUp");
    expect(input.direction()).toBe(0);
    input.cameraQuadrant = 1;
    expect(input.direction()).toBe(6);
  });
});
