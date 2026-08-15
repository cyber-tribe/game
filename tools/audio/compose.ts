/**
 * 手続き的な作曲(plan/sound/archive/audio-synthesis.md、
 * plan/sound/archive/bgm-quality-upgrade.md)。
 * ダンジョン生成と同じ「シード付き乱数で、決めた設計の範囲内だけを
 * 使わせる」考え方を音楽にも当てはめる。音階・楽器群は全曲共通の定数として
 * 固定し、地方ごとにシード・楽器の重み・テンポ・拍子・リバーブの深さを変える。
 */
import { drumHit, fluteNote, malletNote, mixIn, mulberry32, normalize, pluckedString } from "./synth.ts";
import {
  mixStereoIn,
  normalizeStereo,
  panMono,
  reverbOneShot,
  reverbLoopStereo,
  widenMono,
  type ReverbParams,
} from "./effects.ts";

/** 全曲共通の音階(メジャーペンタトニック)。不協和な組み合わせが生まれる余地自体を無くす */
const PENTATONIC_SEMITONES = [0, 2, 4, 7, 9] as const;
const ROOT_MIDI = 60; // C4
const SCALE_LEN = PENTATONIC_SEMITONES.length;

// 全曲共通のコード進行の骨格(ペンタトニック上の度数、8小節分)。
// 8〜16小節のループはこのパターンを繰り返して使う(「同じ世界の続き」を保つ)
const CHORD_SKELETON = [0, 3, 4, 2, 1, 3, 4, 0] as const;

// コードのボイシング(和音の積み方)。0=ルート、2=三度、4=五度相当(ペンタトニック上の度数差)。
// 常にルートを弾かず、小節ごとに転回して単調さを避ける
const VOICING_OFFSETS = [0, 2, 4] as const;

function degreeToFreq(degree: number): number {
  const idx = ((degree % SCALE_LEN) + SCALE_LEN) % SCALE_LEN;
  const octave = Math.floor(degree / SCALE_LEN);
  const semitone = ROOT_MIDI + PENTATONIC_SEMITONES[idx]! + octave * 12;
  return 440 * Math.pow(2, (semitone - 69) / 12);
}

export interface InstrumentWeights {
  mallet: number;
  drum: number;
  flute: number;
  string: number;
}

function pickMelodyInstrument(roll: number, weights: InstrumentWeights): "mallet" | "flute" | "string" {
  const total = weights.mallet + weights.flute + weights.string;
  if (total <= 0) return "mallet";
  const scaled = roll * total;
  if (scaled < weights.mallet) return "mallet";
  if (scaled < weights.mallet + weights.flute) return "flute";
  return "string";
}

export interface StereoTrack {
  left: Float32Array;
  right: Float32Array;
}

export interface TrackParams {
  seed: number;
  weights: InstrumentWeights;
  /** ループの小節数。8〜16を目安にする(短い4小節ループの繰り返し感を避けるため) */
  bars: number;
  /** 1小節の拍数。既定4(4/4拍子)。地方ごとに変えてよい */
  beatsPerBar?: number;
  tempoBpm: number;
  reverb: ReverbParams;
  sampleRate: number;
  /**
   * 各拍の裏(8分裏)に短い木琴を置く確率。既定0(鳴らさない)。
   * せかせかした刻みを出したい曲(近道屋の裏穴など)向けの拡張
   * (plan/sound/archive/bgm-shortcut-back-hole.md)
   */
  offbeatProb?: number;
  /**
   * 旋律・和声の発音確率に掛ける係数。既定1(従来どおり)。
   * 音数を間引いて「聞き流せる」静けさを出したい曲
   * (夜ごとの夢・忘れ物蔵など)向けの拡張
   * (plan/sound/archive/bgm-nightly-dream.md)
   */
  melodyDensity?: number;
}

/**
 * 地方ごとのシード・楽器の重み・テンポ・拍子・リバーブから、ループ用の
 * ステレオBGMを1本生成する。
 */
