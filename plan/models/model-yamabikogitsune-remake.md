# やまびこぎつね(yamabikogitsune)のアニメーション作り直し

## 経緯

plan/game/archive/animation-quality-guidelines.mdでパイロット5体
(garudo/purun/gajiri/honegarami/tsubute)に適用したタメ・ツメ・二次揺れの
規約を、この種族の骨格ファミリー(gajiriと同じ`chest-neck`の胴+前脚
(`hipF`)+後脚(`hipB`)+尾(`tail1`-`tail2`)構成)にも適用する。

## 現状

`build_yamabikogitsune()`はgajiriの関節構成をベースに、全体を細く
しなやかにし尾を長く張り出させて作り直し済み。`yamabikogitsune_animations()`
はidle 4キー(すでに`t1`/`t2`で尾を独立して動かす二次揺れ的な構造)、
walk 4キー、attack 4キー、hit 3キー、die 3キーで、`interp`・`partial`
とも未使用。

## 打ち直しの方針

`neck = "chest-neck"`、`snout = "neck-snout"`、`t1/t2 = "hip-tail1"/
"tail1-tail2"`、`fL/fR = "chest-hipF.L/R"`、`bL/bR = "hip-hipB.L/R"`
を使う。

- **attack**(ranged、頭を反らして声を放つ): 現行の1→6(タメ、6f)→12
  (放つ)→22(戻り)を、タメ(1→6、現行のまま)→放つ(6→9、3f、
  `interp: LINEAR`で`snout`を現行の-30°を-36°まで、`neck`を-22°を
  -26°まで鋭く反らせる)→行き過ぎ(9→12、`snout`18°、`neck`10°まで
  戻りかける、現行値を利用)→戻り(12→22、ゆっくり中立へ)の4段に分ける。
- **hit**: 1f→4fの入りに`interp: LINEAR`を足して鋭さを強調。ranged種族
  なので振幅・戻り時間(4f→14f)は現行どおり中程度に保つ。
- **idle**: 現行はすでに`t1`(1つ目の尾の骨)と`t2`(先端)を別々のタイミング
  (`t1`が-6〜6、`t2`が-8〜8で少しずれた周期)で動かしており、
  パイロットの二次揺れに近い発想になっている。この構造をさらに
  `{"partial": True}`で明示的に2フレーム遅らせる形に整理し、
  「首が動いてから尾が追従する」順序をはっきりさせる(現行は同時
  キーで暗黙的にずれているだけなので、実際に`t2`のキーを`t1`より
  2フレーム後ろへ移す)。
- **walk**: `fL/fR`・`bL/bR`はgajiriと同じく胴の骨(`chest-neck`)が
  ほぼ水平を向く構成のため、honegarami/garudoのような`loc`接地沈みは
  見送る(gajiriの打ち直しと同じ判断理由)。gajiriより長い脚を使った
  現行のしなやかな駆け足は維持する。
- **die**: 現行の1f→10fの初動に`interp: LINEAR`を足して鋭さを出す。
  10f→24fの伸びきった姿勢のあと、24f以降にわずかな跳ね返り
  (`neck`をほんの少し戻す1キー)を追加する。
- squash & stretch: 骨(Skin)ベースの造形のため使わない。

## 対象外

- 骨格・造形そのものの変更(既存の.glbジオメトリはそのまま)
- 新規クリップの追加(5クリップ構成は変えない)

## 未決事項

- 具体的な角度・フレーム数の最終調整(実装時にプレビューで詰める)
