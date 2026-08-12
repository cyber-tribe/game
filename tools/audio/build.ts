/**
 * 楽曲・効果音を生成して public/audio/*.wav に書き出す(plan/audio-synthesis.md)。
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
import { SAMPLE_RATE, encodeWav } from "./wav.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const AUDIO_ROOT = resolve(HERE, "../../public/audio");

/** BGMループの小節数(4/4拍子)。短めに抑え、ファイルサイズを膨らませない */
const BARS = 4;

interface BgmSpec {
  id: string;
  seed: number;
  weights: InstrumentWeights;
}

// design/regions.mdの各地方の雰囲気を、木琴/太鼓/笛/弦の重みづけで描き分ける。
// 数値の大小に厳密な意味は無く、地方ごとに違う質感になることをねらった相対値
const BGM_SPECS: readonly BgmSpec[] = [
  { id: "village", seed: 1000, weights: { mallet: 0.5, drum: 0.15, flute: 0.2, string: 0.3 } },
  // 第一地方: うたたねの参道。素朴でチュートリアルを兼ねる地方 → 木琴主体、軽い
  { id: "region1", seed: 1, weights: { mallet: 0.7, drum: 0.15, flute: 0.15, string: 0.15 } },
  // 第二地方: 忘れ潮の湿地。霧の中を歩く湿地 → 笛主体、太鼓は控えめ
  { id: "region2", seed: 2, weights: { mallet: 0.15, drum: 0.1, flute: 0.65, string: 0.2 } },
  // 第三地方: まどろみの茸林。眠気に満ちた森 → 弦(Karplus-Strong)主体、まばら
  { id: "region3", seed: 3, weights: { mallet: 0.1, drum: 0.08, flute: 0.2, string: 0.7 } },
  // 第四地方: 骨積みの回廊。狭く入り組んだ回廊 → 太鼓主体、乾いた響き
  { id: "region4", seed: 4, weights: { mallet: 0.35, drum: 0.55, flute: 0.1, string: 0.2 } },
  // 第五地方: なみだの滝つぼ。悲しみが形を取った地方 → 笛+弦、ゆったり
  { id: "region5", seed: 5, weights: { mallet: 0.1, drum: 0.1, flute: 0.45, string: 0.45 } },
  // 第六地方: こだまの尾根。物音がよく響く尾根 → 木琴+太鼓、間を活かす
  { id: "region6", seed: 6, weights: { mallet: 0.5, drum: 0.35, flute: 0.15, string: 0.15 } },
  // 第七地方: わすれられた祭りの跡。宵祭りの影のような反映 → 木琴+太鼓、祭り囃子寄り
  { id: "region7", seed: 7, weights: { mallet: 0.55, drum: 0.4, flute: 0.1, string: 0.15 } },
  // 第八地方: めざめの前庭。全地方の記憶が入り乱れる → 4種を均等に
  { id: "region8", seed: 8, weights: { mallet: 0.3, drum: 0.3, flute: 0.2, string: 0.2 } },
  // 地方ボス戦共通テーマ。太鼓を厚めにして緊張感を出す(テンポそのものは共通のまま)
  { id: "boss", seed: 2000, weights: { mallet: 0.4, drum: 0.7, flute: 0.05, string: 0.15 } },
  // 真の目覚め。誰もいない頃の記憶 → 弦+笛のみ、太鼓はほぼ鳴らさない
  { id: "true-awakening", seed: 3000, weights: { mallet: 0.05, drum: 0.02, flute: 0.4, string: 0.55 } },
];

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
    const samples = composeTrack(spec.seed, spec.weights, BARS, SAMPLE_RATE);
    const path = resolve(AUDIO_ROOT, "bgm", `${spec.id}.wav`);
    writeFileSync(path, encodeWav(samples, SAMPLE_RATE));
    console.log(`bgm/${spec.id}.wav (${(samples.length / SAMPLE_RATE).toFixed(1)}s)`);
  }

  for (const spec of SFX_SPECS) {
    const samples = composeSfx(spec.kind, spec.freq, spec.duration, SAMPLE_RATE, spec.seed);
    const path = resolve(AUDIO_ROOT, "sfx", `${spec.id}.wav`);
    writeFileSync(path, encodeWav(samples, SAMPLE_RATE));
    console.log(`sfx/${spec.id}.wav (${(samples.length / SAMPLE_RATE).toFixed(2)}s)`);
  }
}

main();
