> **実装済み。** `tools/models/monsters.py`に`build_chouchinokuri()`/
> `chouchinokuri_animations()`を追加し、`MONSTERS`に登録した
> (`tools/venv/bin/python tools/build_models.py chouchinokuri`で
> `public/models/chouchinokuri.glb`を書き出し)。
>
> **骨格は計画書どおり`purun`の縦2本(`base-mid-top`)をそのまま流用した。**
> 未決事項にあった「アーマチュアの流用可否」は、半径を両端で絞り中央で
> 膨らませるだけで問題なく流用できることを確認した。関節名は完全に
> 同じまま座標・太さだけを差し替え、提灯らしい俵形のシルエットにした。
>
> **提灯の張り骨を、正面から見た角度による縞模様で表現した。**
> `assign_materials_by_region`のclassify関数に`math.atan2(c.x, -c.y)`で
> 求めた角度を渡し、`sin(angle * 6)`のしきい値で6本の縦縞(紅色の紙地と
> 橙色の骨)を作った。上下には金色の口輪(扁平なuv_sphere)を、中央には
> 内側からにじむ橙色の灯り(emissionマテリアルの`uv_sphere`)を仕込んだ。
>
> **配色は計画書どおり、くすんだ紅色に金色の名残、内側からにじむ橙色の
> 灯り。**
>
> **三角形数は2,384**(既存モデルの目安1,800〜7,500の範囲内)。
>
> **アニメーションは計画書どおり`purun_animations()`をそのまま呼び出す
> だけにした**(ボーン名が`purun`と同じ`base-mid`/`mid-top`のため流用
> できる。5クリップとも既存の枠のまま)。
>
> **見た目の確認は`tools/preview/chouchinokuri.png`のCyclesレンダーで
> 行った。** 提灯らしい縞模様と上下の金色の口輪がはっきり見て取れる。
> 裏返り・体積ゼロ・パーツの誤結合といった破綻はない。
> `tools/compare_models.mjs`で全モデル(45個)を再ビルドして構造(頂点数・
> クリップ名・外形)を突き合わせ、一致することも確認した。
>
> **`src/entities/species.ts`の`chouchinokuri.model`を`"purun"`→
> `"chouchinokuri"`に変更した。** `chouchinokuri`は60種化ロースター拡張
> (`plan/game/archive/monster-roster-expansion-species.md`)由来の種族でも
> あるため、`tests/monster-roster-expansion-species.test.ts`の
> `KNOWN_MODEL_IDS`に`chouchinokuri`を追記し、直前のコメントも更新した。
>
> `npx tsc --noEmit`・`npx vitest run`(1161/1161)・`npm run build`は
> すべてgreen。未決事項だった「最終的な三角形数・関節配置の微調整」は
> 上記の数値で確定させた。対象外の項目(装備の重ね表現)は計画書どおり
> 手を付けていない。

# ちょうちんおくり(chouchinokuri)の3Dモデル

現在は`purun`モデルを流用している(仮、`src/entities/species.ts`参照)。
`design/characters.md`の生態設定に基づき、専用モデルを新規に作る。

## 由来と見た目の方針

消えかけた祭りの灯り。群れで漂い、倒されるたび周囲がふっと照らされる。数少ない、寂しさの中にわずかな温かさを残す存在。

AI挙動(`swarm`)に合わせ、単体は簡略化した小さなシルエット(複数体まとめて配置される前提)にする。
配色は第7地方(わすれられた祭りの跡)のテーマに合わせ、
褪せた祭りを思わせる、くすんだ紅色・金色の名残を基調にする。

## 造形の方針

- 元にする骨格: 現在流用している`purun`と同じ関節構成をベースに、
  Skinモディファイア+サブディビジョンで作る(README記載の制作パイプライン)。
- 三角形数の目安: 既存モデル(1,800〜7,500程度)の範囲に収める。
- サイズ: 既存の`purun`モデルを基準に、ステータス(maxHp 18)に
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
