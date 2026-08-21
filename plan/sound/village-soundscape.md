# 村の音風景 ― 建物考証を音で語る

## 経緯

村のBGMは1曲(`village`)を流すだけで、環境音・建物ごとの音は無い。
建物考証(`design/village-buildings.md`)と祠木・タルの考証
(`design/yorishiro-and-barrels.md`)が固まったので、**村の音を
「眠る山の麓の、火のある暮らし」として再設計**する。既存の
オフライン生成パイプライン(`tools/audio/`)と
`plan/sound/bgm-quality-upgrade.md` の改善(リバーブ・ステレオ等)を
前提にする。

## 1. 村BGMの改訂 ― 子守唄のモチーフ

> **実装済み。** `tools/audio/compose.ts` に `LEITMOTIF_DEGREES = [0, 2, 4, 2]`
> をエクスポートし、村BGM(`village`)の`motif`をこれに差し替えて
> `beatsPerBar: 3`(3拍子)・`bars: 9`にした(ゆりかごの揺れ)。
> 加えて`composeTrack`に`quoteMotif`パラメータを新設し、曲の終わり付近
> (ループ末尾から`degrees.length`拍ぶん)にモチーフの断片を木琴・弱い
> ベロシティ(既定0.18)で重ねられるようにした。第一〜第八地方
> (`region1`〜`region8`)の`BGM_SPECS`に`quoteMotif: { degrees:
> LEITMOTIF_DEGREES }`を追加し、各曲の終わりに子守唄の断片が弱く届く形
> にした。ねむり小屋の鈴レイヤー(本ファイル section 3)・
> タイトル・エンドロールの変奏は、それぞれ`plan/game/village-interiors.md`
> 相当の実装セッション側の作業/専用BGM再生の仕組み自体が現状存在しない
> ため、このPRの対象外(前者はsection 3側で`LEITMOTIF_DEGREES`を再利用
> する形で実装予定。後者はタイトル・エンドロール画面にBGM再生の仕組みが
> 無いため実装不可 ― 将来別途検討)。
>
> **検証**: `npx tsc --noEmit`・`npx vitest run`(117ファイル/1562件)・
> `npm run build`・`npm run audio`いずれも成功。再生成後の差分は
> `village.wav`・`region1.wav`〜`region8.wav`の9ファイルのみ(他のBGM・
> SFX・ジングルは無変更)。デコードしてピーク/RMSレベルを確認し、
> クリッピングや異常値が無いことも確認済み。
>
> 本ファイルのsection 2〜4は未実装(別PRで進める)。

- 考証の核「村はヨリシロの眠りを世話する村」を音にする:
  **村BGMの主旋律を、ゆっくりした子守唄の形(ゆりかごのように
  揺れる3拍子系)にする**。
- この子守唄の音形(短い3〜5音のモチーフ)を**ゲーム全体の
  ライトモチーフ**として定義し、以後のBGMが引用できるようにする:
  - ねむり小屋に入ったとき: 同じモチーフを鈴だけで細く鳴らす
  - ダイブ用BGM: 各地方のBGMの終わり付近に、このモチーフの断片を
    弱く混ぜる(夢の中でも子守唄がかすかに届いている、という考証)
  - タイトル・エンドロール: 同モチーフの変奏
- 実装は `compose.ts` にモチーフを定数(音程列)として置き、各曲の
  生成関数から参照する形にする(曲ごとにコピーしない)。

## 2. 村の環境音(アンビエント)

