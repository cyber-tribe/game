/**
 * BGMが「構成上の手抜き」で似すぎていないかを、音を聴かずに機械的に検知する
 * (plan/sound/archive/bgm-automated-distinctness-check.md)。
 *
 * 合成音源であり鳴っている音の周波数があらかじめ既知なので、汎用FFTは
 * 実装せず、狙った周波数のエネルギーだけを直接求められるGoertzelアルゴリズム
 * を使う。和声フィンガープリント(コード進行の"同じさ")はペンタトニック
 * 音階上の周波数だけを、音色フィンガープリント(楽器編成の"同じさ")は
 * 対数間隔の周波数群を対象にする。
 *
 * 「曲としての魅力」等の主観的な音楽性は判定できない(対象外)。あくまで
 * 「全曲同じコード進行」「全曲同じ楽器編成」という既知の退行パターンへの
 * 逆戻りだけを検知する。
 */

// compose.tsと同じ音階(ROOT_MIDI=60・PENTATONIC_SEMITONES)。似すぎ検知の
// 対象周波数を決めるためだけに使うので、compose.ts側の定数はimportしない
// (どちらもテスト対象そのものになりうるため、意図的に独立させておく)
const PENTATONIC_SEMITONES = [0, 2, 4, 7, 9] as const;
const ROOT_MIDI = 60;

function degreeToFreq(degree: number): number {
  const len = PENTATONIC_SEMITONES.length;
  const idx = ((degree % len) + len) % len;
  const octave = Math.floor(degree / len);
  const semitone = ROOT_MIDI + PENTATONIC_SEMITONES[idx]! + octave * 12;
  return 440 * Math.pow(2, (semitone - 69) / 12);
}

// ペンタトニック3オクターブ分(15点)を和声フィンガープリントの対象にする
const HARMONIC_TARGET_FREQS = Array.from({ length: 15 }, (_, i) => degreeToFreq(i - 5));

// 音色フィンガープリントは音階に縛られない対数間隔の周波数群を対象にする
// (rattle等のノイズ主体の音色も拾えるよう、音階外の帯域も見る)
function logSpacedFreqs(count: number, min: number, max: number): number[] {
  const ratio = Math.pow(max / min, 1 / (count - 1));
  return Array.from({ length: count }, (_, i) => min * Math.pow(ratio, i));
}
const TIMBRE_TARGET_FREQS = logSpacedFreqs(24, 100, 8000);

const WINDOW = 2048;
const HOP = 1024;
// 和声フィンガープリントは曲を(絶対時間ではなく)相対位置でこの数の区間に割り、
// 区間ごとにエネルギーを求めてから連結する。単純な全体平均だと「どのコード
// 度数がどれだけ使われたか」の集計(ヒストグラム)にしかならず、コード進行の
// **順序**の違いをほとんど拾えなかった(実測で確認済み。テストのコメント参照)。
// 区間に割って連結することで、時間軸に沿った和声の起伏(進行の形)そのものを
// ベクトルの違いとして表せる
const HARMONIC_SEGMENTS = 16;

function forEachWindow(sampleCount: number, callback: (start: number) => void): void {
  for (let start = 0; start + WINDOW <= sampleCount; start += HOP) callback(start);
}

/** 窓内における1つの周波数のエネルギーをGoertzelアルゴリズムで求める */
function goertzelEnergy(samples: Float32Array, start: number, freq: number, sampleRate: number): number {
  const k = Math.round((WINDOW * freq) / sampleRate);
  const omega = (2 * Math.PI * k) / WINDOW;
  const coeff = 2 * Math.cos(omega);
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < WINDOW; i++) {
    const s0 = samples[start + i]! + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return s1 * s1 + s2 * s2 - coeff * s1 * s2;
}

function normalizeVector(v: readonly number[]): number[] {
  const norm = Math.sqrt(v.reduce((sum, x) => sum + x * x, 0));
  return norm > 0 ? v.map((x) => x / norm) : v.slice();
}

