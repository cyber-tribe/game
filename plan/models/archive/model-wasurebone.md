> **実装済み。** `tools/models/monsters.py`に`build_wasurebone()`/
> `wasurebone_animations()`を追加し、`MONSTERS`に登録した
> (`tools/venv/bin/python tools/build_models.py wasurebone`で
> `public/models/wasurebone.glb`を書き出し)。
>
> **骨格は計画書どおり`honegarami`と同じ人型骨組みをベースにした。**
> 未決事項にあった「アーマチュアの流用可否」は、座標をおよそ0.7倍に
> 縮め、前かがみの姿勢に組み替えることで問題なく流用できることを
> 確認した。四肢を`honegarami`よりさらに細くし、肋骨の数も減らして
> 隙間だらけの粗末な体にした。
>
> **「小柄で華奢な、逃げ足の速さを感じさせる」由来を、不安げに大きく
> 見開いた眼窩と、`honegarami`の力強い橙色より弱々しい青白い光で
> 表現した。**
>
> **配色は計画書どおり、第四地方(骨積みの回廊)の白骨色・くすんだ灰色。**
>
> **三角形数は5,836**(既存モデルの目安1,800〜7,500の範囲内)。
>
> **アニメーションは`honegarami_animations()`を流用せず、新規に
> キーフレームを書いた。** `idle`は気配に怯えるようにびくびくと震え、
> `hit`は非力な体がわずかな一撃でも大きくよろける動きにした
> (クリップ構成・ボーン名は変えていない)。
>
> **見た目の確認は`tools/preview/wasurebone.png`のCyclesレンダーで
> 行った。** 裏返り・体積ゼロ・パーツの誤結合といった破綻はない。
> `tools/compare_models.mjs`で全モデル(79個)を再ビルドして構造(頂点数・
> クリップ名・外形)を突き合わせ、一致することも確認した。
>
> **`src/entities/species.ts`の`wasurebone.model`を`"honegarami"`→
> `"wasurebone"`に変更した。** `wasurebone`は60種化ロースター拡張
> (`plan/game/archive/monster-roster-expansion-species.md`)由来の種族でも
> あるため、`tests/monster-roster-expansion-species.test.ts`の
> `KNOWN_MODEL_IDS`に`wasurebone`を追記し、直前のコメントも更新した。
>
> `npx tsc --noEmit`・`npx vitest run`(1253/1253)・`npm run build`は
> すべてgreen。未決事項だった「最終的な三角形数・関節配置の微調整」は
> 上記の数値で確定させた。対象外の項目(装備の重ね表現)は計画書どおり
> 手を付けていない。

# わすれぼね(wasurebone)の3Dモデル

現在は`honegarami`モデルを流用している(仮、`src/entities/species.ts`参照)。
`design/characters.md`の生態設定に基づき、専用モデルを新規に作る。

## 由来と見た目の方針

誰のものかも忘れられた骨。1体では非力だが、倒されると周りの骨系のモンスターを奮い立たせる。

AI挙動(`coward`)に合わせ、小柄で華奢な、逃げ足の速さを感じさせる軽いシルエットにする。
配色は第4地方(骨積みの回廊)のテーマに合わせ、
積み重なった骨を思わせる、白骨色・くすんだ灰色を基調にする。

## 造形の方針

- 元にする骨格: 現在流用している`honegarami`と同じ関節構成をベースに、
  Skinモディファイア+サブディビジョンで作る(README記載の制作パイプライン)。
- 三角形数の目安: 既存モデル(1,800〜7,500程度)の範囲に収める。
- サイズ: 既存の`honegarami`モデルを基準に、ステータス(maxHp 24)に
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
