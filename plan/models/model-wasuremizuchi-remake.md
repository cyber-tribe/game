# わすれみずち(wasuremizuchi)のアニメーション作り直し

## 経緯

plan/game/archive/animation-quality-guidelines.mdでパイロット5体
(garudo/purun/gajiri/honegarami/tsubute)に適用したタメ・ツメ・二次揺れの
規約を、この種族の骨格ファミリー(tsubute/gajiriと同じ`chest-head`
`chest-hip`の胴+腕(`armF`)+脚(`kneeB`-`ankleB`)構成)にも適用する。

## 現状

`build_wasuremizuchi()`はtsubuteの関節構成をベースに、実体の薄い今にも
消えそうな小柄で華奢なシルエットに作り直し済み。`wasuremizuchi_animations()`
はidle 4キー(小刻みで落ち着かない待機)、walk 5キー、attack 4キー、
hit 3キー、die 3キーで、`interp`・`partial`とも未使用。

## 打ち直しの方針

`head = "chest-head"`、`trunk = "chest-hip"`、`armL/armR = "chest-armF.L/R"`、
`legL/legR = "hip-kneeB.L/R"`、`shinL/shinR = "kneeB.L/R-ankleB.L/R"`を使う。

- **attack**(coward、怯えながら一瞬だけ突く): 現行の1→4(タメ)→8(突く)→16
  (戻り)を、タメ(1→4、現行のまま)→突く(4→6、2f、`interp: LINEAR`で
  `armL/armR`を現行の-30/-30を-36/-36まで鋭く突き出す)→行き過ぎ(6→8、
  すぐ引く性質どおり`armL/armR`を14/14まで戻りかける、現行の値を利用)→
  戻り(8→16、ゆっくり中立へ)の4段に分ける。coward種族らしく「当てたら
  すぐ引く」素早さは維持する。
- **hit**: 現行の3fの入り(1→3、鋭い仰け反り)に`interp: LINEAR`を追加。
  cowardらしく振幅(`trunk`-16、`head`18、`armL/armR`20)は現行どおり
  大きめに保ち、戻り(3f→12f)はゆっくりのまま。「すぐさま深みへ逃げ込む」
  性格を強める。
- **idle**: 現行の4キー(小刻みで落ち着かない、`head`と`armL/armR`が
  同時に動く)構造を維持しつつ、`armL`/`armR`を`head`より2フレーム
  遅らせて追従させる(`{"partial": True}`で10f→12f、20f→22fにキーを
  ずらす)、怯えて落ち着かない体の二次揺れを追加する。
- **walk**: `trunk`(`chest-hip`)はgajiriと同じく胴の骨がほぼ水平を向く
  構成のため、honegarami/garudoのような`loc`接地沈みは見送る(gajiriの
  打ち直しと同じ判断理由)。逃げ足の速さを感じさせる素早い跳ねは維持する。
- **die**: 現行の1f→10fの初動に`interp: LINEAR`を足して「霧に溶ける」
  崩れ始めの鋭さを出す。10f→22fでしゃがみ込んだ姿勢のあと、22f以降に
  わずかな跳ね返り(`head`をほんの少し戻す1キー)を追加する。
- squash & stretch: 骨(Skin)ベースの造形のため使わない。

## 対象外

- 骨格・造形そのものの変更(既存の.glbジオメトリはそのまま)
- 新規クリップの追加(5クリップ構成は変えない)

## 未決事項

- 具体的な角度・フレーム数の最終調整(実装時にプレビューで詰める)
