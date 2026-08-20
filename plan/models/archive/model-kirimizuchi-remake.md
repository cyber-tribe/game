# きりみずち(kirimizuchi)のアニメーション作り直し

## 経緯

plan/game/archive/animation-quality-guidelines.mdでパイロット5体
(garudo/purun/gajiri/honegarami/tsubute)に適用したタメ・ツメ・二次揺れの
規約を、この種族の骨格ファミリー(tsubute/gajiriと同じ`chest-head`
`chest-hip`の胴+腕(`armF`-`handF`)+脚(`kneeB`)構成)にも適用する。

## 現状

`build_kirimizuchi()`はtsubuteの関節構成を流用しつつ、ずんぐりした蛙とは
逆に縦に伸びて頭が前へ傾いだ道しるべのシルエットに作り直し済み。
`kirimizuchi_animations()`はidle 4キー、walk 4キー、attack 4キー
(タメ→ツメの2段止まりでオーバーシュートが無い)、hit 3キー、die 3キーの
素朴な往復のみで、`interp`・`partial`とも未使用。

## 打ち直しの方針

`head = "chest-head"`、`trunk = "chest-hip"`、`armL/armR = "chest-armF.L/R"`、
`foreL/foreR = "armF.L/R-handF.L/R"`、`legL/legR = "hip-kneeB.L/R"`を使う。

- **attack**(ranged、水弾を飛ばす主力): 現行の1→5(タメ)→10(放つ)→20(戻り)を、
  タメ(1→5、現行のまま)→放つ(5→8、3f、`interp: LINEAR`で`head`を
  現行の14°を18°まで、`armL/armR`を22°を26°まで鋭く突き出す)→
  行き過ぎ(8→10、注ぎ口が反動でわずかに引く。`head`を14°、`armL/armR`を
  20°へ戻す)→戻り(10→20、ゆっくり中立へ)の4段に分ける。
- **hit**: 1f目→4fの入りに`interp: LINEAR`を足して鋭さを強調する。
  ranged種族なので振幅・戻り時間(4f→14f)は現行どおり中程度に保つ。
- **idle**: 霧が渦を巻く漂いという方針を活かし、`foreL`/`foreR`
  (触手の先)だけ`armL`/`armRより2フレーム遅らせて追従させる
  (`{"partial": True}`で22f→24f、44f→46fにキーをずらす)、二次揺れを追加。
- **walk**: `trunk`(`chest-hip`)はgajiriと同じく胴の骨がほぼ水平
  (前後方向)を向く構成のため、honegarami/garudoのような`loc`接地沈みは
  見送る(gajiriの打ち直しと同じ判断理由)。現行の体ごと傾いで滑るような
  進み方はそのまま維持する。
- **die**: 現行の1f→12fの初動に`interp: LINEAR`を足して「実体を失う」
  崩れ始めの鋭さを出す。12f→26fの伸びきった姿勢のあと、26f以降に
  わずかな跳ね返り(`head`と`armL/armR`をほんの少し戻す1キー)を追加する。
- squash & stretch: 骨(Skin)ベースの造形で、骨・装甲系に近い硬さのため
  使わない。

## 対象外

- 骨格・造形そのものの変更(既存の.glbジオメトリはそのまま)
- 新規クリップの追加(5クリップ構成は変えない)

## 未決事項

- 具体的な角度・フレーム数の最終調整(実装時にプレビューで詰める)
