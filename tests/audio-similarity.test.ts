import { describe, expect, it } from "vitest";
import { composeTrack, type InstrumentWeights, type TrackParams } from "../tools/audio/compose.ts";
import { BGM_SPECS, type BgmSpec } from "../tools/audio/build.ts";
import {
  cosineSimilarity,
  euclideanDistance,
  findTooSimilarPairs,
  harmonicFingerprint,
  timbreFingerprint,
  zScoreNormalizeColumns,
  type DistinctnessTrack,
} from "../tools/audio/similarity.ts";

/**
 * BGMの「似すぎ」を人手を介さず機械的に検知する仕組みのテスト
 * (plan/sound/archive/bgm-automated-distinctness-check.md)。
 *
 * `bars`は全テストで2に縮めてある(判定の正しさ自体はループの長さに依存しない。
 * CIのタイムアウト対策として規模を縮小する既存の慣例(tests/audio-synthesis.test.ts)
 * に合わせた)。
 */

const SAMPLE_RATE = 22050;
const TEST_BARS = 2;

// 聴感評価(bgm-listening-review-findings.md)の対象だった11本
const DISTINCTNESS_TARGET_IDS = [
  "village",
  "region1",
  "region2",
  "region3",
  "region4",
  "region5",
  "region6",
  "region7",
  "region8",
  "boss",
  "true-awakening",
];
const distinctnessSpecs = BGM_SPECS.filter((s) => DISTINCTNESS_TARGET_IDS.includes(s.id));

// 2回目の所見(楽器編成)で新楽器を割り当てた8本
const TIMBRE_TARGET_IDS = ["region2", "region3", "region4", "region5", "region6", "region8", "boss", "true-awakening"];
const timbreSpecs = BGM_SPECS.filter((s) => TIMBRE_TARGET_IDS.includes(s.id));

function stripNewInstruments(weights: InstrumentWeights): InstrumentWeights {
  const { gong, bow, rattle, ...rest } = weights;
  return rest;
}

function buildParams(spec: BgmSpec, overrides: Partial<TrackParams> = {}): TrackParams {
  return {
    seed: spec.seed,
    weights: spec.weights,
    bars: TEST_BARS,
    beatsPerBar: spec.beatsPerBar,
    tempoBpm: spec.tempoBpm,
    reverb: spec.reverb,
    sampleRate: SAMPLE_RATE,
    offbeatProb: spec.offbeatProb,
    melodyDensity: spec.melodyDensity,
    humLayer: spec.humLayer,
    motif: spec.motif,
    motifNoteBeats: spec.motifNoteBeats,
    quoteMotif: spec.quoteMotif,
    chordSkeleton: spec.chordSkeleton,
    ...overrides,
  };
}

function avgPairwise(vectors: readonly (readonly number[])[], fn: (a: readonly number[], b: readonly number[]) => number): number {
  const values: number[] = [];
  for (let i = 0; i < vectors.length; i++) {
    for (let j = i + 1; j < vectors.length; j++) values.push(fn(vectors[i]!, vectors[j]!));
  }
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

describe("harmonicFingerprint/timbreFingerprint(単体の性質)", () => {
  it("同じ波形からは決定的に同じフィンガープリントを返す", () => {
    const samples = composeTrack(buildParams(distinctnessSpecs[0]!)).left;
    expect(harmonicFingerprint(samples, SAMPLE_RATE)).toEqual(harmonicFingerprint(samples, SAMPLE_RATE));
    expect(timbreFingerprint(samples, SAMPLE_RATE)).toEqual(timbreFingerprint(samples, SAMPLE_RATE));
  });

  it("有限な値のベクトルを返す(NaN・Infinityが混ざらない)", () => {
    const samples = composeTrack(buildParams(distinctnessSpecs[0]!)).left;
    for (const v of harmonicFingerprint(samples, SAMPLE_RATE)) expect(Number.isFinite(v)).toBe(true);
    for (const v of timbreFingerprint(samples, SAMPLE_RATE)) expect(Number.isFinite(v)).toBe(true);
  });

  it("cosineSimilarity/euclideanDistanceは対称かつ自分自身とは最も近い", () => {
    const a = [1, 2, 3];
    const b = [3, -1, 0.5];
    expect(cosineSimilarity(a, b)).toBeCloseTo(cosineSimilarity(b, a), 10);
    expect(euclideanDistance(a, b)).toBeCloseTo(euclideanDistance(b, a), 10);
    expect(cosineSimilarity(a, a)).toBeCloseTo(1, 10);
    expect(euclideanDistance(a, a)).toBe(0);
  });
});

describe("1回目の所見(コード進行)の再現: 和声フィンガープリント", () => {
  it("chordSkeletonを外す(全曲共通に戻す)と、曲間の和声類似度が現行より上がる", () => {
    const currentVecs = distinctnessSpecs.map((s) => harmonicFingerprint(composeTrack(buildParams(s)).left, SAMPLE_RATE));
    const revertedVecs = distinctnessSpecs.map((s) =>
      harmonicFingerprint(composeTrack(buildParams(s, { chordSkeleton: undefined })).left, SAMPLE_RATE),
    );
    const currentAvg = avgPairwise(currentVecs, cosineSimilarity);
    const revertedAvg = avgPairwise(revertedVecs, cosineSimilarity);
    expect(revertedAvg).toBeGreaterThan(currentAvg);
  });
});

describe("2回目の所見(楽器編成)の再現: 音色フィンガープリント", () => {
  it("gong/bow/rattleを外す(4種の重みづけだけに戻す)と、曲間の音色距離が現行より縮む", () => {
    const currentVecs = zScoreNormalizeColumns(timbreSpecs.map((s) => timbreFingerprint(composeTrack(buildParams(s)).left, SAMPLE_RATE)));
    const revertedVecs = zScoreNormalizeColumns(
      timbreSpecs.map((s) => timbreFingerprint(composeTrack(buildParams(s, { weights: stripNewInstruments(s.weights) })).left, SAMPLE_RATE)),
    );
    const currentAvg = avgPairwise(currentVecs, euclideanDistance);
    const revertedAvg = avgPairwise(revertedVecs, euclideanDistance);
    expect(revertedAvg).toBeLessThan(currentAvg);
  });
});

describe("findTooSimilarPairs(退行検知そのもの)", () => {
  function composeAll(overrides: (spec: BgmSpec) => Partial<TrackParams>): DistinctnessTrack[] {
    return distinctnessSpecs.map((s) => ({ id: s.id, samples: composeTrack(buildParams(s, overrides(s))).left }));
  }

  it("現行のBGM11本では、似すぎペアが1件も無い", () => {
    const tracks = composeAll(() => ({}));
    expect(findTooSimilarPairs(tracks, SAMPLE_RATE)).toEqual([]);
  });

  it("コード進行・楽器編成の両方を退行させると、似すぎペアを検知する", () => {
    const tracks = composeAll((s) => ({
      chordSkeleton: undefined,
      weights: stripNewInstruments(s.weights),
    }));
    const pairs = findTooSimilarPairs(tracks, SAMPLE_RATE);
    expect(pairs.length).toBeGreaterThan(0);
  });
});
