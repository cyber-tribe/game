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
  LEITMOTIF_DEGREES,
  type AmbientLoopParams,
  type BarrelElement,
  type InstrumentWeights,
  type JingleNote,
  type VoiceCryParams,
} from "./compose.ts";
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
  /** 旋律・和声の発音確率に掛ける係数。省略時は1(従来どおり) */
  melodyDensity?: number;
  /** 2小節ごとにコードの根音を歌うハミングのレイヤーを重ねるか。省略時false */
  humLayer?: boolean;
  /** 地方固有の旋律モチーフ(ペンタトニック上の度数列、コード度数からの相対値) */
  motif?: readonly number[];
  /** motifの1音があたる拍数。省略時1 */
  motifNoteBeats?: number;
  /** 曲の終わり付近に弱く重ねる、他の曲のモチーフの断片。省略時は無し */
  quoteMotif?: { degrees: readonly number[]; noteBeats?: number; velocity?: number };
}

// design/regions.mdの各地方の雰囲気を、木琴/太鼓/笛/弦の重みづけ・テンポ・拍子・
// リバーブの深さで描き分ける。数値の大小に厳密な意味は無く、地方ごとに違う
// 質感になることをねらった相対値(具体値の決定はplan/sound/archive/bgm-quality-upgrade.mdの
// 未決事項どおり音楽セッションの裁量)
const BGM_SPECS: readonly BgmSpec[] = [
  // 村(拠点)のテーマ。主旋律1本(design/audio-direction.md)。「村はヨリシロの
  // 眠りを世話する村」という考証を踏まえ、ゆりかごのように揺れる3拍子の子守唄の
  // 形にする。主旋律そのものがLEITMOTIF_DEGREES(ゲーム全体のライトモチーフ)
  // (plan/sound/archive/village-soundscape.md)
  {
    id: "village",
    seed: 1000,
    weights: { mallet: 0.5, drum: 0.15, flute: 0.2, string: 0.3 },
    tempoBpm: 90,
    beatsPerBar: 3,
    bars: 9,
    reverb: TOWN_REVERB,
    motif: LEITMOTIF_DEGREES,
  },
  // 第一地方: うたたねの参道。素朴でチュートリアルを兼ねる地方 → 木琴主体、軽快なテンポ。
  // モチーフ(plan/sound/archive/bgm-main-cave.md): 素直に上って戻る、歩き出しの歌。
  // 終わり付近に村の子守唄(ライトモチーフ)の断片を弱く重ねる
  // (plan/sound/archive/village-soundscape.md、以下region2〜8も同様)
  {
    id: "region1",
    seed: 1,
    weights: { mallet: 0.7, drum: 0.15, flute: 0.15, string: 0.15 },
    tempoBpm: 95,
    bars: 9,
    reverb: { wet: 0.3, roomSize: 0.5, damping: 0.2 },
    motif: [0, 1, 2, 1],
    quoteMotif: { degrees: LEITMOTIF_DEGREES },
  },
  // 第二地方: 忘れ潮の湿地。霧の中を歩く湿地 → 笛主体、重めのテンポ。
  // モチーフ: 長く伸びて半歩沈む、霧の中の遠い声
  {
    id: "region2",
    seed: 2,
    weights: { mallet: 0.15, drum: 0.1, flute: 0.65, string: 0.2 },
    tempoBpm: 80,
    bars: 8,
    reverb: { wet: 0.34, roomSize: 0.55, damping: 0.25 },
    motif: [2, 2, 1, -1],
    quoteMotif: { degrees: LEITMOTIF_DEGREES },
  },
  // 第三地方: まどろみの茸林。眠気に満ちた森 → 弦主体、遅めの3拍子でまどろみを出す。
  // モチーフ: 3拍子に乗ってゆっくり降りる、まぶたが落ちる形
  {
    id: "region3",
    seed: 3,
    weights: { mallet: 0.1, drum: 0.08, flute: 0.2, string: 0.7 },
    tempoBpm: 70,
    beatsPerBar: 3,
    bars: 9,
    reverb: { wet: 0.32, roomSize: 0.5, damping: 0.35 },
    motif: [4, 2, 0],
    quoteMotif: { degrees: LEITMOTIF_DEGREES },
  },
  // 第四地方: 骨積みの回廊。狭く入り組んだ回廊 → 太鼓主体、乾いた刻み(残響は控えめ)。
  // モチーフ: 同音の連打から跳ねる、乾いた足音
  {
    id: "region4",
    seed: 4,
    weights: { mallet: 0.35, drum: 0.55, flute: 0.1, string: 0.2 },
    tempoBpm: 100,
    bars: 9,
    reverb: { wet: 0.22, roomSize: 0.4, damping: 0.15 },
    motif: [0, 0, 3, 0],
    quoteMotif: { degrees: LEITMOTIF_DEGREES },
  },
  // 第五地方: なみだの滝つぼ。悲しみが形を取った地方 → 笛+弦、ゆったり・水音を思わせる豊かな残響。
  // モチーフ: 高い所から続けて落ちる、滝の形をなぞる
  {
    id: "region5",
    seed: 5,
    weights: { mallet: 0.1, drum: 0.1, flute: 0.45, string: 0.45 },
    tempoBpm: 75,
    bars: 8,
    reverb: { wet: 0.36, roomSize: 0.6, damping: 0.2 },
    motif: [5, 4, 2, 1],
    quoteMotif: { degrees: LEITMOTIF_DEGREES },
  },
  // 第六地方: こだまの尾根。物音がよく響く尾根 → 木琴+太鼓、最も深い残響で「よく響く」感触を出す。
  // モチーフ: 呼びかけ2音+同じ形の反復(こだま)
  {
    id: "region6",
    seed: 6,
    weights: { mallet: 0.5, drum: 0.35, flute: 0.15, string: 0.15 },
    tempoBpm: 90,
    bars: 8,
    reverb: { wet: 0.38, roomSize: 0.65, damping: 0.15 },
    motif: [3, 0, 3, 0],
    quoteMotif: { degrees: LEITMOTIF_DEGREES },
  },
  // 第七地方: わすれられた祭りの跡。宵祭りの影のような反映 → 木琴+太鼓、軽快な2拍子の囃子。
  // モチーフ: 囃子の掛け合い、跳ねて戻る
  {
    id: "region7",
    seed: 7,
    weights: { mallet: 0.55, drum: 0.4, flute: 0.1, string: 0.15 },
    tempoBpm: 105,
    beatsPerBar: 2,
    bars: 16,
    reverb: { wet: 0.28, roomSize: 0.45, damping: 0.2 },
    motif: [0, 2, 0, 3],
    quoteMotif: { degrees: LEITMOTIF_DEGREES },
  },
  // 第八地方: めざめの前庭。全地方の記憶が入り乱れる → 4種を均等に、遅く荘厳なテンポ。
  // モチーフ: 第一地方のモチーフを2倍の音価に引き延ばした形
  // (全地方の記憶の入口が最初の記憶に戻る)
  {
    id: "region8",
    seed: 8,
    weights: { mallet: 0.3, drum: 0.3, flute: 0.2, string: 0.2 },
    tempoBpm: 60,
    bars: 8,
    motif: [0, 1, 2, 1],
    motifNoteBeats: 2,
    reverb: { wet: 0.34, roomSize: 0.55, damping: 0.2 },
    quoteMotif: { degrees: LEITMOTIF_DEGREES },
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
  // 締めくくりの場面として、最も深く広がりのある残響にする。
  // ハミング(plan/sound/archive/bgm-true-awakening.md)は歌(design/audio-direction.mdが
  // 定めていた未実装要素)をこの曲だけに足す拡張
  {
    id: "true-awakening",
    seed: 3000,
    weights: { mallet: 0.05, drum: 0.02, flute: 0.4, string: 0.55 },
    tempoBpm: 65,
    bars: 8,
    reverb: { wet: 0.4, roomSize: 0.7, damping: 0.15 },
    humLayer: true,
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
  // 腕試しの間(plan/sound/archive/bgm-trial-chamber.md)。地方ボスの再戦だけの
  // ボスラッシュ → ボス戦テーマの姉妹曲として太鼓厚めの編成を引き継ぎつつ、
  // 2拍子・より速いテンポで「道場の張り詰め」に寄せる。輪郭優先で残響は控えめ
  {
    id: "trial-chamber",
    seed: 6000,
    weights: { mallet: 0.45, drum: 0.65, flute: 0.05, string: 0.1 },
    tempoBpm: 116,
    beatsPerBar: 2,
    bars: 16,
    reverb: { wet: 0.2, roomSize: 0.4, damping: 0.15 },
  },
  // 山の芯(plan/sound/archive/bgm-mountain-core.md)。近道屋との決着の場で、
  // 出現テーブルは第八地方(region8)の流用。region8より少し前のめりなテンポと
  // 厚い太鼓で「対峙している」緊張を足しつつ、地続きの荘厳さは保つ。
  // 残響は真の目覚めと同格の深さ(意識の核=いちばん深い場所)
  {
    id: "mountain-core",
    seed: 8000,
    weights: { mallet: 0.3, drum: 0.5, flute: 0.25, string: 0.4 },
    tempoBpm: 66,
    bars: 8,
    reverb: { wet: 0.38, roomSize: 0.7, damping: 0.15 },
  },
  // 樽比べ(plan/sound/archive/bgm-tarukurabe.md)。村はずれの的当て。第七地方
  // (囃子の「影」)と対になる、現役の遊びの明るい2拍子囃子。木琴を主役にし、
  // 残響は村のテーマと同じ浅い屋外の響きにする
  {
    id: "tarukurabe",
    seed: 9000,
    weights: { mallet: 0.65, drum: 0.4, flute: 0.15, string: 0.1 },
    tempoBpm: 108,
    beatsPerBar: 2,
    bars: 12,
    reverb: { wet: 0.15, roomSize: 0.3, damping: 0.2 },
  },
  // 夜ごとの夢(plan/sound/archive/bgm-nightly-dream.md)。無限に潜れるやり込みの場 →
  // 弦+笛主体・太鼓は薄く、深い残響で夜の遠さを出す。8小節のコード骨格に対して
  // 12小節ループにすることで、ループ境界が「終わって戻った」ではなく「続きの
  // 途中に戻った」ように聞こえる(CHORD_SKELETONの折り返しで自然に得られる)。
  // melodyDensityで音数を間引き、何十分も聞き流せる静けさにする
  {
    id: "nightly-dream",
    seed: 5000,
    weights: { mallet: 0.1, drum: 0.12, flute: 0.35, string: 0.5 },
    tempoBpm: 84,
    bars: 12,
    reverb: { wet: 0.33, roomSize: 0.55, damping: 0.25 },
    melodyDensity: 0.8,
  },
  // 忘れ物蔵(plan/sound/archive/bgm-lost-and-found-vault.md)。誰の記憶とも
  // 紐づかない品々が眠る、ひっそりした蔵 → 全曲中もっとも音数を間引き、
  // 全曲中もっとも高域をこもらせた残響(damping)で埃っぽさを出す
  {
    id: "lost-and-found",
    seed: 7000,
    weights: { mallet: 0.45, drum: 0.05, flute: 0.15, string: 0.35 },
    tempoBpm: 68,
    bars: 8,
    reverb: { wet: 0.3, roomSize: 0.45, damping: 0.45 },
    melodyDensity: 0.65,
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
  /** 意味を持たない短い発声を重ねる。省略時は無し(plan/sound/archive/voice-and-cries.md) */
  voiceLayer?: VoiceCryParams & { delaySec?: number };
}

const SFX_SPECS: readonly SfxSpec[] = [
  // 捕獲成功。既存の「やわらかい木の音+鈴」の直後に、相手が眠りに落ちる
  // ような力の抜けた「んー…」を小さく重ねる(voice-and-cries.md)
  {
    id: "capture",
    kind: "mallet",
    freq: 660,
    duration: 0.35,
    seed: 101,
    voiceLayer: { freq: 300, duration: 0.25, seed: 201, velocity: 0.2, delaySec: 0.1 },
  },
  { id: "levelUp", kind: "mallet", freq: 880, duration: 0.5, seed: 102 },
  { id: "hungerWarning", kind: "drum", freq: 140, duration: 0.3, seed: 103 },
  { id: "checkpoint", kind: "mallet", freq: 523, duration: 0.4, seed: 104 },
  { id: "explosion", kind: "drum", freq: 70, duration: 0.5, seed: 105 },
  // ボスの予兆。息を吸うような音の伸びの末尾に、ごく短い息の「はっ」を
  // 重ねて主体の気配を足す(voice-and-cries.md)
  {
    id: "bossTelegraph",
    kind: "drum",
    freq: 110,
    duration: 0.45,
    seed: 106,
    voiceLayer: { freq: 400, duration: 0.15, seed: 202, velocity: 0.25, delaySec: 0.3 },
  },
  // 武器を振ったとき(design/protagonist-weapons.mdの「なた」「大槌」等、
  // 打ち振る道具が中心なので、フィルタしたノイズ主体の短い「シュッ」に
  // 軽い一撃の芯を足す)
  { id: "attack", kind: "drum", freq: 300, duration: 0.15, seed: 107 },
  // 吸い込み失敗(plan/game/barrel-capture-clarity.md)。成功時(capture)の
  // 澄んだ高いマレットと対になるよう、タルが弾かれて転がる鈍く低い一撃にする。
  // 音だけで成功・失敗を取り違えないことが狙いなので、音色の差をはっきりつける
  { id: "captureFailed", kind: "drum", freq: 190, duration: 0.26, seed: 108 },
  // 戦闘のヒット・ミス・撃破音(plan/sound/archive/sfx-combat-feedback.md)。
  // attack.wav(振り)とは別に、当たった/外れた/倒した結果を音で示す
  { id: "hit", kind: "drum", freq: 450, duration: 0.12, seed: 109 },
  { id: "miss", kind: "drum", freq: 700, duration: 0.08, seed: 110 },
  { id: "defeat", kind: "mallet", freq: 330, duration: 0.5, seed: 111 },
  // タルの持ち上げ・置く・投げる・壊れる音(plan/sound/archive/sfx-barrel-handling.md)。
  // capture/captureFailed(吸い込みの成否)とは別の、物理的な持ち運び音
  { id: "barrelLift", kind: "mallet", freq: 220, duration: 0.2, seed: 112 },
  { id: "barrelPut", kind: "drum", freq: 180, duration: 0.15, seed: 113 },
  { id: "barrelThrow", kind: "drum", freq: 250, duration: 0.2, seed: 114 },
  { id: "barrelBreak", kind: "drum", freq: 320, duration: 0.3, seed: 115 },
  // 道具の扱い・罠と予兆の音(plan/sound/archive/sfx-item-and-hazard.md)
  { id: "pickup", kind: "mallet", freq: 990, duration: 0.12, seed: 116 },
  { id: "drop", kind: "drum", freq: 160, duration: 0.12, seed: 117 },
  { id: "useItem", kind: "mallet", freq: 740, duration: 0.2, seed: 118 },
  { id: "equip", kind: "mallet", freq: 440, duration: 0.15, seed: 119 },
  { id: "trap", kind: "drum", freq: 260, duration: 0.2, seed: 120 },
  { id: "crackWarning", kind: "drum", freq: 55, duration: 0.6, seed: 121 },
  { id: "warp", kind: "mallet", freq: 1200, duration: 0.25, seed: 122 },
  // 建物ごとの入店音(plan/sound/archive/village-soundscape.md)
  { id: "enterStorage", kind: "drum", freq: 200, duration: 0.35, seed: 123 }, // 木の扉のきしみ
  { id: "enterWorkshop", kind: "mallet", freq: 1400, duration: 0.18, seed: 124 }, // 金床を打つ一打
  { id: "enterSleepHut", kind: "mallet", freq: 1700, duration: 0.4, seed: 125 }, // 風鈴ひと鳴り
  { id: "enterGallery", kind: "mallet", freq: 900, duration: 0.15, seed: 126 }, // 木札同士が触れる音
  { id: "enterRecordsHall", kind: "drum", freq: 200, duration: 0.08, seed: 127 }, // 筆を置く音
  { id: "enterGarudoHouse", kind: "drum", freq: 220, duration: 0.3, seed: 128 }, // 戸の開閉
];

interface BarrelOpenSpec {
  id: string;
  element: BarrelElement;
  seed: number;
}

// 元素タルをあける音(plan/sound/archive/village-soundscape.md)。栓を抜く
// 「ポン」は共通、こぼれる音の音色だけ属性ごとに変える。composeBarrelOpenが
// mallet/drum単体のcomposeSfxとは違う合成をするので、別枠のspecにする
const BARREL_OPEN_SPECS: readonly BarrelOpenSpec[] = [
  { id: "barrelOpenWater", element: "water", seed: 301 },
  { id: "barrelOpenWind", element: "wind", seed: 302 },
  { id: "barrelOpenLight", element: "light", seed: 303 },
  { id: "barrelOpenStone", element: "stone", seed: 304 },
  { id: "barrelOpenSleep", element: "sleep", seed: 305 },
];

interface JingleSpec {
  id: string;
  notes: readonly JingleNote[];
  tempoBpm: number;
  /** 省略時はリバーブ無し */
  reverb?: ReverbParams;
  /** 意味を持たない短い発声を最後の音のあとに置く。省略時は無し(plan/sound/archive/voice-and-cries.md) */
  coda?: VoiceCryParams;
}

// 節目のジングル(plan/sound/archive/sfx-milestone-jingles.md)。単発SFXでは
// 軽すぎる、頻度は低いが意味の重い場面向けの短い音列。対応するBGM
// (mountain-core.wav等)と楽器・テンポ・残響の系統を揃える
const JINGLE_SPECS: readonly JingleSpec[] = [
  // 仲間が増える、あたたかい歓迎
  {
    id: "recruit",
    notes: [
      { degree: 0, beats: 1 },
      { degree: 2, beats: 1 },
      { degree: 4, beats: 1.5 },
    ],
    tempoBpm: 120,
    reverb: TOWN_REVERB,
  },
  // 忘れ物蔵の隠し通路発見。発見の高揚、きらめき
  {
    id: "secretPassageFound",
    notes: [
      { degree: 0, beats: 0.5 },
      { degree: 2, beats: 0.5 },
      { degree: 4, beats: 0.5 },
      { degree: 7, beats: 1 },
    ],
    tempoBpm: 160,
    reverb: { wet: 0.3, roomSize: 0.5, damping: 0.2 },
  },
  // 樽比べ終了。祭りの遊びの締め、軽い達成感(tarukurabe.wavと同テンポ・浅い残響)
  {
    id: "tarukurabeFinished",
    notes: [
      { degree: 0, beats: 0.5 },
      { degree: 2, beats: 0.5 },
      { degree: 0, beats: 0.5 },
      { degree: 4, beats: 1 },
    ],
    tempoBpm: 108,
    reverb: { wet: 0.15, roomSize: 0.3, damping: 0.2 },
  },
  // 山の芯クリア。決着の重み、力強い解決(mountain-core.wavと同程度の深い残響)
  {
    id: "mountainCoreCleared",
    notes: [
      { degree: 0, beats: 1 },
      { degree: 4, beats: 1 },
      { degree: 7, beats: 1 },
      { degree: 4, beats: 1 },
      { degree: 0, beats: 2, instrument: "string" },
    ],
    tempoBpm: 90,
    reverb: { wet: 0.38, roomSize: 0.7, damping: 0.15 },
  },
  // 真の目覚めクリア。物語の締めくくり、静かな安堵(true-awakening.wavと同テンポ・最深の残響)
  {
    id: "trueAwakeningCleared",
    notes: [
      { degree: 7, beats: 1.5, instrument: "flute" },
      { degree: 4, beats: 1.5, instrument: "flute" },
      { degree: 2, beats: 1.5, instrument: "string" },
      { degree: 0, beats: 3, instrument: "string" },
    ],
    tempoBpm: 65,
    reverb: { wet: 0.4, roomSize: 0.7, damping: 0.15 },
    // ハミングが鳴り止んだあと、ごく短く一度だけ息を吐く。「誰かがそこにいた」余韻を締める
    coda: { freq: 220, duration: 0.3, seed: 203, velocity: 0.2 },
  },
  // タルわざ注入(plan/sound/archive/village-soundscape.md)。仲間が夢気を
  // 注ぐ短いきらめき。3音の速い上行アルペジオ+浅い残響でシャラッとした光を出す
  {
    id: "barrelArtCast",
    notes: [
      { degree: 0, beats: 0.4 },
      { degree: 4, beats: 0.4 },
      { degree: 7, beats: 0.6 },
    ],
    tempoBpm: 150,
    reverb: { wet: 0.25, roomSize: 0.4, damping: 0.15 },
  },
  // 全滅。沈んでいく静けさ
  {
    id: "gameOver",
    notes: [
      { degree: 4, beats: 1.5, instrument: "string" },
      { degree: 2, beats: 1.5, instrument: "string" },
      { degree: 0, beats: 1.5, instrument: "string" },
      { degree: -3, beats: 3, instrument: "string" },
    ],
    tempoBpm: 65,
    reverb: { wet: 0.35, roomSize: 0.6, damping: 0.2 },
  },
];

interface MoodSpec {
  id: string;
  durationSec: number;
  seed: number;
  generate: (params: AmbientLoopParams) => Float32Array;
}

// ヨリシロの気分レイヤー(design/yorishiro-moods.md)と同じ重ね方
// (`AudioPlayer.setMoodLayer`)で流す、村の屋外・室内アンビエント
// (plan/sound/archive/village-soundscape.md)。10秒周期の寝息のうねりが
// 継ぎ目なくループするよう、durationSecは10の倍数にする
const MOOD_SPECS: readonly MoodSpec[] = [
  { id: "village-ambient", durationSec: 20, seed: 10000, generate: composeAmbientLoop },
  { id: "workshop-ambient", durationSec: 20, seed: 10001, generate: composeForgeHum },
  { id: "sleep-hut-ambient", durationSec: 20, seed: 10002, generate: composeSleepHutAmbient },
  { id: "gallery-ambient", durationSec: 20, seed: 10003, generate: composeGalleryAmbient },
  { id: "garudo-house-ambient", durationSec: 20, seed: 10004, generate: composeSmallFireAmbient },
];

function main(): void {
  mkdirSync(resolve(AUDIO_ROOT, "bgm"), { recursive: true });
  mkdirSync(resolve(AUDIO_ROOT, "bgm/mood"), { recursive: true });
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
      melodyDensity: spec.melodyDensity,
      humLayer: spec.humLayer,
      motif: spec.motif,
      motifNoteBeats: spec.motifNoteBeats,
      quoteMotif: spec.quoteMotif,
    });
    const path = resolve(AUDIO_ROOT, "bgm", `${spec.id}.wav`);
    writeFileSync(path, encodeWav([track.left, track.right], SAMPLE_RATE));
    const seconds = track.left.length / SAMPLE_RATE;
    console.log(`bgm/${spec.id}.wav (${seconds.toFixed(1)}s, ${spec.tempoBpm}bpm, ${spec.bars}bars)`);
  }

  for (const spec of MOOD_SPECS) {
    const samples = spec.generate({
      durationSec: spec.durationSec,
      sampleRate: SAMPLE_RATE,
      seed: spec.seed,
    });
    const path = resolve(AUDIO_ROOT, "bgm/mood", `${spec.id}.wav`);
    writeFileSync(path, encodeWav([samples], SAMPLE_RATE));
    console.log(`bgm/mood/${spec.id}.wav (${(samples.length / SAMPLE_RATE).toFixed(1)}s, mood loop)`);
  }

  for (const spec of SFX_SPECS) {
    const samples = composeSfx({
      kind: spec.kind,
      freq: spec.freq,
      duration: spec.duration,
      sampleRate: SAMPLE_RATE,
      seed: spec.seed,
      reverb: SFX_REVERB,
      voiceLayer: spec.voiceLayer,
    });
    const path = resolve(AUDIO_ROOT, "sfx", `${spec.id}.wav`);
    writeFileSync(path, encodeWav([samples], SAMPLE_RATE));
    console.log(`sfx/${spec.id}.wav (${(samples.length / SAMPLE_RATE).toFixed(2)}s)`);
  }

  for (const spec of BARREL_OPEN_SPECS) {
    const samples = composeBarrelOpen({
      element: spec.element,
      sampleRate: SAMPLE_RATE,
      seed: spec.seed,
      reverb: SFX_REVERB,
    });
    const path = resolve(AUDIO_ROOT, "sfx", `${spec.id}.wav`);
    writeFileSync(path, encodeWav([samples], SAMPLE_RATE));
    console.log(`sfx/${spec.id}.wav (${(samples.length / SAMPLE_RATE).toFixed(2)}s, ${spec.element})`);
  }

  for (const spec of JINGLE_SPECS) {
    const samples = composeJingle({
      notes: spec.notes,
      tempoBpm: spec.tempoBpm,
      sampleRate: SAMPLE_RATE,
      reverb: spec.reverb,
      coda: spec.coda,
    });
    const path = resolve(AUDIO_ROOT, "sfx", `${spec.id}.wav`);
    writeFileSync(path, encodeWav([samples], SAMPLE_RATE));
    console.log(`sfx/${spec.id}.wav (${(samples.length / SAMPLE_RATE).toFixed(2)}s, jingle)`);
  }
}

main();
