# 淵の主(fuchiNoNushi)のアニメーション作り直し

## 経緯

plan/game/archive/animation-quality-guidelines.mdでパイロット5体
(garudo/purun/gajiri/honegarami/tsubute)に適用したタメ・ツメ・二次揺れの
規約を、この種族の骨格ファミリー(`honegarami`と同じ人型骨組み。
hip/chest/neck/head/crown、shoulder-elbow-hand、thigh-knee-foot)にも
適用する。

## 現状

`build_fuchiNoNushi()`は`honegarami`・`yamabikooni`と同じ人型骨組みを
ベースに、`nedayamabiko`と同じ低い重心・前傾姿勢(`chest`がy=0.025、
`neck`がy=0.038と、根元から上へ行くほど+Y側=前へ傾く座標)に作られて
いる。`fuchiNoNushi_animations()`は`hipc`/`neck`/`armL,R`/`foreL,R`/
`legL,R`/`shinL,R`を使い、idle 3キー・walk 4キー・attack 4キー・
hit 3キー・die 3キーの構成だが、`partial`も`interp`も未使用で、
honegaramiのパイロット打ち直し前と同じ「振る→戻る」の素朴な往復に
とどまっている。第五地方(なみだの滝つぼ)ボスとして`isRegionBoss: true`
(maxHp 114, atk 29, def 23, ai: melee)。

## 打ち直しの方針

`hipc = "hip-chest"`、`neck = "neck-head"`、`armL,R = "chest-shoulder.L/R"`、
`foreL,R = "shoulder.L/R-elbow.L/R"`、`legL,R = "hip-thigh.L/R"`、
`shinL,R = "thigh.L/R-knee.L/R"`という命名は現行のまま踏襲する。
honegaramiの打ち直しをボスの重さに合わせて拡張する形にする。

- **attack**: 現行の「両腕まとめて振り下ろす」構成(1f→8f→14f→25f)を
  タメ(1→8f、`armR`を-120°まで引く、現行値のまま)→ツメ(8f→14f、
  `{"interp": "LINEAR"}`を付けて鋭く振り下ろす)→行き過ぎ(14f直後に
  1段追加、armRが70°付近まで余分に振り抜ける)→戻り(→25f、ゆっくり
  構えに戻る)の4段構成にする。淵の水を巻き込む重さを出すため、
  `hipc`の前後の踏み込み(-10°/+16°)もそのままLINEARの区間に合わせる。
- **hit**: 現行の`hit`(5f→16f、hipc -10°/neck -10°)の入り(1f→5f)に
  `{"interp": "LINEAR"}`を足す。def 23・maxHp 114の中堅ボスなので、
  honedatami/honezukaNoNushiほど極端に小さくはしないが、振幅は現行
  程度(hipc 10°、neck 10°)に据え置き、「動じることなく淵の底に居座る」
  という由来どおり戻りは短め(16f)のまま維持する。
- **idle**: 腕・尻尾のような明確な末端ボーンは無いが、`neck`(頭)を
  `hipc`(胴)より2フレーム遅らせて追従させる、garudo/honegaramiと
  同じ二次揺れが適用できる。現行の`idle`(36f・72fの2キー)に、36f時点の
  `hipc`の動き(2°/1°)を`neck`だけ2フレーム遅らせて(38f)追従させる形へ
  拡張する(`{"partial": True}`)。
- **walk**: `hip`(z=0.310)→`chest`(z=0.520)→`neck`(z=0.615)と明確に
  垂直に伸びるスパインを持つ二足立ちのため、honegarami/garudoと同じ
  接地沈みを適用できる。現行walk(11f・31fで脚が正中に戻る瞬間)に
  `hipc: {"loc": (0, -0.010, 0)}`を足し、重い巨体が沈み込む重さを出す。
- **die**: 現行の`die`(11f→28fの2段、水底へ沈み込む)の初動(1f→11f)に
  `{"interp": "LINEAR"}`を足して鋭い頽れにする。28f到達後、着地後の
  小さな跳ね返り(1回、hipc/neckをわずかに揺り戻す)を追加する。
- squash & stretch: 骨格を持つ人型ボスであり、スライム状ではないため
  使わない。

## 対象外

- 骨格・造形そのものの変更(既存の.glbジオメトリはそのまま)
- 新規クリップの追加(5クリップ構成は変えない)

## 未決事項

- 具体的な角度・フレーム数の最終調整(実装時にプレビューで詰める)
