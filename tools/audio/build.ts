/**
 * 楽曲・効果音を生成して public/audio/*.wav に書き出す
 * (plan/sound/archive/audio-synthesis.md、plan/sound/archive/bgm-quality-upgrade.md)。
 *
 *     npm run audio
 *
 * tools/models/*.py → public/models/*.glb と対になる仕組み。スクリプトと
 * 生成済みの音声ファイルの両方をコミットする運用も同じにする。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { composeSfx, composeTrack, type InstrumentWeights } from "./compose.ts";
import type { ReverbParams } from "./effects.ts";
import { SAMPLE_RATE, encodeWav } from "./wav.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const AUDIO_ROOT = resolve(HERE, "../../public/audio");

// 拠点(村)は浅め、ダイブ用(地方・ボス・真の目覚め)はやや深めの残響にする
// (舞台が洞窟であることに合わせる。plan/sound/archive/bgm-quality-upgrade.md の指針)
const TOWN_REVERB: ReverbParams = { wet: 0.15, roomSize: 0.3, damping: 0.2 };

interface BgmSpec {
  id: string;
  seed: number;
  weights: InstrumentWeights;
  /** テンポ(BPM)。地方の雰囲気に沿って個別に決める */
  tempoBpm: number;
  /** 1小節の拍数。省略時は4/4拍子 */
  beatsPerBar?: number;
  /** ループの小節数(8〜16小節が目安) */
  bars: number;
  reverb: ReverbParams;
  /** 各拍の裏に短い木琴を置く確率。省略時は鳴らさない */
  offbeatProb?: number;
}

// design/regions.mdの各地方の雰囲気を、木琴/太鼓/笛/弦の重みづけ・テンポ・拍子・
// リバーブの深さで描き分ける。数値の大小に厳密な意味は無く、地方ごとに違う
// 質感になることをねらった相対値(具体値の決定はplan/sound/archive/bgm-quality-upgrade.mdの
// 未決事項どおり音楽セッションの裁量)
const BGM_SPECS: readonly BgmSpec[] = [
  { id: "village", seed: 1000, weights: { mallet: 0.5, drum: 0.15, flute: 0.2, string: 0.3 }, tempoBpm: 90, bars: 8, reverb: TOWN_REVERB },
  // 第一地方: うたたねの参道。素朴でチュートリアルを兼ねる地方 → 木琴主体、軽快なテンポ
  {
    id: "region1",
    seed: 1,
    weights: { mallet: 0.7, drum: 0.15, flute: 0.15, string: 0.15 },
    tempoBpm: 95,
    bars: 9,
    reverb: { wet: 0.3, roomSize: 0.5, damping: 0.2 },
  },
  // 第二地方: 忘れ潮の湿地。霧の中を歩く湿地 → 笛主体、重めのテンポ
  {
    id: "region2",
    seed: 2,
    weights: { mallet: 0.15, drum: 0.1, flute: 0.65, string: 0.2 },
    tempoBpm: 80,
    bars: 8,
    reverb: { wet: 0.34, roomSize: 0.55, damping: 0.25 },
  },
  // 第三地方: まどろみの茸林。眠気に満ちた森 → 弦主体、遅めの3拍子でまどろみを出す
  {
    id: "region3",
    seed: 3,
    weights: { mallet: 0.1, drum: 0.08, flute: 0.2, string: 0.7 },
    tempoBpm: 70,
    beatsPerBar: 3,
    bars: 9,
    reverb: { wet: 0.32, roomSize: 0.5, damping: 0.35 },
  },
  // 第四地方: 骨積みの回廊。狭く入り組んだ回廊 → 太鼓主体、乾いた刻み(残響は控えめ)
  {
    id: "region4",
    seed: 4,
    weights: { mallet: 0.35, drum: 0.55, flute: 0.1, string: 0.2 },
    tempoBpm: 100,
    bars: 9,
    reverb: { wet: 0.22, roomSize: 0.4, damping: 0.15 },
  },
  // 第五地方: なみだの滝つぼ。悲しみが形を取った地方 → 笛+弦、ゆったり・水音を思わせる豊かな残響
  {
    id: "region5",
    seed: 5,
    weights: { mallet: 0.1, drum: 0.1, flute: 0.45, string: 0.45 },
    tempoBpm: 75,
    bars: 8,
    reverb: { wet: 0.36, roomSize: 0.6, damping: 0.2 },
  },
  // 第六地方: こだまの尾根。物音がよく響く尾根 → 木琴+太鼓、最も深い残響で「よく響く」感触を出す
  {
    id: "region6",
    seed: 6,
    weights: { mallet: 0.5, drum: 0.35, flute: 0.15, string: 0.15 },
    tempoBpm: 90,
    bars: 8,
    reverb: { wet: 0.38, roomSize: 0.65, damping: 0.15 },
  },
  // 第七地方: わすれられた祭りの跡。宵祭りの影のような反映 → 木琴+太鼓、軽快な2拍子の囃子
  {
    id: "region7",
    seed: 7,
    weights: { mallet: 0.55, drum: 0.4, flute: 0.1, string: 0.15 },
    tempoBpm: 105,
    beatsPerBar: 2,
    bars: 16,
    reverb: { wet: 0.28, roomSize: 0.45, damping: 0.2 },
  },
  // 第八地方: めざめの前庭。全地方の記憶が入り乱れる → 4種を均等に、遅く荘厳なテンポ
  {
    id: "region8",
    seed: 8,
    weights: { mallet: 0.3, drum: 0.3, flute: 0.2, string: 0.2 },
    tempoBpm: 60,
    bars: 8,
    reverb: { wet: 0.34, roomSize: 0.55, damping: 0.2 },
  },
  // 地方ボス戦共通テーマ。太鼓を厚めにして緊張感を出す。各地方の目安+15前後の速いテンポで、
  // 残響はやや控えめにして音の輪郭を保つ(緊張感優先)
  {
    id: "boss",
    seed: 2000,
    weights: { mallet: 0.4, drum: 0.7, flute: 0.05, string: 0.15 },
    tempoBpm: 108,
    bars: 8,
    reverb: { wet: 0.26, roomSize: 0.45, damping: 0.15 },
  },
  // 真の目覚め。誰もいない頃の記憶 → 弦+笛のみ、太鼓はほぼ鳴らさない。
  // 締めくくりの場面として、最も深く広がりのある残響にする
  {
    id: "true-awakening",
    seed: 3000,
    weights: { mallet: 0.05, drum: 0.02, flute: 0.4, string: 0.55 },
    tempoBpm: 65,
    bars: 8,
    reverb: { wet: 0.4, roomSize: 0.7, damping: 0.15 },
  },
  // 近道屋の裏穴(plan/sound/archive/bgm-shortcut-back-hole.md)。無理やり掘った
  // 短く手荒な穴 → 全曲中最速のテンポ+裏拍の木琴でせかせかした足取りを出す。
  // 残響は浅く乾かし、掘りたての土壁が響かない感触にする
  {
    id: "shortcut",
    seed: 4000,
    weights: { mallet: 0.5, drum: 0.5, flute: 0.05, string: 0.2 },
    tempoBpm: 112,
    bars: 8,
    reverb: { wet: 0.2, roomSize: 0.35, damping: 0.3 },
    offbeatProb: 0.5,
  },
];

