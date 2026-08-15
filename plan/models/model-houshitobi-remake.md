# ほうしとび(houshitobi)のアニメーション作り直し

## 経緯

plan/game/archive/animation-quality-guidelines.mdでパイロット5体
(garudo/purun/gajiri/honegarami/tsubute)に適用したタメ・ツメ・二次揺れの
規約を、この種族の骨格ファミリー(`madoromi`(マドロミダケ)と同じ縦の
キノコ状骨組み`root`-`stem`-`capbase`-`captop`をベースに、噴出口`spout`と
左右の触手`tendril.L,R`-`tendriltip.L,R`を足したもの)にも適用する。

## 現状

`build_houshitobi()`は`madoromi`の縦骨組みを踏襲しつつ、傘の先から
まっすぐ伸びる噴出口(`spout`)と、発射の反動を受け止める左右の触手
(`tendril.L,R`)を新たに足した骨格。`houshitobi_animations()`は
`trunk1`(`root-stem`)・`trunk2`(`stem-capbase`)・`cap`(`capbase-captop`)・
`spout`(`capbase-spout`)・`tendrilL,R`(`capbase-tendril.L,R`)を使い、
idle 3キー(28f・56fでゆっくり漂う)・walk 5キー(触手を交互にはためかせる)
・attack 4キー(ためてから噴出口を突き出し胞子を撃つ、すでに
タメ→発射→戻りの3段構成)・hit 3キー・die 2キーの構成だが、`partial`・
`interp`とも未使用。`ai: "ranged"`(range 4, 睡眠付与15%)の遠隔attacker
で、脚を持たず漂う浮遊系の造形。

## 打ち直しの方針

- **attack**: 現行の「タメ(5f、`spout` +24°/`trunk2` -9°)→発射(10f、
  `spout` -32°/`trunk2` +11°)→戻り(20f)」の3段の、5f→10fの区間へ
  `{"interp": "LINEAR"}`を付けて「勢いよく突き出し胞子を撃ち放つ」瞬間を
  鋭くする。行き過ぎとして10f直後(13f付近)に`spout`が-20°程度・
  `trunk2`が+7°程度まで一瞬余分に戻る段を挟み、20fで漂う構えに戻す。
- **hit**: 現行の`hit`(4f→14f、`trunk2` -16°/`cap` -14°)の入り(1f→4f)に
  `{"interp": "LINEAR"}`を足す。振幅・戻り時間は現行のまま維持する。
- **idle**: `tendrilL,R`(左右の触手)を`trunk2`/`cap`(幹・傘)より2〜3
  フレーム遅らせる二次揺れが適用できる。現行idle(28f・56fの2キー)の
  `tendrilL,R`の動き(±16°)だけ`{"partial": True}`で2フレーム遅らせ
  (30f・58f)、「傘の揺れに触手が遅れて追従する」漂いを出す。
- **walk**: `root`(z=0.06)→`stem`(z=0.19)と垂直に伸びるスパインを持つが、
  houshitobiは脚を持たず宙に漂う浮遊系のため、honegarami/garudoのような
  接地沈み(`loc`)は適用しない。guidelines.mdの「浮遊系は逆に上下動を
  滑らかに保つ」方針どおり、現行walkの`trunk1`/`trunk2`の左右への傾ぎと
  触手のはためきをそのまま滑らかなbezier補間(`interp`指定なし)で維持し、
  LINEARで角張らせない。
- **die**: 現行の`die`(10f→24fの2段、傘と触手をしぼませながら幹から
  崩れ落ちる)の初動(1f→10f)に`{"interp": "LINEAR"}`を足す。24f到達後、
  しぼみきる直前に傘(`cap`)と`trunk1`がわずかに戻る、萎れの小さな
  跳ね返りを1回追加する(honegaramiの着地バウンドと同じ考え方を、
  「倒れる」のではなく「萎れる」動きに置き換える)。
- squash & stretch: キノコ状の芯を持つ造形で、骨組みに沿った剛体的な
  変形のため使わない。

## 対象外

- 骨格・造形そのものの変更(既存の.glbジオメトリはそのまま)
- 新規クリップの追加(5クリップ構成は変えない)

## 未決事項

- 具体的な角度・フレーム数の最終調整(実装時にプレビューで詰める)
