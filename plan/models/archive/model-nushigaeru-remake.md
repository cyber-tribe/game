# ヌシガエル(nushigaeru)のアニメーション作り直し

## 経緯

plan/game/archive/animation-quality-guidelines.mdでパイロット5体
(garudo/purun/gajiri/honegarami/tsubute)に適用したタメ・ツメ・二次揺れの
規約を、この種族の骨格ファミリー(`tsubute`と同じ`hip`/`chest`/`head`/
`armF.L,R`/`handF.L,R`/`kneeB.L,R`/`ankleB.L,R`/`footB.L,R`の四肢構成)にも
適用する。

## 現状

`build_nushigaeru()`は`tsubute`と同じ関節構成をベースに、並より一回り
大きな図体(hip半径0.225・chest半径0.24)、石つぶてを溜め込む大きな
喉袋、いぼを足した第二地方ボスの姿。`nushigaeru_animations()`は
`head = "chest-head"`、`armL,R = "chest-armF.L,R"`、`legL,R =
"hip-kneeB.L,R"`を使い、idle 3キー(1f/36f/72fでheadがわずかに動くだけの
息づかい)・walk 3キー(legL,R/armL,Rを左右交互に振るだけ)・attack 4キー
(headが-18°まで引いてから+26°まで振れて戻る、喉袋を膨らませて吐き出す
動き)・hit 3キー・die 3キー(10f→24fの2段でheadとlegL,Rが沈み込む)の
構成で、`partial`・`interp`とも未使用。`ranged`AI(range4)、HPが半分を
切ると深みタイルに身を潜める2フェーズ制のボス(maxHp 68・atk 20・def 8、
bossTelegraphはmultiplier 2・activateBelowHpRatio 0.5)。

## 打ち直しの方針

`chest-hip`の関節(chest: y=-0.068, z=0.257 / hip: y=0.135, z=0.23)は
Y方向の差(0.203)がZ方向の差(0.027)よりずっと大きく、ほぼ水平に
寝ている。パイロットのgajiriで「胴の骨がほぼ水平のため接地沈みを
見送った」のと同じ構造のため、歩行の接地沈みはここでも見送る。

- **attack**: 現行の「引く(6f、head -18°)→吐き出す(12f、+26°)→
  戻る(22f)」の3段を、タメ(1→6f、ゆっくりheadを-20°まで引いて喉袋を
  膨らませる)→ツメ(6→9f、LINEARでheadを+34°まで鋭く弾き、石つぶてを
  吐く)→行き過ぎ(9→11f、+38°まで一瞬余分に振れる)→戻り(11→22f、
  ゆっくり構えに戻る)の4段に分ける。
- **hit**: bossなので振幅は小さく、のけぞりは短く鋭くする。現行の
  「4f→14f、head +16°・armL,R ∓14/12」を、1f→3fにLINEARを付けた
  鋭い入り、振幅をhead +11°・armL,R ∓9/8まで小さくし、戻りも12fに
  詰める。
- **idle**: 末端の腕(armF.L,R)を頭(head)より3フレーム遅らせて追従
  させる(gajiriの尻尾遅延と同じ考え方)。現行idle(36f地点でheadが
  わずかに動く1キー)に対し、armL,Rの動き(±2°程度)だけ`{"partial":
  True}`で39f地点に3フレーム遅らせて足す。
- **walk**: 上記のとおり`chest-hip`が水平な構造のため、`loc`ベースの
  接地沈みは適用しない。現行の脚・腕を左右交互に振るリズムはそのまま
  維持する。
- **die**: 現行の`die`(10f→24fの2段、headとlegL,Rが沈み込む)の初動
  (1f→10f)に`{"interp": "LINEAR"}`を足し、沈み込みの始まりを鋭くする。
  24f付近の主たる崩れ(head +16°、legL,R ∓46)の後、28f付近に一度だけ
  小さく浮き上がって沈み直す跳ね返り(head +13°、legL,R ∓42程度)を
  追加する。
- squash & stretch: 骨格を持つ蛙型の造形のため使わない。

## 対象外

- 骨格・造形そのものの変更(既存の.glbジオメトリはそのまま)
- 新規クリップの追加(5クリップ構成は変えない)

## 未決事項

- 具体的な角度・フレーム数の最終調整(実装時にプレビューで詰める)
