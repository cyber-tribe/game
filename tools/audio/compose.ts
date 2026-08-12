/**
 * 手続き的な作曲(plan/audio-synthesis.md)。
 * ダンジョン生成と同じ「シード付き乱数で、決めた設計の範囲内だけを
 * 使わせる」考え方を音楽にも当てはめる。音階・テンポ・コード進行の
 * 骨格は全曲共通の定数として固定し、地方ごとにシードと楽器の重みだけを
 * 変える。
 */
import { drumHit, fluteNote, malletNote, mixIn, mulberry32, normalize, pluckedString } from "./synth.ts";

export const TEMPO_BPM = 92;
export const BEAT_SEC = 60 / TEMPO_BPM;

/** 全曲共通の音階(メジャーペンタトニック)。不協和な組み合わせが生まれる余地自体を無くす */
const PENTATONIC_SEMITONES = [0, 2, 4, 7, 9] as const;
const ROOT_MIDI = 60; // C4

/** 全曲共通のコード進行の骨格(ペンタトニック上の度数、4小節分) */
const CHORD_SKELETON = [0, 3, 4, 2] as const;

function degreeToFreq(degree: number): number {
  const len = PENTATONIC_SEMITONES.length;
  const idx = ((degree % len) + len) % len;
  const octave = Math.floor(degree / len);
  const semitone = ROOT_MIDI + PENTATONIC_SEMITONES[idx]! + octave * 12;
  return 440 * Math.pow(2, (semitone - 69) / 12);
}

export interface InstrumentWeights {
  mallet: number;
  drum: number;
  flute: number;
  string: number;
}

function pickMelodyInstrument(
  roll: number,
  weights: InstrumentWeights,
): "mallet" | "flute" | "string" {
  const total = weights.mallet + weights.flute + weights.string;
  if (total <= 0) return "mallet";
  const scaled = roll * total;
  if (scaled < weights.mallet) return "mallet";
  if (scaled < weights.mallet + weights.flute) return "flute";
  return "string";
}

/**
 * 地方ごとのシードと楽器の重みから、ループ用のBGMを1本生成する。
 * @param bars 小節数(4/4拍子)。短めに抑え、ファイルサイズを膨らませない
 */
export function composeTrack(
  seed: number,
  weights: InstrumentWeights,
  bars: number,
  sampleRate: number,
): Float32Array {
  const rng = mulberry32(seed);
  const totalSamples = Math.floor(bars * 4 * BEAT_SEC * sampleRate);
  const out = new Float32Array(totalSamples);

  let noteSeed = seed;
  for (let bar = 0; bar < bars; bar++) {
    const chordDegree = CHORD_SKELETON[bar % CHORD_SKELETON.length]!;
    for (let beat = 0; beat < 4; beat++) {
      const tSec = (bar * 4 + beat) * BEAT_SEC;
      const offset = Math.floor(tSec * sampleRate);

      // 太鼓: 拍の頭に、重みに応じた確率で鳴らす(常時鳴らすとうるさいので間引く)
      if (weights.drum > 0 && rng() < Math.min(0.9, weights.drum)) {
        noteSeed = (noteSeed + 1) | 0;
        mixIn(out, drumHit(BEAT_SEC * 0.6, sampleRate, noteSeed, 90, 0.5), offset);
      }

      // メロディ: コード度数を中心に、ペンタトニック上を1度だけ揺らす
      if (rng() < 0.85) {
        const degree = chordDegree + Math.floor(rng() * 3) - 1 + 5; // 1オクターブ上げて主旋律らしくする
        const freq = degreeToFreq(degree);
        const dur = BEAT_SEC * (rng() < 0.3 ? 0.5 : 0.95);
        const instrument = pickMelodyInstrument(rng(), weights);
        noteSeed = (noteSeed + 1) | 0;
        const note =
          instrument === "mallet"
            ? malletNote(freq, dur, sampleRate, 0.55)
            : instrument === "flute"
              ? fluteNote(freq, dur, sampleRate, 0.5)
              : pluckedString(freq, dur, sampleRate, noteSeed, 0.5);
        mixIn(out, note, offset);
      }
    }
  }

  normalize(out);
  return out;
}

/**
 * 1回きりのSFX。旋律は持たず、単発のエンベロープ付き音源(木琴/太鼓寄り)で表す
 */
export function composeSfx(
  kind: "mallet" | "drum",
  freq: number,
  duration: number,
  sampleRate: number,
  seed: number,
): Float32Array {
  const out = kind === "mallet" ? malletNote(freq, duration, sampleRate, 0.8) : drumHit(duration, sampleRate, seed, freq, 0.8);
  normalize(out);
  return out;
}
