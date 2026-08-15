# ねむりモグラ(nemurimogura)のアニメーション作り直し

## 経緯

plan/game/archive/animation-quality-guidelines.mdでパイロット5体
(garudo/purun/gajiri/honegarami/tsubute)に適用したタメ・ツメ・二次揺れの
規約を、この種族の骨格ファミリー(gajiriと同じ`chest-neck`の胴+前脚
(`hipF`)+後脚(`hipB`)構成)にも適用する。

## 現状

`build_nemurimogura()`はgajiriの関節構成をベースに、体を丸く縮め掘削に
適した大きな前足に作り直し済み(companion-evolutionの成熟系統)。
`nemurimogura_animations()`はidle 3キー、walk 3キー、attack 4キー
(タメ→掻き出しの2段止まり)、hit 3キー、die 3キーで、`interp`・`partial`
とも未使用。

## 打ち直しの方針

`neck = "chest-neck"`、`hipF_L/hipF_R = "chest-hipF.L/R"`、
`hipB_L/hipB_R = "hip-hipB.L/R"`を使う。

- **attack**(burrow、前足を大きく掻き出し眠りをまとわりつかせる):
  現行の1→5(タメ)→10(掻き出し)→18(戻り)を、タメ(1→5、現行のまま)→
  掻き出し(5→8、3f、`interp: LINEAR`で`hipF_L/hipF_R`を現行の-24/-24を
  -30/-30まで鋭く掻き出す)→行き過ぎ(8→10、`hipF_L/hipF_R`を18/18まで
  戻りかける、現行の値を利用)→戻り(10→18、ゆっくり中立へ)の4段に分ける。
- **hit**: 1f→4fの入りに`interp: LINEAR`を足して鋭さを強調。
  companion-evolutionの成熟個体らしい高HP・高防御を反映し、振幅は
  控えめのまま、戻り時間(4f→14f)も現行どおりに保つ。
- **idle**: 現行は「眠たげに、ゆっくりと体を揺らす」3キー(`neck`のみ)
  構造。この方針は維持しつつ、`hipF_L`/`hipF_R`を`neck`より2〜3フレーム
  遅らせて追従させる(`{"partial": True}`で36f→38f、72f→74fにキーを
  ずらす)、眠りに沈んだ体の重みを感じさせる二次揺れを追加する。
- **walk**: `neck`はgajiriと同じく胴の骨がほぼ水平を向く構成のため、
  honegarami/garudoのような`loc`接地沈みは見送る(gajiriの打ち直しと
  同じ判断理由)。土を掻くように前足を大きく使う現行の動きは維持する。
- **die**: 現行の1f→10fの初動に`interp: LINEAR`を足して鋭さを出す。
  10f→24fで体を丸めた姿勢のあと、24f以降にわずかな跳ね返り
  (`neck`をほんの少し戻す1キー)を追加する。
- squash & stretch: 骨(Skin)ベースの造形のため使わない。

## 対象外

- 骨格・造形そのものの変更(既存の.glbジオメトリはそのまま)
- 新規クリップの追加(5クリップ構成は変えない)

## 未決事項

- 具体的な角度・フレーム数の最終調整(実装時にプレビューで詰める)
