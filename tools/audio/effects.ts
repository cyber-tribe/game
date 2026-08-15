/**
 * ミックスバス側の信号処理(plan/sound/archive/bgm-quality-upgrade.md)。
 * 楽器ごとの合成(synth.ts)とは別に、リバーブ・パン・ステレオ合成をここに集める。
 */
import { mixIn } from "./synth.ts";

export interface ReverbParams {
  /** ウェット成分の混合比 0..1 */
  wet: number;
  /** 残響の長さ(フィードバック量) 0..1 */
  roomSize: number;
  /** 高域の減衰(こもり具合) 0..1。既定0.2 */
  damping?: number;
}

// Schroeder型: 並列コムフィルタ4本 + 直列オールパス2本。
// L/Rで少しずらした遅延時間を使い、位相差だけでステレオの広がりを作る
const COMB_DELAYS_L_MS = [29.7, 37.1, 41.1, 43.7];
const COMB_DELAYS_R_MS = [31.3, 38.9, 43.3, 46.1];
const ALLPASS_DELAYS_MS = [5.0, 1.7];

function combFilter(input: Float32Array, delaySamples: number, feedback: number, damping: number): Float32Array {
  const out = new Float32Array(input.length);
  const buf = new Float32Array(delaySamples);
  let idx = 0;
  let filterStore = 0;
  for (let i = 0; i < input.length; i++) {
    const bufOut = buf[idx]!;
    filterStore = bufOut * (1 - damping) + filterStore * damping; // フィードバック経路の一次ローパス
    out[i] = bufOut;
    buf[idx] = input[i]! + filterStore * feedback;
    idx = (idx + 1) % delaySamples;
  }
  return out;
}

function allpassFilter(input: Float32Array, delaySamples: number, feedback: number): Float32Array {
  const out = new Float32Array(input.length);
  const buf = new Float32Array(delaySamples);
  let idx = 0;
  for (let i = 0; i < input.length; i++) {
    const bufOut = buf[idx]!;
    const inVal = input[i]!;
    out[i] = -inVal + bufOut;
    buf[idx] = inVal + bufOut * feedback;
    idx = (idx + 1) % delaySamples;
  }
  return out;
}

/** 純粋なウェット成分(ドライは混ぜない)を返す。コムフィルタの和 → オールパス2段 */
function reverbTail(
  input: Float32Array,
  sampleRate: number,
  roomSize: number,
  damping: number,
  delaysMs: readonly number[],
): Float32Array {
  const feedback = 0.6 + Math.max(0, Math.min(1, roomSize)) * 0.35;
  let wet: Float32Array = new Float32Array(input.length);
  for (const ms of delaysMs) {
    const delaySamples = Math.max(1, Math.round((ms / 1000) * sampleRate));
    const combOut = combFilter(input, delaySamples, feedback, damping);
    for (let i = 0; i < wet.length; i++) wet[i]! += combOut[i]! / delaysMs.length;
  }
  for (const ms of ALLPASS_DELAYS_MS) {
    const delaySamples = Math.max(1, Math.round((ms / 1000) * sampleRate));
    wet = allpassFilter(wet, delaySamples, 0.5);
  }
  return wet;
}

/**
 * ループBGM用のステレオリバーブ。残響の尾を`tailSec`分だけ余分に計算し、
 * ループ末尾にあたる部分を先頭へ折り返して混ぜることで、ループ境界で
 * 残響が不自然に途切れないようにする(オフライン生成だからできる定石)。
 */
export function reverbLoopStereo(
  monoDry: Float32Array,
  sampleRate: number,
  params: ReverbParams,
  tailSec = 1.2,
): { left: Float32Array; right: Float32Array } {
  const tailLen = Math.round(tailSec * sampleRate);
  const extended = new Float32Array(monoDry.length + tailLen);
  extended.set(monoDry, 0);
  const damping = params.damping ?? 0.2;

  const wrap = (delaysMs: readonly number[]): Float32Array => {
    const full = reverbTail(extended, sampleRate, params.roomSize, damping, delaysMs);
    const out = full.slice(0, monoDry.length);
    for (let i = 0; i < tailLen && i < out.length; i++) out[i]! += full[monoDry.length + i]!;
    for (let i = 0; i < out.length; i++) out[i]! *= params.wet;
    return out;
  };

  return { left: wrap(COMB_DELAYS_L_MS), right: wrap(COMB_DELAYS_R_MS) };
}

/**
 * 単発SFX用のリバーブ(モノラルのまま)。ループしないので、尾はそのまま
 * 音の後ろに伸ばす(折り返しは不要)。
 */
export function reverbOneShot(dry: Float32Array, sampleRate: number, params: ReverbParams, tailSec = 0.4): Float32Array {
  const tailLen = Math.round(tailSec * sampleRate);
  const extended = new Float32Array(dry.length + tailLen);
  extended.set(dry, 0);
  const wet = reverbTail(extended, sampleRate, params.roomSize, params.damping ?? 0.2, COMB_DELAYS_L_MS);
  const out = new Float32Array(extended.length);
  for (let i = 0; i < out.length; i++) out[i] = extended[i]! + wet[i]! * params.wet;
  return out;
}

/** 等パワーパンニング。pan: -1(左)..0(中央)..1(右) */
export function panMono(mono: Float32Array, pan: number): { left: Float32Array; right: Float32Array } {
  const p = Math.max(-1, Math.min(1, pan));
  const angle = ((p + 1) / 2) * (Math.PI / 2);
  const leftGain = Math.cos(angle);
  const rightGain = Math.sin(angle);
  const left = new Float32Array(mono.length);
  const right = new Float32Array(mono.length);
  for (let i = 0; i < mono.length; i++) {
    left[i] = mono[i]! * leftGain;
    right[i] = mono[i]! * rightGain;
  }
  return { left, right };
}

/**
 * モノラル音源をハース効果で左右に広げる(弦のような「広がる」音像向け)。
 * 右チャンネルを`delayMs`だけ遅らせるだけで、位相差から幅の感覚が生まれる。
 */
export function widenMono(mono: Float32Array, sampleRate: number, delayMs = 12): { left: Float32Array; right: Float32Array } {
  const delaySamples = Math.round((delayMs / 1000) * sampleRate);
  const left = mono;
  const right = new Float32Array(mono.length);
  for (let i = 0; i < mono.length; i++) {
    const srcIdx = i - delaySamples;
    right[i] = srcIdx >= 0 ? mono[srcIdx]! : 0;
  }
  return { left, right };
}

/** ステレオ版のmixIn: LR両方を同じoffsetで加算合成する */
export function mixStereoIn(
  destLeft: Float32Array,
  destRight: Float32Array,
  srcLeft: Float32Array,
  srcRight: Float32Array,
  offset: number,
): void {
  mixIn(destLeft, srcLeft, offset);
  mixIn(destRight, srcRight, offset);
}

/** L/R共通のピークで正規化する(片チャンネルだけ縮小して定位がずれるのを防ぐ) */
export function normalizeStereo(left: Float32Array, right: Float32Array, headroom = 0.9): void {
  let peak = 0;
  for (const s of left) peak = Math.max(peak, Math.abs(s));
  for (const s of right) peak = Math.max(peak, Math.abs(s));
  if (peak <= headroom) return;
  const scale = headroom / peak;
  for (let i = 0; i < left.length; i++) left[i]! *= scale;
  for (let i = 0; i < right.length; i++) right[i]! *= scale;
}
