# もうひとつのかげ(mouhitotsunokage)のアニメーション作り直し

## 経緯

plan/game/archive/animation-quality-guidelines.mdでパイロット5体
(garudo/purun/gajiri/honegarami/tsubute)に適用したタメ・ツメ・二次揺れの
規約を、この種族の骨格(madoromiと同じ`root-stem`-`stem-capbase`-
`capbase-captop`の3骨)にも適用する。

## 現状

`build_mouhitotsunokage()`はmadoromiの関節構成をベースに、フード状の
ドームではなく寸胴で角ばった道具箱のような輪郭に作り替えて作り直し済み
(mimic AI、ゆめまよいの影の対をなす個体)。`mouhitotsunokage_animations()`
はidle 3キー、walk 4キー、attack 4キー、hit 3キー、die 3キーで、
`interp`・`partial`とも未使用。既にmizukagamiとほぼ同じ「道具のふり」の
idle/walkを流用している。

## 打ち直しの方針

`lower = "root-stem"`、`mid = "stem-capbase"`、`upper = "capbase-captop"`
を使う。

- **attack**: 現行の1→6(タメ、6f)→11(打撃)→20(戻り)を、タメ(1→6、
  現行のまま)→打撃(6→9、3f、`interp: LINEAR`で`upper`を現行の-22°を
  -28°まで、`mid`を-15°を-20°まで鋭く振る)→行き過ぎ(9→11、`upper`
  13°、`mid`9°まで戻りかける)→戻り(11→20、ゆっくり中立へ)の4段に
  分ける。
- **hit**: 1f→4fの入りに`interp: LINEAR`を足して鋭さを強調。振幅・戻り
  時間(4f→14f)は現行どおり中程度に保つ。
- **idle**: 現行は「道具のふりをして、ほとんど動かずじっと潜む」1→48→96
  の3キー(`mid`のみ)構造。mimicらしくこの静止方針は維持しつつ、
  `upper`を`mid`より3フレーム遅らせて追従させる(`{"partial": True}`
  で48f→51fにキーをずらす)、箱の蓋がわずかに一拍遅れて揺れる控えめな
  二次揺れを追加する。
- **walk**: 脚を持たず、`lower`/`mid`をひねって進む構成のため、
  honegarami/garudoのような`loc`接地沈みは適用しない(madoromiと同じ
  判断理由)。現行の「道具らしからぬぎこちない足取り」は維持する。
- **die**: 現行の1f→10fの初動に`interp: LINEAR`を足して「影がほどける」
  崩れ始めの鋭さを出す。10f→22fでほどけきった姿勢のあと、22f以降に
  わずかな跳ね返りではなく、影らしく完全に薄れて消える1キーへ差し替える
  (scale等の追加要素は既存の仕組みに無いため、`lower`/`mid`/`upper`を
  さらにわずかに広げるだけの最小限の変更にとどめる)。
- squash & stretch: 骨(Skin)ベースの箱状の造形のため使わない。

## 対象外

- 骨格・造形そのものの変更(既存の.glbジオメトリはそのまま)
- 新規クリップの追加(5クリップ構成は変えない)

## 未決事項

- 具体的な角度・フレーム数の最終調整(実装時にプレビューで詰める)
