import { describe, expect, it } from "vitest";
import { composeSfx, composeTrack, BEAT_SEC } from "../tools/audio/compose.ts";
import { drumHit, fluteNote, malletNote, mixIn, mulberry32, normalize, pluckedString } from "../tools/audio/synth.ts";
import { encodeWav } from "../tools/audio/wav.ts";

describe("tools/audio/wav.ts(plan/audio-synthesis.md)", () => {
  it("正しいRIFF/WAVEヘッダとPCM16データを書き出す", () => {
    const samples = new Float32Array([0, 0.5, -0.5, 1, -1]);
    const buf = encodeWav(samples, 22050);

    expect(buf.toString("ascii", 0, 4)).toBe("RIFF");
    expect(buf.toString("ascii", 8, 12)).toBe("WAVE");
    expect(buf.toString("ascii", 12, 16)).toBe("fmt ");
    expect(buf.readUInt16LE(20)).toBe(1); // PCM
    expect(buf.readUInt16LE(22)).toBe(1); // モノラル
    expect(buf.readUInt32LE(24)).toBe(22050); // サンプルレート
    expect(buf.readUInt16LE(34)).toBe(16); // ビット深度
    expect(buf.toString("ascii", 36, 40)).toBe("data");
    expect(buf.readUInt32LE(40)).toBe(samples.length * 2);
    expect(buf.length).toBe(44 + samples.length * 2);

    // サンプル値がPCM16として正しく書き出されている
    expect(buf.readInt16LE(44)).toBe(0);
    expect(buf.readInt16LE(44 + 6)).toBe(32767); // 1.0
    expect(buf.readInt16LE(44 + 8)).toBe(-32767); // -1.0
  });

  it("範囲外(-1..1超え)のサンプルはクランプする", () => {
    const buf = encodeWav(new Float32Array([2, -2]), 22050);
    expect(buf.readInt16LE(44)).toBe(32767);
    expect(buf.readInt16LE(46)).toBe(-32767);
  });
});

describe("tools/audio/synth.ts(plan/audio-synthesis.md)", () => {
  it("mulberry32は同じシードから同じ数列を返す", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = Array.from({ length: 5 }, () => a());
    const seqB = Array.from({ length: 5 }, () => b());
    expect(seqA).toEqual(seqB);
    for (const v of seqA) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("異なるシードは異なる数列を返す", () => {
    const a = mulberry32(1)();
    const b = mulberry32(2)();
    expect(a).not.toBe(b);
  });

  it.each([
    ["malletNote", () => malletNote(440, 0.3, 22050)],
    ["drumHit", () => drumHit(0.3, 22050, 1)],
    ["fluteNote", () => fluteNote(440, 0.3, 22050)],
    ["pluckedString", () => pluckedString(440, 0.3, 22050, 1)],
  ])("%sは指定した長さの有限な値の配列を返す", (_name, make) => {
    const out = make();
    expect(out.length).toBe(Math.floor(0.3 * 22050));
    for (const v of out) expect(Number.isFinite(v)).toBe(true);
  });

  it("mixInは指定位置から加算合成する", () => {
    const dest = new Float32Array(10);
    mixIn(dest, new Float32Array([1, 1, 1]), 3);
    expect(Array.from(dest)).toEqual([0, 0, 0, 1, 1, 1, 0, 0, 0, 0]);
  });

  it("mixInは範囲外にはみ出す分を無視する(クラッシュしない)", () => {
    const dest = new Float32Array(4);
    expect(() => mixIn(dest, new Float32Array([1, 1, 1, 1, 1]), 2)).not.toThrow();
    expect(Array.from(dest)).toEqual([0, 0, 1, 1]);
  });

  it("normalizeはヘッドルームを超えるピークだけを縮小する", () => {
    const loud = new Float32Array([0, 1.8, -1.8]);
    normalize(loud, 0.9);
    expect(Math.max(...Array.from(loud).map(Math.abs))).toBeCloseTo(0.9, 5);

    const quiet = new Float32Array([0, 0.2, -0.2]);
    normalize(quiet, 0.9);
    expect(Array.from(quiet)).toEqual(Array.from(new Float32Array([0, 0.2, -0.2]))); // 既にヘッドルーム内なら変えない
  });
});

describe("tools/audio/compose.ts(plan/audio-synthesis.md)", () => {
  const weights = { mallet: 0.4, drum: 0.3, flute: 0.2, string: 0.1 };

  it("composeTrackは小節数どおりの長さを返す", () => {
    const bars = 4;
    const out = composeTrack(1, weights, bars, 22050);
    expect(out.length).toBe(Math.floor(bars * 4 * BEAT_SEC * 22050));
  });

  it("composeTrackは同じシードから決定的に同じ波形を返す", () => {
    const a = composeTrack(7, weights, 2, 22050);
    const b = composeTrack(7, weights, 2, 22050);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it("composeTrackは異なるシードで異なる波形を返す(地方ごとの違いを生む前提)", () => {
    const a = composeTrack(1, weights, 4, 22050);
    const b = composeTrack(2, weights, 4, 22050);
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });

  it("composeTrackはピークが1.0を超えない(クリップ防止)", () => {
    const out = composeTrack(3, weights, 4, 22050);
    for (const v of out) expect(Math.abs(v)).toBeLessThanOrEqual(1);
  });

  it("composeSfxは有限な値の配列を返す", () => {
    const out = composeSfx("mallet", 660, 0.35, 22050, 1);
    expect(out.length).toBe(Math.floor(0.35 * 22050));
    for (const v of out) expect(Number.isFinite(v)).toBe(true);
  });
});
