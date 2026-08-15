# なみだぐま(namidaguma)のアニメーション作り直し

## 経緯

plan/game/archive/animation-quality-guidelines.mdでパイロット5体
(garudo/purun/gajiri/honegarami/tsubute)に適用したタメ・ツメ・二次揺れの
規約を、この種族の骨格ファミリー(`tsubute`と同じ関節構成`hip`-`chest`-
`head`、`armF.L,R`-`handF.L,R`、`kneeB.L,R`-`ankleB.L,R`-`footB.L,R`)にも
適用する。

## 現状

`build_namidaguma()`は`tsubute`と同じ関節の"種類"を踏襲しつつ、四肢を
太く張り出させ、正面から迫る力強いがっしりした熊の体格に作り替えた
もの。`namidaguma_animations()`は`head`(`chest-head`)・`armL,R`
(`chest-armF.L,R`)・`legL,R`(`hip-kneeB.L,R`)を使い、idle 3キー
(30f・60fの長い周期で`head`2°/`armL,R`∓2°とごくわずかに動く)・
walk 3キー・attack 4キー(1f中立→5f`head` -14°/`armL,R` ∓30°/16°の
溜め→10f`head` 20°/`armL,R` 36°/-10°の叩きつけ→20f戻り、まだタメ→
ツメ→戻りの3段で行き過ぎが無い)・hit 3キー・die 3キー(体が伸びながら
崩れる2段)の構成だが、`partial`・`interp`とも未使用。`ai: "melee"`
(HPが減るほど攻撃力が上がる`lowHpAtkBonusMax: 0.5`。maxHp 36, atk 21,
def 9, exp 32, `minFloor: Number.POSITIVE_INFINITY`・`weight: 0`で通常の
フロア出現はせず、夢あわせ産の専用個体として扱われる)。

## 打ち直しの方針

- **attack**: 現行の「溜め(5f、`head` -14°/`armL,R` ∓30°/16°)→
  叩きつけ(10f、`head` 20°/`armL,R` 36°/-10°)→戻り(20f)」に、5f→10fの
  区間へ`{"interp": "LINEAR"}`を付けて「底力を振り絞り、正面から力強く
  叩きつける」瞬発力を鋭くする。10f直後(13f付近)に`armL,R`が42°程度
  まで一瞬余分に伸びる行き過ぎの段を挟み、20fで戻す。melee AIで
  guard/cowardのどちらでもないため振幅自体は現行のまま(garudoと
  同程度の強さ)を基準にする。
- **hit**: 現行の`hit`(4f→14f、`head` 16°/`armL,R` ∓12°/10°)の入り
  (1f→4f)に`{"interp": "LINEAR"}`を足す。振幅・戻り時間とも現行のまま
  維持する。
- **idle**: 現行idle(30f・60fの長い周期で`head`/`armL,R`がごくわずかに
  動く、どっしり構えた演出)に対し、`armL,R`を`head`より2〜3フレーム
  遅らせる二次揺れを、tsubute本家と同じ処方で追加する。大柄でどっしりした
  体格を反映し、遅れ幅はgajiriの3フレームと同程度かやや長め(3フレーム)
  にして、鈍重さを強調する。
- **walk**: `chest`(0, -0.055, 0.215)から`hip`(0, 0.115, 0.195)への
  `chest-hip`ボーンはほぼ水平(tsubute本家と同じ、胴のローカルY軸が
  前後方向を向く)ため、**tsubute本家remake時の判断と同じ理由で接地沈み
  (`loc`)は見送る**。「重い体を踏みしめるように歩く」という現行の
  読み味は、`loc`の沈み込みではなく現行walk(9f・18fの)テンポと振幅の
  大きさ(z16°)で表現する方針を維持する。
- **die**: 現行の`die`(10f→24fの2段)の初動(1f→10f)に
  `{"interp": "LINEAR"}`を足す。24f到達後、`legL,R`がごくわずかに
  戻る揺り戻しを1回追加して「着地後の小さな跳ね返り」を表現する。
- squash & stretch: 骨組みに沿った剛体的な変形の造形(骨・関節を持つ
  熊型)であり、スライム状の柔構造ではないため使わない。

## 対象外

- 骨格・造形そのものの変更(既存の.glbジオメトリはそのまま)
- 新規クリップの追加(5クリップ構成は変えない)

## 未決事項

- 具体的な角度・フレーム数の最終調整(実装時にプレビューで詰める)
