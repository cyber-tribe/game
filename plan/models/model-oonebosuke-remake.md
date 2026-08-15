# おおねぼすけ(oonebosuke)のアニメーション作り直し

## 経緯

plan/game/archive/animation-quality-guidelines.mdでパイロット5体
(garudo/purun/gajiri/honegarami/tsubute)に適用したタメ・ツメ・二次揺れの
規約を、この種族の骨格ファミリー(`purun`と同じ縦2本の骨組み、`base`-
`mid`-`top`)にも適用する。

## 現状

`build_oonebosuke()`は`purun`の骨組みをそのまま流用しつつ、全体を
およそ1.5倍に拡大し(base半径0.435)、まぶたが重く垂れた目とよだれを
足した第一地方ボスの姿。`oonebosuke_animations()`は`lower =
"base-mid"`、`upper = "mid-top"`を使い、いずれも`scale`のみで構成される
「下半身スケール+上半身スケール」構成(purun本体と同じ役割分担)。
idle 3キー(1f/36f/72fでlower/upperがわずかに呼吸する)・walk 3キー
(10f地点でlowerが伸び・upperが縮む、のっそりした一往復)・attack 4キー
(7f・14fの2段でsquash→stretchする、`loc`も使い始めている)・hit 3キー
・die 3キーの構成で、`partial`・`interp`とも未使用。`melee`AIの
チュートリアル的な単純な単一フェーズボス(maxHp 30・atk 11・def 4、
bossTelegraph multiplier 2)。

## 打ち直しの方針

`lower = "base-mid"`、`upper = "mid-top"`の2骨構成のため、gajiriの
「尻尾が首より3フレーム遅れる」ような追加ボーンの二次揺れは組めない。
akubitokageの打ち直しと同じく、`upper`のキーを`lower`より遅らせる形で
2骨間の二次揺れを表現する。

- **attack**: 現行の「タメ(7f、lower squash・upper stretch+`loc`
  (0,-0.05,0))→伸び上がり(14f、lower stretch・upper squash+`loc`
  (0,0.12,0))→戻り(24f)」の3段に、7f→14fの区間へ
  `{"interp": "LINEAR"}`を付けて、がっしりした体格から叩きつける瞬間を
  鋭くする。行き過ぎ(14f直後、17f付近でupperをさらに(0.80, 1.28,
  0.80)まで一瞬余分に伸ばす)を短く挟んでから24fで戻す4段構成にする。
  ボス級の重さを保つため、パイロットのhonegaramiよりフレーム間隔を
  やや長めに保つ。
- **hit**: bossなので振幅は小さく、のけぞりは短く鋭くする。現行の
  「4f→14f、lower (1.28, 0.68, 1.28)・upper (0.84, 1.20, 0.84)」を、
  1f→4fにLINEARを付けた鋭い入り、振幅をlower (1.18, 0.80, 1.18)・
  upper (0.90, 1.12, 0.90)程度まで小さくし、戻りも11fに詰める。
- **idle**: 末端の腕・尻尾に相当するボーンは無いため、`purun`と同じ
  呼吸的なscale変化(現行はlower/upperが同時に動く)に、`upper`のキー
  だけ1〜2フレーム遅らせて追従させる形で二次揺れを表現する(`upper`の
  キーだけ`{"partial": True}`で2フレーム遅らせる)。決して覚めない
  眠気を表す寝息のゆっくりした呼吸のリズム自体は現行のまま(36f・72f)
  維持する。
- **walk**: squash & stretchで体積そのものが変わる構造のため、
  honegarami/garudoのような`loc`ベースの接地沈みは提案しない(潰しの
  リズムがそのまま「重い図体を引きずる」重さの表現になっている、
  現行方針を維持)。
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
