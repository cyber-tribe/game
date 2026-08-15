# モヤウツボ(moyautsubo)のアニメーション作り直し

## 経緯

plan/game/archive/animation-quality-guidelines.mdでパイロット5体
(garudo/purun/gajiri/honegarami/tsubute)に適用したタメ・ツメ・二次揺れの
規約を、この種族の骨格ファミリー(`tsubute`と同じ関節構成`hip`-`chest`-
`head`、`armF.L,R`-`handF.L,R`、`kneeB.L,R`-`ankleB.L,R`-`footB.L,R`)にも
適用する。

## 現状

`build_moyautsubo()`は`tsubute`と同じ関節の"種類"を踏襲しつつ、頭から
しっぽへ引き伸ばして高さを削り、周囲に溶け込む平たく低いウツボの
シルエットに作り替えたもの。`moyautsubo_animations()`は`head`
(`chest-head`)・`armL,R`(`chest-armF.L,R`)・`legL,R`(`hip-kneeB.L,R`)を
使い、idle 3キー(40f・80fの長い周期でほとんど動かず潜む)・walk 3キー・
attack 4キー(1f中立→4f`head` -18°の溜め→7f`head` +28°の初撃→16f戻り、
まだタメ→ツメ→戻りの3段で行き過ぎが無い)・hit 3キー(`head` 14°/
`armL,R` ∓10°/8°、4f→12fの8f戻り)・die 3キー(`head`/`legL,R`が
広がりながら消える2段)の構成だが、`partial`・`interp`とも未使用。
`ai: "ambush"`(隣接するまで気配を消す。maxHp 24, atk 15, def 6, exp 22,
minFloor 7)。

## 打ち直しの方針

- **attack**: 現行の「溜め(4f、`head` -18°)→初撃(7f、`head` +28°)→
  戻り(16f)」に、4f→7fの区間へ`{"interp": "LINEAR"}`を付けて「油断した
  ところへ強く叩き込む」鋭さを出す。7f直後(9f付近)に`head`が+34°程度
  まで一瞬余分に伸びる行き過ぎの段を挟み、16fで気配を消した構えに戻す。
- **hit**: 現行の`hit`(4f→12f、`head` 14°/`armL,R` ∓10°/8°)の入り
  (1f→4f)に`{"interp": "LINEAR"}`を足す。ambush AIはguard/cowardの
  どちらでもないため、振幅・戻り時間とも現行のまま(tsubute本家より
  一回り小さい程度)維持する。
- **idle**: 現行idle(40f・80fの長い周期で`head`が2°だけ動く、ほぼ静止)は
  「隣接するまで気配を消す」性質を表す意図的な簡素さのため、大きく
  作り込みすぎない。ただし`armL,R`(前脚)を`head`より2〜3フレーム
  遅らせる、tsubute本家と同じ二次揺れの型は適用できる。`head`の動き
  (40f地点)に合わせ、`armL,R`が極小(±1〜2°程度)だけ`{"partial": True}`
  で2〜3フレーム遅らせて追従する動きを足し、「霧の房がわずかに遅れて
  なびく」控えめな揺れにする(現行の静けさを壊さない範囲にとどめる)。
- **walk**: `chest`(0, -0.06, 0.10)から`hip`(0, 0.12, 0.09)への
  `chest-hip`ボーンはほぼ水平(tsubute本家と同じ、胴のローカルY軸が
  前後方向を向く)ため、**tsubute本家remake時の判断と同じ理由で接地沈み
  (`loc`)は見送る**。現行walk(9f・18fで音も無く這うように進む)の
  テンポのみでambushらしい静けさを表現する方針を維持する。
- **die**: 現行の`die`(9f→20fの2段)の初動(1f→9f)に
  `{"interp": "LINEAR"}`を足す。20f到達後、`legL,R`/`armL,R`が一度
  わずかに戻る揺り戻しを1回追加して「着地後の小さな跳ね返り」を
  表現する。
- squash & stretch: 骨組みに沿った剛体的な変形の造形(骨・関節を持つ
  ウツボ型)であり、スライム状の柔構造ではないため使わない。

## 対象外

- 骨格・造形そのものの変更(既存の.glbジオメトリはそのまま)
- 新規クリップの追加(5クリップ構成は変えない)

## 未決事項

- 具体的な角度・フレーム数の最終調整(実装時にプレビューで詰める)
