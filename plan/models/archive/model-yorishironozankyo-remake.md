# ヨリシロの残響(yorishironozankyo)のアニメーション作り直し

## 経緯

plan/game/archive/animation-quality-guidelines.mdでパイロット5体
(garudo/purun/gajiri/honegarami/tsubute)に適用したタメ・ツメ・二次揺れの
規約を、honegarami/yamabikooniと同じ人型骨格ファミリー(`hip`-`chest`-
`neck`-`head`-`crown`、`shoulder`-`elbow`-`hand`、`thigh`-`knee`-`foot`)
を使うこの種族にも適用する。

## 現状

`build_yorishironozankyo()`はhonegarami/yamabikooniと同じ人型骨組みを、
これまでで最大のサイズ(`hip`半径0.152、`shoulder.L`半径0.082など)に
拡大し、高さで5段に区切った色帯と、胸に発光する核を持たせた個体。
出現率は極めて低く(`weight: 1`)、HP160・atk45・def32とこの作品で
最も強い(ヨリシロ自身の記憶そのものという由来)。

`yorishironozankyo_animations()`は5クリップで、yamabikooniと同様に
honegaramiの打ち直し構成を部分的になぞっているが届いていない。

- **idle**(3キー): `hipc`/`armL`/`armR`/`neck`がすべてframe30で同時に
  動く。`neck`の遅延追従は未使用。
- **walk**(4キー): honegarami/yamabikooniと同型だが、接地フレーム
  (frame10/19/28)に`hipc`の`loc`沈み込みが無い。
- **attack**(4キー): `neutral`(1)→`windup`(8、`armR:(-145,0,-28)`)→
  `strike`と`overshoot`合体(14、`armR:(80,0,19)`)→`return`(26)の
  3段構成。`interp: LINEAR`指定と、strike/overshootの分離が無い。
- **hit**(3キー): frame1に`interp: LINEAR`指定が無い。振幅
  (`hipc:(-11,0,0)`, `neck:(-11,0,0)`)はyamabikooniよりさらに控えめで、
  「記憶そのものとして、静かに、しかし途方もない存在感で佇む」という
  性格づけをすでに反映できている。
- **die**(3キー): frame1に`interp: LINEAR`指定が無く、跳ね返りも無い。

## 打ち直しの方針

honegarami/yamabikooniの打ち直し内容を移植しつつ、「物語終盤にふさわしい、
これまでで最も大きく力強い」という設定と、既存のhit振幅にすでに表れている
「静かな重厚さ」を壊さないよう、フレーム間隔はyamabikooniよりやや長めに
保つ(動きの速さそのものではなく、間の長さで格を出す)。`ai: "melee"`で
あり、このゲームに`guard`/`boss`/`coward`のような専用のAI区分は無いため、
振幅の機械的な補正はせず、既存の控えめな数値を基準にする。

- **attack**: frame8(windup)に`{"interp": "LINEAR"}`を追加し、8→15の
  区間を鋭いツメにする(honegaramiより1フレーム長く取り、体格差を
  出す)。現行のframe14(strike+overshoot合体)を、frame15(ツメの到達点、
  `armR:(88,0,21)`程度)とframe18(行き過ぎからの収まり、
  `armR:(76,0,18)`程度)の2キーに分割する。frame26のreturnを30まで
  延ばし、ゆったりとした戻りにする。
- **hit**: frame1に`{"interp": "LINEAR"}`を追加するのみ。振幅は現行の
  まま(このゲーム内では最も抑えた数値で、意図通り)。
- **idle**: `neck`を`hipc`より3フレーム遅らせる(体格が大きい分、
  honegaramiの2フレームよりわずかに長く)。frame30で`hipc`/`armL`/
  `armR`のキーを打ち、frame33に`{neck: (-3, 0, 0)}`を`{"partial": True}`
  で追加する。frame60の戻りにも同様に、frame63で`neck`だけを`partial`
  で0へ戻す。
- **walk**: `hip-chest`は`hip: (0,0,0.390)`→`chest: (0,0,0.655)`で
  完全に垂直な骨のため、footfall dipが適用できる。frame10/28の接地
  キーに`hipc: {"loc": (0, -0.010, 0)}`程度を追加する。体格は最大だが、
  「静かに佇む」性格づけを尊重し、honegaramiより深く沈めすぎない
  控えめな値に留める。
- **die**: frame1に`{"interp": "LINEAR"}`を追加し、初動を鋭くする。
  frame32の崩れ落ちの後、frame36あたりに`hipc`/`neck`/`armL`/`armR`を
  frame32よりわずかに戻した値で小さな跳ね返りを1回追加する。「記憶が
  薄れるように、大きく傾いて崩れ落ちる」という現行のコメントの読み味は
  変えない。

## 対象外

- 骨格・造形そのものの変更(既存の.glbジオメトリはそのまま)
- 新規クリップの追加(5クリップ構成は変えない)

## 未決事項

- 具体的な角度・フレーム数の最終調整(実装時にプレビューで詰める)
- windup/returnをyamabikooniよりどの程度長く取るか(「格の違い」を
  テンポの差だけでどこまで表現できるかは実機で確認する)
