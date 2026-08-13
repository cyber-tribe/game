> **実装済み。** `tools/models/monsters.py`に`build_fuchiNoNushi()`/
> `fuchiNoNushi_animations()`を追加し、`MONSTERS`に登録した
> (`tools/venv/bin/python tools/build_models.py fuchiNoNushi`で
> `public/models/fuchiNoNushi.glb`を書き出し)。
>
> **骨格は計画書どおり`honegarami`と同じ人型骨組みをベースにした。**
> 未決事項にあった「アーマチュアの流用可否」は、座標の差し替えだけで
> 問題なく流用できることを確認した。`yamabikooni`の力強い直立とは
> 異なり、`nedayamabiko`と同じ低い重心・前傾した姿勢にし、「悲しみの
> 重さでうつむいている」ような佇まいにした。
>
> **配色は計画書どおり、涙と滝つぼを思わせる沈んだ青・藍色系。**
> `assign_materials_by_region`で高さにより2トーンに塗り分け、目には
> 発光する淡い水色を使った。肩と顎から涙のしずく(半透明感のある
> 青いuv_sphere、わずかに発光)を垂れ下げて、由来を視覚化した。
>
> **三角形数は4,400**(既存モデルの目安1,800〜7,500の範囲内)。
>
> **アニメーションは`honegarami_animations()`を流用せず、新規に
> キーフレームを書いた。** `idle`は動じることなく淵の底に居座る
> ほとんど静止した待機、`attack`は淵の水を巻き込むように重々しく
> 両腕を振り下ろす動きにした(クリップ構成・ボーン名は変えていない)。
>
> **見た目の確認は`tools/preview/fuchiNoNushi.png`のCyclesレンダーで
> 行った。** 沈んだ藍色の体・発光する目・涙のしずくがはっきり見て取れる。
> 裏返り・体積ゼロ・パーツの誤結合といった破綻はない。
> `tools/compare_models.mjs`で全モデル(51個)を再ビルドして構造(頂点数・
> クリップ名・外形)を突き合わせ、一致することも確認した。
>
> **`src/entities/species.ts`の`fuchiNoNushi.model`を`"honegarami"`→
> `"fuchiNoNushi"`に変更した。** `fuchiNoNushi`は地方ボス
> (`minFloor: Infinity`・`weight: 0`)のため
> `tests/monster-roster-expansion-species.test.ts`の60種化ロースター拡張
> (`NEW_SPECIES_IDS`)には含まれておらず、`KNOWN_MODEL_IDS`の更新は
> 不要だった。
>
> `npx tsc --noEmit`・`npx vitest run`(1173/1173)・`npm run build`は
> すべてgreen。未決事項だった「最終的な三角形数・関節配置の微調整」は
> 上記の数値で確定させた。対象外の項目(装備の重ね表現)は計画書どおり
> 手を付けていない。

# 淵の主(fuchiNoNushi)の3Dモデル

現在は`honegarami`モデルを流用している(仮、`src/entities/species.ts`参照)。
`design/characters.md`の生態設定に基づき、専用モデルを新規に作る。

## 由来と見た目の方針

滝つぼの一番深いところに沈んだ、この地方でもっとも重い悲しみが凝った姿。動じることなく淵の底に居座り、地方の主として滝つぼ全体を見渡す。

AI挙動(`melee`)に合わせ、がっしりした体格で、正面から迫る力強いシルエットにする。
配色は第5地方(なみだの滝つぼ)のテーマに合わせ、
涙と滝つぼを思わせる、沈んだ青・藍色系を基調にする。

## 造形の方針

- 元にする骨格: 現在流用している`honegarami`と同じ関節構成をベースに、
  Skinモディファイア+サブディビジョンで作る(README記載の制作パイプライン)。
- 三角形数の目安: 既存モデル(1,800〜7,500程度)の範囲に収める。
- サイズ: 既存の`honegarami`モデルを基準に、ステータス(maxHp 114)に
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
- 既存`honegarami`のアーマチュアをそのまま流用できるか、一部調整が要るか
