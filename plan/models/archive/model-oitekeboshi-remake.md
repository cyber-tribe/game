# オイテケボシ(oitekeboshi)のアニメーション作り直し

## 経緯

plan/game/archive/animation-quality-guidelines.mdでパイロット5体
(garudo/purun/gajiri/honegarami/tsubute)に適用したタメ・ツメ・二次揺れの
規約を、この種族の骨格ファミリー(`madoromi`と同じ`root`-`stem`-
`capbase`-`captop`の縦1本キノコ状構成)にも適用する。

## 現状

`build_oitekeboshi()`は`madoromi`と同じ関節構成をベースに、傘の縁に
星形の突起を並べ、口元に小さな牙を足した姿。`oitekeboshi_animations()`
は`lower = "root-stem"`、`upper = "stem-capbase"`、`top =
"capbase-captop"`を使い、idle 3キー(24f・48fでlower/upper/topが同時に
揺れる)・walk 5キー(lower/upperが左右に振れる)・attack 4キー(upper/top
が-14°/-10°まで引いてから+20°/+16°まで開く、大きく口を開けて吸い取る
動き)・hit 3キー・die 3キー(10f→24fの2段でlower/upperが崩れる)の構成で、
`partial`・`interp`とも未使用。`ranged`AI(range4)で、HPではなく満腹度を
削る特殊な攻め方をする(drainsSatiety、maxHp 30・atk 16・def 6、
minFloor 19)。

## 打ち直しの方針

`root`-`stem`-`capbase`-`captop`はいずれも脚・足首を持たない縦1本の
軸で、`madoromi`ファミリー共通の「幹をひねって進む」歩き方しかできない
(同じ骨格ファミリーの`honezukanotsukai`の打ち直しで確認済みの制約と
同じ)。踏み込む足という概念が無いため、歩行の接地沈みは適用しない。

- **attack**: 現行の「引く(5f、upper -14°/top -10°)→開く(10f、
  +20°/+16°)→戻る(20f)」の3段に、5f→10fの区間へ
  `{"interp": "LINEAR"}`を付けて、満腹度を吸い取る一瞬を鋭くする。
  行き過ぎ(10f直後、13f付近でupper +24°/top +19°まで一瞬余分に開く)を
  短く挟んでから20fで戻す4段構成にする。
- **hit**: 現行の`hit`(4f→14f、lower -16°/upper -14°)の入り(1f→4f)に
  `{"interp": "LINEAR"}`を足す。防御6・HP30という中堅相応の振幅・戻り
  時間は現行のまま維持する。
- **idle**: `top`(星形の傘の先端)を`upper`より2〜3フレーム遅らせる
  二次揺れが適用できる。現行idle(24f・48fの2キー)の24f地点の`top`の
  動き(2°)だけ`{"partial": True}`で26f地点に2フレーム遅らせ、漂う
  未練の先端がわずかに遅れて追従する揺れにする。
- **walk**: 上記のとおり脚を持たない構造のため、`loc`ベースの接地沈みは
  提案しない。現行walkの`lower`/`upper`が左右に振れるリズムはそのまま
  維持する。
- **die**: 現行の`die`(10f→24fの2段、lower/upperが大きく崩れて消える)の
  初動(1f→10f)に`{"interp": "LINEAR"}`を足し、未練が断ち切られる
  鋭さを出す。24f到達後、消える直前に`lower`がわずかに戻る小さな
  跳ね返りを1回追加する(honezukanotsukaiの「ほどけた骨が一度弾んでから
  崩れ落ちる」のと同じ考え方)。
- squash & stretch: キノコ状の芯を持つ剛体的な造形のため使わない。

## 対象外

- 骨格・造形そのものの変更(既存の.glbジオメトリはそのまま)
- 新規クリップの追加(5クリップ構成は変えない)

## 未決事項

- 具体的な角度・フレーム数の最終調整(実装時にプレビューで詰める)
