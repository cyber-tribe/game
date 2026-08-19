# こだまうさぎ(kodamausagi)のアニメーション作り直し

## 経緯

plan/game/archive/animation-quality-guidelines.mdでパイロット5体
(garudo/purun/gajiri/honegarami/tsubute)に適用したタメ・ツメ・二次揺れの
規約を、この種族の骨格ファミリー(`purun`と同じ縦2本の骨組み、
`base`-`mid`-`top`)にも適用する。

## 現状

`build_kodamausagi()`は`purun`と同じ`base`-`mid`-`top`の2骨構成を
そのまま使い、丸く詰まった体に耳(`kodamausagi_ear{side}`、cone製の
別メッシュで骨には対応しない)を足した、`swarm`AI(`swarmSize: [3, 4]`・
`fieldSkill: "squeeze"`)向けの簡略化された小さなシルエット。
`KODAMAUSAGI_RADII`は`{"base": 0.195, "mid": 0.165, "top": 0.082}`で
`purun`(`{"base": 0.29, "mid": 0.25, "top": 0.09}`)より一回り小さい。
HP22/atk18/def8。

`kodamausagi_animations()`は**独自の実装を持たず**、
`return purun_animations()`とだけ書かれている。骨名が`purun`と完全に
同じ(`base-mid`/`mid-top`)ため、この関数はすでに書き換え済みの
`purun_animations()`(タメ→ツメ(LINEAR)→行き過ぎ→戻りの4段attack、
LINEARで鋭く入る/ゆっくり戻るhit、squash & stretch)をそのまま継承して
おり、**パイロット5体の打ち直し時点で自動的に新方式へ移行済み**である。
`chouchinokuri`・`horoholocho`・`kodamagumo`も同じ`return
purun_animations()`パターンを使っている。

## 打ち直しの方針

規約が要求する緩急・二次揺れ・squash & stretchはすでに`purun_
animations()`経由で満たされているため、**このPRでは
`kodamausagi_animations()`のコード自体を変更する必要はない**。その
前提を確認したうえで、`swarm`(群れで3〜4体出現)・`fieldSkill: "squeeze"`
というこの種族固有の性格を出すための、任意の追加差別化を検討する。

- **attack**: `purun_animations()`のタメ(1→5f)→ツメ(5→8f、LINEARで
  `lower`を`(0.8, 1.35, 0.8)`)→行き過ぎ(8→10f)→戻り(10→18f)構成を、
  群れで素早く動く`kodamausagi`向けに全体を詰めた`1→4→6→8→14`へ
  圧縮し、`upper`(`mid-top`)の振り角度も心持ち小さくする(耳が立った
  頭が過剰に暴れないように)。
- **hit**: HP22はパイロット`purun`(想定基準)よりやや低めなので、
  `purun`の`lower: (1.3, 0.66, 1.3)`をわずかに強め
  (`(1.36, 0.58, 1.36)`)にし、戻りを14f→11fへ短縮して、驚いてすぐ
  跳ねのく身のこなしを強調する。
- **idle**: 2骨構成のため`partial`による部位ずらしは`purun`と同じく
  適用しない。`akubitokage`が採用した「`upper`のキーだけ1〜2フレーム
  遅らせる」手法を踏襲し、耳の付け根に近い`upper`の傾きをわずかに
  遅らせて追従させる。
- **walk**: squash & stretchによる潰し伸ばしが接地の重みを表現する
  方針を維持し、loc接地沈みは`purun`と同じく提案しない。
- **die**: `purun`の構成をそのまま踏襲する(体格が小さいぶん、
  scale値の絶対量はやや小さくしてもよいが必須ではない)。

## 対象外

- 骨格・造形そのものの変更(既存の.glbジオメトリはそのまま)
- 新規クリップの追加(5クリップ構成は変えない)
- `purun_animations()`自体の変更(パイロットとしてすでに完了済み)

## 未決事項

- 上記の差別化(専用`kodamausagi_animations()`への切り出し)を実際に
  行うか、`return purun_animations()`のまま据え置くかは実装セッションの
  判断に委ねる。据え置く場合、この計画書は「現状のままで規約を満たして
  いることの確認」という結論になる。
- 具体的な角度・フレーム数の最終調整(実装する場合、プレビューで詰める)
