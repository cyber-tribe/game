> **実装済み。** `tools/models/monsters.py`に`build_subetenopurun()`/
> `subetenopurun_animations()`を追加し、`MONSTERS`に登録した
> (`tools/venv/bin/python tools/build_models.py subetenopurun`で
> `public/models/subetenopurun.glb`を書き出し)。
>
> **骨格は計画書どおり`purun`と同じ縦2本の関節構成をベースにした。**
> 未決事項にあった「アーマチュアの流用可否」は、座標・半径を全体で
> およそ1.2倍にする差し替えだけで問題なく流用できることを確認した。
>
> **「全地方の記憶が混ざり合った」由来を、第一〜第七地方それぞれの
> 配色を角度で不揃いに区切った継ぎ接ぎ模様として体にまとわせることで
> 表現した。** 各地方の配色は既存モデルのテーマ色から採った
> (第1: `oonebosuke`の淡い土色、第2: `nushigaeru`の水色系、
> 第3: `oomadoromi`の茸色、第4: `oitekeboshi`の白骨色、
> 第5: `namidaguma`の藍色系、第6: `kodamaNoNushi`の岩・土色、
> 第7: `misemonoNoNushi`の緋色)。まどろみの余韻の名残として、
> 目は`purun`本来の見開いた目よりわずかに眠たげにした。
>
> **三角形数は当初1,780と目安をわずかに下回ったため、`subsurf`を
> 2から3に上げて2,740に収めた**(既存モデルの目安1,800〜7,500の範囲内)。
>
> **アニメーションは`purun_animations()`を流用せず、新規に
> キーフレームを書いた。** `attack`はなみだぐまの瀕死時攻撃力上昇
> (`lowHpAtkBonusMax: 0.15`)も併せ持つ性質に合わせ、力強く踏み込んで
> 叩きつける動きにした(クリップ構成・ボーン名は変えていない)。
>
> **見た目の確認は`tools/preview/subetenopurun.png`のCyclesレンダーで
> 行った。** 裏返り・体積ゼロ・パーツの誤結合といった破綻はない。
> `tools/compare_models.mjs`で全モデル(64個)を再ビルドして構造(頂点数・
> クリップ名・外形)を突き合わせ、一致することも確認した。
>
> **`src/entities/species.ts`の`subetenopurun.model`を`"purun"`→
> `"subetenopurun"`に変更した。** `subetenopurun`は60種化ロースター拡張
> (`plan/game/archive/monster-roster-expansion-species.md`)由来の種族でも
> あるため、`tests/monster-roster-expansion-species.test.ts`の
> `KNOWN_MODEL_IDS`に`subetenopurun`を追記し、直前のコメントも更新した。
>
> `npx tsc --noEmit`・`npx vitest run`(1223/1223)・`npm run build`は
> すべてgreen。未決事項だった「最終的な三角形数・関節配置の微調整」は
> 上記の数値で確定させた。対象外の項目(装備の重ね表現)は計画書どおり
> 手を付けていない。

# すべてのぷるん(subetenopurun)の3Dモデル

現在は`purun`モデルを流用している(仮、`src/entities/species.ts`参照)。
`design/characters.md`の生態設定に基づき、専用モデルを新規に作る。

## 由来と見た目の方針

全地方の記憶が混ざり合ったぷるん。攻撃にわずかな眠りが乗るのは、ぷるん本来のまどろみの余韻がまだ芯に残っているため。

AI挙動(`melee`)に合わせ、がっしりした体格で、正面から迫る力強いシルエットにする。
配色は第8地方(めざめの前庭)のテーマに合わせ、
第一〜第七地方の色が淡く混ざり合った、統一感のない配色を基調にする。

## 造形の方針

- 元にする骨格: 現在流用している`purun`と同じ関節構成をベースに、
  Skinモディファイア+サブディビジョンで作る(README記載の制作パイプライン)。
- 三角形数の目安: 既存モデル(1,800〜7,500程度)の範囲に収める。
- サイズ: 既存の`purun`モデルを基準に、ステータス(maxHp 56)に
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
- 既存`purun`のアーマチュアをそのまま流用できるか、一部調整が要るか
