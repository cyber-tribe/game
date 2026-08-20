# しずくうお(shizukuuo)のアニメーション作り直し

## 経緯

plan/game/archive/animation-quality-guidelines.mdでパイロット5体
(garudo/purun/gajiri/honegarami/tsubute)に適用したタメ・ツメ・二次揺れの
規約を、この種族の骨格ファミリー(tsubute/gajiriと同じ`chest-head`
`chest-armF`の胴+腕(ひれ)+脚(`kneeB`-`ankleB`、尾びれ)構成)にも適用する。

## 現状

`build_shizukuuo()`はtsubuteの関節構成をベースに、四足の蛙ではなく
水滴形の魚に作り替えて作り直し済み(swarm用に簡略化)。
`shizukuuo_animations()`はidle 3キー、walk 3キー(尾びれをくねらせて
泳ぐ)、attack 4キー、hit 3キー、die 3キーで、`interp`・`partial`とも
未使用。

## 打ち直しの方針

`head = "chest-head"`、`finL/finR = "chest-armF.L/R"`(胸びれ)、
`tailL/tailR = "hip-kneeB.L/R"`、`shinL/shinR = "kneeB.L/R-ankleB.L/R"`
(尾びれ)を使う。

- **attack**(swarm): 現行の1→4(タメ)→9(突進)→16(戻り、尾を6°残す)を、
  タメ(1→4、現行のまま)→突進(4→6、2f、`interp: LINEAR`で`head`を
  現行の-20°を-26°まで、`tailL/tailR`を24/24を30/30まで鋭くくねらせる)→
  行き過ぎ(6→9、水を弾いた反動で`head`14°、`tailL/tailR`-18/-18まで
  戻りかける、現行値を利用)→戻り(9→16、ゆっくり中立へ)の4段に分ける。
- **hit**: 1f→4fの入りに`interp: LINEAR`を足して鋭さを強調。swarm個体
  らしく振幅は現行どおり中程度、戻り(4f→12f)はゆっくりのまま。
- **idle**: 現行の「水中を漂うようにゆっくり揺れる」3キー構造
  (`head`と`tailL/tailR`が同時に反対方向へ揺れる)を維持しつつ、
  `shinL`/`shinR`(尾びれの先端)を`tailL`/`tailR`より2フレーム遅らせて
  追従させる(`{"partial": True}`で24f→26f、48f→50fにキーをずらす)、
  水中でひらひらと漂う尾びれの二次揺れを追加する。
- **walk**: 泳ぐ生物であり接地・足取りという概念自体が存在しないため
  (`head`・尾びれのくねりだけで前進を表現する構成)、
  honegarami/garudoのような`loc`接地沈みは適用しない(浮遊・遊泳系は
  上下動を滑らかに保つ、というガイドラインの例外規定に該当)。現行の
  尾びれの大きなくねりは維持する。
- **die**: 現行の1f→8fの初動に`interp: LINEAR`を足して「しずくが弾ける」
  崩れ始めの鋭さを出す。8f→18fで丸く潰れた姿勢のあと、18f以降に
  わずかな跳ね返り(尾びれをほんの少し戻す1キー)を追加する。
- squash & stretch: 骨(Skin)ベースの造形のため使わない(水滴の丸みは
  造形自体で表現済み)。

## 対象外

- 骨格・造形そのものの変更(既存の.glbジオメトリはそのまま)
- 新規クリップの追加(5クリップ構成は変えない)

## 未決事項

- 具体的な角度・フレーム数の最終調整(実装時にプレビューで詰める)
