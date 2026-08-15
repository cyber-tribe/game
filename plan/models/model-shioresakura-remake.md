# しおれざくら(shioresakura)のアニメーション作り直し

## 経緯

plan/game/archive/animation-quality-guidelines.mdでパイロット5体
(garudo/purun/gajiri/honegarami/tsubute)に適用したタメ・ツメ・二次揺れの
規約を、この種族の骨格ファミリー(`purun`と同じ縦2本の骨組み、`base`-
`mid`-`top`)にも適用する。

## 現状

`build_shioresakura()`は`purun`の骨組みをそのまま流用し、頭の周りに
萎れた花びらを6枚まとわせた姿。`shioresakura_animations()`は`lower =
"base-mid"`、`upper = "mid-top"`を使い、purunと違って`lower`だけでなく
`upper`も常にscaleで動かす構成(idle 3キー・walk 5キー・attack 4キー・
hit 3キー・die 3キーの、いずれもlower/upperが対になって動く)。attack
コメントには「瀕死になるほど攻撃力が増す性質どおり、散り際に大きく
身を反らせる」とあるが、実装はsquash(4f)→伸び上がり(9f)→戻り(18f)の
3段止まりで、`partial`・`interp`とも未使用。`melee`AI、maxHp 30・
atk 18・def 6、`lowHpAtkBonusMax: 0.3`(瀕死になるほど攻撃力が上がる)。

## 打ち直しの方針

`lower = "base-mid"`、`upper = "mid-top"`の2骨構成のため、akubitokageの
打ち直しと同じく、`upper`のキーを`lower`より遅らせる形で2骨間の
二次揺れを表現する。

- **attack**: 現行の「タメ(4f、lower squash・upper stretch)→伸び上がり
  (9f、lower (0.8, 1.35, 0.8)+`loc`(0,0.06,0)・upper (1.18, 0.78,
  1.18))→戻り(18f)」の3段に、4f→9fの区間へ`{"interp": "LINEAR"}`を
  付けて、瀕死ほど鋭さを増す散り際の一撃を強調する。行き過ぎ(9f直後、
  11f付近でupperをさらに(1.24, 0.72, 1.24)まで一瞬余分に反らせる)を
  短く挟んでから18fで戻す4段構成にする。
- **hit**: 現行の`hit`(4f→14f、lower (1.3, 0.66, 1.3)・upper (0.88,
  1.16, 0.88))の入り(1f→4f)に`{"interp": "LINEAR"}`を足して、
  「攻撃を受けるたびわずかに弱る」花の脆さを鋭く見せる。振幅・戻り
  時間は現行のまま維持する。
- **idle**: 末端の腕・尻尾に相当するボーンは無いため、`upper`のキー
  だけ`lower`より1〜2フレーム遅らせて追従させる形で二次揺れを表現する
  (`upper`のキーだけ`{"partial": True}`で2フレーム遅らせる)。萎れた
  花びらが本体からわずかに遅れて揺れる印象を狙う。
- **walk**: squash & stretchで体積そのものが変わる構造のため、
  honegarami/garudoのような`loc`ベースの接地沈みは提案しない(現行の
  潰し伸ばしのリズムをそのまま維持)。
- **die**: 現行の`die`(10f→24fの2段、lower/upperが潰れて花びらごと
  崩れ落ちる)の前に、初動(1f→3f程度)にLINEAR指定を足して「散る
  花びらの最初の一枚がびくっと落ちる」鋭さを加える。着地後の小さな
  跳ね返り(1回、scaleをわずかに揺り戻す程度)を24f以降に追加する。
- squash & stretch: `purun`ファミリー(骨・装甲のないスライム状の
  一種)なので継続して使う。既存のsquash/stretch定義はそのまま流用
  してよい。

## 対象外

- 骨格・造形そのものの変更(既存の.glbジオメトリはそのまま)
- 新規クリップの追加(5クリップ構成は変えない)

## 未決事項

- 具体的な角度・フレーム数の最終調整(実装時にプレビューで詰める)
