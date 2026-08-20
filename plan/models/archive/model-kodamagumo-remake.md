# こだまぐも(kodamagumo)のアニメーション作り直し

## 経緯

plan/game/archive/animation-quality-guidelines.mdでパイロット5体
(garudo/purun/gajiri/honegarami/tsubute)に適用したタメ・ツメ・二次揺れの
規約を、この種族の骨格ファミリー(`purun`と同じ縦2本の骨組み、
`base`-`mid`-`top`)にも適用する。

## 現状

`build_kodamagumo()`は`purun`と同じ`base`-`mid`-`top`の2骨構成
(`KODAMAGUMO_RADII = {"base": 0.220, "mid": 0.195, "top": 0.135}`、
`purun`より扁平)を芯にしつつ、周囲に6個の`uv_sphere`(`KODAMAGUMO_
PUFFS`)をめり込ませて融合させ、もこもことした雲の輪郭を作っている。
`swarm`AI(`swarmSize: [3, 4]`)向けの簡略化されたシルエットで、
HP16/atk15/def6(`kodamausagi`よりさらに紙装甲寄り)。

`kodamagumo_animations()`は**独自の実装を持たず**、
`return purun_animations()`とだけ書かれている。骨名が`purun`と完全に
同じ(`base-mid`/`mid-top`)ため、この関数はすでに書き換え済みの
`purun_animations()`(タメ→ツメ(LINEAR)→行き過ぎ→戻りの4段attack、
LINEARで鋭く入る/ゆっくり戻るhit、squash & stretch)をそのまま継承して
おり、**パイロット5体の打ち直し時点で自動的に新方式へ移行済み**である。
`chouchinokuri`・`horoholocho`・`kodamausagi`も同じ`return
purun_animations()`パターンを使っている。

## 打ち直しの方針

規約が要求する緩急・二次揺れ・squash & stretchはすでに`purun_
animations()`経由で満たされているため、**このPRでは
`kodamagumo_animations()`のコード自体を変更する必要はない**。その
前提を確認したうえで、群れで漂う雲状の`kodamagumo`固有の質感(体格が
一番低くHP16と最も脆い一方、雲らしい漂うような柔らかさを持つ)を出す
ための、任意の追加差別化を検討する。

- **attack**: `purun_animations()`のタメ(1→5f)→ツメ(5→8f、LINEARで
  `lower`を`(0.8, 1.35, 0.8)`)→行き過ぎ(8→10f)→戻り(10→18f)構成を
  基本として維持しつつ、扁平な体型(`base`半径0.220に対し`top`半径
  0.135としぼみが緩い)に合わせてツメの伸び量をやや控えめ
  (`(0.84, 1.28, 0.84)`程度)にし、体積の変わり方を雲のもこもことした
  シルエットに合わせて穏やかにする。
- **hit**: HP16は`kodamausagi`(22)よりさらに低いため、`purun`の
  `lower: (1.3, 0.66, 1.3)`より一段強め(`(1.4, 0.55, 1.4)`程度)にし、
  戻りは14fのまま(あるいはやや延ばして16f)にして、雲がふわっと
  大きく潰れて漂うように戻る質感にする(`kodamausagi`の「素早く戻る」
  とは逆に、戻りをやや長めに残すのが差別化の要点)。
- **idle**: 2骨構成のため`partial`による部位ずらしは`purun`と同じく
  適用しない。`purun`の呼吸的なscale変化をそのまま使い、周囲のpuff
  メッシュが芯の変形に自動ウェイトで追従することで、輪郭全体がゆっくり
  もこもこ揺れる質感を狙う(骨側の追加変更は不要)。
- **walk**: squash & stretchによる潰し伸ばしが接地の重みを表現する
  方針を維持し、loc接地沈みは`purun`と同じく提案しない。
- **die**: `purun`の構成をそのまま踏襲する。雲が薄れて消える設定に
  合わせ、最終キー(24f)の潰れ具合(`(1.5, 0.06, 1.5)`)は現行のまま
  でよい。

## 対象外

- 骨格・造形そのものの変更(既存の.glbジオメトリはそのまま)
- 新規クリップの追加(5クリップ構成は変えない)
- `purun_animations()`自体の変更(パイロットとしてすでに完了済み)

## 未決事項

- 上記の差別化(専用`kodamagumo_animations()`への切り出し)を実際に
  行うか、`return purun_animations()`のまま据え置くかは実装セッションの
  判断に委ねる。据え置く場合、この計画書は「現状のままで規約を満たして
  いることの確認」という結論になる。
- 具体的な角度・フレーム数の最終調整(実装する場合、プレビューで詰める)
