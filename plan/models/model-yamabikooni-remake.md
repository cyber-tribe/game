# やまびこおに(yamabikooni)のアニメーション作り直し

## 経緯

plan/game/archive/animation-quality-guidelines.mdでパイロット5体
(garudo/purun/gajiri/honegarami/tsubute)に適用したタメ・ツメ・二次揺れの
規約を、honegaramiと同じ人型骨格ファミリー(`hip`-`chest`-`neck`-`head`-
`crown`、`shoulder`-`elbow`-`hand`、`thigh`-`knee`-`foot`)を使うこの種族
にも適用する。

## 現状

`build_yamabikooni()`はhonegaramiの人型骨組みをそのまま流用しつつ、座標・
半径ともに大きく太らせて(`hip`半径0.128、`shoulder.L`半径0.068など、
honegaramiのおよそ2倍)がっしりした体格にし、角2本と発光する目を追加した
個体。`yamabikooni_animations()`はすでにhonegaramiの打ち直し後の構成を
部分的になぞっているが、以下の点で規約に届いていない。

- **idle**(3キー): `hipc`(`hip-chest`)と`armL`/`armR`がframe24で同時に
  動き、`neck`(`neck-head`)も同じframe24に同居している。honegaramiの
  ような`neck`の遅延追従(`partial`)は未使用。
- **walk**(5キー): honegaramiと同じ4足交互パターンだが、接地フレーム
  (frame10/28)に`hipc`の`loc`沈み込みが無い。
- **attack**(4キー): `neutral`(1)→`windup`(7、`armR:(-135,0,-22)`)→
  `strike`と`overshoot`を1キーに合体させた`armR:(72,0,16)`(12)→
  `return`(24)という3段構成。honegaramiが持つ「windup末尾への
  `interp: LINEAR`指定」と「strike/overshootをframe10/12の2キーに
  分ける」構成が欠けている。
- **hit**(3キー): frame1に`interp: LINEAR`指定が無い。振幅
  (`hipc:(-14,0,0)`, `neck:(-14,0,0)`, `armL/armR:±18,20`)自体は
  honegaramiと同水準ですでに妥当。
- **die**(3キー): frame1に`interp: LINEAR`指定が無く、崩れ落ちた後の
  小さな跳ね返りも無い。

## 打ち直しの方針

honegaramiとほぼ同じ骨格・比率のため、honegaramiの打ち直し内容を
そのまま移植する形で進める。`ai: "melee"`であり`guard`/`coward`の
ような明示的な補正は無いため、振幅はhonegarami基準を踏襲する。

- **attack**: frame7(windup)に`{"interp": "LINEAR"}`を追加し、7→10の
  区間を鋭いツメにする。現行のframe12(strike+overshoot合体)を、
  frame10(ツメの到達点、`armR:(72,0,16)`程度)とframe13(行き過ぎからの
  収まり、`armR:(60,0,13)`程度に弱める)の2キーに分割する。frame24の
  returnはそのまま。
- **hit**: frame1に`{"interp": "LINEAR"}`を追加するのみ。振幅は現行の
  ままでよい。
- **idle**: `neck`を`hipc`より2フレーム遅らせる。frame24で
  `hipc`/`armL`/`armR`のキーを打ち、frame26に`{neck: (-4, 0, 0)}`を
  `{"partial": True}`で追加する。frame48の戻りにも同様に、frame50で
  `neck`だけを`partial`で0へ戻す。
- **walk**: `hip-chest`は`hip: (0,0,0.335)`→`chest: (0,0,0.565)`と
  x/yが0のまま完全に垂直な骨のため、footfall dipが適用できる。
  frame10/28の接地キーに`hipc: {"loc": (0, -0.010, 0)}`程度を追加する
  (honegaramiの`-0.010`と同水準、がっしりした体格なので`-0.012`まで
  強めても良い)。
- **die**: frame1に`{"interp": "LINEAR"}`を追加し、初動(1→10)を鋭くする。
  frame28の崩れ落ちの後、frame32あたりに`hipc`/`neck`/`armL`/`armR`を
  frame28よりわずかに戻した値(honegaramiのdieパターンに倣う)で小さな
  跳ね返りを1回追加する。

## 対象外

- 骨格・造形そのものの変更(既存の.glbジオメトリはそのまま)
- 新規クリップの追加(5クリップ構成は変えない)

## 未決事項

- 具体的な角度・フレーム数の最終調整(実装時にプレビューで詰める)
