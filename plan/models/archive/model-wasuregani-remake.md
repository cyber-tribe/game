# ワスレガニ(wasuregani)のアニメーション作り直し

## 経緯

plan/game/archive/animation-quality-guidelines.mdでパイロット5体
(garudo/purun/gajiri/honegarami/tsubute)に適用したタメ・ツメ・二次揺れの
規約を、この種族の骨格(honegaramiと同じ`hip-chest``neck-head`の胴+腕
(`shoulder`)+脚(`thigh`)構成)にも適用する。

## 現状

`build_wasuregani()`はhonegarami系の人型骨組みをベースに、低い重心の
どっしりした体格・大きな甲羅・小さな鋏に組み替えた造形(guard AI)。
`wasuregani_animations()`はidle 3キー、walk 4キー、attack 4キー
(すでにタメ→打撃→行き過ぎ→戻りの4段構成)、hit 3キー、die 3キーで、
`interp`・`partial`とも未使用。

## 打ち直しの方針

`hipc = "hip-chest"`、`neck = "neck-head"`、
`armL/armR = "chest-shoulder.L/R"`、`legL/legR = "hip-thigh.L/R"`を使う。

- **attack**: 現行はすでに1→6(タメ)→12(鋏の打撃)→22(戻り)の4段構成
  なので、6→12の打撃区間に`interp: LINEAR`を追加して「鋏を振りかざして
  鈍く叩きつける」鋭さを強調する。guard AIらしくタメ(1→6)はそのまま
  維持する。
- **hit**: 現行の1→4(縮み)→14(戻り)に`interp: LINEAR`を4f目の入りへ
  追加。guardの甲羅らしく振幅は現行どおり小さめ(`hipc`-6、`neck`-10)、
  戻り時間(4f→14f)も短めに保つ。
- **idle**: 現行は1→30→60の3キーで`hipc`/`neck`が同時にわずかに動く
  「思い出そうとしてふらふらと据わりの悪い揺れ」構造。`neck`を`hipc`
  より2フレーム遅らせて追従させる(`{"partial": True}`で30f→32fに
  キーをずらす)、頭がわずかに一拍遅れて追従する二次揺れを追加する。
- **walk**: `hipc`(`hip-chest`)はhonegarami/garudoと同じくほぼ垂直な
  胴の骨のため、接地の瞬間に`hipc`を1〜2%沈める`loc`接地沈みを追加する
  (garudo/honegaramiの打ち直しと同じ手法)。現行の脚・腕の交互の往復は
  維持する。
- **die**: 現行の1f→10fの初動に`interp: LINEAR`を足して鋭さを出す。
  10f→24fの大きく傾いた姿勢のあと、24f以降にわずかな跳ね返り
  (`hipc`/`neck`をほんの少し戻す1キー)を追加する。
- squash & stretch: 骨・甲羅(装甲)系の造形のため使わない。

## 対象外

- 骨格・造形そのものの変更(既存の.glbジオメトリはそのまま)
- 新規クリップの追加(5クリップ構成は変えない)

## 未決事項

- 具体的な角度・フレーム数の最終調整(実装時にプレビューで詰める)
