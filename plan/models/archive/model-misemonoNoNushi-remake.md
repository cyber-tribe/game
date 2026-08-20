# 見世物のぬし(misemonoNoNushi)のアニメーション作り直し

## 経緯

plan/game/archive/animation-quality-guidelines.mdでパイロット5体
(garudo/purun/gajiri/honegarami/tsubute)に適用したタメ・ツメ・二次揺れの
規約を、この種族の骨格(honegarami/yamabikooniと同じ`hip-chest`
`neck-head`の胴+腕(`shoulder`-`elbow`)+脚(`thigh`-`knee`)構成)にも
適用する。第七地方の地方ボス。

## 現状

`build_misemonoNoNushi()`はhonegarami系の人型骨組みをボスサイズまで
拡大した造形。`misemonoNoNushi_animations()`はidle 3キー、walk 4キー
(すでに`loc`接地沈みなしの単純な脚の往復)、attack 4キー(すでに
タメ→大振り→行き過ぎ→戻りの4段構成)、hit 3キー、die 3キーで、
`interp`・`partial`とも未使用。

## 打ち直しの方針

`hipc = "hip-chest"`、`neck = "neck-head"`、
`armL/armR = "chest-shoulder.L/R"`、`foreL/foreR = "shoulder.L/R-
elbow.L/R"`、`legL/legR = "hip-thigh.L/R"`、
`shinL/shinR = "thigh.L/R-knee.L/R"`を使う。

- **attack**: 現行はすでに1→8(タメ)→14(打撃)→26(戻り)の4段構成
  なので、8→14の打撃区間に`interp: LINEAR`を追加して鋭さを強調する。
  ボスらしくタメ(1→8)はそのまま長めに保ち、`armR`の-140°という
  大振りの迫力は維持する。
- **hit**: 現行の1→5(縮み)→18(戻り)に`interp: LINEAR`を5f目の入りへ
  追加。ボス格の高い防御を反映し、振幅は現行どおり中程度、戻り
  (5f→18f)はゆっくりのまま。
- **idle**: 現行は1→28→56の3キーで`hipc`/`neck`/`armL`/`armR`が
  同時に動く。`neck`を`hipc`より2フレーム、`armL`/`armR`を`neck`より
  さらに2フレーム遅らせて追従させる(`{"partial": True}`で28f→30f、
  30f→32fの多段ずらし)、honegarami/garudoと同じ「頭が胴より遅れて
  追従する」二次揺れを追加する。
- **walk**: `hipc`(`hip-chest`)はhonegarami/garudoと同じくほぼ垂直な
  胴の骨のため、接地の瞬間に`hipc`を1〜2%沈める`loc`接地沈みを追加する
  (garudo/honegaramiの打ち直しと同じ手法)。現行の脚・腕の交互の往復は
  維持する。
- **die**: 現行の1f→12fの初動に`interp: LINEAR`を足して「存在感ごと
  崩れ落ちる」鋭さを出す。12f→30fの大きく傾いた姿勢のあと、30f以降に
  わずかな跳ね返り(`hipc`/`neck`をほんの少し戻す1キー)を追加する。
- squash & stretch: 骨・装甲系の造形のため使わない。

## 対象外

- 骨格・造形そのものの変更(既存の.glbジオメトリはそのまま)
- 新規クリップの追加(5クリップ構成は変えない)

## 未決事項

- 具体的な角度・フレーム数の最終調整(実装時にプレビューで詰める)
