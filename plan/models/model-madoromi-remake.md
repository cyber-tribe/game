# マドロミダケ(madoromi)のアニメーション作り直し

## 経緯

plan/game/archive/animation-quality-guidelines.mdでパイロット5体
(garudo/purun/gajiri/honegarami/tsubute)に適用したタメ・ツメ・二次揺れの
規約を、この種族の骨格ファミリー(`root`-`stem`-`capbase`-`captop`の
縦一直線3骨)にも適用する。

## 現状

`build_madoromi()`は歩くキノコで、傘を大きく広げ笠の下に眠たげな顔を
つけたもの。骨は`root`(z=0.05)→`stem`(z=0.24)→`capbase`(z=0.36)→
`captop`(z=0.50)と、x=y=0のまま高さだけが変わる純粋な縦一直線。
`madoromi_animations()`は`stem`(`root-stem`)・`cap`(`stem-capbase`)と、
リテラル文字列`"capbase-captop"`(attackでのみ使用)の3骨を扱う。
idle 3キー(1,24,48。`stem`/`cap`がわずかに揺れるだけ)・walk 5キー
(1,9,18,27,36。根元をひねりながら傘を左右に揺らす往復)・attack 4キー
(1,5,10,20)・hit 3キー(1,4,14)・die 3キー(1,10,24。根元が傾いて倒れる)
の構成だが、`partial`・`interp`とも未使用。`ai: "melee"`(睡眠付与25%,
maxHp 18, atk 8, def 5, minFloor 4)。

## 打ち直しの方針

- **attack**: 現行の「タメ(5f、`stem` -14°/`cap` -16°)→ツメ(10f、
  `stem` +24°/`cap` +26°/`capbase-captop` +18°)→戻り(20f)」を、
  5f→8fをツメ本体として`{"interp": "LINEAR"}`を付けて鋭く伸ばし直し、
  行き過ぎとして11f付近に`stem` +30°/`cap` +32°/`capbase-captop` +22°
  程度まで一瞬余分に振れる段を挟んでから20fで戻す4段構成に組み直す。
- **hit**: 現行の入り(1f→4f)に`{"interp": "LINEAR"}`を足す。def 5は
  パイロット中でも低めだが突出してはいないため、振幅(`stem` -20°/
  `cap` -18°)・戻り時間(14f)とも現行程度を維持する。
- **idle**: `root-stem`/`stem-capbase`/`capbase-captop`の3骨。傘の
  先端(`capbase-captop`)を茎(`stem-capbase`=`cap`)より2〜3フレーム
  遅らせて追従させる二次揺れを追加する。現行24f地点の動き
  (`stem` 3°/`cap` -3°)に続け、26〜27f付近で`capbase-captop`に
  ±2°程度だけ`{"partial": True}`で遅らせて追従させる。
- **walk**: `root`(0,0,0.05)から`stem`(0,0,0.24)への`root-stem`
  ボーンはx=y=0の純粋な垂直で、honegarami/garudoの`hipc`と同じ理由
  (関節のz座標が縦に並ぶ)で接地沈みが適用できる。現行walk(根元を
  ひねる回転のみで沈みがない)の踏み込みタイミング(9f・27f付近)に、
  `root-stem`へ`{"loc": (0, -0.006, 0)}`程度の小さな沈みを追加する。
  ただしmadoromiはsquash & stretch系(purunファミリー)ではなく硬い
  茎+傘の造形のため、沈み量はhonegarami/garudoより控えめにする。
- **die**: 現行(1→10→24の2段、根元が傾いて倒れる)の初動(1→10f)に
  `{"interp": "LINEAR"}`を足す。24f到達後、傾ききる直前に小さく揺り
  戻る跳ね返りを26f付近に1回追加する。
- squash & stretch: 骨組みに沿った剛体的な変形の造形(硬い茎と傘を持つ
  きのこ型)であり、スライム状の柔構造ではないため使わない。

## 対象外

- 骨格・造形そのものの変更(既存の.glbジオメトリはそのまま)
- 新規クリップの追加(5クリップ構成は変えない)

## 未決事項

- 具体的な角度・フレーム数の最終調整(実装時にプレビューで詰める)
- 傘の先端(`capbase-captop`)の遅れ量、および接地沈みの深さの最終調整
