# ねぼすけがえる(nebosukegaeru)のアニメーション作り直し

## 経緯

plan/game/archive/animation-quality-guidelines.mdでパイロット5体
(garudo/purun/gajiri/honegarami/tsubute)に適用したタメ・ツメ・二次揺れの
規約を、この種族の骨格ファミリー(tsubute/gajiriと同じ`chest-head`
`chest-hip`の胴+腕(`armF`)+脚(`kneeB`)構成)にも適用する。

## 現状

`build_nebosukegaeru()`はtsubuteの関節構成をベースに、ずんぐりした蛙より
ひと回り小さく華奢に、まぶたが重く垂れた眠たげな目に作り直し済み。
`nebosukegaeru_animations()`はidle 3キー(深く眠るほぼ静止)、walk 4キー、
attack 5キー(すでにタメ→大跳ね→戻りかけ→戻りの4段構成)、hit 3キー、
die 3キーで、`interp`・`partial`とも未使用。

## 打ち直しの方針

`head = "chest-head"`、`armL/armR = "chest-armF.L/R"`、
`legL/legR = "hip-kneeB.L/R"`を使う。

- **attack**(coward、起こされて跳ねて反撃): 現行はすでに1→4(タメ)→8
  (大跳ね)→14(戻りかけ)→20(戻り)の4段構成なので大枠は維持しつつ、
  4→8の跳ねる瞬間に`interp: LINEAR`を追加して鋭さを出す。counter属性の
  「起こされて驚いて跳ねる」性格に合わせ、タメ(1→4)はねぼすけらしく
  今のまま長めに保つ。
- **hit**: 1f→4fの入りに`interp: LINEAR`を足して鋭さを強調。cowardらしく
  振幅(`head`20°、`armL/armR`24°)は現行どおり大きめに保ち、戻り
  (4f→14f)はゆっくりのまま。
- **idle**: 現行は1→48→96の3キーで`head`がわずかに動くだけの深い眠りを
  表現済み。この構造は維持しつつ、`armL`/`armR`を`head`より3〜4フレーム
  遅らせて追従させる(`{"partial": True}`で48fの少し後にキーを追加)、
  眠りに落ちた体の重みを感じさせる二次揺れを追加する。
- **walk**: `head`はtsubute/gajiriと同じく胴の骨がほぼ水平を向く構成の
  ため、honegarami/garudoのような`loc`接地沈みは見送る(gajiriの
  打ち直しと同じ判断理由)。現行の小刻みな跳びはねは維持する。
- **die**: 現行の1f→10fの初動に`interp: LINEAR`を足して鋭さを出す。
  10f→24fの伸びきった姿勢のあと、24f以降にわずかな跳ね返り
  (`head`をほんの少し戻す1キー)を追加する。
- squash & stretch: 骨(Skin)ベースの造形のため使わない。

## 対象外

- 骨格・造形そのものの変更(既存の.glbジオメトリはそのまま)
- 新規クリップの追加(5クリップ構成は変えない)

## 未決事項

- 具体的な角度・フレーム数の最終調整(実装時にプレビューで詰める)
