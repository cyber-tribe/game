# スリガラス(surigarasu)のアニメーション作り直し

## 経緯

plan/game/archive/animation-quality-guidelines.mdでパイロット5体
(garudo/purun/gajiri/honegarami/tsubute)に適用したタメ・ツメ・二次揺れの
規約を、この種族の骨格ファミリー(`gajiri`と同じ`hip`/`chest`/`neck`/
`snout`/`tail1,2,3`/`ear.L`/`hipF.L,R`/`footF.L,R`/`hipB.L,R`/
`footB.L,R`の四つ足構成)にも適用する。

## 現状

`build_surigarasu()`は`gajiri`と同じ関節構成をベースに、細身ですばやそう
な鳥のシルエットに作り替え、平たい翼と嘴、扇状の尾羽を足した姿。
`surigarasu_animations()`は`neck,snout = "chest-neck","neck-snout"`、
`hipF_L,R = "chest-hipF.L,R"`、`hipB_L,R = "hip-hipB.L,R"`を使い、
gajiriと違って尻尾(tail1)は一切動かさない。idle 4キー(14f・28f・42fで
neckがきょろきょろ首を振る)・walk 3キー(hipF/hipBが跳ねるように交互に
振れる)・attack 4キー(neckが-10°まで引いてhipF_L,Rが∓30まで開いてから
戻る、素早く近づいて掠め取る動き)・hit 3キー・die 3キーの構成で、
`partial`・`interp`とも未使用。`thief`AI、maxHp 8・atk 4・def 1という
紙装甲(近道屋の強欲さが夢に映り込んでできた、寄生的な夢のかけら)。

## 打ち直しの方針

`chest-hip`の関節(chest: y=-0.02, z=0.15 / hip: y=0.09, z=0.13)は
Y方向の差(0.11)がZ方向の差(0.02)よりずっと大きく、ほぼ水平に寝て
いる。パイロットのgajiriで「胴の骨がほぼ水平のため接地沈みを見送った」
のと同じ構造(実際に同じ関節構成を流用したファミリー)のため、歩行の
接地沈みはここでも見送る。

- **attack**: 現行の「引く(4f、neck -10°、hipF_L,R ∓30)→戻る(8f、
  neck +14°、hipF_L,R ∓22)→構えに戻る(16f)」の構成を、タメ(1→4f、
  ゆっくりneckを-12°まで引いて身をかがめる)→ツメ(4→7f、LINEARで
  neckを+18°まで鋭く伸ばし、hipF_L,Rを∓36まで一気に開いて掠め取る)→
  行き過ぎ(7→9f、hipF_L,Rが∓40まで一瞬余分に開く)→戻り(9→16f、
  飛び去る構えに戻る)の4段に分ける。`thief`らしく間合いを詰める
  フレーム数自体はパイロットのtsubuteより詰めたまま(俊敏さを維持)。
- **hit**: 防御1というごく薄い装甲のため、振幅は大きめに保つ
  (akubitokageのcowardと同じ「紙装甲は大きく怯む」考え方)。現行の
  `hit`(4f→12f、neck +12°、hipF_L,R ∓14)の入り(1f→4f)に
  `{"interp": "LINEAR"}`を足し、振幅をneck +18°、hipF_L,R ∓20程度まで
  大きくする一方、`thief`らしくすぐ逃げに転じるため戻りは伸ばさず
  現行の12f程度のまま速く戻す。
- **idle**: 尻尾(tail1)を`neck`より2〜3フレーム遅らせる二次揺れが
  適用できる(gajiriと同じ骨格のため、gajiriと同じ手法をそのまま
  流用できる)。現行idle(14f・28f・42fの3キー)のneckの首振りに対し、
  `tail1`の動き(±12°程度)だけ`{"partial": True}`で17f・31f・45f地点に
  3フレーム遅らせて足し、「光るものを探してきょろきょろする」動きに
  尻尾が遅れて追従する揺れを加える。
- **walk**: 上記のとおり`chest-hip`が水平な構造のため、`loc`ベースの
  接地沈みは適用しない。現行walkの跳ねるような歩行のリズムはそのまま
  維持する。
- **die**: 現行の`die`(8f→18fの2段、neckとhipF_L,Rが崩れる)の初動
  (1f→8f)に`{"interp": "LINEAR"}`を足し、「寄生的な夢のかけら」が
  断ち切られる鋭さを出す。18f到達後、消える直前にneckがわずかに戻る
  小さな跳ね返りを1回追加する。
- squash & stretch: 骨格を持つ鳥型の造形のため使わない。

## 対象外

- 骨格・造形そのものの変更(既存の.glbジオメトリはそのまま)
- 新規クリップの追加(5クリップ構成は変えない)

## 未決事項

- 具体的な角度・フレーム数の最終調整(実装時にプレビューで詰める)
