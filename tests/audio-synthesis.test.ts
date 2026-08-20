import { describe, expect, it } from "vitest";
import { composeJingle, composeSfx, composeTrack } from "../tools/audio/compose.ts";
import { drumHit, fluteNote, humVoice, malletNote, mixIn, mulberry32, normalize, pluckedString } from "../tools/audio/synth.ts";
import { encodeWav } from "../tools/audio/wav.ts";

const NO_REVERB = { wet: 0, roomSize: 0.3 };

describe("tools/audio/wav.ts(plan/sound/archive/bgm-quality-upgrade.md)", () => {
  it("モノラル(チャンネル1本)なら正しいRIFF/WAVEヘッダとPCM16データを書き出す", () => {
    const samples = new Float32Array([0, 0.5, -0.5, 1, -1]);
    const buf = encodeWav([samples], 22050);

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
    const buf = encodeWav([new Float32Array([2, -2])], 22050);
    expect(buf.readInt16LE(44)).toBe(32767);
    expect(buf.readInt16LE(46)).toBe(-32767);
  });

  it("チャンネル2本(ステレオ)ならインターリーブして書き出す", () => {
    const left = new Float32Array([1, 0.5]);
    const right = new Float32Array([-1, -0.5]);
    const buf = encodeWav([left, right], 22050);

    expect(buf.readUInt16LE(22)).toBe(2); // ステレオ
    expect(buf.readUInt16LE(32)).toBe(4); // ブロックアライン(2ch×2byte)
    expect(buf.readUInt32LE(28)).toBe(22050 * 4); // バイトレート
    expect(buf.readUInt32LE(40)).toBe(left.length * 4); // dataサイズ
    // フレーム0: L,R / フレーム1: L,R の順でインターリーブされている
    expect(buf.readInt16LE(44 + 0)).toBe(32767); // L[0]
    expect(buf.readInt16LE(44 + 2)).toBe(-32767); // R[0]
    expect(buf.readInt16LE(44 + 4)).toBe(16384); // L[1] (0.5)
    expect(buf.readInt16LE(44 + 6)).toBe(-16383); // R[1] (-0.5)
  });
});

describe("tools/audio/synth.ts(plan/sound/archive/audio-synthesis.md)", () => {
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
    ["humVoice", () => humVoice(440, 0.3, 22050, 1)],
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

  it("humVoiceは同じシードから決定的に同じ波形を返す(plan/sound/archive/bgm-true-awakening.md)", () => {
    const a = humVoice(220, 0.5, 22050, 3);
    const b = humVoice(220, 0.5, 22050, 3);
    expect(Array.from(a)).toEqual(Array.from(b));

    const c = humVoice(220, 0.5, 22050, 4);
    expect(Array.from(a)).not.toEqual(Array.from(c));
  });
});

