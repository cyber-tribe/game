# わすれぼね(wasurebone)のアニメーション作り直し

## 経緯

plan/game/archive/animation-quality-guidelines.mdでパイロット5体
(garudo/purun/gajiri/honegarami/tsubute)に適用したタメ・ツメ・二次揺れの
規約を、この種族の骨格(honegaramiと同じ`hip-chest``neck-head`の胴+腕
(`shoulder`)+脚(`thigh`)構成)にも適用する。

## 現状

`build_wasurebone()`はhonegarami系の人型骨組みをベースに、ぐっと小柄で
華奢な前かがみの姿勢に作り替えた造形(coward AI)。`wasurebone_animations()`
はidle 4キー(すでにびくびくと震える構造)、walk 4キー、attack 4キー、
hit 3キー、die 3キーで、`interp`・`partial`とも未使用。

## 打ち直しの方針

`hipc = "hip-chest"`、`neck = "neck-head"`、
`armL/armR = "chest-shoulder.L/R"`、`legL/legR = "hip-thigh.L/R"`を使う。

- **attack**: 現行の1→4(タメ)→8(打撃)→16(戻り)を、タメ(1→4、
  現行のまま)→打撃(4→6、2f、`interp: LINEAR`で`armL/armR`を現行の
  -20/-20を-26/-26まで鋭く振る)→行き過ぎ(6→8、`armL/armR`を
  現行の26/26を利用しつつわずかに戻す)→戻り(8→16、ゆっくり中立へ)の
  4段に分ける。非力なcowardらしく振り自体は小さいまま。
- **hit**: 現行の1→4(縮み)→14(戻り)に`interp: LINEAR`を4f目の入りへ
  追加。「非力な体は、わずかな一撃でも大きくよろける」性質どおり振幅
  (`hipc`-14、`neck`-18)は現行どおり大きめに保ち、戻り(4f→14f)は
  ゆっくりのまま。
- **idle**: 現行はすでに1→10→20→30の4キーでびくびくと震える構造。
  `neck`を`hipc`より1〜2フレーム遅らせて追従させる(`{"partial": True}`
  で10f→11f、30f→31fにキーをずらす)、怯えて震える体に頭がわずかに
  遅れて追従する二次揺れを追加する。
- **walk**: `hipc`(`hip-chest`)はhonegarami/garudoと同じくほぼ垂直な
  胴の骨のため、接地の瞬間に`hipc`を1〜2%沈める`loc`接地沈みを追加する
  (garudo/honegaramiの打ち直しと同じ手法)。逃げ足の速さを感じさせる
  現行のせかせかとした足取りは維持する。
- **die**: 現行の1f→8fの初動に`interp: LINEAR`を足して鋭さを出す。
  8f→18fで大きく崩れた姿勢のあと、18f以降にわずかな跳ね返り
  (`hipc`/`neck`をほんの少し戻す1キー)を追加する。
- squash & stretch: 骨(白骨)系の造形のため使わない。

## 対象外

- 骨格・造形そのものの変更(既存の.glbジオメトリはそのまま)
- 新規クリップの追加(5クリップ構成は変えない)

## 未決事項

- 具体的な角度・フレーム数の最終調整(実装時にプレビューで詰める)
