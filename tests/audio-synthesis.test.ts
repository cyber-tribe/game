import { describe, expect, it } from "vitest";
import {
  composeAmbientLoop,
  composeBarrelOpen,
  composeForgeHum,
  composeGalleryAmbient,
  composeJingle,
  composeSfx,
  composeSleepHutAmbient,
  composeSmallFireAmbient,
  composeTrack,
} from "../tools/audio/compose.ts";
import {
  bowedTone,
  breathCry,
  drumHit,
  fluteNote,
  gongHit,
  humVoice,
  malletNote,
  mixIn,
  mulberry32,
  normalize,
  pluckedString,
  rattleHit,
} from "../tools/audio/synth.ts";
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

  it("breathCryは指定した長さの有限な値の配列を、同じシードから決定的に返す(plan/sound/archive/voice-and-cries.md)", () => {
    const a = breathCry(300, 0.25, 22050, 5, 0.2);
    const b = breathCry(300, 0.25, 22050, 5, 0.2);
    expect(a.length).toBe(Math.floor(0.25 * 22050));
    expect(Array.from(a)).toEqual(Array.from(b));
    for (const v of a) expect(Number.isFinite(v)).toBe(true);

    const c = breathCry(300, 0.25, 22050, 6, 0.2);
    expect(Array.from(a)).not.toEqual(Array.from(c));
  });

  // 楽器の多様化(plan/sound/archive/bgm-instrument-diversity.md): 木琴・太鼓・笛・
  // 弦の4種だけでは地方ごとの楽器編成そのものを変えられなかったための3種追加
  it("gongHitは指定した長さの有限な値の配列を、同じシードから決定的に返す", () => {
    const a = gongHit(440, 0.6, 22050, 10);
    const b = gongHit(440, 0.6, 22050, 10);
    expect(a.length).toBe(Math.floor(0.6 * 22050));
    expect(Array.from(a)).toEqual(Array.from(b));
    for (const v of a) expect(Number.isFinite(v)).toBe(true);

    const c = gongHit(440, 0.6, 22050, 11);
    expect(Array.from(a)).not.toEqual(Array.from(c));
  });

  it("bowedToneは指定した長さの有限な値の配列を、同じシードから決定的に返す", () => {
    const a = bowedTone(330, 0.5, 22050, 12);
    const b = bowedTone(330, 0.5, 22050, 12);
    expect(a.length).toBe(Math.floor(0.5 * 22050));
    expect(Array.from(a)).toEqual(Array.from(b));
    for (const v of a) expect(Number.isFinite(v)).toBe(true);

    const c = bowedTone(330, 0.5, 22050, 13);
    expect(Array.from(a)).not.toEqual(Array.from(c));
  });

  it("rattleHitは指定した長さの有限な値の配列を、同じシードから決定的に返す", () => {
    const a = rattleHit(0.4, 22050, 14);
    const b = rattleHit(0.4, 22050, 14);
    expect(a.length).toBe(Math.floor(0.4 * 22050));
    expect(Array.from(a)).toEqual(Array.from(b));
    for (const v of a) expect(Number.isFinite(v)).toBe(true);

    const c = rattleHit(0.4, 22050, 15);
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

  it("quoteMotifを指定すると波形が変わり、未指定の曲には影響しない(plan/sound/archive/village-soundscape.md)", () => {
    const without = composeTrack({ ...baseParams, seed: 21 });
    const withQuote = composeTrack({ ...baseParams, seed: 21, quoteMotif: { degrees: [0, 2, 4, 2] } });
    expect(Array.from(withQuote.left)).not.toEqual(Array.from(without.left));
  });

  it("quoteMotifは同じシードから決定的に同じ波形を返す", () => {
    const a = composeTrack({ ...baseParams, seed: 23, quoteMotif: { degrees: [0, 2, 4, 2] } });
    const b = composeTrack({ ...baseParams, seed: 23, quoteMotif: { degrees: [0, 2, 4, 2] } });
    expect(Array.from(a.left)).toEqual(Array.from(b.left));
  });

  it("chordSkeletonを指定すると波形が変わり、未指定の曲には影響しない(plan/sound/archive/bgm-chord-progression-variety.md)", () => {
    const without = composeTrack({ ...baseParams, seed: 25 });
    const withSkeleton = composeTrack({ ...baseParams, seed: 25, chordSkeleton: [0, 4, 3, 4, 0, 3, 4, 0] });
    expect(Array.from(withSkeleton.left)).not.toEqual(Array.from(without.left));
  });

  it("chordSkeletonが異なる2曲は、他のパラメータが同じでも異なる波形を返す(和声の起伏そのものが差別化されている)", () => {
    const a = composeTrack({ ...baseParams, seed: 27, chordSkeleton: [0, 0, 3, 3, 4, 4, 0, 0] });
    const b = composeTrack({ ...baseParams, seed: 27, chordSkeleton: [4, 2, 0, 1, 0, 2, 4, 0] });
    expect(Array.from(a.left)).not.toEqual(Array.from(b.left));
  });

  it("chordSkeletonは同じシードから決定的に同じ波形を返す", () => {
    const a = composeTrack({ ...baseParams, seed: 29, chordSkeleton: [0, 4, 3, 4, 0, 3, 4, 0] });
    const b = composeTrack({ ...baseParams, seed: 29, chordSkeleton: [0, 4, 3, 4, 0, 3, 4, 0] });
    expect(Array.from(a.left)).toEqual(Array.from(b.left));
  });

  // 楽器の多様化(plan/sound/archive/bgm-instrument-diversity.md): weightsに
  // gong/bow/rattleを指定すると、既存4種だけの場合と異なる波形になる
  // (地方ごとに楽器編成そのものを変えられることの確認)
  it("weightsにgong/bow/rattleを指定すると波形が変わり、未指定の曲には影響しない", () => {
    const without = composeTrack({ ...baseParams, seed: 31 });
    const withNewInstruments = composeTrack({
      ...baseParams,
      seed: 31,
      weights: { mallet: 0.1, drum: 0.1, flute: 0.1, string: 0.1, gong: 0.3, bow: 0.3, rattle: 0.2 },
    });
    expect(Array.from(withNewInstruments.left)).not.toEqual(Array.from(without.left));
  });

  // barsを小さくする(gong/bowは1サンプルごとにsin()を複数重ねるぶん
  // 既存の楽器より合成コストが高く、baseParams規模(8小節)だとCIの
  // 遅いランナーでは単発の生成だけでも既定の5秒タイムアウトを
  // 超えることがあったため)。決定性・クリップ防止という性質の検証には
  // 小節数を減らしても十分
  it("gong/bow/rattleのみのweightsでも決定的に同じ波形を返す", () => {
    const gongBowRattleOnly = { mallet: 0, drum: 0, flute: 0, string: 0, gong: 0.4, bow: 0.3, rattle: 0.3 };
    const smallParams = { ...baseParams, bars: 2 };
    const a = composeTrack({ ...smallParams, seed: 33, weights: gongBowRattleOnly });
    const b = composeTrack({ ...smallParams, seed: 33, weights: gongBowRattleOnly });
    expect(Array.from(a.left)).toEqual(Array.from(b.left));
  });

  it("gong/bow/rattleのみのweightsでも有限な値のまま収まる(クリップ防止も維持される)", () => {
    const gongBowRattleOnly = { mallet: 0, drum: 0, flute: 0, string: 0, gong: 0.4, bow: 0.3, rattle: 0.3 };
    const smallParams = { ...baseParams, bars: 2 };
    const out = composeTrack({ ...smallParams, seed: 33, weights: gongBowRattleOnly });
    const peak = (arr: Float32Array) => arr.reduce((max, v) => Math.max(max, Math.abs(v)), 0);
    expect(peak(out.left)).toBeLessThanOrEqual(1);
    expect(peak(out.right)).toBeLessThanOrEqual(1);
    for (const v of out.left) expect(Number.isFinite(v)).toBe(true);
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

  it("composeSfxはvoiceLayerを指定すると波形が変わり、未指定の曲には影響しない(plan/sound/archive/voice-and-cries.md)", () => {
    const base = { kind: "mallet" as const, freq: 660, duration: 0.35, sampleRate: 22050, seed: 1 };
    const without = composeSfx(base);
    const withVoice = composeSfx({ ...base, voiceLayer: { freq: 300, duration: 0.25, seed: 201, velocity: 0.2, delaySec: 0.1 } });
    expect(Array.from(withVoice)).not.toEqual(Array.from(without));
  });

  it("composeSfxのvoiceLayerはdelaySecぶん音を伸ばせる(主音より後ろへはみ出す場合)", () => {
    const base = { kind: "drum" as const, freq: 110, duration: 0.2, sampleRate: 22050, seed: 106 };
    const without = composeSfx(base);
    const withVoice = composeSfx({ ...base, voiceLayer: { freq: 400, duration: 0.15, seed: 202, velocity: 0.25, delaySec: 0.15 } });
    expect(withVoice.length).toBeGreaterThan(without.length);
  });

  // durationSecは本番(20秒)より小さい2秒にする。441,000要素どうしの
  // toEqual比較はCIの遅いランナーだと既定の5秒タイムアウトを超えることが
  // あったため(実際に生成にかかる時間ではなく比較コストが支配的)、
  // 決定性という性質の検証には短いループで十分という判断
  it("composeAmbientLoopは指定した長さの有限な値の配列を、同じシードから決定的に返す(plan/sound/archive/village-soundscape.md)", () => {
    const durationSec = 2;
    const sampleRate = 22050;
    const a = composeAmbientLoop({ durationSec, sampleRate, seed: 1 });
    const b = composeAmbientLoop({ durationSec, sampleRate, seed: 1 });
    expect(a.length).toBe(Math.floor(durationSec * sampleRate));
    expect(Array.from(a)).toEqual(Array.from(b));
    for (const v of a) expect(Number.isFinite(v)).toBe(true);
  });

  it("composeAmbientLoopは異なるシードで異なる波形を返す", () => {
    const params = { durationSec: 2, sampleRate: 22050 };
    const a = composeAmbientLoop({ ...params, seed: 1 });
    const b = composeAmbientLoop({ ...params, seed: 2 });
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });

  it("composeAmbientLoopはBGMの下に薄く敷く前提の控えめな音量に収まる(ピークが0.35を超えない、本番相当の20秒で確認)", () => {
    const out = composeAmbientLoop({ durationSec: 20, sampleRate: 22050, seed: 3 });
    const peak = out.reduce((max, v) => Math.max(max, Math.abs(v)), 0);
    expect(peak).toBeLessThanOrEqual(0.35);
  });

  // 建物の室内環境音(plan/sound/archive/village-soundscape.md)。
  // composeAmbientLoopと同じ理由でdurationSecは短く(2秒)して検証する
  describe.each([
    ["composeForgeHum", composeForgeHum],
    ["composeSleepHutAmbient", composeSleepHutAmbient],
    ["composeGalleryAmbient", composeGalleryAmbient],
    ["composeSmallFireAmbient", composeSmallFireAmbient],
  ] as const)("%s", (_name, compose) => {
    it("指定した長さの有限な値の配列を、同じシードから決定的に返す", () => {
      const durationSec = 2;
      const sampleRate = 22050;
      const a = compose({ durationSec, sampleRate, seed: 1 });
      const b = compose({ durationSec, sampleRate, seed: 1 });
      expect(a.length).toBe(Math.floor(durationSec * sampleRate));
      expect(Array.from(a)).toEqual(Array.from(b));
      for (const v of a) expect(Number.isFinite(v)).toBe(true);
    });

    it("異なるシードで異なる波形を返す", () => {
      const params = { durationSec: 2, sampleRate: 22050 };
      const a = compose({ ...params, seed: 1 });
      const b = compose({ ...params, seed: 2 });
      expect(Array.from(a)).not.toEqual(Array.from(b));
    });

    it("屋外アンビエントと同じく控えめな音量に収まる(ピークが0.35を超えない、本番相当の20秒で確認)", () => {
      const out = compose({ durationSec: 20, sampleRate: 22050, seed: 3 });
      const peak = out.reduce((max, v) => Math.max(max, Math.abs(v)), 0);
      expect(peak).toBeLessThanOrEqual(0.35);
    });
  });

  // 元素タルをあける音(plan/sound/archive/village-soundscape.md)
  describe("composeBarrelOpen", () => {
    it("同じ属性・シードから決定的に、有限な値の配列を返す", () => {
      const params = { element: "water", sampleRate: 22050, seed: 1 } as const;
      const a = composeBarrelOpen(params);
      const b = composeBarrelOpen(params);
      expect(Array.from(a)).toEqual(Array.from(b));
      for (const v of a) expect(Number.isFinite(v)).toBe(true);
    });

    it("属性ごとに異なる波形を返す(こぼれる音の音色を聴き分けられる)", () => {
      const elements = ["water", "wind", "light", "stone", "sleep"] as const;
      const waveforms = elements.map((element) => Array.from(composeBarrelOpen({ element, sampleRate: 22050, seed: 1 })));
      for (let i = 0; i < waveforms.length; i++) {
        for (let j = i + 1; j < waveforms.length; j++) {
          expect(waveforms[i]).not.toEqual(waveforms[j]);
        }
      }
    });

    it("ピークが1.0を超えない(クリップ防止)", () => {
      const out = composeBarrelOpen({ element: "stone", sampleRate: 22050, seed: 2 });
      const peak = out.reduce((max, v) => Math.max(max, Math.abs(v)), 0);
      expect(peak).toBeLessThanOrEqual(1);
    });

    it("リバーブを指定すると音が伸びる(尾を切り捨てない)", () => {
      const dry = composeBarrelOpen({ element: "light", sampleRate: 22050, seed: 4 });
      const wet = composeBarrelOpen({ element: "light", sampleRate: 22050, seed: 4, reverb: { wet: 0.25, roomSize: 0.4 } });
      expect(wet.length).toBeGreaterThan(dry.length);
      for (const v of wet) expect(Number.isFinite(v)).toBe(true);
    });
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

  it("codaを指定すると最後の音のあとに音が伸び、未指定の場合と波形が変わる(plan/sound/archive/voice-and-cries.md)", () => {
    const without = composeJingle({ notes, tempoBpm: 120, sampleRate: 22050 });
    const withCoda = composeJingle({ notes, tempoBpm: 120, sampleRate: 22050, coda: { freq: 220, duration: 0.3, seed: 203, velocity: 0.2 } });
    expect(withCoda.length).toBeGreaterThan(without.length);
    expect(withCoda.length - without.length).toBe(Math.floor(0.3 * 22050));
    for (const v of withCoda) expect(Number.isFinite(v)).toBe(true);
  });
});