describe("tools/audio/compose.ts(plan/sound/archive/bgm-quality-upgrade.md)", () => {
  const weights = { mallet: 0.4, drum: 0.3, flute: 0.2, string: 0.1 };
  const baseParams = { weights, bars: 8, tempoBpm: 100, sampleRate: 22050, reverb: NO_REVERB };

  it("composeTrackは小節数・テンポどおりの長さのLR両チャンネルを返す", () => {
    const bars = 8;
    const tempoBpm = 100;
    const out = composeTrack({ ...baseParams, seed: 1, bars, tempoBpm });
    const expectedLength = Math.floor(bars * 4 * (60 / tempoBpm) * 22050);
    expect(out.left.length).toBe(expectedLength);
    expect(out.right.length).toBe(expectedLength);
  });

  it("beatsPerBarを指定すると拍子どおりに長さが変わる(3拍子は4拍子より短い)", () => {
    const out4 = composeTrack({ ...baseParams, seed: 1, beatsPerBar: 4 });
    const out3 = composeTrack({ ...baseParams, seed: 1, beatsPerBar: 3 });
    expect(out3.left.length).toBeLessThan(out4.left.length);
  });

  it("composeTrackは同じシードから決定的に同じ波形を返す", () => {
    const a = composeTrack({ ...baseParams, seed: 7, bars: 8 });
    const b = composeTrack({ ...baseParams, seed: 7, bars: 8 });
    expect(Array.from(a.left)).toEqual(Array.from(b.left));
    expect(Array.from(a.right)).toEqual(Array.from(b.right));
  });

  it("composeTrackは異なるシードで異なる波形を返す(地方ごとの違いを生む前提)", () => {
    const a = composeTrack({ ...baseParams, seed: 1 });
    const b = composeTrack({ ...baseParams, seed: 2 });
    expect(Array.from(a.left)).not.toEqual(Array.from(b.left));
  });

  it("composeTrackはピークが1.0を超えない(クリップ防止)", () => {
    const out = composeTrack({ ...baseParams, seed: 3, reverb: { wet: 0.3, roomSize: 0.6 } });
    const peak = (arr: Float32Array) => arr.reduce((max, v) => Math.max(max, Math.abs(v)), 0);
    expect(peak(out.left)).toBeLessThanOrEqual(1);
    expect(peak(out.right)).toBeLessThanOrEqual(1);
  });

  it("リバーブのウェット率を上げるとループ末尾付近のエネルギーが増える(残響が乗る)", () => {
    const dry = composeTrack({ ...baseParams, seed: 5, reverb: { wet: 0, roomSize: 0.6 } });
    const wet = composeTrack({ ...baseParams, seed: 5, reverb: { wet: 0.4, roomSize: 0.6 } });
    expect(Array.from(wet.left)).not.toEqual(Array.from(dry.left));
  });

  it("offbeatProbを指定すると波形が変わり、未指定(既定0)の曲には影響しない(plan/sound/archive/bgm-shortcut-back-hole.md)", () => {
    const without = composeTrack({ ...baseParams, seed: 9 });
    const withOffbeat = composeTrack({ ...baseParams, seed: 9, offbeatProb: 0.5 });
    expect(Array.from(withOffbeat.left)).not.toEqual(Array.from(without.left));

    const explicitZero = composeTrack({ ...baseParams, seed: 9, offbeatProb: 0 });
    expect(Array.from(explicitZero.left)).toEqual(Array.from(without.left));
  });

  it("melodyDensityを下げると波形が変わり、未指定(既定1)の曲には影響しない(plan/sound/archive/bgm-nightly-dream.md)", () => {
    const without = composeTrack({ ...baseParams, seed: 11 });
    const thinned = composeTrack({ ...baseParams, seed: 11, melodyDensity: 0.5 });
    expect(Array.from(thinned.left)).not.toEqual(Array.from(without.left));

    const explicitOne = composeTrack({ ...baseParams, seed: 11, melodyDensity: 1 });
    expect(Array.from(explicitOne.left)).toEqual(Array.from(without.left));
  });

  it("humLayerを指定すると波形が変わり、未指定(既定false)の曲には影響しない(plan/sound/archive/bgm-true-awakening.md)", () => {
    const without = composeTrack({ ...baseParams, seed: 13 });
    const withHum = composeTrack({ ...baseParams, seed: 13, humLayer: true });
    expect(Array.from(withHum.left)).not.toEqual(Array.from(without.left));

    const explicitFalse = composeTrack({ ...baseParams, seed: 13, humLayer: false });
    expect(Array.from(explicitFalse.left)).toEqual(Array.from(without.left));
  });

  it("motifを指定すると波形が変わり、未指定の曲には影響しない(plan/sound/archive/bgm-main-cave.md)", () => {
    const without = composeTrack({ ...baseParams, seed: 15 });
    const withMotif = composeTrack({ ...baseParams, seed: 15, motif: [0, 1, 2, 1] });
    expect(Array.from(withMotif.left)).not.toEqual(Array.from(without.left));
  });

  it("motifは同じシードから決定的に同じ波形を返す(再生成しても歌い出しが変わらない前提)", () => {
    const a = composeTrack({ ...baseParams, seed: 17, motif: [0, 1, 2, 1] });
    const b = composeTrack({ ...baseParams, seed: 17, motif: [0, 1, 2, 1] });
    expect(Array.from(a.left)).toEqual(Array.from(b.left));
  });

  it("motifNoteBeatsを指定すると波形が変わる", () => {
    const a = composeTrack({ ...baseParams, seed: 19, motif: [0, 1, 2, 1] });
    const b = composeTrack({ ...baseParams, seed: 19, motif: [0, 1, 2, 1], motifNoteBeats: 2 });
    expect(Array.from(a.left)).not.toEqual(Array.from(b.left));
  });

  it("composeSfxは有限な値の配列を返す", () => {
    const out = composeSfx({ kind: "mallet", freq: 660, duration: 0.35, sampleRate: 22050, seed: 1 });
    expect(out.length).toBe(Math.floor(0.35 * 22050));
    for (const v of out) expect(Number.isFinite(v)).toBe(true);
  });

  it("composeSfxはリバーブを指定すると音が伸びる(尾を切り捨てない)", () => {
    const dry = composeSfx({ kind: "drum", freq: 140, duration: 0.3, sampleRate: 22050, seed: 2 });
    const wet = composeSfx({ kind: "drum", freq: 140, duration: 0.3, sampleRate: 22050, seed: 2, reverb: { wet: 0.2, roomSize: 0.4 } });
    expect(wet.length).toBeGreaterThan(dry.length);
    for (const v of wet) expect(Number.isFinite(v)).toBe(true);
  });
});

