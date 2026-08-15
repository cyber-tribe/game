# めんかぶりこぞう(menkaburikozo)のアニメーション作り直し

## 経緯

plan/game/archive/animation-quality-guidelines.mdでパイロット5体
(garudo/purun/gajiri/honegarami/tsubute)に適用したタメ・ツメ・二次揺れの
規約を、この種族の骨格ファミリー(tsubute/gajiriと同じ`chest-head`
`chest-hip`の胴+腕(`armF`)+脚(`kneeB`)構成)にも適用する。

## 現状

`build_menkaburikozo()`はtsubuteの関節構成を流用しつつ立体感を潰した
平たいシルエットに作り直し済み。`menkaburikozo_animations()`はidle 3キー
(ほとんど動かない待機)、walk 4キー、attack 4キー(タメ→跳びかかりの
2段止まり)、hit 3キー、die 3キーで、`interp`・`partial`とも未使用。

## 打ち直しの方針

`head = "chest-head"`、`armL/armR = "chest-armF.L/R"`、
`legL/legR = "hip-kneeB.L/R"`を使う。

- **attack**(ambush、不意打ち): 現行の1→4(タメ、4f)→8(跳びかかり、4f)→16
  (戻り)を、タメ(1→4、現行のまま)→跳びかかり(4→6、2f、
  `interp: LINEAR`で`armL/armR`を現行の-40/-40を-48/-48まで、`head`を
  -24°を-30°まで鋭く突き出す)→行き過ぎ(6→8、面が相手にぶつかった反動で
  `armL/armR`を30/30、`head`14°まで戻りかける)→戻り(8→16、ゆっくり
  中立へ)の4段に分ける。不意打ちらしく、タメから跳びかかりへの切り替えは
  現行の鋭さを保つ。
- **hit**: 1f→4fの入りに`interp: LINEAR`を足して鋭さを強調。ambush種族
  なので振幅は中程度、戻り(4f→14f)はゆっくりのまま。
- **idle**: 現行は「気配を消してじっと潜む」ほぼ静止のidleで、末端に
  相当する腕・脚を意図的に動かしていない。この方針自体は維持しつつ、
  1→40→80の3キーの`head`のわずかな動き(2,3,0)に対し、`armL`/`armR`を
  1〜2フレーム遅れて追従させる控えめな二次揺れを`partial`で足す
  (`head`の動きにわずかに遅れて腕が揺れることで、完全な静止ではなく
  息を潜めている感じを強める)。
- **walk**: `head`はtsubute/gajiriと同じく胴の骨(`chest-hip`に相当する
  暗黙の胴)がほぼ水平を向く構成のため、honegarami/garudoのような`loc`
  接地沈みは見送る(gajiriの打ち直しと同じ判断理由)。低い姿勢のまま
  音もなく忍び寄る現行の動きは維持する。
- **die**: 現行の1f→9fの初動に`interp: LINEAR`を足して鋭さを出す。
  9f→22fの伸びきった姿勢のあと、22f以降にわずかな跳ね返り
  (`head`をほんの少し戻す1キー)を追加する。
- squash & stretch: 骨(Skin)ベースの造形のため使わない。

## 対象外

- 骨格・造形そのものの変更(既存の.glbジオメトリはそのまま)
- 新規クリップの追加(5クリップ構成は変えない)

## 未決事項

- 具体的な角度・フレーム数の最終調整(実装時にプレビューで詰める)