> **実装済み。** `tools/audio/compose.ts` に `composeAmbientLoop` を新設し、
> 火のはぜる音(低域フィルタしたノイズの床+時折の「パチッ」)・祠木の葉ずれ
> (疎らな高域寄りのノイズバースト)・遠い山の寝息(35Hzの超低音が10秒周期で
> うねる)を1本のモノラルループ(20秒、寝息2周期ぶんで継ぎ目なくループ)に
> ミックスした。`tools/audio/build.ts`の`MOOD_SPECS`から
> `public/audio/bgm/mood/village-ambient.wav`へ生成。
>
> 再生側は`src/main.ts`の`showTown()`で`this.audio.setMoodLayer(
> "village-ambient", true)`を、ダイブ開始の共通初期化`presentFloor()`で
> `setMoodLayer("village-ambient", false)`を呼ぶだけで済んだ
> (`AudioPlayer.setMoodLayer`は本実装まで未使用だった既存APIをそのまま
> 流用)。建物内装での屋外アンビエントの停止(「重ねない」)はsection 3側の
> `enterInterior`/`exitInterior`実装で扱う(このPRの対象外)。
>
> **検証**: `npx tsc --noEmit`・`npx vitest run`(117ファイル/1567件)・
> `npm run build`・`npm run audio`いずれも成功。再生成後の差分は新規の
> `public/audio/bgm/mood/village-ambient.wav`のみ(既存音源は無変更)。
> デコードしてピーク0.14・RMS0.013程度と、BGMの下に薄く敷くのに十分
> 控えめな音量であることを確認済み。
>
> 本ファイルのsection 3は実装済み(下記参照)。section 4は未実装
> (別PRで進める)。

BGMと並行してループ再生する薄い環境音レイヤーを1本追加する
(`AudioPlayer.setMoodLayer` と同じ重ね方が流用できる):

- **火のはぜる音**(広場の囲炉裏火。低く小さく、常時)
- **祠木の葉ずれ**(風が通るたび、疎らに)
- **遠い山の寝息**(可聴域ぎりぎりの超低音のうねり。10秒周期程度。
  ヨリシロが近くで眠っている気配。音量はごく控えめにし、
  不気味にならない範囲に留める)

3つを1本のループにミックスして書き出してよい(実行時の同時再生数を
増やさない)。

## 3. 建物ごとの音

> **実装済み。** `src/view/villageInterior.ts`の`VillageInteriorDef`に
> `enterSfx`(入店SFXのid)・`ambientMoodId`(室内環境音のid、無ければ
> 「静けさ」)を追加し、下表の6件(storage/workshop/sleepHut/gallery/
> recordsHall/garudoHouse)に割り当てた(development は表に無いので
> どちらも未割り当て)。
>
> 入店SFXは既存の`composeSfx`(mallet/drum)のみで6音を賄えた
> (`tools/audio/build.ts`の`SFX_SPECS`に`enterStorage`等を追加)。
> 室内環境音は`tools/audio/compose.ts`に4つの新しい合成関数を追加:
> `composeForgeHum`(工房の炉、継続する低いうなりが6秒周期で息づく)・
> `composeSleepHutAmbient`(ねむり小屋、`LEITMOTIF_DEGREES`を鈴でごく
> 細く1回鳴らし+タルの軋みを疎らに)・`composeGalleryAmbient`(図鑑小屋、
> 紙・木札をめくる音が時折)・`composeSmallFireAmbient`(ガルドの家、
> `composeAmbientLoop`の火の層より一段控えめ)。共通する「ノイズの床」
> 「ノイズバースト」の部分は`composeAmbientLoop`から
> `noiseFloor`/`scatterNoiseBursts`という2つの非公開ヘルパーに切り出し、
> 4つ全部+`composeAmbientLoop`自身で共有する形にリファクタした
> (`composeAmbientLoop`の出力自体は完全に不変であることを確認済み。
> 下記検証参照)。storage・recordsHallは表どおり「静けさ」のまま、
> 専用の環境音は追加していない。
>
> 再生側は`src/main.ts`の`enterInterior()`/`exitInterior()`を編集: 入店時に
> `setMoodLayer("village-ambient", false)`で屋外アンビエントを止め、
> `def.enterSfx`があれば`playSfx`、`def.ambientMoodId`があれば
> `setMoodLayer(..., true)`。退室時は現在の建物の`ambientMoodId`を止める
> だけにとどめ、屋外アンビエントの再開は「建物メニューを閉じて村なかへ
> 戻る」呼び出し元(`tryEnterVillageBuilding`の`onClose`)の責務にした
> (ダイブ開始画面を開く経路でも`exitInterior`は呼ばれるが、そちらは
> `presentFloor()`が別途ダイブBGMに切り替えるため、屋外アンビエントを
> 再開する必要が無い)。
>
> **検証**: `npx tsc --noEmit`・`npx vitest run`(118ファイル/1603件、
> 新規16件を含む)・`npm run build`・`npm run audio`いずれも成功。
> 再生成後の差分は新規の`enter*.wav`6件(`public/audio/sfx/`)と
> `workshop-ambient.wav`・`sleep-hut-ambient.wav`・`gallery-ambient.wav`・
> `garudo-house-ambient.wav`の4件(`public/audio/bgm/mood/`)のみで、
> `village-ambient.wav`を含む既存音源はバイト単位で無変更(リファクタが
> 出力を変えていないことの直接確認)。デコードしてピーク・RMSを確認し、
> 環境音は控えめ・入店SFXは既存SFXと同程度の音量であることを確認済み。
>
> 本ファイルのsection 4は未実装(別PRで進める)。

