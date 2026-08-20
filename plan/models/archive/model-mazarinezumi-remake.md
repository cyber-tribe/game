# まざりねずみ(mazarinezumi)のアニメーション作り直し

## 経緯

plan/game/archive/animation-quality-guidelines.mdでパイロット5体
(garudo/purun/gajiri/honegarami/tsubute)に適用したタメ・ツメ・二次揺れの
規約を、この種族の骨格ファミリー(gajiriと同じ`chest-neck`の胴+前脚
(`hipF`)+後脚(`hipB`)構成)にも適用する。

## 現状

`build_mazarinezumi()`はgajiriの関節構成をベースに、ガジリねずみと
いしずえねずみの中間の体格に作り直し済み。`mazarinezumi_animations()`は
idle 3キー、walk 3キー(gajiriと同じ前後脚交互)、attack 4キー、hit 3キー、
die 3キーで、`interp`・`partial`とも未使用。

## 打ち直しの方針

`neck = "chest-neck"`、`snout = "neck-snout"`、
`hipF_L/hipF_R = "chest-hipF.L/R"`、`hipB_L/hipB_R = "hip-hipB.L/R"`
を使う。

- **attack**(guard、gajiriより落ち着いた噛みつき): 現行の1→5(タメ)→10
  (噛みつき)→20(戻り)を、タメ(1→5、現行のまま)→噛みつき(5→8、3f、
  `interp: LINEAR`で`neck`を現行の20°を26°まで、`snout`を12°を16°まで
  鋭く突き出す)→行き過ぎ(8→10、`neck`14°、`snout`8°まで戻りかける)→
  戻り(10→20、ゆっくり中立へ)の4段に分ける。guard AIらしくgajiriより
  やや落ち着いたテンポを保つ。
- **hit**: 1f→4fの入りに`interp: LINEAR`を足して鋭さを強調。guard種族
  なので振幅は小さめ・戻り時間も短め(現行の4f→14fより少し詰めた
  4f→12fを目安)にする(既存のyoroimukade等の防御の高い種族の設計思想を
  踏襲)。
- **idle**: 現行は「臆病さと不動の構えが同居し、落ち着かずわずかに揺れる」
  3キー(`neck`のみ)構造。この方針は維持しつつ、`snout`を`neck`より
  2フレーム遅らせて追従させる(`{"partial": True}`で20f→22f、
  40f→42fにキーをずらす)、鼻先の二次揺れを追加する。
- **walk**: `neck`はgajiriと同じく胴の骨がほぼ水平を向く構成のため、
  honegarami/garudoのような`loc`接地沈みは見送る(gajiriの打ち直しと
  同じ判断理由)。現行の前後脚が交互に踏み出す動きは維持する。
- **die**: 現行の1f→10fの初動に`interp: LINEAR`を足して鋭さを出す。
  10f→24fの伸びきった姿勢のあと、24f以降にわずかな跳ね返り
  (`neck`をほんの少し戻す1キー)を追加する。
- squash & stretch: 骨(Skin)ベースの造形のため使わない。

## 対象外

- 骨格・造形そのものの変更(既存の.glbジオメトリはそのまま)
- 新規クリップの追加(5クリップ構成は変えない)

## 未決事項

- 具体的な角度・フレーム数の最終調整(実装時にプレビューで詰める)
