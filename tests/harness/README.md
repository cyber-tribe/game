# テスト用の箱庭ダンジョン

`plan/game/test-dungeon-harness.md` で決めた、フロアの状態を丸ごと外から
差し込める箱庭。**動くのは本物のゲームそのもの**(描画・HUD・タッチ操作・
メニューまでフルセット)で、差し替わるのはダンジョンの状態(`generateFloor`
の乱数生成)だけ。箱庭はテスト専用で、通常プレイからは一切到達できない
(本番ビルドの成果物からも消える。「なぜ消えるか」は
[注入口](#1-注入口-windowtestharness)の節を参照)。

## 実行方法

```sh
npm run test:e2e
```

`tests/e2e/*.test.ts` を、`vitest.e2e.config.ts` の設定で実行する
(実ブラウザとVite devサーバーの起動を伴うため重く、通常の`npm test`
には含まれない)。テストファイルは直列に実行される(実ブラウザ+dev
サーバーを毎回起動するため、並行実行するとCPUを奪い合ってタイムアウト
しやすくなる)。

ローカルの `npx vitest run --config vitest.e2e.config.ts tests/e2e/movement.test.ts`
のように、特定の1ファイルだけ動かすこともできる。

## 1. 注入口(`window.__testHarness`)

`src/application/dungeonRun/game.ts` の `Game` コンストラクタと
`src/main.ts` の `App.startInjectedTestRun` に、通常の
`generateFloor` を経由せず、与えられた `FloorState` とプレイヤー
初期状態でダイブを始める入口がある。この入口は
`import.meta.env.MODE === "test"` のときだけ有効で、`vite dev --mode test`
のようにテストモードで起動したときだけ `window.__testHarness` として
生える。本番ビルド(`npm run build`、既定モードは"production")では
このガードが常に`false`になる式へ置き換わり、Terserがブロックごと
dead code除去する。**通常プレイのどのUIからもこの入口へ辿る導線は無い**。

`tests/harness/server.ts` の `startTestServer()` が、テストごとに
`mode: "test"` のVite devサーバーを1つ起動する(ポート0でOSに空きポートを
割り当てさせるので、並行実行しても衝突しない)。

## 2. 箱庭ビルダー(`tests/harness/floor.ts`)

`buildTestFloor(asciiMap, opts)` で、ASCIIマップから `FloorState` を
乱数を使わず宣言的に組み立てる:

```ts
import { buildTestFloor } from "./floor";

const { floor, at } = buildTestFloor(`
  ##########
  #@...p...#
  #....#...#
  #..b.#..>#
  ##########
`, {
  legend: {
    p: { actor: "purun" },      // モンスター(種族id)。省略時hpは種族の最大HP
    b: { barrel: "empty" },     // タル(kind、任意でspeciesId)
  },
});

at("@"); // -> { x: 1, y: 1 } プレイヤー初期位置(座標マーカーのみ。
         // actorとしては含まれない。実際のプレイヤーActorは注入側が作る)
at("p"); // -> { x: 5, y: 1 } 記号からタイル座標を引く(アサーションで
         // 座標をハードコードしないため)
```

- 既定の記号: `#` 壁 / `.` 床 / `>` 階段(必ず1つ) / `@` プレイヤー
  初期位置(必ず1つ)。
- `legend` はそれ以外の1文字を意味づける。対応する種類:
  `{ actor: string; hp?: number }` / `{ barrel: BarrelKind; speciesId?: string }` /
  `{ item: string; charges?: number }` / `{ trap: TrapKind; revealed?: boolean }` /
  `{ gold: number }` / `{ obstacle: FieldSkillId }`。
- 部屋(`rooms`)は既定で自動検出する: 歩けるマスのうち縦横とも2マス以上
  ある矩形を貪欲に切り出し、通路(1マス幅)でつながった複数の部屋も
  それぞれ検出する。視界処理の部屋依存ロジックを試すときだけ、
  `{ rooms: [...] }` で明示指定できる。
- `depth`・`gimmick` もオプションで指定できる(省略時は「いつも通りの階」)。

## 3. 決定的な乱数

`tests/harness/rng.ts` の `seededRng(seed)` / `EnumeratedRng` は、
このファイルを直接importして使う純粋なNode/vitestコードの中でだけ
使える(将来、実ブラウザを介さない高速な単体テストを足す場合の土台)。

**E2Eテスト(`tests/e2e/`)からは、代わりに `startInjectedRun` の
`rng` に以下の簡易仕様を渡す**:

```ts
await startInjectedRun(page, {
  floor,
  player: { pos: at("@") },
  rng: { kind: "enumerated", values: [0.5] }, // または { kind: "seeded", seed: 42 }
});
```

Playwrightの `page.evaluate` はNode↔ブラウザの境界を挟むため、渡した
値はプロトタイプ(メソッド)を失ってしまい、`Rng`のインスタンスとして
動かない。そのためブラウザ側(`src/main.ts`)がこの仕様から`Rng`を
組み立て直す。`kind: "enumerated"` は `next()` が返す値を列で固定する
(列を使い切ると先頭に戻る)。`Rng.chance(p)`は`next() < p`、
`Rng.float(min,max)`は`min + next()*(max-min)`という実装(`src/core/rng.ts`)
を踏まえて値を選ぶ。

## 4. 実ブラウザでの操作(`tests/harness/`)

- `browser.ts` の `launchMobileBrowser()`: Playwright(Chromium)を、
  スマホ相当(タッチ有効・縦長のモバイル画面、Pixel 5プリセット)で
  起動する。`playwright`パッケージは`tools/playtest.mjs`と同じ方針で
  プロジェクトの依存には入れておらず、動的importで読む(無ければ
  `PLAYWRIGHT_PATH`環境変数か既定のフォールバックパスを探す)。
- `gamePage.ts`:
  - `waitForLoaded(page)` / `settle(page)`: ロード完了待ち・直前の
    操作が落ち着くまでの待ち(`tools/playtest.mjs`の`settle()`と同じ考え方)。
  - `startInjectedRun(page, payload)`: 上記の注入口を呼び、ダイブを開始する。
  - `dragTouchPad(page, dx, dy)`: 仮想パッド(`#touchPad`)を実際に
    ドラッグする。`dx`/`dy`は見た目どおり(右に倒したいなら`dx>0`)。
    強制横向き(タッチ端末の縦持ちで画面をCSS回転させる、
    `plan/game/archive/forced-landscape.md`)が有効なときは、内部で
    座標を逆変換してから送る。`DASH_HOLD_THRESHOLD`(0.25秒)未満で
    離せば、1マスだけ進む「タップ」相当になる。
  - `tapActionButton(page, dataCode)`: アクションボタン(`.touch-btn`、
    攻撃は`"KeyX"`・タルを持ち上げるのは`"KeyF"`・投げるのは`"KeyG"` 等)
    を実際にタップする。

これらはすべて、`src/ui/touch-controls.ts`が実際にゲームへ配信する
のと同じDOM要素・同じイベントを使う。内部APIを直接呼んで手順を
飛ばすことはしない。

### ヘッドレスブラウザでのrequestAnimationFrame

ヘッドレスChromiumでは、ページに触れているだけでは`requestAnimationFrame`
の連鎖が自然には進まないことがある。`App`のメインループはスロット
選択の直後に`this.loop()`を呼んで連鎖を起動する作りだが、箱庭注入は
スロット選択を経由しないため、`App.startInjectedTestRun`が代わりに
(初回だけ)`this.loop()`を呼んで起動する。テスト側で個別にRAFを
ポンプする必要は無い。

## 5. 基盤テスト(`tests/e2e/`)

- `smoke.test.ts`: 基盤そのものの疎通(注入フックの存在・スマホ
  プリセットが効いていること・注入した`floor.depth`が実際に反映
  されること)。
- `movement.test.ts`: 移動と衝突。壁へ向かって歩いてもターン
  (`game.turnCount`)を消費せず動かず、床なら1マス進むことを確認する。
- `combat.test.ts`: 戦闘の決定性。列挙Rngで隣接攻撃のダメージを
  固定し、状態(モンスターのHP)とUI(ダメージ表示・会心のログ)の
  両方で確認する。
- `capture.test.ts`: 捕獲。弱らせたモンスターに空タルを当てて捕獲し
  (タルが`caught`になる)、もう一度投げて仲間になったことを状態
  (`game.allies`)とUI(捕獲・仲間成立のメッセージ)の両方で確認する。

## 対象外

- 村・拠点のシーンへの注入基盤(まずダンジョンだけ)。
- `tools/auto-tester.mjs`(乱数プレイテスト)の置き換え(別役割として残す)。
