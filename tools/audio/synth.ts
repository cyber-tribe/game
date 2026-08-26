/**
 * 楽器ごとの手続き的な音声合成(plan/audio-synthesis.md)。
 * 録音・既製サンプルに頼らず、単純な信号処理でそれぞれの質感を近似する。
 */

/** シード付きの決定的な疑似乱数(RNGの結果だけを採用する既存の考え方をここでも踏襲) */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 木琴・鈴: 正弦波+わずかな倍音、鋭いアタック・指数的な減衰(バチで叩く質感) */
export function malletNote(freq: number, duration: number, sampleRate: number, velocity = 1): Float32Array {
  const n = Math.max(1, Math.floor(duration * sampleRate));
  const out = new Float32Array(n);
  const attack = Math.min(0.004, duration * 0.1);
  const decayTau = duration * 0.35;
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const env = t < attack ? t / attack : Math.exp(-(t - attack) / decayTau);
    const fund = Math.sin(2 * Math.PI * freq * t);
    // 完全な整数倍音ではなく、少しずらすことで金属的な鳴りに近づける
    const harmonic = 0.25 * Math.sin(2 * Math.PI * freq * 2.76 * t);
    out[i] = velocity * env * (fund + harmonic) * 0.8;
  }
  return out;
}

/** 太鼓: フィルタしたノイズ+低い正弦波の「ドン」、短いエンベロープ */
export function drumHit(duration: number, sampleRate: number, seed: number, pitch = 90, velocity = 1): Float32Array {
  const n = Math.max(1, Math.floor(duration * sampleRate));
  const out = new Float32Array(n);
  const rng = mulberry32(seed);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const env = Math.exp(-t / (duration * 0.18));
    const noise = rng() * 2 - 1;
    lp += (noise - lp) * 0.3; // 一次のローパスで、ノイズを鈍らせる
    const tone = Math.sin(2 * Math.PI * pitch * t) * Math.exp(-t / (duration * 0.12));
    out[i] = velocity * env * (lp * 0.6 + tone * 0.6);
  }
  return out;
}

/** 笛: 正弦波主体、緩やかなアタックとわずかなビブラート(息の揺れ) */
export function fluteNote(freq: number, duration: number, sampleRate: number, velocity = 1): Float32Array {
  const n = Math.max(1, Math.floor(duration * sampleRate));
  const out = new Float32Array(n);
  const attack = duration * 0.18;
  const release = duration * 0.25;
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    let env: number;
    if (t < attack) env = t / attack;
    else if (t > duration - release) env = Math.max(0, (duration - t) / release);
    else env = 1;
    const vibrato = 1 + 0.006 * Math.sin(2 * Math.PI * 5 * t);
    out[i] = velocity * env * Math.sin(2 * Math.PI * freq * vibrato * t) * 0.7;
  }
  return out;
}

/** 弦(琴に近い響き): Karplus-Strong法。はじいた弦特有の減衰音になる */
export function pluckedString(freq: number, duration: number, sampleRate: number, seed: number, velocity = 1): Float32Array {
  const n = Math.max(1, Math.floor(duration * sampleRate));
  const period = Math.max(2, Math.round(sampleRate / freq));
  const ring = new Float32Array(period);
  const rng = mulberry32(seed);
  for (let i = 0; i < period; i++) ring[i] = rng() * 2 - 1;

  const out = new Float32Array(n);
  let idx = 0;
  for (let i = 0; i < n; i++) {
    const cur = ring[idx]!;
    const next = ring[(idx + 1) % period]!;
    ring[idx] = (cur + next) * 0.5 * 0.996; // 平均化+減衰で弦の振動を模す
    out[i] = velocity * cur;
    idx = (idx + 1) % period;
  }
  return out;
}

/**
 * ハミング(声のような持続音): 倍音少なめの正弦波(口を閉じた「んー」)+
 * 深めでゆっくりしたビブラート(人の声の揺れ)+ごく薄い息ノイズ
 * (plan/sound/archive/bgm-true-awakening.md)
 */
export function humVoice(freq: number, duration: number, sampleRate: number, seed: number, velocity = 1): Float32Array {
  const n = Math.max(1, Math.floor(duration * sampleRate));
  const out = new Float32Array(n);
  const attack = duration * 0.25;
  const release = duration * 0.25;
  const rng = mulberry32(seed);
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    let env: number;
    if (t < attack) env = t / attack;
    else if (t > duration - release) env = Math.max(0, (duration - t) / release);
    else env = 1;
    const vibrato = 1 + 0.008 * Math.sin(2 * Math.PI * 4.5 * t);
    const fund = Math.sin(2 * Math.PI * freq * vibrato * t);
    const h2 = 0.2 * Math.sin(2 * Math.PI * freq * 2 * vibrato * t);
    const h3 = 0.05 * Math.sin(2 * Math.PI * freq * 3 * vibrato * t);
    const breath = (rng() * 2 - 1) * 0.02;
    out[i] = velocity * env * (fund + h2 + h3 + breath);
  }
  return out;
}

/**
 * 意味を持たない短い発声(息づかい・唸り・吐息)。humVoiceを元に、
 * アタックを鋭く・音価を短く・息の存在感(ノイズ比率)を上げ、
 * 歌わせず一声で終える(ビブラートは無し)
 * (plan/sound/archive/voice-and-cries.md)
 */
