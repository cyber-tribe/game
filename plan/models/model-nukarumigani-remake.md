# ぬかるみがに(nukarumigani)のアニメーション作り直し

## 経緯

plan/game/archive/animation-quality-guidelines.mdでパイロット5体
(garudo/purun/gajiri/honegarami/tsubute)に適用したタメ・ツメ・二次揺れの
規約を、この種族の骨格(honegaramiと同じ「胴の芯+腕+脚」の関節の"種類"を
踏襲しつつ、胴の芯を`hip`1関節に一本化した独自構成)にも適用する。

## 現状

`build_nukarumigani()`はhonegarami系の関節構成を踏襲しつつ、直立させず
胴を`hip`1関節に一本化して低く丸いドーム状にし、腕の先を大ぶりな
ハサミに仕立てた造形(melee AI)。`nukarumigani_animations()`はidle 3キー、
walk 5キー(左右の脚を交互に踏みしめる)、attack 4キー(すでにタメ→
挟み潰す→行き過ぎ→戻りの4段構成)、hit 3キー、die 3キーで、
`interp`・`partial`とも未使用。

## 打ち直しの方針

`spine = "hip-neck"`、`headb = "neck-head"`、
`armL/armR = "hip-shoulder.L/R"`、`foreL/foreR = "shoulder.L/R-
elbow.L/R"`、`handL/handR = "elbow.L/R-hand.L/R"`、
`legL/legR = "hip-thigh.L/R"`、`shinL/shinR = "thigh.L/R-knee.L/R"`
を使う。

- **attack**(両方のハサミで挟み潰す): 現行はすでに1→7(タメ)→13(挟み
  潰す)→24(戻り)の4段構成なので、7→13の挟み込み区間に
  `interp: LINEAR`を追加して「力比べで挟み潰す」重さと鋭さを強調する。
  タメ(1→7)は現行のまま維持する。
- **hit**: 現行の1→5(縮み)→16(戻り)に`interp: LINEAR`を5f目の入りへ
  追加。振幅・戻り時間(5f→16f)は現行どおり中程度に保つ。
- **idle**: 現行は1→26→52の3キーで`spine`/`headb`/`armL`/`armR`/
  `handL`/`handR`が同時に動く「ハサミだけがゆっくり開閉する」構造。
  `handL`/`handR`(ハサミの先)を`armL`/`armR`より2フレーム遅らせて
  追従させる(`{"partial": True}`で26f→28fにキーをずらす)、ハサミの
  開閉に一拍遅れが生まれる二次揺れを追加する。
- **walk**: `spine`(`hip-neck`)は胴を`hip`1関節に一本化した低いドーム
  状の構成で、honegarami/garudoのようなほぼ垂直な胴の骨とは異なり、
  低く這うがに股の姿勢そのものが接地の重みを表現しているため、
  `loc`接地沈みは追加しない(gajiriの打ち直しと同じ、胴が水平に近い
  構成での判断理由)。現行のがに股の左右交互の踏みしめは維持する。
- **die**: 現行の1f→10fの初動に`interp: LINEAR`を足して「がに股の脚から
  順にぬかるみへ沈み込む」鋭さを出す。10f→26fの沈み込んだ姿勢のあと、
  26f以降にわずかな跳ね返り(`spine`をほんの少し戻す1キー)を追加する。
- squash & stretch: 骨・甲殻(装甲)系の造形のため使わない。

## 対象外

- 骨格・造形そのものの変更(既存の.glbジオメトリはそのまま)
- 新規クリップの追加(5クリップ構成は変えない)

## 未決事項

- 具体的な角度・フレーム数の最終調整(実装時にプレビューで詰める)
