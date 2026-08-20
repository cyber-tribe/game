# ゆめみるぷるん(yumemirupurun)のアニメーション作り直し

## 経緯

plan/game/archive/animation-quality-guidelines.mdでパイロット5体
(garudo/purun/gajiri/honegarami/tsubute)に適用したタメ・ツメ・二次揺れの
規約を、purunと同じ骨格ファミリー(縦2本の`base`-`mid`-`top`)を使う
この種族にも適用する。`plan/models/archive/model-yumemirupurun.md`は
このモデルを新規に作った際の元の仕様書で、実装済みのアーカイブ。本ファイル
は打ち直し専用の計画で、造形の変更は扱わない。

## 現状

`build_yumemirupurun()`はpurunと同じ縦2本の骨組みを流用し、全体を
およそ1.12倍にして`melee`AIにふさわしいがっしりした正面向きの
シルエットにした個体。白目の上から覆いかぶさる専用の「まぶた」
ジオメトリと、頭上に浮かぶ発光する「夢の粒」3つを持つ。攻撃に眠り
付与(20%、3ターン)が乗る。

`yumemirupurun_animations()`は5クリップで、他の未打ち直し種族と違い、
**idleだけはすでにこの種族固有の凝った表現が入っている**(6キー、
`upper`(`mid-top`)の`rot`で「立ったまま船を漕ぐように深く傾いては、
はっと我に返って起き直る」を表現)。ただしpartialは未使用で、
`lower`/`upper`は常に同じframeで同時に動く。

- **walk**(5キー): purunの打ち直し後と同じsquash&stretch構成
  (`squash`→`stretch`+`loc`→戻り)がすでに入っている。
- **attack**(4キー): `squash`(6)→大きな`stretch`(11、
  `lower:{"scale":(0.80,1.34,0.80),"loc":(0,0.09,0)}`)→`return`(21)
  という3段。`interp: LINEAR`指定は無く、タメ→ツメ→行き過ぎ→戻りの
  4段には分かれていない。
- **hit**(3キー): `interp: LINEAR`指定が無い。
- **die**(3キー): 沈み込んで潰れる表現(`(1, neutral)` →
  `(12, ...)` → `(28, {"scale":(1.5,0.06,1.5)}, ...)`)で、frame1に
  `interp: LINEAR`指定は無く、跳ね返りも無い。

## 打ち直しの方針

`lower`/`upper`の2骨構成で、`purun`ファミリー共通の「squash&stretchで
体積そのものが変わる」という設計方針(骨・装甲を持たない一種なので継続
して使う)は変えない。

- **idle**: 「船を漕ぐ」現行のコンセプトは維持しつつ、`upper`が
  `lower`よりわずかに遅れて追従するよう、frame18の`lower`変化に対して
  frame20で`upper`の変化を`{"partial": True}`にする(1〜2フレームの
  遅延を明示化する)。他のフレーム・数値は現行のまま踏襲する。
- **walk**: すでにpurunの打ち直し後と同じsquash&stretch構成が入って
  いるため大きな変更は不要。squash/stretchの潰し伸ばしが接地の重みを
  表現しているため、honegaramiのような`loc`ベースの接地沈みは(purun
  ファミリー共通の方針どおり)提案しない。
- **attack**: 現行の`squash`(6)→大`stretch`(11)→`return`(21)の3段を、
  タメ(1→6、`squash`のまま)→ツメ(6→9、`{"interp": "LINEAR"}`を追加し
  `lower:{"scale":(0.80,1.34,0.80),"loc":(0,0.09,0)}`まで鋭く伸ばす)→
  行き過ぎ(9→12、現行の`stretch`値をやや弱めて`lower:{"scale":
  (0.86,1.22,0.86)}`程度の余韻を残す)→`return`(21)の4段に分ける。
  眠り付与を持つ一撃という性格上、windup(1→6)は他のmelee種よりやや
  長めに保ち、「ぬっと迫る」緩慢さと打撃の鋭さを両立させる。
- **hit**: frame1に`{"interp": "LINEAR"}`を追加するのみ。振幅は現行
  維持(meleeは標準、専用の補正指定は無い)。
- **die**: frame1に`{"interp": "LINEAR"}`を追加し、沈み込みの初動を
  鋭くする。frame28の後、frame32あたりに「まどろみに沈んだ後、一度
  だけふっと浮き上がる」ような小さな跳ね返り(`lower`/`upper`の
  `scale`をわずかに戻す)を1回追加する。
- **squash & stretch**: purunファミリー(骨・装甲のないスライム状の
  一種)なので継続して使う。既存のsquash/stretch定義はそのまま流用する。

## 対象外

- 骨格・造形そのものの変更(既存の.glbジオメトリはそのまま)
- 新規クリップの追加(5クリップ構成は変えない)
- `plan/models/archive/model-yumemirupurun.md`(元の造形仕様書)の内容
  の変更

## 未決事項

- 具体的な角度・フレーム数の最終調整(実装時にプレビューで詰める)
- attackのwindupをどこまで長く取ると「眠気を誘う緩慢さ」と「打撃の
  重さ」が両立するかは実機で確認する
