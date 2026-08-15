# かたくなガニ(katakunagani)のアニメーション作り直し

## 経緯

plan/game/archive/animation-quality-guidelines.mdでパイロット5体
(garudo/purun/gajiri/honegarami/tsubute)に適用したタメ・ツメ・二次揺れの
規約を、この種族の骨格ファミリー(`gajiri`と同じ四つ足の関節構成。
`chest`-`hip`-`neck`-`snout`の胴、`tail1`-`tail2`-`tail3`の尻尾、
`ear.L,R`の耳、`hipF/hipB`-`footF/footB`の前後脚)にも適用する。

## 現状

`build_katakunagani()`は`gajiri`と同じ関節の"種類"を踏襲しつつ、体を
平たく幅広くしてカニらしい甲羅の輪郭にし、前脚(`hipF.L,R`)を太く大きく
して鋏(`katakuna_pincer`等、静的メッシュ)を掴ませ、耳と尻尾は
「カニらしからぬ」ため小さく切り詰めている。`katakunagani_animations()`
は`neck`(`chest-neck`)・`snout`(`neck-snout`)・`hipF_L,R`
(`chest-hipF.L,R`)・`hipB_L,R`(`hip-hipB.L,R`)を使い、idle 3キー(30f・
60fで意地を張ったまま身構える)・walk 3キー(`hipF`/`hipB`を左右逆位相に
振る、横滑りするような歩み)・attack 4キー(すでに「近づいて鋏でかすめ
取り4f→8f→身を引く16f」の3段構成)・hit 3キー・die 3キー(`neck`/
`hipF.L,R`が持ち上がりながら崩れる)の構成だが、`partial`・`interp`とも
未使用。`ai: "thief"`(minFloor 21, maxHp 20, atk 15, def 8)で、
アイテムを奪って離脱する挙動を持つ。

## 打ち直しの方針

- **attack**: 現行の「タメ(4f、`neck` -12°/`hipF.L,R` -22°/+12°)→
  スナッチ(8f、`neck` +16°/`hipF.L,R` +24°/-8°)→戻り(16f)」の3段の、
  4f→8fの区間へ`{"interp": "LINEAR"}`を付けて「素早く近づいて鋏で
  かすめ取る」瞬間を鋭くする。行き過ぎとして8f直後(11f付近)に
  `hipF.L,R`が+30°程度まで一瞬余分に引かれる段を挟み、18fで「意地を
  張ったまま身を引いた」構えに戻す(現行16fからやや延長)。thiefらしく
  タメ自体は短く、スナッチの一瞬に緩急を集中させる。
- **hit**: 現行の`hit`(4f→12f、`neck` 14°/`hipF.L,R` ±8°)の入り
  (1f→4f)に`{"interp": "LINEAR"}`を足す。防御力8は高くないため、
  振幅・戻り時間とも現行程度を維持する。
- **idle**: 現行idle(30f・60fの2キー、`neck` 2°/`hipF.L,R` ±3°が同時に
  動く)に対し、`tail1`(`hip-tail1`、切り詰めた短い尻尾)を`neck`より
  3フレーム遅らせる二次揺れが、gajiriと同じ関節構成のため適用できる。
  短い尻尾なりの小さな振幅(±5°程度)で`{"partial": True}`により
  3フレーム遅らせ(33f・63f)、「意固地に身構えたまま、切り詰めた尻尾
  だけがわずかに遅れて揺れる」動きにする。
- **walk**: `chest`(0, -0.03, 0.145)から`hip`(0, 0.13, 0.135)への
  `chest-hip`ボーンはほぼ水平(gajiri本家と同じ、胴のローカルY軸が
  前後方向を向く)ため、**gajiri本家remake時の判断と同じ理由で接地沈み
  (`loc`)は見送る**。現行walkはそもそも脚を左右逆位相に振る横滑りの
  歩みで、カニらしい「すばやく横滑りするように進む」動きのため、
  沈み込みを足すと不自然になる点でも見送りが妥当。
- **die**: 現行の`die`(8f→18fの2段、`neck`/`hipF.L,R`が持ち上がりながら
  崩れる)の初動(1f→8f)に`{"interp": "LINEAR"}`を足す。18f到達後、
  `hipF.L,R`/`neck`が一度小さく跳ね返ってから完全に力尽きる段
  (22f付近)を追加する(gajiri本家の20f→24fの跳ね返りと同じ考え方)。
- squash & stretch: 甲羅を持つ装甲質の造形のため使わない。

## 対象外

- 骨格・造形そのものの変更(既存の.glbジオメトリはそのまま)
- 新規クリップの追加(5クリップ構成は変えない)

## 未決事項

- 具体的な角度・フレーム数の最終調整(実装時にプレビューで詰める)
