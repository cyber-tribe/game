> **実装済み。** `tools/audio/build.ts` の `BGM_SPECS` に計画書どおりの
> 値(`tarukurabe`、108bpm・2拍子・12小節・mallet0.65/drum0.4/
> flute0.15/string0.1・`wet 0.15/roomSize 0.3/damping 0.2`)で
> `tarukurabe` エントリを追加し、`public/audio/bgm/tarukurabe.wav`
> (約13.3秒、全BGM中最短)を生成した。新しい合成機能は不要だった
> (計画書の見込みどおり)。`src/main.ts` の `bgmForDive` に
> `TARUKURABE_ID`(既存importを流用)の分岐を追加した。
>
> **検証**: `npx tsc --noEmit`・`npx vitest run`(105ファイル/1349件)・
> `npm run build`・`npm run audio` いずれも成功。`public/audio/`合計は
> 約28MB。

# 樽比べのBGM

## 経緯・現状

樽比べ(`tarukurabe`、村はずれの的当てミニゲーム、1階)は専用BGMが
無く、村のテーマが流れ続ける(`src/main.ts` の `bgmForDive` が
対象外にしているため)。村の続きなので致命的な違和感は無いが、
「遊びが始まった」という切り替わりが音に無いのはもったいない。
短い専用曲を1本作る。

## 曲の狙い

タル10個で3つの的に当てる、村はずれの気軽な的当て。
`design/village-festivals.md` の祭りの空気に連なる「現役の遊び」で
ある点が、第七地方(わすれられた祭りの跡=囃子の**影**)との対比になる。

- **明るく軽い囃子**: 第七地方と同じ2拍子・囃子の系譜だが、
  こちらは現役の賑わいなので短調な影を持たせず、木琴を主役に
  屈託なく鳴らす。
- **村の屋外**: 残響は村のテーマと同じ浅さ。洞窟ではないので
  深い残響を使わない。
- **1プレイが短い**: タル10個を投げたら終わり。ループも短くてよい。

## 仕様

`tools/audio/build.ts` の `BGM_SPECS` に1エントリ追加する。

| 項目 | 値(目安。聴感で調整可) |
|---|---|
| id | `tarukurabe` |
| ファイル | `public/audio/bgm/tarukurabe.wav`(ステレオ、22.05kHz) |
| seed | 9000(聴感で選び直してよい) |
| tempoBpm | 108 |
| beatsPerBar | 2(囃子。第七地方105bpmとテンポを僅かにずらす) |
| bars | 12(2拍子で約13秒。全BGM中最短でよい) |
| weights | mallet 0.65 / drum 0.4 / flute 0.15 / string 0.1 |
| reverb | wet 0.15 / roomSize 0.3 / damping 0.2(村のテーマと同じ屋外の浅さ) |

新しい合成機能は不要。既存の `TrackParams` だけで作れる。

## 再生側の接続

`src/main.ts` の `bgmForDive` に分岐を1つ足す:
`dungeonId === "tarukurabe"` なら `"tarukurabe"` を返す。
終了して拠点に戻れば既存の `showTown()` 経由で村のテーマに戻る。

## 受け入れ基準

1. 樽比べを始めると専用曲へ切り替わり、終えて村に戻ると村のテーマに
   戻る。
2. 第七地方のBGMと並べて聴いたとき、同じ囃子の系譜でありつつ
   こちらの方が明るく軽い。
3. 既存曲の波形が変わらない。

## 対象外

- 的中・記録更新時のジングルSFX(既存SFXの流用で足りるかも含め別途)
- 開催日判定・遊び自体の仕様変更

## 未決事項

- シード・重みの最終値(聴感で確定)
- 村のテーマの変奏(同じ主題の囃子アレンジ)にする案。モチーフ導入
  (`plan/sound/bgm-main-cave.md`)が村のテーマにも広がったら検討する
