# 掘り杭の主(horikuiNoNushi)のアニメーション作り直し

## 経緯

plan/game/archive/animation-quality-guidelines.mdでパイロット5体
(garudo/purun/gajiri/honegarami/tsubute)に適用したタメ・ツメ・二次揺れの
規約を、この種族の骨格ファミリー(`honegarami`と同じ人型骨組みの"種類"。
`hip`-`chest`-`neck`-`head`-`crown`の縦のスパイン、`shoulder`-`elbow`-`hand`
の腕、`thigh`-`knee`-`foot`の脚)にも適用する。

## 現状

`build_horikuiNoNushi()`は`honegarami`と同じ関節の"種類"を踏襲しつつ、
座標を全体で約1.6倍・胴と腿の半径をさらに太く(2.0倍前後)して、がっしり
重い体格に育てたもの。体を貫いて突き出た太い杭(`horikui_stake`)は
別メッシュの静的な飾りで、ボーンには連動しない。`horikuiNoNushi_animations()`
は`hipc`(`hip-chest`)・`neck`(`neck-head`)・`armL,R`(`chest-shoulder`)・
`foreL,R`(`shoulder-elbow`)・`legL,R`(`hip-thigh`)を使い、idle 3キー
(28f・56fでごく僅かに軋むだけ)・walk 4キー・attack 4キー(タメ→打撃→戻り
の3段相当)・hit 3キー(振幅は`hipc` -8°/`neck` -10°とすでに小さい)・
die 3キー(初動と崩れ落ちの2段のみ、着地後の跳ね返りなし)の構成だが、
`partial`・`interp`とも未使用。`isRegionBoss: true`・`ai: "melee"`
(maxHp 304, atk 59, def 42)の地方ボスであり、「がっしりした体格で、正面
から迫る力強いシルエット」という方針どおり、`hit`の振幅はすでに他の
非ボス種族より小さく抑えられている。

## 打ち直しの方針

- **attack**: 現行の「タメ(6f、`armL/R`を-30°/+18°、`hipc` -12°)→
  打撃(12f、`armL/R` +46°/-4°、`hipc` +16°)→戻り(22f)」の3段に、
  6f→12fの区間へ`{"interp": "LINEAR"}`を付けて「打ち込まれた痛みを
  振り払う」一撃を鋭くする。行き過ぎ(オーバーシュート)として12f直後
  (14f付近)に`armL/R`が+52°/-2°程度まで一瞬余分に振れる段を挟み、
  22fで正面へ構えた姿勢に戻す。
- **hit**: 現行の`hit`(4f→15f、`hipc` -8°/`neck` -10°)の入り(1f→4f)に
  `{"interp": "LINEAR"}`を足す。ボスらしく「当たってもほとんど揺るがない」
  読み味を保つため、振幅・戻り時間とも現行のまま(honegaramiの-18°/-16°
  より一回り小さい)にする。
- **idle**: 末端の尻尾・耳はないが、`neck`(頭)を`hipc`(胴)より2フレーム
  遅らせる二次揺れが、honegaramiと同じ関節構成のためそのまま適用できる。
  現行idle(28f・56fの2キー、`hipc` +2°/`neck` -2°)の`neck`の動きだけ
  `{"partial": True}`で2フレーム遅らせ(30f)、「体を貫いた杭に取り憑かれ、
  頭がわずかに遅れて軋む」揺れにする。振幅自体は現行のごく小さいまま。
- **walk**: `hip`(z=0.576)→`chest`(z=0.896)→`neck`(z=1.056)と垂直に伸びる
  スパインを持つ二足立ちのため、honegarami/garudoと同じ接地沈みが適用
  できる。現行walk(11f・32fで脚が正中に戻る瞬間)に
  `hipc: {"loc": (0, -0.014, 0)}`を足す。全体が約1.6倍のスケールのため、
  honegaramiの-0.010よりやや大きめの沈みにして、がっしりした重量感を
  出す。
- **die**: 現行の`die`(12f→30fの2段、杭に絡みついていた反発と痛みが
  支えを失って崩れ落ちる)の初動(1f→12f)に`{"interp": "LINEAR"}`を足す。
  30f到達後、体を貫く杭がわずかに揺り戻すように、`hipc`/`legL,R`が一度
  小さく跳ね返ってから完全に崩れ落ちる段を追加する(honegaramiの
  20f→24fの跳ね返りと同じ考え方)。
- squash & stretch: 杭とヨリシロの反発でできた硬い体で、骨格・装甲質の
  造形のため使わない。

## 対象外

- 骨格・造形そのものの変更(既存の.glbジオメトリはそのまま)
- 新規クリップの追加(5クリップ構成は変えない)

## 未決事項

- 具体的な角度・フレーム数の最終調整(実装時にプレビューで詰める)
