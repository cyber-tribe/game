# ホロホロチョウ(horoholocho)のアニメーション作り直し

## 経緯

plan/game/archive/animation-quality-guidelines.mdでパイロット5体
(garudo/purun/gajiri/honegarami/tsubute)に適用したタメ・ツメ・二次揺れの
規約を、この種族の骨格ファミリー(`purun`と同じ縦2本の骨組み、`base`-
`mid`-`top`)にも適用する。

## 現状

`build_horoholocho()`は`purun`の骨組み(`base`-`mid`-`top`、ボーン名も
座標系も完全一致)を流用し、根元(base半径0.128)から先端(top半径0.040)まで
絞ったシルエットに、垂れた羽毛の房(`horoholocho_wing`、静的な飾りメッシュ
でボーンには連動しない)を左右に足したもの。`horoholocho_animations()`は
既存クリップを新規に書かず、**`purun_animations()`をボーン名が同一である
ことを理由にそのまま呼んでいる**(`return purun_animations()`のみの
1行関数)。このため、パイロット5体の一員である`purun`がすでに受けた
タメ→ツメ(LINEAR)→行き過ぎ→戻りのattack、鋭く入ってゆっくり戻るhit、
squash & stretchのdieは、horoholochoにも**間接的にすでに適用済み**という
状態になっている。

## 打ち直しの方針

`ai: "swarm"`(3〜4体まとめて出現、minFloor 13、maxHp 14と紙装甲)という
性格から、horoholochoは「ちぎれた微睡みの欠片」という単体の存在感が薄い
種族であり、guidelines.mdの「swarmは全ボーン同時の単振動を避けつつも
簡潔に保つ」という方針に照らすと、**purunの動きをそのまま流用し続ける
のが妥当**という結論になる。理由は以下の3点:

- ボーン名(`base-mid`, `mid-top`)がpurunと完全一致しており、`horoholocho`
  固有の骨(耳・尻尾・触手に相当するもの)が存在しないため、gajiriのような
  部位ずらしの二次揺れを追加する余地がそもそもない(羽毛の房は静的メッシュ
  でボーンに乗っていない)。
- purunのsquash & stretch(体積を保った潰し伸ばし)は、horoholochoも骨・
  装甲を持たない柔らかい塊であるという造形方針(`build_horoholocho()`の
  docstring)と矛盾しない。
- swarmで複数体が同時に動くため、purunと異なるモーションを新たに作ると
  「同じ骨格なのに個体ごとに動き方の癖が違う」という不整合が目立ちやすい。
  むしろ揃って同じ動きをする方が、群れらしい統一感になる。

そのため各クリップの結論は以下のとおり:

- **attack / hit / die**: `purun_animations()`をそのまま継続利用する。
  タメ→ツメ(LINEAR)→行き過ぎ→戻りのattack、鋭い入り/ゆっくり戻りのhit、
  squash & stretchのdieは、すでにguidelines.mdの規約を満たしている。
  追加の打ち直しは不要。
- **idle**: 同様に`purun_animations()`のidle(16f・32fの2キー、`lower`の
  scale呼吸のみ)を継続利用する。horoholochoだけの個別モーションを
  作るなら振幅を一回り小さく(purunの`(1.06, 0.92, 1.06)`に対し
  `(1.03, 0.96, 1.03)`程度)して「軽い羽毛の房」らしさを出す案もあるが、
  swarmの簡潔さを優先し、現時点では見送る。
- **walk**: 同上。purunの「縮んでから跳ね上がり、着地でまた潰れる」歩みを
  継続利用する。
- squash & stretch: purunファミリー(骨・装甲のないスライム状の一種)
  なので継続して使う。

## 対象外

- 骨格・造形そのものの変更(既存の.glbジオメトリはそのまま)
- 新規クリップの追加(5クリップ構成は変えない)
- horoholocho専用のアニメーション新規作成(上記の理由によりpurunの
  流用を維持する方針。将来、群れの中で個体差を出したくなった場合の
  最小変更案として、idleの振幅を一回り小さくする程度の分岐は選択肢と
  して残す)

## 未決事項

- 上記「idleだけ個別に打ち直すか」の最終判断(実装時にプレビューで
  purunとの見分けやすさを見て決める)
