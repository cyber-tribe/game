# いしずえねずみ(ishizuenezumi)のアニメーション作り直し

## 経緯

plan/game/archive/animation-quality-guidelines.mdでパイロット5体
(garudo/purun/gajiri/honegarami/tsubute)に適用したタメ・ツメ・二次揺れの
規約を、この種族の骨格ファミリー(`gajiri`と同じ四つ足のねずみの関節
構成。`chest`-`hip`-`neck`-`snout`の胴、`tail1`-`tail2`-`tail3`の尻尾、
`ear.L,R`の耳、`hipF/hipB`-`footF/footB`の前後脚)にも適用する。

## 現状

`build_ishizuenezumi()`は`gajiri`と同じ関節の"種類"を踏襲しつつ、体高を
落として重心を低く、胴・脚を太くしてどっしり見せ、背に甲羅状のプレート
(`ishizue_shell`、静的メッシュ)を重ねた装甲質の表皮にしたもの。尻尾も
gajiriの長く跳ねる形から短く太い形に変えている。`ishizuenezumi_animations()`
は`neck`(`chest-neck`)・`snout`(`neck-snout`)・`t1,t2`(`hip-tail1`,
`tail1-tail2`)・`fL,fR`(`chest-hipF.L,R`)・`bL,bR`(`hip-hipB.L,R`)を使い、
idle 3キー(24f・48fでゆったり呼吸)・walk 5キー・attack 3キー(頭から
体当たり)・hit 3キー(振幅は`neck` 10°/`snout` 6°と控えめ)・die 2キー
の構成だが、gajiriの本家remakeで足された`partial`・`interp`が**どちらも
まだ未適用**(gajiriを打ち直す前の素朴な往復のままのスタイル)。
`ai: "guard"`(gajiriのcowardから配合で変化した性格、maxHp 24, atk 11,
def 9, minFloor: 無限大の配合限定種)で、「動じない」性格を反映して
`hit`の振幅はすでにgajiri本家より小さい。

## 打ち直しの方針

gajiri本家remakeとほぼ同じ処方をそのまま適用できる骨格・ボーン名だが、
guardらしい「動じなさ」を各段でgajiriより一段強める。

- **attack**: 現行の「タメ(5f、`neck` +18°/`snout` +10°/`t2` +16°)→
  突進(10f、`neck` -28°/`snout` -16°/`t2` -12°)→戻り(20f)」の3段の、
  5f→10fの区間へ`{"interp": "LINEAR"}`を付けて体当たりを鋭くする。
  行き過ぎとして10f直後(13f付近)に`neck`が-20°程度まで一瞬余分に
  振れる段を挟み、20fで正面に構えた低い姿勢に戻す。
- **hit**: 現行の`hit`(4f→14f、`neck` 10°/`t1` 8°)の入り(1f→4f)に
  `{"interp": "LINEAR"}`を足す。guardらしく「高い防御どおり、当たっても
  ほとんど動じない」読み味をさらに強めるため、振幅はgajiri本家(`neck`
  26°)よりさらに小さい現行値のまま据え置く。
- **idle**: `t1`(尻尾)を`neck`(首)より3フレーム遅らせる二次揺れが、
  gajiriと同じ関節構成のためそのまま適用できる。現行idle(24f・48fの
  2キー、`t1` 4°/`neck` -2°)の`t1`の動きだけ`{"partial": True}`で
  3フレーム遅らせ(27f・51f)、「短く太い尻尾がわずかに遅れて揺れる」
  二次揺れにする。guardらしく振幅・速度自体は現行のごく小さいまま。
- **walk**: `chest`(0, -0.02, 0.195)から`hip`(0, 0.20, 0.175)への
  `chest-hip`ボーンはほぼ水平(胴のローカルY軸が前後方向を向く)ため、
  **gajiri本家remake時の判断と同じ理由で接地沈み(`loc`)は見送る**。
  素直な沈み込み表現にならないため、現行walkの脚の踏み出しのみで
  「どっしりと地を踏みしめる」重さを表現する方針を維持する。
- **die**: 現行の`die`(10f→28fの2段、逃げ足だった頃とは違い最後まで
  踏みとどまってから力尽きる)の初動(1f→10f)に`{"interp": "LINEAR"}`を
  足す。28f到達後、`fL,fR`/`bL,bR`が一度小さく跳ね返ってから完全に
  崩れ落ちる段を追加する(gajiri本家の20f→24fの跳ね返りと同じ考え方)。
- squash & stretch: 甲羅状のプレートを重ねた装甲質の表皮のため使わない。

## 対象外

- 骨格・造形そのものの変更(既存の.glbジオメトリはそのまま)
- 新規クリップの追加(5クリップ構成は変えない)

## 未決事項

- 具体的な角度・フレーム数の最終調整(実装時にプレビューで詰める)