describe("tools/audio/compose.ts composeJingle(plan/sound/archive/sfx-milestone-jingles.md)", () => {
  const notes = [
    { degree: 0, beats: 1 },
    { degree: 2, beats: 1 },
    { degree: 4, beats: 1.5 },
  ];

  it("音価の合計どおりの長さを返す", () => {
    const tempoBpm = 120;
    const out = composeJingle({ notes, tempoBpm, sampleRate: 22050 });
    const totalBeats = notes.reduce((sum, n) => sum + n.beats, 0);
    expect(out.length).toBe(Math.floor(totalBeats * (60 / tempoBpm) * 22050));
  });

  it("同じ入力から決定的に同じ波形を返す", () => {
    const a = composeJingle({ notes, tempoBpm: 120, sampleRate: 22050 });
    const b = composeJingle({ notes, tempoBpm: 120, sampleRate: 22050 });
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it("有限な値を返し、無音のままではない(実際に音が鳴っている)", () => {
    const out = composeJingle({ notes, tempoBpm: 120, sampleRate: 22050 });
    let peak = 0;
    for (const v of out) {
      expect(Number.isFinite(v)).toBe(true);
      peak = Math.max(peak, Math.abs(v));
    }
    expect(peak).toBeGreaterThan(0);
  });

  it("音列が違えば波形も変わる", () => {
    const a = composeJingle({ notes, tempoBpm: 120, sampleRate: 22050 });
    const differentDegrees = notes.map((n) => ({ ...n, degree: n.degree + 1 }));
    const b = composeJingle({ notes: differentDegrees, tempoBpm: 120, sampleRate: 22050 });
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });

  it("instrumentを指定すると波形が変わる(mallet/flute/stringを聴き分けられる)", () => {
    const mallet = composeJingle({ notes: [{ degree: 0, beats: 1, instrument: "mallet" }], tempoBpm: 120, sampleRate: 22050 });
    const flute = composeJingle({ notes: [{ degree: 0, beats: 1, instrument: "flute" }], tempoBpm: 120, sampleRate: 22050 });
    const string = composeJingle({ notes: [{ degree: 0, beats: 1, instrument: "string" }], tempoBpm: 120, sampleRate: 22050 });
    expect(Array.from(mallet)).not.toEqual(Array.from(flute));
    expect(Array.from(mallet)).not.toEqual(Array.from(string));
  });

  it("リバーブを指定すると音が伸びる(composeSfxと同じ手順)", () => {
    const dry = composeJingle({ notes, tempoBpm: 120, sampleRate: 22050 });
    const wet = composeJingle({ notes, tempoBpm: 120, sampleRate: 22050, reverb: { wet: 0.3, roomSize: 0.5 } });
    expect(wet.length).toBeGreaterThan(dry.length);
    for (const v of wet) expect(Number.isFinite(v)).toBe(true);
  });
});
