/**
 * サウンド再生(plan/audio-playback.md)。design/audio-direction.md が定めた
 * 「音源の制作はスコープ外、配線だけを扱う」方針に沿って、BGM・SFX・
 * ヨリシロの気分レイヤー(design/yorishiro-moods.md)を鳴らす薄いラッパー。
 *
 * AudioContext は生成コスト・自動再生制限の両方の理由でページロード時には
 * 作らず、呼び出し側が resume() を呼ぶまで存在しない。
 */

const DEFAULT_CROSSFADE_MS = 800;
const DEFAULT_MOOD_FADE_MS = 600;

/** テスト時に実際のブラウザAPIを介さず差し替えられるようにするための注入口 */
export type AudioContextFactory = () => AudioContext;
export type AudioFetcher = (url: string) => Promise<ArrayBuffer>;

interface Layer {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

interface BgmTrack extends Layer {
  id: string;
}

async function defaultFetchAudio(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  return res.arrayBuffer();
}

// 手続き的な音声合成(plan/audio-synthesis.md): 実行環境にffmpeg/sox等の
// エンコードツールが無いため、外部ツール無しで書き出せる.wavを使う
export function bgmUrl(id: string, baseUrl = "audio/bgm"): string {
  return `${baseUrl}/${id}.wav`;
}

export function sfxUrl(id: string, baseUrl = "audio/sfx"): string {
  return `${baseUrl}/${id}.wav`;
}

export class AudioPlayer {
  private ctx: AudioContext | undefined;
  private master: GainNode | undefined;
  private bgmGain: GainNode | undefined;
  private sfxGain: GainNode | undefined;
  /** 音源はURLごとに1度だけデコードしてキャッシュする */
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly pendingLoads = new Map<string, Promise<AudioBuffer | undefined>>();
  private currentBgm: BgmTrack | undefined;
  private readonly moodLayers = new Map<string, Layer>();
  private muted = false;
  private masterVolume = 0.7;

  constructor(
    private readonly createContext: AudioContextFactory = () => new AudioContext(),
    private readonly fetchAudio: AudioFetcher = defaultFetchAudio,
  ) {}

  /** 初回のユーザー操作(キー入力など)で呼ぶ。AudioContextを生成・resumeする */
  resume(): void {
    if (!this.ctx) {
      this.ctx = this.createContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.effectiveVolume();
      this.master.connect(this.ctx.destination);
      this.bgmGain = this.ctx.createGain();
      this.bgmGain.connect(this.master);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.connect(this.master);
    }
    if (this.ctx.state !== "running") void this.ctx.resume();
  }

  private effectiveVolume(): number {
    return this.muted ? 0 : this.masterVolume;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master) this.master.gain.value = this.effectiveVolume();
  }

  /** @param v 0..1 */
  setMasterVolume(v: number): void {
    this.masterVolume = Math.min(1, Math.max(0, v));
    if (this.master) this.master.gain.value = this.effectiveVolume();
  }

  private loadBuffer(id: string, url: string): Promise<AudioBuffer | undefined> {
    const cached = this.buffers.get(id);
    if (cached) return Promise.resolve(cached);
    const pending = this.pendingLoads.get(id);
    if (pending) return pending;
    const ctx = this.ctx;
    if (!ctx) return Promise.resolve(undefined);
    const promise = (async () => {
      try {
        const data = await this.fetchAudio(url);
        const buffer = await ctx.decodeAudioData(data);
        this.buffers.set(id, buffer);
        return buffer;
      } catch {
        // プレースホルダー無音ファイルが未整備でも、ゲーム進行自体は止めない
        return undefined;
      } finally {
        this.pendingLoads.delete(id);
      }
    })();
    this.pendingLoads.set(id, promise);
    return promise;
  }

  playSfx(id: string): void {
    if (!this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const sfxGain = this.sfxGain;
    void this.loadBuffer(id, sfxUrl(id)).then((buffer) => {
      if (!buffer) return;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(sfxGain);
      source.start();
    });
  }

  /** 現在と同じidなら何もしない(無音の継ぎ目回避) */
  setBgm(id: string, crossfadeMs = DEFAULT_CROSSFADE_MS): void {
    if (this.currentBgm?.id === id) return;
    if (!this.ctx || !this.bgmGain) return;
    const ctx = this.ctx;
    const bgmGain = this.bgmGain;
    const outgoing = this.currentBgm;
    this.currentBgm = undefined;
    void this.loadBuffer(id, bgmUrl(id)).then((buffer) => {
      if (!buffer || this.ctx !== ctx) return;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      source.connect(gain);
      gain.connect(bgmGain);
      source.start();
      const now = ctx.currentTime;
      gain.gain.linearRampToValueAtTime(1, now + crossfadeMs / 1000);
      this.currentBgm = { id, source, gain };
      if (outgoing) fadeOutAndStop(ctx, outgoing, crossfadeMs);
    });
  }

  /** ヨリシロの気分(design/yorishiro-moods.md)のレイヤーを足し引きする。曲を丸ごと差し替えない */
  setMoodLayer(id: string, active: boolean, fadeMs = DEFAULT_MOOD_FADE_MS): void {
    if (!this.ctx || !this.bgmGain) return;
    const ctx = this.ctx;
    const bgmGain = this.bgmGain;
    const existing = this.moodLayers.get(id);
    if (active) {
      if (existing) return;
      void this.loadBuffer(id, bgmUrl(id, "audio/bgm/mood")).then((buffer) => {
        if (!buffer || this.ctx !== ctx || this.moodLayers.has(id)) return;
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        const gain = ctx.createGain();
        gain.gain.value = 0;
        source.connect(gain);
        gain.connect(bgmGain);
        source.start();
        gain.gain.linearRampToValueAtTime(1, ctx.currentTime + fadeMs / 1000);
        this.moodLayers.set(id, { source, gain });
      });
    } else {
      if (!existing) return;
      this.moodLayers.delete(id);
      fadeOutAndStop(ctx, existing, fadeMs);
    }
  }
}

function fadeOutAndStop(ctx: AudioContext, layer: Layer, fadeMs: number): void {
  layer.gain.gain.linearRampToValueAtTime(0, ctx.currentTime + fadeMs / 1000);
  setTimeout(() => layer.source.stop(), fadeMs);
}