/**
 * 和声フィンガープリント: 曲を相対位置でHARMONIC_SEGMENTS個の区間に割り、
 * 区間ごとにペンタトニック3オクターブ分のエネルギーを時間平均・正規化した
 * ものを連結する(HARMONIC_SEGMENTS×15次元)。コード進行の順序自体が近いほど、
 * 曲間のコサイン類似度が高くなる。
 */
export function harmonicFingerprint(samples: Float32Array, sampleRate: number): number[] {
  const segmentLength = Math.floor(samples.length / HARMONIC_SEGMENTS);
  const out: number[] = [];
  for (let seg = 0; seg < HARMONIC_SEGMENTS; seg++) {
    const segmentStart = seg * segmentLength;
    const segmentEnd = seg === HARMONIC_SEGMENTS - 1 ? samples.length : segmentStart + segmentLength;
    const totals = new Array(HARMONIC_TARGET_FREQS.length).fill(0);
    let windows = 0;
    for (let start = segmentStart; start + WINDOW <= segmentEnd; start += HOP) {
      for (let i = 0; i < HARMONIC_TARGET_FREQS.length; i++) {
        totals[i] += goertzelEnergy(samples, start, HARMONIC_TARGET_FREQS[i]!, sampleRate);
      }
      windows++;
    }
    const avg = windows > 0 ? totals.map((v) => v / windows) : totals;
    out.push(...normalizeVector(avg));
  }
  return out;
}

function spectralCentroid(mags: readonly number[], freqs: readonly number[]): number {
  let weighted = 0;
  let total = 0;
  for (let i = 0; i < mags.length; i++) {
    weighted += mags[i]! * freqs[i]!;
    total += mags[i]!;
  }
  return total > 0 ? weighted / total : 0;
}

function spectralFlatness(mags: readonly number[]): number {
  const eps = 1e-9;
  const logSum = mags.reduce((sum, m) => sum + Math.log(m + eps), 0);
  const geoMean = Math.exp(logSum / mags.length);
  const arithMean = mags.reduce((sum, m) => sum + m, 0) / mags.length;
  return arithMean > 0 ? geoMean / arithMean : 0;
}

function zeroCrossingRate(samples: Float32Array, start: number): number {
  let crossings = 0;
  for (let i = start + 1; i < start + WINDOW; i++) {
    if (samples[i - 1]! >= 0 !== samples[i]! >= 0) crossings++;
  }
  return crossings / WINDOW;
}

/**
 * 音色フィンガープリント: スペクトル重心(明るさ)・スペクトルフラットネス
 * (倍音性かノイズ性か)・ゼロ交差率を曲全体で時間平均した3次元ベクトル。
 * 楽器編成(mallet/flute/gong/bow/rattle等)が実質的に異なれば、この3値も
 * はっきり異なるはず。
 */
export function timbreFingerprint(samples: Float32Array, sampleRate: number): number[] {
  let centroidSum = 0;
  let flatnessSum = 0;
  let zcrSum = 0;
  let windows = 0;
  forEachWindow(samples.length, (start) => {
    const mags = TIMBRE_TARGET_FREQS.map((freq) => Math.sqrt(Math.max(0, goertzelEnergy(samples, start, freq, sampleRate))));
    centroidSum += spectralCentroid(mags, TIMBRE_TARGET_FREQS);
    flatnessSum += spectralFlatness(mags);
    zcrSum += zeroCrossingRate(samples, start);
    windows++;
  });
  if (windows === 0) return [0, 0, 0];
  return [centroidSum / windows, flatnessSum / windows, zcrSum / windows];
}

export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? dot / denom : 0;
}

