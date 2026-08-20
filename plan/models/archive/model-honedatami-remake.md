# ホネダタミ(honedatami)のアニメーション作り直し

## 経緯

plan/game/archive/animation-quality-guidelines.mdでパイロット5体
(garudo/purun/gajiri/honegarami/tsubute)に適用したタメ・ツメ・二次揺れの
規約を、この種族の骨格ファミリー(`honegarami`と同じ人型骨組みの"種類"。
hip/chest/neck/head/crown、shoulder-elbow-hand、thigh-knee-foot)にも
適用する。

## 現状

`build_honedatami()`は`honegarami`と同じ関節の"種類"を踏襲しつつ、座標を
guardらしく低く幅広く作り直したもの(全高は`honegarami`の約6割、四肢は
太く短い)。剣を持たせず素手のまま、背中・胸・頭上に骨板を重ねて
「積み重なった記憶の重み」を表す。`honedatami_animations()`は`hipc`/
`neck`/`armL,R`/`foreL,R`/`legL,R`/`shinL,R`を使い、idle 3キー(60fかけて
ごく僅かに軋むだけ)・walk 5キー・attack 4キー(両腕をまとめて叩きつける
体当たり)・hit 3キー・die 2キーの構成だが、`partial`・`interp`とも未使用。
guardらしい「どっしり構えて動じない」性格づけはすでに動きの振幅に
反映されている(maxHp 56, atk 22, def 20, ai: guard)。

## 打ち直しの方針

- **attack**: 現行の「タメ(7f、armL/R -30°)→振り下ろし(13f、+48°)→
  戻り(24f)」の3段構成に、7f→13fの区間へ`{"interp": "LINEAR"}`を付けて
  鋭く叩きつける。剣を持たない体当たりのため行き過ぎの余韻は小さめに
  (13f直後、armL/Rが+56°付近まで一瞬余分に振れる程度)留め、24fで
  素手のまま構えに戻る。
- **hit**: 現行の`hit`(4f→15f、hipc -6°/neck -8°)の入り(1f→4f)に
  `{"interp": "LINEAR"}`を足す。振幅・戻り時間は現行のまま(guardの
  高い防御力どおり小さく短く)維持する。
- **idle**: 尻尾・耳のような末端ボーンは無いが、`neck`(頭)を`hipc`
  (胴)より2〜3フレーム遅らせる二次揺れが適用できる。現行idle(30f・60f
  の2キー)の30f地点の`neck`の動き(2°)だけ`{"partial": True}`で3フレーム
  遅らせ(33f)、「積まれた頭が本体よりわずかに遅れて軋む」揺れにする。
  guardらしく振幅・速度自体は現行のごく小さいままにする。
- **walk**: `hip`(z=0.145)→`chest`(z=0.275)→`neck`(z=0.360)と垂直に
  伸びるスパインを持つ二足立ちのため、honegarami/garudoと同じ接地沈みが
  適用できる。現行walk(12f・34fで脚が正中に戻る瞬間)に
  `hipc: {"loc": (0, -0.006, 0)}`を足す。ただしguardの「重い塊がのろのろ
  引きずられる」歩みという現行の作り込みに合わせ、honegaramiより沈みは
  さらに小さく(honegaramiの-0.010に対し-0.006程度)抑える。
- **die**: 現行の`die`(9f→26fの2段、骨の山がそのまま崩れ落ちる)の初動
  (1f→9f)に`{"interp": "LINEAR"}`を足す。26f到達後、積まれていた骨板が
  一度弾んでから完全に崩れ落ちる、小さな跳ね返りを1回追加する。
- squash & stretch: 骨・骨板でできた硬い造形であり、スライム状の柔構造
  ではないため使わない。

## 対象外

- 骨格・造形そのものの変更(既存の.glbジオメトリはそのまま)
- 新規クリップの追加(5クリップ構成は変えない)

## 未決事項

- 具体的な角度・フレーム数の最終調整(実装時にプレビューで詰める)
