import { describe, expect, it } from "vitest";
import {
  mixStereoIn,
  normalizeStereo,
  panMono,
  reverbLoopStereo,
  reverbOneShot,
  widenMono,
} from "../tools/audio/effects.ts";

describe("tools/audio/effects.ts(plan/sound/archive/bgm-quality-upgrade.md)", () => {
  it("panMonoは中央(0)なら左右均等に振り分ける", () => {
    const mono = new Float32Array([1, 1, 1]);
    const { left, right } = panMono(mono, 0);
    for (let i = 0; i < mono.length; i++) {
      expect(left[i]).toBeCloseTo(right[i]!, 5);
      expect(left[i]).toBeCloseTo(Math.SQRT1_2, 5);
    }
  });

  it("panMonoは-1(左)で右チャンネルを無音にする", () => {
    const mono = new Float32Array([1, 0.5]);
    const { left, right } = panMono(mono, -1);
    expect(Array.from(right)).toEqual([0, 0]);
    expect(left[0]).toBeCloseTo(1, 5);
  });

  it("panMonoは範囲外のpanを-1..1にクランプする", () => {
    const mono = new Float32Array([1]);
    const a = panMono(mono, -5);
    const b = panMono(mono, -1);
    expect(Array.from(a.left)).toEqual(Array.from(b.left));
    expect(Array.from(a.right)).toEqual(Array.from(b.right));
  });

  it("widenMonoは左チャンネルを元信号のまま、右チャンネルを遅延させる", () => {
    const mono = new Float32Array([1, 2, 3, 4, 5]);
    const { left, right } = widenMono(mono, 1000, 2); // 1000Hzで2ms=2サンプル遅延
    expect(Array.from(left)).toEqual(Array.from(mono));
    expect(Array.from(right)).toEqual([0, 0, 1, 2, 3]);
  });

  it("reverbLoopStereoはwet=0なら出力がほぼ無音になる(ドライは混ぜないバスなので)", () => {
    const dry = new Float32Array(200).fill(0);
    dry[0] = 1;
    const { left, right } = reverbLoopStereo(dry, 22050, { wet: 0, roomSize: 0.5 });
    for (const v of left) expect(v).toBe(0);
    for (const v of right) expect(v).toBe(0);
  });

  it("reverbLoopStereoは入力と同じ長さを返す(ループ末尾を先頭に折り返して混ぜるため)", () => {
    const dry = new Float32Array(500);
    dry[0] = 1;
    const { left, right } = reverbLoopStereo(dry, 22050, { wet: 0.4, roomSize: 0.5 });
    expect(left.length).toBe(dry.length);
    expect(right.length).toBe(dry.length);
  });

  it("reverbLoopStereoはL/Rで異なる波形を返す(位相差によるステレオの広がり)", () => {
    const dry = new Float32Array(2000);
    dry[0] = 1;
    const { left, right } = reverbLoopStereo(dry, 22050, { wet: 0.5, roomSize: 0.6 });
    expect(Array.from(left)).not.toEqual(Array.from(right));
  });

  it("reverbLoopStereoは全て有限な値を返す(発散しない)", () => {
    const dry = new Float32Array(2000);
    for (let i = 0; i < dry.length; i++) dry[i] = Math.sin(i * 0.1);
    const { left, right } = reverbLoopStereo(dry, 22050, { wet: 0.6, roomSize: 0.9 });
    for (const v of left) expect(Number.isFinite(v)).toBe(true);
    for (const v of right) expect(Number.isFinite(v)).toBe(true);
  });

  it("reverbOneShotは尾の分だけ入力より長い出力を返す", () => {
    const dry = new Float32Array(100);
    dry[0] = 1;
    const out = reverbOneShot(dry, 22050, { wet: 0.3, roomSize: 0.4 }, 0.1);
    expect(out.length).toBe(100 + Math.round(0.1 * 22050));
    for (const v of out) expect(Number.isFinite(v)).toBe(true);
  });

  it("mixStereoInはL/R両方を指定位置から加算合成する", () => {
    const destL = new Float32Array(5);
    const destR = new Float32Array(5);
    mixStereoIn(destL, destR, new Float32Array([1, 1]), new Float32Array([2, 2]), 1);
    expect(Array.from(destL)).toEqual([0, 1, 1, 0, 0]);
    expect(Array.from(destR)).toEqual([0, 2, 2, 0, 0]);
  });

  it("normalizeStereoはL/R共通のピークで両方を同じ比率で縮小する(定位を保つ)", () => {
    const left = new Float32Array([0, 1.8]);
    const right = new Float32Array([0, 0.9]);
    normalizeStereo(left, right, 0.9);
    expect(left[1]).toBeCloseTo(0.9, 5);
    expect(right[1]).toBeCloseTo(0.45, 5); // 同じスケールで縮小されるので比率(2:1)は保たれる
  });

  it("normalizeStereoはヘッドルーム内なら変えない", () => {
    const left = new Float32Array([0.2, -0.2]);
    const right = new Float32Array([0.1, -0.1]);
    normalizeStereo(left, right, 0.9);
    expect(left[0]).toBeCloseTo(0.2, 5);
    expect(left[1]).toBeCloseTo(-0.2, 5);
    expect(right[0]).toBeCloseTo(0.1, 5);
    expect(right[1]).toBeCloseTo(-0.1, 5);
  });
});
