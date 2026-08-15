# マドロミダケ(madoromi)のアニメーション作り直し

## 経緯

plan/game/archive/animation-quality-guidelines.mdでパイロット5体
(garudo/purun/gajiri/honegarami/tsubute)に適用したタメ・ツメ・二次揺れの
規約を、この種族の骨格(`root-stem`-`stem-capbase`-`capbase-captop`の
3骨、脚を持たない歩くキノコ)にも適用する。madoromiはmizukagami・
mouhitotsunokage・yaguramoriが流用する原型のファミリーでもある。

## 現状

`build_madoromi()`は「歩くキノコ。傘を大きく広げ、笠の下に眠たげな顔を
つける」造形。`madoromi_animations()`はidle 3キー、walk 5キー
(根元をひねって傘を左右に揺らす)、attack 4キー、hit 3キー、die 3キーで、
`interp`・`partial`とも未使用。

## 打ち直しの方針

`stem = "root-stem"`、`cap = "stem-capbase"`、`captop = "capbase-captop"`
を使う。

- **attack**(melee、傘を大きく振って眠りを付与する打撃): 現行の1→5
  (タメ)→10(打撃、`stem`24°`cap`26°`capbase-captop`18°)→20(戻り)を、
  タメ(1→5、現行のまま)→打撃(5→8、3f、`interp: LINEAR`で`stem`を
  現行の24°を30°まで、`cap`を26°を32°まで鋭く振る)→行き過ぎ(8→10、
  `stem`16°、`cap`18°まで戻りかける)→戻り(10→20、ゆっくり中立へ)の
  4段に分ける。
- **hit**: 1f→4fの入りに`interp: LINEAR`を足して鋭さを強調。振幅・戻り
  時間(4f→14f)は現行どおり中程度に保つ。
- **idle**: 現行は1→24→48の3キーで`stem`/`cap`が反対方向へ揺れるだけの
  単振動。`cap`(傘)を`stem`(根元)より2フレーム遅らせて追従させる
  (`{"partial": True}`で24f→26f、48f→50fにキーをずらす)、傘が根元に
  一拍遅れて揺れる二次揺れを追加する。
- **walk**: 脚を持たず、根元(`stem`)をひねりながら傘を左右に揺らして
  進む構成のため、honegarami/garudoのような`loc`接地沈みは適用しない
  (脚のない構造には「接地の重み」という前提が無い。hajimeNoYume・
  honezukanotsukaiの打ち直しと同じ判断理由)。現行の左右のひねりは
  維持する。
- **die**: 現行の1f→10fの初動に`interp: LINEAR`を足して鋭さを出す。
  10f→24fで大きく倒れた姿勢のあと、24f以降にわずかな跳ね返り
  (`stem`/`cap`をほんの少し戻す1キー)を追加する。
- squash & stretch: 骨(Skin)ベースのキノコの造形で、`purun`のような
  スライム体積変化ではないため使わない。

## 対象外

- 骨格・造形そのものの変更(既存の.glbジオメトリはそのまま)
- 新規クリップの追加(5クリップ構成は変えない)

## 未決事項

- 具体的な角度・フレーム数の最終調整(実装時にプレビューで詰める)
