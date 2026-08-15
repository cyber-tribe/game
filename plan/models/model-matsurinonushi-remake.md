# まつりのぬし(matsurinonushi)のアニメーション作り直し

## 経緯

plan/game/archive/animation-quality-guidelines.mdでパイロット5体
(garudo/purun/gajiri/honegarami/tsubute)に適用したタメ・ツメ・二次揺れの
規約を、この種族の骨格ファミリー(`tsubute`と同じ関節構成`hip`-`chest`-
`head`、`armF.L,R`-`handF.L,R`、`kneeB.L,R`-`ankleB.L,R`-`footB.L,R`)にも
適用する。

## 現状

`build_matsurinonushi()`はtsubute系の関節構成を踏襲しつつ、
menkaburikozoよりさらに立体感を削って地面すれすれに伏せるシルエットに
作り替えたもの(めんかぶりこぞう+かざりだるまの夢あわせで生まれた
配合限定種)。`ai: "ambush"`、`statusImmune: true`(状態異常を受け
なくなる)、maxHp 63, atk 31, def 16, minFloor 無限大。
`matsurinonushi_animations()`は`head`(`chest-head`)・`armL,R`
(`chest-armF.L,R`)・`legL,R`(`hip-kneeB.L,R`)を使う。idle 3キー
(1,48,96。非常に長い周期でほぼ静止)・walk 4キー(1,5,9,14。低い姿勢で
音も無く這うように距離を詰める)・attack 4キー(1,4,8,16。御守りごと
体ごとぶつかるように飛びかかる不意打ち)・hit 3キー(1,4,14)・die 3キー
(1,9,22)の構成だが、`partial`・`interp`とも未使用。

## 打ち直しの方針

- **attack**: 現行の「タメ(4f、`armL,R` ∓42°/±22°)→ぶつかり(8f、
  `armL,R` ±28°/∓8°)→戻り(16f)」に4f→8fの区間へ`{"interp": "LINEAR"}`
  を付ける。行き過ぎとして8f直後(10〜11f付近)に`armL,R`が±34°程度
  まで一瞬余分に前へ出る段を挟み16fへ戻す。
- **hit**: 1f→4fの入りに`{"interp": "LINEAR"}`を足す。def 16は
  パイロット中でも高めの部類(honegaramiのdef 8のおよそ2倍)なので、
  振幅を現行(`head` 17°/`armL,R` ±19°)よりやや小さく(`head` 12°/
  `armL,R` ±14°程度)、戻り時間も現行14fよりやや短く(11f程度)絞り、
  `statusImmune`という設定とも整合する「状態異常を受けないぶん揺れも
  小さい」性格づけを強める。
- **idle**: 現行idle(48f・96fの長い周期で`head`がわずかに動くのみ)の
  静けさは「悪戯を恐れず微動だにせず潜む」性質そのものであり維持する。
  tsubute本家と同じ「`armL,R`が`head`より2フレーム遅れる」型の二次
  揺れを、極小振幅(±1°程度)に留めて`{"partial": True}`で48f地点から
  2フレーム遅らせる程度の最小限の追加にする。
- **walk**: `chest`(0,-0.061,0.120)から`hip`(0,0.128,0.109)への
  `chest-hip`ボーンはtsubute本家と同じくほぼ水平(Y方向の変位が大きく
  Zはほぼ同じ高さ)。接地沈み(`loc`)は適用しない。現行walk(低い姿勢の
  まま音も無く這う)のテンポのみで表現する方針を維持する。
- **die**: 現行(1→9→22の2段)の初動(1→9f)に`{"interp": "LINEAR"}`を
  足す。22f到達後に小さな跳ね返り(揺り戻し)を1回追加する。
- squash & stretch: 骨組みに沿った剛体的な変形の造形であり、スライム状
  の柔構造ではないため使わない。

## 対象外

- 骨格・造形そのものの変更(既存の.glbジオメトリはそのまま)
- 新規クリップの追加(5クリップ構成は変えない)

## 未決事項

- 具体的な角度・フレーム数の最終調整(実装時にプレビューで詰める)