建物に入ったとき(`plan/game/village-interiors.md` の内装シーン)の
専用SFX・室内アンビエントを、考証の小道具に対応させて用意する:

| 建物 | 入店SFX | 室内の薄い環境音 |
|---|---|---|
| モグラ婆の倉庫 | 木の扉のきしみ | 静けさ(外の音がくぐもる) |
| ゲンドの工房 | 金床を打つ一打 | 炉の低い燃焼音 |
| ねむり小屋 | 風鈴ひと鳴り | 子守唄モチーフの鈴(ごく細く)+タルの軋み |
| おキヨの図鑑小屋 | 木札同士が触れる音 | 紙・木札をめくる音が時折 |
| 記録の間 | 筆を置く音 | 静けさ |
| ガルドの家 | 戸の開閉 | 火の小さなはぜ |

- 入店SFXは既存の `composeSfx` で1音ずつ合成する(木・金属・鈴の
  既存音源で全て賄える想定)。
- 室内環境音は屋外アンビエントを止めて差し替える(重ねない)。

## 4. タルの操作音の拡充

考証で「タル=夢のゆりかご」の位置づけが強まったのに合わせ、
タル操作のSFXを聞き分けられるように増やす:

- 持ち上げ/下ろす(既存)に加え、**あける**
  (`plan/game/barrel-arts.md`): 栓を抜くポンという音+中身が
  こぼれる音(元素タルの種類で後半の音色を変える: 水・風・光・
  石・ねむ)
- **タルわざ注入**: 仲間が夢気を注ぐ短いきらめき音
- **捕獲失敗**(`plan/game/barrel-capture-clarity.md` で依頼済みの
  専用SFX)もこの一群として音色を揃える

## 受け入れ基準

1. 村BGMが子守唄モチーフを含む曲に差し替わり、ねむり小屋・
   ダイブBGMの断片引用と聴き比べてモチーフが同一とわかる。
2. 村の屋外で火・葉ずれ・寝息の環境音が薄く鳴る。
3. 建物に入ると入店SFXが鳴り、室内の環境音に切り替わる。
4. 元素タルを「あける」と種類ごとに違う音が鳴る。

## 対象外

- ダイブ用BGM全曲の作り直し(モチーフの断片挿入のみ。曲自体の
  品質改善は `plan/sound/bgm-quality-upgrade.md` が担当)
- ボイス・せりふ音

## 未決事項

- 子守唄モチーフの具体的な音程列(音楽セッションが決める。
  ペンタトニックの範囲内で)
- 寝息の超低音がモバイルのスピーカーで聞こえない場合の扱い
  (聞こえなくても害はないので、そのままでよい想定)
