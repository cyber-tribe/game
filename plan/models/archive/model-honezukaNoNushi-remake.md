# ホネヅカのぬし(honezukaNoNushi)のアニメーション作り直し

## 経緯

plan/game/archive/animation-quality-guidelines.mdでパイロット5体
(garudo/purun/gajiri/honegarami/tsubute)に適用したタメ・ツメ・二次揺れの
規約を、この種族の骨格ファミリー(`honegarami`・`honedatami`と同じ人型
骨組みの"種類"。hip/chest/neck/head/crown、shoulder-elbow-hand、
thigh-knee-foot)にも適用する。

## 現状

`build_honezukaNoNushi()`は`honegarami`・`honedatami`と同じ人型骨組みを
ボスらしく一回り太く大きく育てたもの(hip半径0.165・chest半径0.182など、
honedatamiよりさらに太い)。まだ形を保った小さな頭蓋骨を肩・胸・背に
複数めり込ませ、「無数の古い記憶が寄り集まってひとつの巨体を成した」姿
にしている。`honezukaNoNushi_animations()`は`hipc`/`neck`/`armL,R`/
`foreL,R`/`legL,R`/`shinL,R`を使い、idle 3キー・walk 4キー・attack 4キー
(両腕まとめての体当たり)・hit 3キー・die 3キーの構成で、`honedatami`と
ほぼ同じ形の振り付け(体当たりattack、防御特化の小さなhit)だが、
`partial`・`interp`とも未使用。第四地方(骨積みの回廊)ボス
(`isRegionBoss: true`, maxHp 96, atk 24, def 40, ai: melee)。

## 打ち直しの方針

`honedatami`の打ち直し方針を、ボスとしてさらに重く・より動じない方向に
拡張する形にする。

- **attack**: 現行の「タメ(7f、armL/R -32°)→振り下ろし(13f、+52°)→
  戻り(24f)」の3段構成に、7f→13fの区間へ`{"interp": "LINEAR"}`を付けて
  鋭く叩きつける。巨体の質量を感じさせるため、13f直後に行き過ぎ
  (armL/Rが+60°付近まで一瞬余分に振れる)を1段挟んでから24fで戻す
  4段構成にする。`hipc`の踏み込み(-10°/+14°)もLINEARの区間に合わせる。
- **hit**: 現行の`hit`(4f→15f、hipc -6°/neck -8°)の入り(1f→4f)に
  `{"interp": "LINEAR"}`を足すのみに留める。def 40という全モンスター中
  でも屈指の防御力どおり、振幅・戻り時間とも現行の小ささをそのまま
  維持し、honedatamiよりさらにわずかに短く(戻りを15f→13f程度に)して
  「ほとんど揺るがない」を徹底する。
- **idle**: 末端ボーンは無いが、`neck`(頭。主頭蓋+複数の埋もれた頭蓋
  からなる塊)を`hipc`(胴)より2〜3フレーム遅らせる二次揺れが適用できる。
  現行idle(32f・64fの2キー)の32f地点の`neck`の動き(2°)を
  `{"partial": True}`で3フレーム遅らせ(35f)、寄せ集まった頭部の塊が
  本体よりわずかに遅れて軋む揺れにする。
- **walk**: `hip`(z=0.335)→`chest`(z=0.560)→`neck`(z=0.690)と垂直に
  伸びるスパインを持つ二足立ちのため、honegarami/honedatamiと同じ接地
  沈みが適用できる。現行walk(12f・34fで脚が正中に戻る瞬間)に
  `hipc: {"loc": (0, -0.006, 0)}`を足す。honedatamiと同程度の小さな
  沈みに留め、「積み重なった巨体を引きずるような、重く遅い歩み」という
  現行の作り込みを壊さない。
- **die**: 現行の`die`(10f→28fの2段、寄せ集まっていた記憶の塊が支えを
  失って崩れ落ちる)の初動(1f→10f)に`{"interp": "LINEAR"}`を足す。28f
  到達後、複数の頭蓋骨が一度ばらけて弾んでから完全に崩れ落ちる、
  小さな跳ね返りを1回追加する。
- squash & stretch: 骨・頭蓋骨でできた硬い造形であり、スライム状の
  柔構造ではないため使わない。

## 対象外

- 骨格・造形そのものの変更(既存の.glbジオメトリはそのまま)
- 新規クリップの追加(5クリップ構成は変えない)

## 未決事項

- 具体的な角度・フレーム数の最終調整(実装時にプレビューで詰める)
