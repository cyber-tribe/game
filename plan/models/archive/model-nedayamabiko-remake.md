# ねだやまびこ(nedayamabiko)のアニメーション作り直し

## 経緯

plan/game/archive/animation-quality-guidelines.mdでパイロット5体
(garudo/purun/gajiri/honegarami/tsubute)に適用したタメ・ツメ・二次揺れの
規約を、この種族の骨格(honegarami/yamabikooniと同じ`hip-chest`
`neck-head`の胴+腕(`shoulder`)+脚(`thigh`-`knee`)構成)にも適用する。

## 現状

`build_nedayamabiko()`はhonegarami系の人型骨組みを、背が低く前傾した
どっしりした構えに作り替えた造形(guard AI)。`nedayamabiko_animations()`
はidle 3キー、walk 4キー、attack 4キー(すでにタメ→打ち下ろし→
行き過ぎ→戻りの4段構成)、hit 3キー、die 3キーで、`interp`・`partial`
とも未使用。

## 打ち直しの方針

`hipc = "hip-chest"`、`neck = "neck-head"`、
`armL/armR = "chest-shoulder.L/R"`、`legL/legR = "hip-thigh.L/R"`、
`shinL/shinR = "thigh.L/R-knee.L/R"`を使う。

- **attack**: 現行はすでに1→9(タメ)→15(打撃)→26(戻り)の4段構成
  なので、9→15の打ち下ろし区間に`interp: LINEAR`を追加して「根を
  張った重心のまま短く鈍く打ち下ろす」鋭さを強調する。guard AIらしく
  タメ(1→9)は長めのまま維持する。
- **hit**: 現行の1→5(縮み)→18(戻り)に`interp: LINEAR`を5f目の入りへ
  追加。guardらしく振幅は小さめ、戻り時間(5f→18f)も短め
  (既存のyoroimukade等の設計思想を踏襲)に保つ。
- **idle**: 現行は1→50→100の3キーで`hipc`のみがわずかに動く「根を
  張ったように、ほとんど動かない」構造。この方針は維持しつつ、`neck`を
  `hipc`より2フレーム遅らせて追従させる(`{"partial": True}`で
  50f→52fにキーをずらす)、岩の塊のようにわずかに一拍遅れて頭が
  追従する二次揺れを追加する。
- **walk**: `hipc`(`hip-chest`)はhonegarami/garudoと同じくほぼ垂直な
  胴の骨のため、接地の瞬間に`hipc`を1〜2%沈める`loc`接地沈みを追加する
  (garudo/honegaramiの打ち直しと同じ手法)。guard AIでも移動自体は
  起こりうるため、現行の重く鈍い足取りは維持しつつ沈みを足す。
- **die**: 現行の1f→12fの初動に`interp: LINEAR`を足して「根が抜ける」
  鋭さを出す。12f→32fのゆっくり崩れ落ちる姿勢のあと、32f以降に
  わずかな跳ね返り(`hipc`/`neck`をほんの少し戻す1キー)を追加する。
- squash & stretch: 骨・装甲(甲羅状の岩)系の造形のため使わない。

## 対象外

- 骨格・造形そのものの変更(既存の.glbジオメトリはそのまま)
- 新規クリップの追加(5クリップ構成は変えない)

## 未決事項

- 具体的な角度・フレーム数の最終調整(実装時にプレビューで詰める)
