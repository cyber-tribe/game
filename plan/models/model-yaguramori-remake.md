# やぐらもり(yaguramori)のアニメーション作り直し

## 経緯

plan/game/archive/animation-quality-guidelines.mdでパイロット5体
(garudo/purun/gajiri/honegarami/tsubute)に適用したタメ・ツメ・二次揺れの
規約を、この種族の骨格(madoromiと同じ`root-stem`-`stem-capbase`-
`capbase-captop`の3骨)にも適用する。

## 現状

`build_yaguramori()`はmadoromiの関節構成をベースに、柱を長く細く屋根を
平たく広く作り替えて祭りの櫓を思わせる姿に作り直し済み(ranged AI、
range5)。`yaguramori_animations()`はidle 3キー、walk 4キー、attack 4キー、
hit 3キー、die 3キーで、`interp`・`partial`とも未使用。

## 打ち直しの方針

`lower = "root-stem"`、`mid = "stem-capbase"`、`upper = "capbase-captop"`
を使う。

- **attack**(ranged、鏃形の棘を矢のように放つ): 現行の1→6(タメ、6f)→11
  (放つ)→20(戻り)を、タメ(1→6、現行のまま)→放つ(6→9、3f、
  `interp: LINEAR`で`upper`を現行の-26°を-32°まで、`mid`を-14°を
  -18°まで鋭く突き出す)→行き過ぎ(9→11、`upper`10°、`mid`6°まで
  戻りかける)→戻り(11→20、ゆっくり中立へ)の4段に分ける。
- **hit**: 1f→4fの入りに`interp: LINEAR`を足して鋭さを強調。ranged種族
  なので振幅・戻り時間(4f→14f)は現行どおり中程度に保つ。
- **idle**: 現行は「櫓の上でじっと見下ろす、ほとんど動かない待機」
  1→40→80の3キー(`mid`のみ)構造。この静止方針は維持しつつ、`upper`
  (屋根)を`mid`(柱の途中)より2〜3フレーム遅らせて追従させる
  (`{"partial": True}`で40f→42fにキーをずらす)、屋根がわずかに一拍
  遅れて揺れる二次揺れを追加する。
- **walk**: 脚を持たず、`lower`/`mid`をひねって進む構成のため、
  honegarami/garudoのような`loc`接地沈みは適用しない(madoromiと同じ
  判断理由)。現行の「柱が軋むように小さく揺れて進む」表現は維持する。
- **die**: 現行の1f→10fの初動に`interp: LINEAR`を足して「古い柱が朽ち
  崩れる」鋭さを出す。10f→24fの大きく傾いた姿勢のあと、24f以降に
  わずかな跳ね返り(`lower`/`mid`をほんの少し戻す1キー)を追加する。
- squash & stretch: 骨(Skin)ベースの櫓の造形のため使わない。

## 対象外

- 骨格・造形そのものの変更(既存の.glbジオメトリはそのまま)
- 新規クリップの追加(5クリップ構成は変えない)

## 未決事項

- 具体的な角度・フレーム数の最終調整(実装時にプレビューで詰める)