export function breathCry(freq: number, duration: number, sampleRate: number, seed: number, velocity = 1): Float32Array {
  const n = Math.max(1, Math.floor(duration * sampleRate));
  const out = new Float32Array(n);
  const attack = duration * 0.05;
  const release = duration * 0.3;
  const rng = mulberry32(seed);
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    let env: number;
    if (t < attack) env = t / attack;
    else if (t > duration - release) env = Math.max(0, (duration - t) / release);
    else env = 1;
    const fund = Math.sin(2 * Math.PI * freq * t);
    const h2 = 0.2 * Math.sin(2 * Math.PI * freq * 2 * t);
    const h3 = 0.05 * Math.sin(2 * Math.PI * freq * 3 * t);
    const breath = (rng() * 2 - 1) * 0.05;
    out[i] = velocity * env * (fund + h2 + h3 + breath);
  }
  return out;
}

/**
 * 銅鑼・鐘(金属的な残響): 整数倍でない部分音(インハーモニック)を
 * 複数重ね、それぞれをうねらせることで金属特有のうなりを出す。
 * mallet(整数倍音中心の木質音)とは別の質感を狙う
 * (plan/sound/archive/bgm-instrument-diversity.md)
 */
export function gongHit(freq: number, duration: number, sampleRate: number, seed: number, velocity = 1): Float32Array {
  const n = Math.max(1, Math.floor(duration * sampleRate));
  const out = new Float32Array(n);
  const rng = mulberry32(seed);
  const attack = Math.min(0.015, duration * 0.08);
  const decayTau = duration * 0.5;
  // 整数倍でない部分音比率(金属の非調和性)。それぞれわずかに違う減衰速度を持たせる
  const partials = [1, 1.79, 2.42, 3.08, 3.76].map((ratio) => ({
    ratio,
    decay: decayTau * (0.6 + rng() * 0.6),
    phase: rng() * Math.PI * 2,
  }));
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const env = t < attack ? t / attack : 1;
    let sum = 0;
    for (const p of partials) {
      sum += Math.sin(2 * Math.PI * freq * p.ratio * t + p.phase) * Math.exp(-t / p.decay);
    }
    const noise = (rng() * 2 - 1) * Math.exp(-t / (duration * 0.03)); // アタックのわずかな打撃ノイズ
    out[i] = velocity * env * (sum / partials.length + noise * 0.15);
  }
  return out;
}

/**
 * 弓弦(バイオリン属を弓で擦るような持続音): pluckedString(弾いて減衰)
 * とは対照的に、アタックが緩やかで音量を持続でき、弓のこすれるノイズを
 * わずかに含む。倍音は整数次で保ちつつノコギリ波的な構成にし、木質の
 * mallet/flute/pluckedStringとは異なる「擦れる」質感を出す
 * (plan/sound/archive/bgm-instrument-diversity.md)
 */
export function bowedTone(freq: number, duration: number, sampleRate: number, seed: number, velocity = 1): Float32Array {
  const n = Math.max(1, Math.floor(duration * sampleRate));
  const out = new Float32Array(n);
  const rng = mulberry32(seed);
  const attack = duration * 0.15;
  const release = duration * 0.2;
  let bowNoiseLp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    let env: number;
    if (t < attack) env = t / attack;
    else if (t > duration - release) env = Math.max(0, (duration - t) / release);
    else env = 1;
    // ノコギリ波寄りの倍音構成(整数次を弱めながら5倍音まで足す)
    let tone = 0;
    for (let h = 1; h <= 5; h++) tone += Math.sin(2 * Math.PI * freq * h * t) / h;
    const noise = rng() * 2 - 1;
    bowNoiseLp += (noise - bowNoiseLp) * 0.2;
    out[i] = velocity * env * (tone * 0.5 + bowNoiseLp * 0.06);
  }
  return out;
}

/**
 * からから鳴る乾いた連打(骨や小枝が触れ合うような): 短いノイズの
 * 小さな束を数回、わずかに間を空けて置く。1発だけのdrumHitとは違う
 * 「連なった」質感になる(plan/sound/archive/bgm-instrument-diversity.md)
 */
export function rattleHit(duration: number, sampleRate: number, seed: number, velocity = 1): Float32Array {
  const n = Math.max(1, Math.floor(duration * sampleRate));
  const out = new Float32Array(n);
  const rng = mulberry32(seed);
  const clickCount = 3 + Math.floor(rng() * 3);
  for (let c = 0; c < clickCount; c++) {
    const posSec = (c / clickCount) * duration * (0.5 + rng() * 0.3);
    const offset = Math.floor(posSec * sampleRate);
    const clickN = Math.max(1, Math.floor(duration * 0.15 * sampleRate));
    let lp = 0;
    for (let i = 0; i < clickN && offset + i < n; i++) {
      const env = Math.exp(-(i / clickN) * 10);
      const noise = rng() * 2 - 1;
      lp += (noise - lp) * 0.7; // 速い追従で、木質より硬く乾いた質感にする
      out[offset + i]! += velocity * env * lp;
    }
  }
  return out;
}

/** noteをoffset位置から加算合成する(重ね録りと同じ) */
export function mixIn(dest: Float32Array, note: Float32Array, offset: number): void {
  const end = Math.min(dest.length, offset + note.length);
  for (let i = Math.max(0, offset); i < end; i++) {
    dest[i]! += note[i - offset]!;
  }
}

/** ピークで正規化し、クリップを防ぐ(複数の音を重ねると1.0を超えうるため) */
export function normalize(samples: Float32Array, headroom = 0.9): void {
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  if (peak <= headroom) return;
  const scale = headroom / peak;
  for (let i = 0; i < samples.length; i++) samples[i]! *= scale;
}
