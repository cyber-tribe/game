# なきむし(nakimushi)のアニメーション作り直し

## 経緯

plan/game/archive/animation-quality-guidelines.mdでパイロット5体
(garudo/purun/gajiri/honegarami/tsubute)に適用したタメ・ツメ・二次揺れの
規約を、この種族の骨格ファミリー(`tsubute`と同じ関節構成`hip`-`chest`-
`head`、`armF.L,R`-`handF.L,R`、`kneeB.L,R`-`ankleB.L,R`-`footB.L,R`)にも
適用する。

## 現状

`build_nakimushi()`は`tsubute`と同じ関節の"種類"を踏襲しつつ、群れの1体分
として簡略化した小さなシルエットに縮めたもの(species.tsのコメントは
「tsubuteモデルを流用する」とあるが、実際には`build_nakimushi()`/
`nakimushi_animations()`という専用の関節座標・専用アニメーションを持つ、
tsubuteと同じ関節構成の別モデル)。`nakimushi_animations()`は`head`
(`chest-head`)・`armL,R`(`chest-armF.L,R`)・`legL,R`(`hip-kneeB.L,R`)を
使い、idle 5キー(1・6・12・18・24fで`head`5°/`armL,R`∓6°の震えを2回
繰り返す、しゃくり上げる演出)・walk 3キー・attack 4キー(1f中立→5f
溜め→10f`head` 14°の泣き声→18f戻り)・hit 3キー・die 3キー(体が
しぼんで消える2段)の構成だが、`partial`・`interp`とも未使用。
`ai: "swarm"`(群れで行動。倒されるたび攻撃力が上がる案は未実装。
maxHp 16, atk 13, def 5, exp 18, minFloor 25)。

## 打ち直しの方針

- **attack**: 現行の「溜め(5f、`head` -18°/`armL,R` ∓14°/10°)→
  泣き声(10f、`head` 14°/`armL,R` 10°/-8°の反り返り)→戻り(18f)」に、
  5f→10fの区間へ`{"interp": "LINEAR"}`を付けて精一杯泣き声を上げる
  瞬発力を鋭くする。10f直後(12f付近)に`head`が18°程度まで一瞬余分に
  反り返る行き過ぎの段を挟み、18fで戻す。
- **hit**: 現行の`hit`(4f→12f、`head` 16°/`armL,R` ∓10°/12°)の入り
  (1f→4f)に`{"interp": "LINEAR"}`を足す。swarm AIはguard/cowardの
  どちらでもないため、振幅・戻り時間とも現行のまま維持する。
- **idle**: 現行idle(6f・12f・18f・24fで震えを2回繰り返す、すでに
  しゃくり上げるような小刻みな往復)に対し、`armL,R`を`head`より1〜2
  フレーム遅らせる二次揺れを追加する。群れの小さな個体なので、
  gajiri/tsubuteの2〜3フレーム遅れよりさらに詰めた1〜2フレームにして
  「小さく素早い震え」を保つ。`head`の各ピーク(6f・18f)に対し
  `armL,R`を1〜2フレーム遅らせて`{"partial": True}`で追従させる。
- **walk**: `chest`(0, -0.03, 0.115)から`hip`(0, 0.06, 0.10)への
  `chest-hip`ボーンはほぼ水平(tsubute本家と同じ、胴のローカルY軸が
  前後方向を向く)ため、**tsubute本家remake時の判断と同じ理由で接地沈み
  (`loc`)は見送る**。現行walk(7f・14fのZひねり主体の小走り)のテンポ
  のみを維持する。
- **die**: 現行の`die`(9f→20fの2段)の初動(1f→9f)に
  `{"interp": "LINEAR"}`を足す。「声を上げきったように、体がしぼんで
  消える」という現行の演出は維持しつつ、20f到達後に`legL,R`がごく
  わずかに広がる方向へ揺り戻る段を1回追加し、「着地後の小さな
  跳ね返り」を表現する。
- squash & stretch: 骨組みに沿った剛体的な変形の造形であり、スライム状の
  柔構造ではないため使わない。

## 対象外

- 骨格・造形そのものの変更(既存の.glbジオメトリはそのまま)
- 新規クリップの追加(5クリップ構成は変えない)
- species.tsのコメント「tsubuteモデルを流用する」の記述修正
  (このセッションはmd計画のみを扱うため、コードコメントの訂正は
  実装セッションの対象外事項として扱う)

## 未決事項

- 具体的な角度・フレーム数の最終調整(実装時にプレビューで詰める)
