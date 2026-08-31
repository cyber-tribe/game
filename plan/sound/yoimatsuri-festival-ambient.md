# 宵祭りの拠点BGMレイヤー

## 経緯

`plan/game/archive/yoimatsuri-festival.md`は、拠点BGMへの宵祭りレイヤー
追加を「`plan/audio-playback.md`側の実装が先行する前提だったが、まだ
実装されていないため見送った」と明記していた。その前提
(`AudioPlayer.setMoodLayer`、`plan/sound/archive/audio-playback.md`)は
既に実装済みで、`village-ambient`等の気分レイヤーとして日常的に使われて
いる(`src/main.ts`)。`design/village-festivals.md`も「拠点のBGMが宵祭り
専用の編成になる(`design/audio-direction.md`の『軽いレイヤーを足す』
手法を流用)」と明記したまま未着手だった。前提が解消されたので着手する。

`setMoodLayer`はidごとに独立した`Map`でレイヤーを管理しており
(`src/audio/player.ts`)、複数レイヤーを同時に鳴らせる。よって
`village-ambient`(火・葉ずれ・遠い寝息)を置き換えず、宵祭りの日だけ
別idのレイヤーをその上に薄く重ねる設計にする。

## 変更内容

`tools/audio/compose.ts`に`composeFestivalAmbient(params:
AmbientLoopParams): Float32Array`を新設する(既存の
`composeSleepHutAmbient`等と同じ形)。提灯の下の賑わいを、常時鳴る
音ではなく**疎らな祭囃子の欠片**として表現する:

- 数秒〜十数秒に一度、太鼓の短い連打(`drumHit`を2〜3回、テンポを
  揺らして)。
- さらに疎らに、高い鈴・マレットの短い上行フレーズ(`LEITMOTIF_DEGREES`
  ではなく別の3〜4音、「囃子らしい」跳ねた音型)を挟む。
- 常時鳴る成分(ノイズ床)は持たせない。「祭りの気配が時折聞こえる」
  程度に留め、`village-ambient`の火・葉ずれの上に鬱陶しくかぶさらない
  ようにする。

`tools/audio/build.ts`の`MOOD_SPECS`に`yoimatsuri-ambient`
(`durationSec`は他のmoodと同じ20秒、継ぎ目なくループ)を追加する。

`src/main.ts`の`showTown()`(`this.village.setFestivalLighting(
isYoimatsuri(todayKey()))`のすぐ下)に、
`this.audio.setMoodLayer("yoimatsuri-ambient", isYoimatsuri(todayKey()))`
を追加する。`village-ambient`は既存どおり常時trueのまま
(置き換えではなく追加なので、`showTown`以外の箇所
(`setVillageActive`等)の`village-ambient`の扱いは変更しない)。

## 受け入れ基準

1. `npm run audio`で`public/audio/bgm/mood/yoimatsuri-ambient.wav`が
   生成される。
2. 宵祭りの日(`isYoimatsuri(todayKey())`がtrue)に拠点へ戻ると、
   `village-ambient`に加えて`yoimatsuri-ambient`も鳴る(両レイヤー同時)。
3. 宵祭りでない日は`yoimatsuri-ambient`が鳴らない(`village-ambient`の
   みは従来どおり)。
4. 拠点にいる間に日付が変わる操作は無い(`todayKey()`はセッション中
   固定)ため、動的な切り替えテストは不要。`showTown()`呼び出し時点の
   判定だけで十分。

## 対象外

- 拠点BGM本体(`village.wav`)を宵祭り専用に丸ごと差し替えること
  (`design/audio-direction.md`が明示的に「レイヤーを足す」方式を
  指定しているため、本体の差し替えはしない)。
- 樽比べ(たるくらべ)ミニゲーム側の音(`tarukurabe.wav`・
  `tarukurabeFinished`ジングルは既に実装済み、対象外)。
- NPCの一言・出店UI(`plan/game/archive/yoimatsuri-festival.md`で
  実装済み、対象外)。

## 未決事項

- 祭囃子の欠片の具体的な音型・出現頻度(聴感で調整する)。
