# きのこおとこ(kinokootoko)のアニメーション作り直し

## 経緯

plan/game/archive/animation-quality-guidelines.mdでパイロット5体
(garudo/purun/gajiri/honegarami/tsubute)に適用したタメ・ツメ・二次揺れの
規約を、この種族の骨格ファミリー(`honegarami`と同じ人型の胴・腕・脚に、
`madoromi`由来の傘(`capbase`/`captop`)を頭の上に足した構成)にも適用する。

## 現状

`build_kinokootoko()`は`hip`-`chest`-`neck`-`head`-`capbase`-`captop`の
縦の芯に、左右対称の`shoulder`-`elbow`-`hand`(腕)と`thigh`-`knee`-`foot`
(脚)をぶら下げる構成。`hip`(0,0,0.32)・`chest`(0,0,0.50)でZ差0.18・XY差0
と、`hipc`(`hip-chest`)は明確に縦向きの骨になっている(`honegarami`/
`garudo`と同じ判定)。傘(`head`から上)は高さ0.74を境に淡い黄土色で
塗り分けてあり、`melee`AI・`atkMulInSporedRoom`(胞子部屋での攻撃力上昇)
という設定に合う、正面から迫る力強い顔つきにしてある。

`kinokootoko_animations()`は`hipc = hip-chest`・`neck = chest-neck`・
`headb = neck-head`・`capb = head-capbase`・`captip = capbase-captop`・
`armL/armR = chest-shoulder.L/R`・`legL/legR = hip-thigh.L/R`・
`shinL/shinR = thigh.L/R-knee.L/R`を使い、idle 3キー(1/24/48、`hipc`と
`capb`が同じフレームで同時に動く)・walk 5キー(1/9/17/25/33、脚の踏み
込みで`capb`を逆位相に振るが`hipc`のlocは未使用)・attack 4キー
(1/5/10/20)・hit 3キー(1/4/14)・die 3キー(1/10/24)。`interp`・`partial`は
いずれも未使用。

## 打ち直しの方針

`melee`AI・HP34/atk19/def9というがっしり系の中堅として、「大きくは動かず
傘だけがゆったり揺れる」現行の性格づけを保ちながら、打撃の重さと傘の
遅れ揺れを足す。

- **attack**: 現行の4段(1/5/10/20)を、タメ(1→5f、`armL/armR`を
  `(-70, 0, 20)/(-70, 0, -20)`まで引く、現行値のまま)→ツメ(5→8f、
  LINEARで`armL/armR`を`(60, 0, -10)/(60, 0, 10)`へ叩きつけ、`capb`を
  `(-10, 0, 0)`・`captip`を`(-6, 0, 0)`へ振る)→行き過ぎ(8→10f、腕を
  ほんの少し余分に押し出す)→戻り(10→20f、ゆっくり)の4段に分ける。
- **hit**: 1f→4fの入りに`interp: LINEAR`を足す。振幅(`hipc: (-16, 0, 0)`・
  `headb: (-14, 0, 0)`・`capb: (-10, 0, 0)`・`armL/armR: (-18, 0, 20)/
  (-18, 0, -20)`)は現行どおり維持し、戻り(4f→14f)もゆっくりのまま
  にする(def9の中堅なので極端な大小どちらにも振らない)。
- **idle**: 現行は`hipc`と`capb`が同じフレーム(1/24/48)で同時に動いて
  いるため、傘が体と一体でしか揺れない。傘(`capb`/`captip`)を胴
  (`hipc`)より2〜3フレーム遅らせて追従させる(`{"partial": True}`)ことで、
  がっしりした体が先に揺れ、傘がふわっと遅れてついてくる二次揺れを表す。
- **walk**: `hipc`(`hip-chest`)は縦向きの骨なので、接地の瞬間に胴を
  わずかに沈める`honegarami`/`garudo`と同じ`hipc: {"loc": (0, -0.010, 0)}`
  形式の接地沈みを、脚が接地する9f・25f付近のキーに追加する。
- **die**: 初動(1f→3f程度)に`interp: LINEAR`を足して「がっしりした
  巨体が最初にびくっと崩れかける」鋭さを加える。現行の最終キー(24f)の
  後に、崩れ落ちた末端の小さな跳ね返り(腕や傘のわずかな戻り揺れ)を
  1回追加する。

## 対象外

- 骨格・造形そのものの変更(既存の.glbジオメトリはそのまま)
- 新規クリップの追加(5クリップ構成は変えない)

## 未決事項

- 具体的な角度・フレーム数の最終調整(実装時にプレビューで詰める)
