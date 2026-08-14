> **実装済み。** `tools/models/monsters.py`に`build_matsurinonushi()`/
> `matsurinonushi_animations()`を追加し、`MONSTERS`に登録した
> (`tools/venv/bin/python tools/build_models.py matsurinonushi`で
> `public/models/matsurinonushi.glb`を書き出し)。
>
> **「のぬし」という名前だが、地方ボスではない。** `src/entities/species.ts`
> の`matsurinonushi`は`plan/game/archive/monster-roster-expansion-species.md`
> 系統ではなく、`plan/game/region-bosses.md`が定義する地方ボス群(minFloor
> 固定・専用配置)とも別枠の、通常出現する「夢あわせ」種族(コメントに
> 「めんかぶりこぞう+かざりだるまの夢あわせ」とある)。maxHp 63・atk 31・
> def 16というステータスも、同じく通常種の`menkaburikozo`(maxHp 42)・
> `kageboushi`(maxHp 38)と地続きの範囲に収まり、地方ボス(`kazaridaruma`
> 単体で見ても`ai: "guard"`のほうがまだ近いが、それでも通常種の域)と
> 比べて突出して大きくも硬くもない。したがって造形も、地方ボス級の巨大な
> ものではなく、`ai: "ambush"`にふさわしい等身大の潜伏役として作った。
>
> **骨格は計画書どおり`tsubute`と同じ関節構成をベースにした。**
> `plan/models/archive/model-menkaburikozo.md`・
> `plan/models/archive/model-kageboushi.md`と同じ同系統の奇襲役(ambush
> AI)として、`hip/chest/head/armF/handF/kneeB/ankleB/footB`をそのまま
> 流用し、アーマチュアの流用に問題は生じなかった(未決事項はこれで解消)。
> `menkaburikozo`よりもさらに立体感を削り、地面すれすれに伏せる平たい
> シルエットにした。全体は`menkaburikozo`(maxHp 42)を基準に約1.11倍へ
> 拡大し、`kazaridaruma`(maxHp 80)ほどは大きくしていない。
>
> **由来(めんかぶりこぞう+かざりだるまの夢あわせ)どおり、造形も2種の
> 折衷にした。** `menkaburikozo`のマスク由来の紅色を残しつつ彩度を
> 大きく落として「わすれられた祭りの跡」の褪せた紅色にし、`kazaridaruma`
> の金の帯を腹まわりに一筋だけ名残として残した。胸には、状態異常を退ける
> 由来にちなんだ御守りの結び目を1つだけ据え、控えめな発光(emission)で
> 目立たない配色を崩さない範囲に留めた。目は`menkaburikozo`の見開いた
> 面の穴・`kageboushi`の三日月形とは逆に、警戒して見開く必要がない
> (=状態異常を恐れない)ことの裏返しとして、ただ静かに閉じただけの
> 細い線にした。
>
> **三角形数は3,520**(既存モデルの目安1,800〜7,500の範囲内)。
>
> **アニメーションは既存5クリップの構成のまま、`menkaburikozo`・
> `kageboushi`と同系統のキーフレームを新規に書いた。** `idle`は気配を
> 消してほぼ静止、`walk`は低い姿勢のまま這うように接近、`attack`は
> 御守りごと体ごとぶつかる不意打ち、`hit`は状態異常を受けないぶん
> わずかに揺れるだけの控えめな被弾モーションにした。
>
> **見た目の確認は`tools/preview/matsurinonushi.png`のCyclesレンダーで
> 行った。** 裏返り・体積ゼロ・パーツの誤結合といった破綻はない。
> `tools/build_models.py --no-preview`で全70件を再ビルドし、
> `matsurinonushi`以外に差分が出ないことを確認した(非決定的な書き出しで
> 変化した他モデルの`.glb`・プレビューPNGは`git checkout`で戻した)。
>
> **`src/entities/species.ts`の`matsurinonushi.model`を`"tsubute"`→
> `"matsurinonushi"`に変更した。** `matsurinonushi`は
> `tests/monster-roster-expansion-species.test.ts`が対象とする60種化
> ロースター拡張(固定30種・`SPECIES.length`の件数アサーションつき)には
> 含まれない種族のため、同テストの`NEW_SPECIES_IDS`/`KNOWN_MODEL_IDS`には
> 追記していない。
>
> `npx tsc --noEmit`・`npx vitest run`(1235/1235)・`npm run build`は
> すべてgreen。未決事項だった「最終的な三角形数・関節配置の微調整」「既存
> `tsubute`のアーマチュアの流用可否」は上記のとおり確定させた。対象外の
> 項目(装備の重ね表現)は計画書どおり手を付けていない。

# まつりのぬし(matsurinonushi)の3Dモデル

現在は`tsubute`モデルを流用している(仮、`src/entities/species.ts`参照)。
`design/characters.md`の生態設定に基づき、専用モデルを新規に作る。

## 由来と見た目の方針

状態異常を受けつけなくなった姿。祭りの高揚が、正気を失わせる悪戯からも自分を守るようになった。

AI挙動(`ambush`)に合わせ、周囲に溶け込む、平たく低いシルエット。目立たない配色にする。
配色は第7地方(わすれられた祭りの跡)のテーマに合わせ、
褪せた祭りを思わせる、くすんだ紅色・金色の名残を基調にする。

## 造形の方針

- 元にする骨格: 現在流用している`tsubute`と同じ関節構成をベースに、
  Skinモディファイア+サブディビジョンで作る(README記載の制作パイプライン)。
- 三角形数の目安: 既存モデル(1,800〜7,500程度)の範囲に収める。
- サイズ: 既存の`tsubute`モデルを基準に、ステータス(maxHp 63)に
  見合う大きさに調整する。

## アニメーション

既存5クリップ(待機・歩行・攻撃・被弾・消滅)の構成をそのまま流用する。
新規モーション制作は増やさない(アーマチュア+自動ウェイト→キーフレームの
既存パイプラインをそのまま適用する)。

## 対象外

- 造形の最終決定(実装時に`tools/models/`のスクリプトで確定させる)
- `plan/equipped-weapon-visual.md`のような装備の重ね表現(このモンスターには該当しない)

## 未決事項

- 最終的な三角形数・関節配置の微調整
- 既存`tsubute`のアーマチュアをそのまま流用できるか、一部調整が要るか
