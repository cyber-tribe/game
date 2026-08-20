# みずかがみ(mizukagami)のアニメーション作り直し

## 経緯

plan/game/archive/animation-quality-guidelines.mdでパイロット5体
(garudo/purun/gajiri/honegarami/tsubute)に適用したタメ・ツメ・二次揺れの
規約を、この種族の骨格(madoromiと同じ`root-stem`-`stem-capbase`-
`capbase-captop`の3骨)にも適用する。

## 現状

`build_mizukagami()`はmadoromiの関節構成をベースに、傘の代わりに寸胴な
壺状の輪郭にし頂上に鏡のような水面を張らせて作り直し済み(mimic AI)。
`mizukagami_animations()`はidle 3キー、walk 4キー、attack 4キー、
hit 3キー、die 3キーで、`interp`・`partial`とも未使用。

## 打ち直しの方針

`stem = "root-stem"`、`cap = "stem-capbase"`、
`mirror = "capbase-captop"`を使う。

- **attack**(mimic、道具のふりから正体を現して打ちつける): 現行の1→5
  (タメ)→10(打撃)→20(戻り)を、タメ(1→5、現行のまま)→打撃(5→8、3f、
  `interp: LINEAR`で`cap`を現行の22°を28°まで、`mirror`を20°を26°まで
  鋭く振る)→行き過ぎ(8→10、`cap`14°、`mirror`12°まで戻りかける)→
  戻り(10→20、ゆっくり中立へ)の4段に分ける。
- **hit**: 1f→4fの入りに`interp: LINEAR`を足して鋭さを強調。振幅・戻り
  時間(4f→14f)は現行どおり中程度に保つ。
- **idle**: 現行は「道具のふりをして、ほとんど動かずじっと潜む」1→48→96
  の3キー(`mirror`のみ)構造。mimicらしくこの静止方針は維持しつつ、
  `cap`を`mirror`より3フレーム遅らせて追従させる(`{"partial": True}`
  で48f→51fにキーをずらす)、水面の揺らぎが壺全体へ一拍遅れて伝わる
  ごく控えめな二次揺れを追加する。
- **walk**: 脚を持たず、`stem`/`cap`をひねって進む構成のため、
  honegarami/garudoのような`loc`接地沈みは適用しない(madoromiと同じ
  判断理由)。現行の「道具らしからぬぎこちない足取り」は維持する。
- **die**: 現行の1f→10fの初動に`interp: LINEAR`を足して「水面が波紋と
  なって崩れる」鋭さを出す。10f→24fで崩れきった姿勢のあと、24f以降に
  わずかな跳ね返り(`stem`/`cap`をほんの少し戻す1キー)を追加する。
- squash & stretch: 骨(Skin)ベースの壺の造形のため使わない。

## 対象外

- 骨格・造形そのものの変更(既存の.glbジオメトリはそのまま)
- 新規クリップの追加(5クリップ構成は変えない)

## 未決事項

- 具体的な角度・フレーム数の最終調整(実装時にプレビューで詰める)
