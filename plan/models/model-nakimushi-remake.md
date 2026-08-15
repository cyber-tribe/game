# なきむし(nakimushi)のアニメーション作り直し

## 経緯

plan/game/archive/animation-quality-guidelines.mdでパイロット5体
(garudo/purun/gajiri/honegarami/tsubute)に適用したタメ・ツメ・二次揺れの
規約を、この種族の骨格ファミリー(tsubute/gajiriと同じ`chest-head`
`chest-hip`の胴+腕(`armF`)+脚(`kneeB`)構成)にも適用する。

## 現状

`build_nakimushi()`はtsubuteの関節構成を、群れの1体分として簡略化した
小さなシルエットに縮めて作り直し済み。`nakimushi_animations()`はidle 5キー
(しゃくり上げる小刻みな震え)、walk 3キー、attack 4キー、hit 3キー、
die 3キーで、`interp`・`partial`とも未使用。

## 打ち直しの方針

`head = "chest-head"`、`armL/armR = "chest-armF.L/R"`、
`legL/legR = "hip-kneeB.L/R"`を使う。

- **attack**(swarm、精一杯泣き声を上げる): 現行の1→5(タメ、5f)→10
  (振り絞る)→18(戻り)を、タメ(1→5、現行のまま)→振り絞る(5→7、2f、
  `interp: LINEAR`で`head`を現行の14°を18°まで鋭く反らせる)→行き過ぎ
  (7→10、`head`を10°まで戻りかける、`armL/armR`もわずかに緩む)→戻り
  (10→18、ゆっくり中立へ)の4段に分ける。swarmの小さな個体らしく振り幅
  自体は控えめのまま。
- **hit**: 1f→4fの入りに`interp: LINEAR`を足して鋭さを強調。非力な
  swarm個体なので振幅は現行どおり中程度、戻り(4f→12f)はゆっくりのまま。
- **idle**: 現行のしゃくり上げる小刻みな震え(6キー間隔で往復)自体が
  すでに神経質な性格づけになっているため、この構造は維持しつつ、
  `armL`/`armRを`head`より1フレーム遅らせて追従させる(`{"partial": True}`
  で6f→7f、18f→19fにキーをずらす)、震えに巻き込まれる腕の二次揺れを
  ごく小さく追加する。
- **walk**: `head`はtsubute/gajiriと同じく胴の骨がほぼ水平を向く構成の
  ため、honegarami/garudoのような`loc`接地沈みは見送る(gajiriの
  打ち直しと同じ判断理由)。現行の左右の脚・腕が交互に振れる小走りは
  維持する。
- **die**: 現行の1f→9fの初動に`interp: LINEAR`を足して鋭さを出す。
  9f→20fでしぼみきった姿勢のあと、20f以降にわずかな跳ね返り
  (`head`をほんの少し戻す1キー)を追加する。
- squash & stretch: 骨(Skin)ベースの造形のため使わない。

## 対象外

- 骨格・造形そのものの変更(既存の.glbジオメトリはそのまま)
- 新規クリップの追加(5クリップ構成は変えない)

## 未決事項

- 具体的な角度・フレーム数の最終調整(実装時にプレビューで詰める)
