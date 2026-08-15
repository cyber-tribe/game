# わたあめのおばけ(wataamenoobake)のアニメーション作り直し

## 経緯

plan/game/archive/animation-quality-guidelines.mdでパイロット5体
(garudo/purun/gajiri/honegarami/tsubute)に適用したタメ・ツメ・二次揺れの
規約を、この種族の骨格(purunと同じ縦2本の骨組み、`base`-`mid`-`top`)
にも適用する。

## 現状

`build_wataamenoobake()`はpurunの骨組みを流用し、半径を逆転させて
根元を細く先端を太くした幽霊らしいシルエット(coward AI)。
`wataamenoobake_animations()`はidle 3キー、walk 5キー、attack 4キー、
hit 3キー、die 3キーで、`interp`・`partial`とも未使用。

## 打ち直しの方針

`lower = "base-mid"`、`upper = "mid-top"`を使う2骨構成のため、追加
ボーンの二次揺れは組めないが、purunと同じ役割分担のまま、cowardらしい
軽さ・逃げ足の速さを強める。

- **attack**: 現行の1(中立)→4(squash/stretch)→9(伸び)→18(戻り)を、
  タメ(1→4、現行のまま)→打撃(4→7の3fを`interp: LINEAR`にして鋭く
  伸ばす)→行き過ぎ(7→9、伸びをわずかに残しつつ戻りかける)→戻り
  (9→18、ゆっくり中立へ)の4段に整理する。coward種族らしく振り自体は
  ほかのpurun系よりやや小さめのまま。
- **hit**: 現行の1→4(縮み)→14(戻り)に`interp: LINEAR`を4f目の入りへ
  追加。cowardらしく振幅(1.28/0.68)は現行どおり大きめに保ち、
  戻り(4f→14f)はゆっくりのまま。
- **idle**: 現行は1→16→32の3キーで`lower`/`upper`が反対方向へふわふわと
  伸縮するのみ。`upper`(頭側)を`lower`より2フレーム遅らせて追従させる
  (`{"partial": True}`で16f→18fにキーをずらす)、地に足の付かない
  漂いの二次揺れを追加する。
- **walk**: 現行はすでに`loc`(0, 0.11, 0)による前へのわずかな重心
  移動をsquash&stretchに組み合わせているため、honegarami/garudoの
  ような追加の`loc`接地沈みは重ねて追加しない(shioresakuraと同じ
  判断理由)。cowardらしく素早く逃げるように弾む現行の構成を維持する。
- **die**: 現行の1→10→24の2段の潰れに、1f→3f程度の初動へ
  `interp: LINEAR`を足して「触れるとほどけて散る綿あめ」の崩れ始めの
  鋭さを加える。24f以降にわずかな跳ね返り(scaleをわずかに揺り戻す
  1キー)を追加する。
- squash & stretch: purunファミリー(骨・装甲のない綿あめの塊)なので
  継続して使う。既存の定義はそのまま流用してよい。

## 対象外

- 骨格・造形そのものの変更(既存の.glbジオメトリはそのまま)
- 新規クリップの追加(5クリップ構成は変えない)

## 未決事項

- 具体的な角度・フレーム数の最終調整(実装時にプレビューで詰める)