export function composeTrack(params: TrackParams): StereoTrack {
  const { seed, weights, bars, tempoBpm, reverb, sampleRate } = params;
  const beatsPerBar = params.beatsPerBar ?? 4;
  const offbeatProb = params.offbeatProb ?? 0;
  const melodyDensity = params.melodyDensity ?? 1;
  const beatSec = 60 / tempoBpm;
  const totalSamples = Math.floor(bars * beatsPerBar * beatSec * sampleRate);

  const malletMono = new Float32Array(totalSamples);
  const fluteMono = new Float32Array(totalSamples);
  const stringMono = new Float32Array(totalSamples);
  const drumMono = new Float32Array(totalSamples);
  const bassMono = new Float32Array(totalSamples);
  const byInstrument = { mallet: malletMono, flute: fluteMono, string: stringMono } as const;

  const rng = mulberry32(seed);
  let noteSeed = seed;
  const secondHalfStart = Math.floor(bars / 2);

  for (let bar = 0; bar < bars; bar++) {
    const chordDegree = CHORD_SKELETON[bar % CHORD_SKELETON.length]!;
    const isSecondHalf = bar >= secondHalfStart;
    const barOffset = Math.floor(bar * beatsPerBar * beatSec * sampleRate);

    // ベースライン: 小節ごとにコードの根音を1オクターブ下で鳴らし、曲の土台を作る
    noteSeed = (noteSeed + 1) | 0;
    const bassDur = beatsPerBar * beatSec * 0.92;
    mixIn(bassMono, pluckedString(degreeToFreq(chordDegree - SCALE_LEN), bassDur, sampleRate, noteSeed, 0.4), barOffset);

    // 転回: 小節ごとにルート/三度/五度のどれを中心に旋律を組むか変え、ルート弾き一辺倒を避ける
    const voicing = VOICING_OFFSETS[Math.floor(rng() * VOICING_OFFSETS.length)]!;
    const voicedDegree = chordDegree + voicing;

    for (let beat = 0; beat < beatsPerBar; beat++) {
      const tSec = (bar * beatsPerBar + beat) * beatSec;
      const offset = Math.floor(tSec * sampleRate);

      // 太鼓: 拍の頭に、重みに応じた確率で鳴らす。後半は気持ち密度を上げて起伏を付ける
      const drumProb = Math.min(0.9, weights.drum * (isSecondHalf ? 1.15 : 1));
      if (weights.drum > 0 && rng() < drumProb) {
        noteSeed = (noteSeed + 1) | 0;
        mixIn(drumMono, drumHit(beatSec * 0.6, sampleRate, noteSeed, 90, 0.5), offset);
      }

      // メロディ: 転回したコード度数を中心に、ペンタトニック上を1度だけ揺らす。
      // melodyDensityで発音確率全体を間引ける(既定1、聞き流せる静けさを出したい曲向け)
      const melodyProb = (isSecondHalf ? 0.9 : 0.85) * melodyDensity;
      if (rng() < melodyProb) {
        const degree = voicedDegree + Math.floor(rng() * 3) - 1 + SCALE_LEN; // 1オクターブ上げて主旋律らしくする
        const freq = degreeToFreq(degree);
        const dur = beatSec * (rng() < 0.3 ? 0.5 : 0.95);
        const instrument = pickMelodyInstrument(rng(), weights);
        noteSeed = (noteSeed + 1) | 0;
        const note =
          instrument === "mallet"
            ? malletNote(freq, dur, sampleRate, 0.55)
            : instrument === "flute"
              ? fluteNote(freq, dur, sampleRate, 0.5)
              : pluckedString(freq, dur, sampleRate, noteSeed, 0.5);
        mixIn(byInstrument[instrument], note, offset);

        // 後半(Bメロ相当)だけ、五度違いの和音構成音を木琴で重ねて厚みを増す
        if (isSecondHalf && rng() < 0.4 * melodyDensity) {
          const harmonyDegree = chordDegree + (voicing === 0 ? 4 : 0) + SCALE_LEN;
          mixIn(malletMono, malletNote(degreeToFreq(harmonyDegree), dur * 0.8, sampleRate, 0.3), offset);
        }
      }

      // 裏拍: 拍の裏(8分裏)に短い木琴を置き、せかせかした刻みを出す(既定0で従来曲には影響なし)
      if (offbeatProb > 0 && rng() < offbeatProb) {
        const offbeatOffset = Math.floor((tSec + beatSec * 0.5) * sampleRate);
        mixIn(malletMono, malletNote(degreeToFreq(voicedDegree + SCALE_LEN), beatSec * 0.25, sampleRate, 0.3), offbeatOffset);
      }
    }
  }

  // 楽器ごとにパンを振る: 木琴やや左・笛中央・太鼓とベースは中央、弦は左右に広げる
  const malletStereo = panMono(malletMono, -0.35);
  const fluteStereo = panMono(fluteMono, 0);
  const stringStereo = widenMono(stringMono, sampleRate);
  const drumStereo = panMono(drumMono, 0);
  const bassStereo = panMono(bassMono, 0);

  const dryLeft = new Float32Array(totalSamples);
  const dryRight = new Float32Array(totalSamples);
  for (const s of [malletStereo, fluteStereo, stringStereo, drumStereo, bassStereo]) {
    mixStereoIn(dryLeft, dryRight, s.left, s.right, 0);
  }

  // リバーブはパン前のモノラル和音源にかける(ウェット成分は左右に広く散らして空間の広がりを出す)
  const monoDrySum = new Float32Array(totalSamples);
  for (let i = 0; i < totalSamples; i++) {
    monoDrySum[i] = malletMono[i]! + fluteMono[i]! + stringMono[i]! + drumMono[i]! + bassMono[i]!;
  }
  const wet = reverbLoopStereo(monoDrySum, sampleRate, reverb);

  const left = new Float32Array(totalSamples);
  const right = new Float32Array(totalSamples);
  for (let i = 0; i < totalSamples; i++) {
    left[i] = dryLeft[i]! + wet.left[i]!;
    right[i] = dryRight[i]! + wet.right[i]!;
  }

  normalizeStereo(left, right);
  return { left, right };
}

export interface SfxParams {
  kind: "mallet" | "drum";
  freq: number;
  duration: number;
  sampleRate: number;
  seed: number;
  /** BGMより薄いウェット率のリバーブ。省略時はリバーブ無し */
  reverb?: ReverbParams;
}

/**
 * 1回きりのSFX。旋律は持たず、単発のエンベロープ付き音源(木琴/太鼓寄り)で表す。
 * SFXは再生時に中央定位で足りるためモノラルのまま(ファイルサイズを抑える)。
 */
export function composeSfx(params: SfxParams): Float32Array {
  const { kind, freq, duration, sampleRate, seed, reverb } = params;
  const dry = kind === "mallet" ? malletNote(freq, duration, sampleRate, 0.8) : drumHit(duration, sampleRate, seed, freq, 0.8);
  normalize(dry);
  if (!reverb) return dry;
  const wet = reverbOneShot(dry, sampleRate, reverb);
  normalize(wet);
  return wet;
}
