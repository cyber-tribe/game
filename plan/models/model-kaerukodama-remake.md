# かえるこだま(kaerukodama)のアニメーション作り直し

## 経緯

plan/game/archive/animation-quality-guidelines.mdでパイロット5体
(garudo/purun/gajiri/honegarami/tsubute)に適用したタメ・ツメ・二次揺れの
規約を、この種族の骨格ファミリー(`tsubute`と同じ関節構成`hip`-`chest`-
`head`、`armF.L,R`-`handF.L,R`、`kneeB.L,R`-`ankleB.L,R`-`footB.L,R`)にも
適用する。

## 現状

`build_kaerukodama()`は`tsubute`と同じ関節の"種類"を踏襲しつつ、座標は
ゼロから設計し直して全体を細く軽くし、後ろ足(`kneeB.L,R`/`ankleB.L,R`/
`footB.L,R`)だけを高く張り出させた「いつでも跳べる」姿勢にしたもの。
`kaerukodama_animations()`は`tsubute_animations()`を流用せず新規に
キーフレームを書いた(石投げのattackが「追い詰められて跳びかかる反撃」
という行動と噛み合わないため)。`head`(`chest-head`)・`armL,R`
(`chest-armF.L,R`)・`legL,R`(`hip-kneeB.L,R`)を使い、idle 4キー
(そわそわ見回す)・walk 4キー・attack 5キー(すでにタメ4f→跳びかかり8f→
行き過ぎ14f→戻り20fの4段構成!)・hit 3キー(振幅`head` 24°で12fに
戻る、fast-in/slow-outの形はすでにある)・die 2キーの構成だが、こちらも
`partial`・`interp`とも未使用のまま(tsubute本家remake前のスタイル)。
`ai: "coward"`(counterDamageRatio 0.2「追い詰めると跳ねて反撃する」、
maxHp 30, atk 17, def 8)。

## 打ち直しの方針

attackはすでに4段構成が組まれているため、今回の打ち直しは主に
`interp`/`partial`の付与とcowardらしい振幅の強調が中心になる。

- **attack**: 現行の「タメ(4f、`legL,R` +56°/`head` +20°/`armL,R` +34°)→
  跳びかかり(8f、`legL,R` -68°/`head` -28°/`armL,R` -60°)→行き過ぎ
  (14f、`legL,R` +8°程度の余韻)→戻り(20f)」の4段構成はそのままに、
  4f→8fの区間へ`{"interp": "LINEAR"}`を付けて跳躍の瞬発力を鋭くする
  だけでよい。
- **hit**: 現行の`hit`(4f→12f、`head` 24°)の入り(1f→4f)に
  `{"interp": "LINEAR"}`を足す。coward AIの「大きく怯み、素早く逃げに
  転じる」読み味を強めるため、振幅を`head` 24°→28°程度へ一回り
  大きくしつつ、戻りは12fのまま(むしろ11f程度へ短縮する案も検討)、
  「大きく怯んで素早く立て直す」性格を強調する。
- **idle**: 現行idle(10f・20f・30fで`head`が左右をきょろきょろ見回す)
  に対し、`armL,R`(前脚)を`head`より2フレーム遅らせる二次揺れが、
  tsubuteと同じ関節構成のためそのまま適用できる(tsubute本家の
  「腕が頭より2フレーム遅れる」二次揺れと同じ処方)。`head`の見回しに
  合わせ、`armL,R`が小さく(±4°程度)追従する動きを`{"partial": True}`で
  2フレーム遅らせて足す。「気配に敏感」な性質と両立する、落ち着かない
  揺れになる。
- **walk**: `chest`(0, -0.048, 0.168)から`hip`(0, 0.125, 0.150)への
  `chest-hip`ボーンはほぼ水平(tsubute本家と同じ、胴のローカルY軸が
  前後方向を向く)ため、**tsubute本家remake時の判断と同じ理由で接地沈み
  (`loc`)は見送る**。現行walk(3f・7f・11fで素早く小刻みに跳ねる)の
  テンポのみで逃げ足の速さを表現する方針を維持する。
- **die**: 現行の`die`(9f→20fの2段)の初動(1f→9f)に
  `{"interp": "LINEAR"}`を足す。20f到達後、`legL,R`/`armL,R`が一度小さく
  跳ね返ってから完全に崩れ落ちる段(24f付近)を追加する(tsubute本家の
  22f→26fの跳ね返りと同じ考え方)。
- squash & stretch: 骨組みに沿った剛体的な変形の造形(骨・関節を持つ
  蛙型)であり、スライム状の柔構造ではないため使わない。

## 対象外

- 骨格・造形そのものの変更(既存の.glbジオメトリはそのまま)
- 新規クリップの追加(5クリップ構成は変えない)

## 未決事項

- 具体的な角度・フレーム数の最終調整(実装時にプレビューで詰める)
- hitの戻り時間を12fのまま維持するか11f程度へ短縮するか
