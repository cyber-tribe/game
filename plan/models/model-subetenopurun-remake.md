# すべてのぷるん(subetenopurun)のアニメーション作り直し

## 経緯

plan/game/archive/animation-quality-guidelines.mdでパイロット5体
(garudo/purun/gajiri/honegarami/tsubute)に適用したタメ・ツメ・二次揺れの
規約を、この種族の骨格ファミリー(`purun`と同じ縦2本の骨組み、`base`-
`mid`-`top`)にも適用する。

なお`plan/models/archive/model-subetenopurun.md`は造形そのものの制作
計画(実装済み)であり、本ファイルはそのアニメーションだけを対象にした
打ち直し計画になる。

## 現状

`build_subetenopurun()`は`purun`の骨組みをそのまま流用し、全体を
およそ1.2倍に拡大、第一〜第七地方それぞれの色を継ぎ接ぎにした第八
地方のエリート個体。`subetenopurun_animations()`は`lower =
"base-mid"`、`upper = "mid-top"`を使い、`shioresakura`とほぼ同じ
「lower/upperが対になって動く」構成(idle 3キー・walk 5キー・
attack 4キー・hit 3キー・die 3キー)で、`partial`・`interp`とも未使用。
`melee`AI、maxHp 56・atk 30・def 16、`inflicts: {kind: "sleep", chance:
0.12, turns: 2}`(オオマドロミの眠り付与)と`lowHpAtkBonusMax: 0.15`
(なみだぐまの瀕死時攻撃力上昇)を薄く併せ持つ集大成として実装されて
いる。

## 打ち直しの方針

`lower = "base-mid"`、`upper = "mid-top"`の2骨構成のため、akubitokageの
打ち直しと同じく、`upper`のキーを`lower`より遅らせる形で2骨間の
二次揺れを表現する。全地方の記憶が混ざり合った集大成という設定を
汲み、パイロットのpurun/shioresakuraよりわずかに力強く・重みのある
緩急にする。

- **attack**: 現行の「タメ(5f、lower squash・upper stretch)→叩きつけ
  (10f、lower (0.82, 1.32, 0.82)+`loc`(0,0.08,0)・upper (1.20, 0.80,
  1.20))→戻り(20f)」の3段に、5f→10fの区間へ`{"interp": "LINEAR"}`を
  付けて、力強く踏み込んで叩きつける瞬間を鋭くする。行き過ぎ(10f
  直後、13f付近でupperをさらに(1.26, 0.74, 1.26)まで一瞬余分に伸ばす)
  を短く挟んでから20fで戻す4段構成にする。
- **hit**: 現行の`hit`(4f→14f、lower (1.3, 0.66, 1.3)・upper (0.88,
  1.16, 0.88))の入り(1f→4f)に`{"interp": "LINEAR"}`を足す。エリート
  個体として振幅・戻り時間は現行のまま維持する(小さく速いbossほどは
  絞らない)。
- **idle**: 末端の腕・尻尾に相当するボーンは無いため、`upper`のキー
  だけ`lower`より1〜2フレーム遅らせて追従させる形で二次揺れを表現する
  (`upper`のキーだけ`{"partial": True}`で2フレーム遅らせる)。継ぎ接ぎ
  模様の体表が波打つように、上半身がわずかに遅れて揺れる印象を狙う。
- **walk**: squash & stretchで体積そのものが変わる構造のため、
  honegarami/garudoのような`loc`ベースの接地沈みは提案しない(現行の
  潰し伸ばしのリズムをそのまま維持)。
- **die**: 現行の`die`(10f→24fの2段、lower/upperが潰れて消える)の
  前に、初動(1f→3f程度)にLINEAR指定を足して「体がびくっと縮む」
  鋭さを加える。着地後の小さな跳ね返り(1回、scaleをわずかに揺り戻す
  程度)を24f以降に追加する。
- squash & stretch: `purun`ファミリー(骨・装甲のないスライム状の
  一種)なので継続して使う。既存のsquash/stretch定義はそのまま流用
  してよい。

## 対象外

- 骨格・造形そのものの変更(既存の.glbジオメトリはそのまま)
- 新規クリップの追加(5クリップ構成は変えない)

## 未決事項

- 具体的な角度・フレーム数の最終調整(実装時にプレビューで詰める)