// SFXにも薄くリバーブを掛けBGMと馴染ませるが、操作音の輪郭を保つためウェット率はBGMより下げる
const SFX_REVERB: ReverbParams = { wet: 0.12, roomSize: 0.35, damping: 0.25 };

interface SfxSpec {
  id: string;
  kind: "mallet" | "drum";
  freq: number;
  duration: number;
  seed: number;
}

const SFX_SPECS: readonly SfxSpec[] = [
  { id: "capture", kind: "mallet", freq: 660, duration: 0.35, seed: 101 },
  { id: "levelUp", kind: "mallet", freq: 880, duration: 0.5, seed: 102 },
  { id: "hungerWarning", kind: "drum", freq: 140, duration: 0.3, seed: 103 },
  { id: "checkpoint", kind: "mallet", freq: 523, duration: 0.4, seed: 104 },
  { id: "explosion", kind: "drum", freq: 70, duration: 0.5, seed: 105 },
  { id: "bossTelegraph", kind: "drum", freq: 110, duration: 0.45, seed: 106 },
];

function main(): void {
  mkdirSync(resolve(AUDIO_ROOT, "bgm"), { recursive: true });
  mkdirSync(resolve(AUDIO_ROOT, "sfx"), { recursive: true });

  for (const spec of BGM_SPECS) {
    const track = composeTrack({
      seed: spec.seed,
      weights: spec.weights,
      bars: spec.bars,
      beatsPerBar: spec.beatsPerBar,
      tempoBpm: spec.tempoBpm,
      reverb: spec.reverb,
      sampleRate: SAMPLE_RATE,
      offbeatProb: spec.offbeatProb,
    });
    const path = resolve(AUDIO_ROOT, "bgm", `${spec.id}.wav`);
    writeFileSync(path, encodeWav([track.left, track.right], SAMPLE_RATE));
    const seconds = track.left.length / SAMPLE_RATE;
    console.log(`bgm/${spec.id}.wav (${seconds.toFixed(1)}s, ${spec.tempoBpm}bpm, ${spec.bars}bars)`);
  }

  for (const spec of SFX_SPECS) {
    const samples = composeSfx({
      kind: spec.kind,
      freq: spec.freq,
      duration: spec.duration,
      sampleRate: SAMPLE_RATE,
      seed: spec.seed,
      reverb: SFX_REVERB,
    });
    const path = resolve(AUDIO_ROOT, "sfx", `${spec.id}.wav`);
    writeFileSync(path, encodeWav([samples], SAMPLE_RATE));
    console.log(`sfx/${spec.id}.wav (${(samples.length / SAMPLE_RATE).toFixed(2)}s)`);
  }
}

main();