/** 音色フィンガープリントの3次元は単位がバラバラ(Hz・比率・比率)なので、 */
/** 比較する曲の集合全体でZスコア正規化してから距離を測る */
export function zScoreNormalizeColumns(vectors: readonly (readonly number[])[]): number[][] {
  const dims = vectors[0]?.length ?? 0;
  const means: number[] = [];
  const stds: number[] = [];
  for (let d = 0; d < dims; d++) {
    const col = vectors.map((v) => v[d]!);
    const mean = col.reduce((sum, x) => sum + x, 0) / col.length;
    const variance = col.reduce((sum, x) => sum + (x - mean) ** 2, 0) / col.length;
    means.push(mean);
    stds.push(Math.sqrt(variance));
  }
  return vectors.map((v) => v.map((x, d) => (stds[d]! > 0 ? (x - means[d]!) / stds[d]! : 0)));
}

export function euclideanDistance(a: readonly number[], b: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i]! - b[i]!) ** 2;
  return Math.sqrt(sum);
}

export interface DistinctnessTrack {
  id: string;
  /** モノラルの波形(ステレオならどちらか片方の耳の内容で十分。左右はほぼ同じ内容のパン違い) */
  samples: Float32Array;
}

export interface SimilarPair {
  a: string;
  b: string;
  harmonicSimilarity: number;
  timbreDistance: number;
  /** どちらの軸が閾値を超えたか(両方のこともある) */
  reasons: ("harmonic" | "timbre")[];
}

/**
 * 和声(コサイン類似度が高い=近い)・音色(ユークリッド距離が近い=似ている)の
 * **どちらか一方**でも閾値を超えたペアを「似すぎ」と判定する。
 *
 * 当初は両方が閾値内に収まることを条件にしていた(地方ごとに意図的にテンポ・
 * 拍子を共通にすることはあり得るので、片方だけ近くても誤検知にしないねらい)。
 * だが較正実験(plan/sound/archive/bgm-automated-distinctness-check.md)で、
 * 「どの曲同士が和声的に近づくか」と「どの曲同士が音色的に近づくか」は
 * 実際にはほぼ無関係であることが分かった(コード進行を退行させたときに近づく
 * ペアと、楽器編成を退行させたときに近づくペアは別の組み合わせになる)。
 * 両方同時を要求すると、2回の所見(それぞれ別の原因)を完全に再現させても
 * 1件も検知できなかった(較正実験で確認済み)。1回目・2回目はそもそも別々の
 * 退行だったので、軸ごとに独立して検知する設計に改めた。誤検知は
 * `npm run audio`ではビルドを止めない警告に留めることで許容する
 */
export function findTooSimilarPairs(
  tracks: readonly DistinctnessTrack[],
  sampleRate: number,
  opts?: { harmonicSimilarityThreshold?: number; timbreDistanceThreshold?: number },
): SimilarPair[] {
  // 閾値は plan/sound/archive/bgm-automated-distinctness-check.md の較正実験
  // (1回目・2回目の所見状態を再現し、実測値をもとに決めた)による
  const harmonicSimilarityThreshold = opts?.harmonicSimilarityThreshold ?? 0.5;
  const timbreDistanceThreshold = opts?.timbreDistanceThreshold ?? 0.25;

  const harmonicVecs = tracks.map((t) => harmonicFingerprint(t.samples, sampleRate));
  const timbreVecs = zScoreNormalizeColumns(tracks.map((t) => timbreFingerprint(t.samples, sampleRate)));

  const pairs: SimilarPair[] = [];
  for (let i = 0; i < tracks.length; i++) {
    for (let j = i + 1; j < tracks.length; j++) {
      const harmonicSimilarity = cosineSimilarity(harmonicVecs[i]!, harmonicVecs[j]!);
      const timbreDistance = euclideanDistance(timbreVecs[i]!, timbreVecs[j]!);
      const reasons: ("harmonic" | "timbre")[] = [];
      if (harmonicSimilarity >= harmonicSimilarityThreshold) reasons.push("harmonic");
      if (timbreDistance <= timbreDistanceThreshold) reasons.push("timbre");
      if (reasons.length > 0) {
        pairs.push({ a: tracks[i]!.id, b: tracks[j]!.id, harmonicSimilarity, timbreDistance, reasons });
      }
    }
  }
  return pairs;
}
