> **実装済み。** `src/entities/player.ts`の`gainExp`のレベルアップ判定
> ループ内、`player.hp += 6`を`player.hp = player.maxHp`に置き換えた
> (計画書どおり、`player.maxHp += 6`を先に適用した直後に代入するため、
> 複数レベル同時に上がる場合も各回でそのつどmaxHpまで回復し、最終的に
> 最新のmaxHpまで全回復される)。既存の`tests/protagonist-training.test.ts`・
> `tests/game.test.ts`はHPを直接検証していなかったため無改修のまま通過。
> 新規`tests/levelup-full-heal.test.ts`(3件)で、HPが減っている状態からの
> 全回復・複数レベル同時上昇時の全回復・レベルが上がらない場合はHPが
> 変化しないことを検証した。
>
> `npx tsc --noEmit` / `npx vitest run`(1132件)/ `npm run build`いずれもgreen。

# レベルアップ時にHPを全回復する

## 現状

`src/entities/player.ts` の `gainExp` は、レベルが上がるたびに
`maxHp += 6` と同時に `hp += 6` しているだけで、**現在HPが最大HPまで
届いていなければ差分は残ったまま**になる。たとえば残りHP1でレベルが
上がっても、HP7(最大HP+6分)にしかならない。

## 変更方針

レベルアップの瞬間、**現在HPを最大HPまで全回復する**。

- 対象は`gainExp`(`src/entities/player.ts`)のレベルアップ判定ループ内。
  `player.hp += 6` を、そのレベルアップ後の`player.maxHp`まで
  `player.hp`を引き上げる処理に置き換える。
- 1回の経験値獲得で複数レベル同時に上がる場合も、ループの各回で
  そのつどmaxHpまで回復してよい(最終的に最新のmaxHpまで全回復されて
  いれば結果は同じ)。
- 対象はプレイヤー(ガルド)のみ。仲間(companion)は`gainExp`を使った
  経験値レベリングの対象になっておらず(`plan/archive/companion-evolution.md`
  ・`plan/archive/companion-bond-growth.md`の別の成長軸で扱う)、
  この変更の対象外。

## 狙い

深く潜るほど回復手段(食料・道具)が貴重になる中、レベルアップという
明確な区切りで体力の不安を一度リセットできるようにし、「ピンチのまま
レベルが上がってもジリ貧が続く」という理不尽さを避ける。多くの
ローグライクで採用されている一般的な救済であり、`design/balance-philosophy.md`
の難易度カーブを崩すほどの強化ではない(経験値を得るペース自体は
変えないため、回復のタイミングが早まるだけ)。

## 対象外

- 仲間(companion)側のHP回復ロジックの変更
- レベルアップ時のHP以外のステータス(atk/def)成長量の見直し
