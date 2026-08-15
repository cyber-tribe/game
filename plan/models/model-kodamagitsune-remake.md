# こだまぎつね(kodamagitsune)のアニメーション作り直し

## 経緯

plan/game/archive/animation-quality-guidelines.mdでパイロット5体
(garudo/purun/gajiri/honegarami/tsubute)に適用したタメ・ツメ・二次揺れの
規約を、この種族の骨格ファミリー(`gajiri`由来、`yamabikogitsune`と同じ
関節構成)にも適用する。`yamabikogitsune`(声の実体)と`kodamausagi`
(響きを追う小さな生き物)の夢あわせを重ねて育った姿。

## 現状

`build_kodamagitsune()`は`yamabikogitsune`と同じ`chest`-`hip`(尾)・
`chest`-`neck`-`snout`(頭)・`neck`-`ear.L/R`・`chest`-`hipF.L/R`-
`footF.L/R`・`hip`-`hipB.L/R`-`footB.L/R`の関節構成をひとまわり大きく
育てたもの。`hip`(0,0.185,0.230)・`chest`(0,-0.028,0.240)・`neck`
(0,-0.196,0.218)はZがほぼ一定(0.22〜0.24)でYが大きく変化しており、
`gajiri`/`kodamaNoNushi`と同じく胴の芯がほぼ水平。「攻撃が2回まで反響
する」性質(`echoAttackChance: 0.3`)を、間隔を空けた2つの発光球(喉と
口元)で視覚化してある。`ranged`AI・範囲5・HP60/atk29/def13。

`kodamagitsune_animations()`は`neck = chest-neck`・`snout = neck-snout`・
`t1/t2 = hip-tail1/tail1-tail2`・`fL/fR = chest-hipF.L/R`・
`bL/bR = hip-hipB.L/R`を使い、idle 4キー(1/24/48/66)・walk 4キー
(1/7/13/19)・attack 6キー(1/5/10/14/19/26、声→間→反響の2打を表現
済み)・hit 3キー(1/4/14)・die 3キー(1/10/24)。`interp`・`partial`は
いずれも未使用で、`yamabikogitsune_animations()`(こちらも未打ち直し)を
下敷きにした構成のまま。

## 打ち直しの方針

`echoAttackChance`(2回まで反響)を表す既存の2段攻撃構造は活かしつつ、
それぞれの打撃にタメ→ツメ(LINEAR)の緩急を足す。`ranged`AI・def13の
中間的な防御力なので、hitの振幅は極端な大小どちらにも振らない。

- **attack**: 現行の2打構成(1/5/10・10/14/19、それぞれ引く→放つ)を、
  1打目をタメ(1→5f、`snout: (-28, 0, 0)`・`neck: (-20, 0, 0)`まで引く、
  現行値のまま)→ツメ(5→8f、LINEARで`snout: (14, 0, 0)`・
  `neck: (8, 0, 0)`へ声を放つ)に、2打目(反響)をタメ(8→14f、
  `snout: (-16, 0, 0)`・`neck: (-10, 0, 0)`、現行値のまま)→ツメ
  (14→17f、LINEARで`snout: (10, 0, 0)`・`neck: (6, 0, 0)`)に分け、
  それぞれの放つ瞬間にLINEARを足す。戻り(17→26f)はゆっくりのまま。
- **hit**: 1f→4fの入りに`interp: LINEAR`を足す。振幅(`neck: (18, 0, 0)`・
  `t1: (0, -18, 0)`)は現行どおり維持し、戻り(4f→14f)もゆっくりの
  ままにする。
- **idle**: 現行は`neck`と`t1`/`t2`が同じキーフレーム(1/24/48/66)で
  動く単振動。`t1`(尾の付け根)を`neck`より3フレーム遅らせ、`t2`
  (尾の先)をさらに2フレーム遅らせて追従させる(`{"partial": True}`)。
  `gajiri`の「尻尾が首より3フレーム遅れる」二次揺れと同じ考え方を、
  尾がさらに1関節長いぶん2段階に分けて適用する。
- **walk**: `chest-hip`(および`chest-neck`)はZがほぼ一定でYが大きく
  変化する、ほぼ水平な骨(`gajiri`/`kodamaNoNushi`と同じ判定)。素直な
  接地沈み表現にならないため、footfall dip(loc接地沈み)は見送る
  (現行どおり脚の振り角度と尾の左右揺れで進行感を出す)。
- **die**: 初動(1f→3f程度)に`interp: LINEAR`を足して「反響していた
  声が最初に鋭く途切れる」感触を加える。現行の最終キー(24f)の後に、
  崩れ落ちた末端(前脚)の小さな跳ね返りを1回追加する。

## 対象外

- 骨格・造形そのものの変更(既存の.glbジオメトリはそのまま)
- 新規クリップの追加(5クリップ構成は変えない)
- 耳(`ear.L/R`)への新規アニメーション追加(現行クリップでも未使用の
  ため、今回の規約適用範囲には含めない)

## 未決事項

- 具体的な角度・フレーム数の最終調整(実装時にプレビューで詰める)
- `yamabikogitsune_animations()`自体の打ち直し(別種族として扱われる
  ため、この計画書の対象外。先に打ち直された場合はこちらの方針も
  合わせて見直す)
