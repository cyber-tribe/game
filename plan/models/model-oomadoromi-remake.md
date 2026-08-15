# オオマドロミ(oomadoromi)のアニメーション作り直し

## 経緯

plan/game/archive/animation-quality-guidelines.mdでパイロット5体
(garudo/purun/gajiri/honegarami/tsubute)に適用したタメ・ツメ・二次揺れの
規約を、この種族の骨格ファミリー(`madoromi`と同じ`root`-`stem`-
`capbase`-`captop`の縦1本キノコ状構成)にも適用する。

なお`plan/models/archive/model-oomadoromi.md`は造形そのものの制作計画
(実装済み)であり、本ファイルはそのアニメーションだけを対象にした
打ち直し計画になる。

## 現状

`build_oomadoromi()`は`madoromi`と同じ関節構成をベースに全体を
およそ1.4倍に拡大し、がっしりした太い軸(root半径0.165)と大きく
張り出した傘(capbase半径0.375)を持つ第三地方ボスの姿。
`oomadoromi_animations()`は`stem = "root-stem"`、`cap =
"stem-capbase"`、`top = "capbase-captop"`を使い、idle 3キー(1f/36f/72f
でstem/capがわずかに動くだけ)・walk 5キー(stem/capを左右に振って歩く)
・attack 4キー(stem/cap/topが-12°/-16°/-12°まで引いてから+20°/+28°/+22°
まで叩きつける、「正面へ全身で叩きつける」動き)・hit 3キー・die 3キー
(10f→24fの2段でstem/capが崩れる)の構成で、`partial`・`interp`とも
未使用。`melee`AI、maxHp 82・atk 22・def 12、bossTelegraphは
effect: aoeSleep(自分のいる部屋全体への睡眠放出)。

## 打ち直しの方針

`root`-`stem`-`capbase`-`captop`はいずれも脚・足首を持たない縦1本の
軸で、`madoromi`ファミリー共通の「幹をひねって進む」歩き方しかできない
(同じ骨格ファミリーの`honezukanotsukai`の打ち直しで確認済みの制約と
同じ)。踏み込む足という概念が無いため、歩行の接地沈みは適用しない
(現行walkコメントの「太い軸を踏みしめ」る重さの表現は、`loc`ではなく
`stem`/`cap`の振れ幅の大きさで表す方針を維持する)。

- **attack**: 現行の「引く(6f、stem -12°/cap -16°/top -12°)→叩きつける
  (12f、+20°/+28°/+22°)→戻る(24f)」の3段に、6f→12fの区間へ
  `{"interp": "LINEAR"}`を付けて、全身で叩きつける瞬間を鋭くする。
  行き過ぎ(12f直後、15f付近でstem +24°/cap +33°/top +26°まで一瞬
  余分に振れる)を短く挟んでから24fで戻す4段構成にする。ボス級の
  重さを保つため、フレーム間隔自体はパイロットのhonegaramiより
  やや長めに保つ。
- **hit**: bossなので振幅は小さく、のけぞりは短く鋭くする。現行の
  「4f→14f、stem -16°/cap -14°」を、1f→3fにLINEARを付けた鋭い入り、
  振幅をstem -11°/cap -9°まで小さくし、戻りも11fに詰める。
- **idle**: `top`(傘の頂の斑点部分)を`cap`より2〜3フレーム遅らせる
  二次揺れが適用できる。現行idle(36f・72fの2キー)の36f地点の`cap`の
  動き(-2°)に対応する`top`の動き(-1.5°程度)だけ`{"partial": True}`で
  38f地点に2フレーム遅らせ、大きな傘の先がわずかに遅れて追従する
  揺れにする。
- **walk**: 上記のとおり脚を持たない構造のため、`loc`ベースの接地沈みは
  提案しない。現行walkの`stem`/`cap`が左右に振れるリズムはそのまま
  維持する。
- **die**: 現行の`die`(10f→24fの2段、stem/capが大きく崩れて消える)の
  初動(1f→10f)に`{"interp": "LINEAR"}`を足し、根が崩れ落ちる鋭さを
  出す。24f到達後、崩れきる直前に`stem`がわずかに戻る小さな跳ね返りを
  1回追加する(honezukanotsukaiの「ほどけた骨が一度弾んでから崩れ
  落ちる」のと同じ考え方)。
- squash & stretch: キノコ状の芯を持つ剛体的な造形のため使わない
  (`purun`系のような骨・装甲を持たないスライム状の造形ではない)。

## 対象外

- 骨格・造形そのものの変更(既存の.glbジオメトリはそのまま)
- 新規クリップの追加(5クリップ構成は変えない)

## 未決事項

- 具体的な角度・フレーム数の最終調整(実装時にプレビューで詰める)
