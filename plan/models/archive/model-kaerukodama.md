> **実装済み。** `tools/models/monsters.py`に`build_kaerukodama()`/
> `kaerukodama_animations()`を追加し、`MONSTERS`に登録した
> (`tools/venv/bin/python tools/build_models.py kaerukodama`で
> `public/models/kaerukodama.glb`を書き出し)。
>
> **骨格は計画書どおり`tsubute`と同じ関節の"種類"(hip/chest/head/armF/
> handF/kneeB/ankleB/footB)をベースにした。** `plan/models/archive/
> model-nebosukegaeru.md`と同じ前例に倣い、座標・太さはゼロから設計し
> 直している(`tsubute`比で全体を細く軽くしつつ、後ろ足(kneeB/ankleB/
> footB)だけをtsubuteより高く大きく張り出させ、「いつでも跳べる」姿勢に
> した)。未決事項にあった「アーマチュアの流用可否」は、関節の種類・
> ボーン構成をそのまま使い、座標だけの差し替えで問題なく流用できることを
> 確認した。
>
> **石は持たせず、代わりに喉の鳴き袋を追加した。** `tsubute`は投げる石を
> 手に持つが、`kaerukodama`は遠隔攻撃をしないためこの小物は不要。代わりに
> 「跳ね返る声を追いかける」という由来にちなみ、口の下に小さな
> `uv_sphere`の鳴き袋を足した。目は`tsubute`よりわずかに大きく、
> 常に警戒しているような見開き方にして「気配に敏感」な性質を表した。
>
> **配色は計画書どおり岩肌の灰色と乾いた土色の2トーン。**
> `assign_materials_by_region`で、`tsubute`と同じく真下を向いた面だけを
> 腹色(乾いた土色)に、それ以外を岩肌の灰色にした。
>
> **三角形数は4,684**(既存モデルの目安1,800〜7,500の範囲内)。
>
> **アニメーションは`tsubute_animations()`を流用せず、新規にキーフレーム
> を書いた。** これも`model-nebosukegaeru.md`と同じ判断で、石投げの
> `attack`モーションが「追い詰められて跳びかかる反撃」という行動と
> 噛み合わないため。ただしクリップ構成(idle/walk/attack/hit/die の
> 5つ、ボーン名も`chest-head`等tsubuteと同一)は変えていない
> ("新規モーション制作は増やさない"という計画書の意図は、クリップ数を
> 増やさない、既存パイプラインのまま作る、という点で守っている)。
> `walk`はtsubuteよりフレーム間隔を詰めて素早さを、`idle`は左右を
> きょろきょろ見回す落ち着きのなさを表現した。
>
> **見た目の確認は`tools/preview/kaerukodama.png`のCyclesレンダーで行った。**
> 裏返り・体積ゼロ・パーツの誤結合といった破綻はない。
> `tools/compare_models.mjs`で全モデル(35個)を再ビルドして構造(頂点数・
> クリップ名・外形)を突き合わせ、一致することも確認した。
>
> **`src/entities/species.ts`の`kaerukodama.model`を`"tsubute"`→
> `"kaerukodama"`に変更した。** `kaerukodama`は60種化ロースター拡張
> (`plan/game/archive/monster-roster-expansion-species.md`)由来の種族でも
> あるため、`tests/monster-roster-expansion-species.test.ts`の
> `KNOWN_MODEL_IDS`に`kaerukodama`を追記し、直前のコメントも更新した。
>
> `npx tsc --noEmit`・`npx vitest run`(1131/1131)・`npm run build`は
> すべてgreen。未決事項だった「最終的な三角形数・関節配置の微調整」は
> 上記の数値で確定させた。対象外の項目(装備の重ね表現)は計画書どおり
> 手を付けていない。

# かえるこだま(kaerukodama)の3Dモデル

現在は`tsubute`モデルを流用している(仮、`src/entities/species.ts`参照)。
`design/characters.md`の生態設定に基づき、専用モデルを新規に作る。

## 由来と見た目の方針

跳ね返る声を追いかける小さな生き物。気配に敏感ですぐ逃げるが、追い詰められると跳ねて反撃する。

AI挙動(`coward`)に合わせ、小柄で華奢な、逃げ足の速さを感じさせる軽いシルエットにする。
配色は第6地方(こだまの尾根)のテーマに合わせ、
吹きさらしの尾根らしい、岩肌の灰色と乾いた土色を基調にする。

## 造形の方針

- 元にする骨格: 現在流用している`tsubute`と同じ関節構成をベースに、
  Skinモディファイア+サブディビジョンで作る(README記載の制作パイプライン)。
- 三角形数の目安: 既存モデル(1,800〜7,500程度)の範囲に収める。
- サイズ: 既存の`tsubute`モデルを基準に、ステータス(maxHp 30)に
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
