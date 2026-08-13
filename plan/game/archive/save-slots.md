> **実装済み。**
> `src/save.ts`(`slotKey`/`slotSnapshotKey`・`migrateLegacySaveIfNeeded`・
> `SaveData.lastPlayedAt`・`SAVE_SLOT_COUNT`・`listSaveSlotSummaries`・
> `deleteSaveSlot`を追加)、`src/ui/slot-select.ts`(新規、`SlotSelectScreen`)、
> `src/main.ts`(起動直後にスロット選択画面を表示し、選んだ枠で
> 拠点/ダイブ再開を組み立てる)、`index.html`(`#slotSelect`のマークアップ・
> スタイル追加)に実装した。テストは `tests/save-slots.test.ts`(9件)、
> 既存の17テストファイルが直接触っていた旧キー("garudo-dungeon/v1"等)の
> フィクスチャも新しいslot0キーへ更新した。
>
> `src/save.ts` の実装詳細(プランからの主な調整):
> - プランは`loadSave`/`saveSave`という関数名を前提にしていたが、実際の
>   関数名は`loadSave`/`saveData`(save-compat-testing.mdの既存API)
>   だったため、そちらに`slot`引数を追加する形にした。
> - 呼び出し側(main.tsの9箇所・save.ts内の記録まわり約30関数)すべてに
>   `slot`を引き回すのは影響範囲が大きすぎるため、プランには無い設計判断
>   として**モジュール内に「現在アクティブな枠」を1つ持つ**方式にした
>   (`setActiveSlot(slot)`)。`loadSave`/`saveData`/`saveRunSnapshot`/
>   `loadRunSnapshot`/`clearRunSnapshot`はいずれも`slot`引数省略時に
>   アクティブ枠を使う。既存の記録まわり関数(`addKnownCheckpoint`等)は
>   引数無しの`saveData(next)`呼び出しのままで自動的にアクティブ枠へ書かれる
>   ため、無改修で済んだ。既存テスト(17ファイル)も`loadSave()`/
>   `saveData(x)`の無引数呼び出しのまま(既定のアクティブ枠=0)で動く。
> - `lastPlayedAt`は`saveData`(旧`saveSave`)が呼ばれるたびに、書き込み
>   直前に現在時刻へ更新する(渡された`SaveData`オブジェクト自体は
>   変更せず、`localStorage`へ書く直前にコピーへ反映する)。
>
> `src/ui/slot-select.ts` の実装詳細:
> - `town.ts`のような列・カーソルを持つ複雑なメニューではなく、
>   `naming-dialog.ts`に近い軽量な単一リスト画面にした(3行の上下選択+
>   Enter決定)。データの無い枠は「はじめる」表記。
> - 削除(やり直し)は`Delete`/`Backspace`キーで確認状態に入り、
>   `Enter`で確定・`Escape`でキャンセルする1段階の確認ダイアログにした。
> - タイトル画面そのもの(ロゴ・背景演出等)は本文書のスコープ外のため
>   作らず、起動直後に直接この選択画面を表示する形にした
>   (「未決事項: タイトル画面自体のビジュアル」として明記されていた
>   範囲)。
>
> 動作確認: `npm run dev`させてChromiumで実際に起動し、起動直後に
> 3枠とも「はじめる」で表示されること、Enterで選ぶと`#slotSelect`が
> 隠れて拠点画面(初期の倉庫アイテム込み)が表示されることを確認した。

# セーブ枠(3スロット化)

`design/ui-flow.md` が「セーブ枠の具体的なUI」を未決事項として残していた
部分を、既存の`src/save.ts`の実装(単一`localStorage`キー)を踏まえて
確定させる。同文書が示した`KEY_PREFIX`方式をそのまま採用する。

## 現状(前提)

`src/save.ts`は`localStorage`に2つの固定キーを使っている。

```ts
const KEY = "garudo-dungeon/v1";                        // 本編セーブ
const SNAPSHOT_KEY = "garudo-dungeon/v1/run-snapshot";    // ダイブ中の一時保存(plan/archive/mid-dive-autosave.md)
```

3スロット化にあたり、**両方のキーをスロットごとに分ける**必要がある
(本編セーブだけをスロット化し、ダイブ中スナップショットを共有のままに
すると、スロットを切り替えた瞬間に別スロットのダイブ復帰データが
誤って読まれてしまう)。

## キー方式(確定)

```ts
function slotKey(slot: number): string {
  return `garudo-dungeon/v1/slot${slot}`;
}
function slotSnapshotKey(slot: number): string {
  return `garudo-dungeon/v1/slot${slot}/run-snapshot`;
}
```

`loadSave`・`saveSave`・`saveSnapshot`・`loadSnapshot`(いずれも
`src/save.ts`の既存関数)に`slot: number`引数を追加し、内部で使う
`localStorage`キーを`slotKey(slot)`/`slotSnapshotKey(slot)`に差し替える。

## 既存データの引き継ぎ(マイグレーション)

初回起動時、**旧キー(`garudo-dungeon/v1`・`garudo-dungeon/v1/run-
snapshot`)にデータが残っていれば、`slot0`として1回だけコピーし、
旧キーは削除する**(`design/ui-flow.md`の記述どおり)。

```ts
function migrateLegacySaveIfNeeded(): void {
  const legacy = localStorage.getItem("garudo-dungeon/v1");
  if (legacy !== null && localStorage.getItem(slotKey(0)) === null) {
    localStorage.setItem(slotKey(0), legacy);
    localStorage.removeItem("garudo-dungeon/v1");
    const legacySnapshot = localStorage.getItem("garudo-dungeon/v1/run-snapshot");
    if (legacySnapshot !== null) {
      localStorage.setItem(slotSnapshotKey(0), legacySnapshot);
      localStorage.removeItem("garudo-dungeon/v1/run-snapshot");
    }
  }
}
```

このマイグレーションはゲーム起動時に1回だけ呼ぶ。`plan/archive/save-
compat-testing.md`のフィクスチャ手法をそのまま使い、「旧キーにv6相当の
データがある状態→起動→`slot0`に移っている」ことをテストで確認する。

## スロット選択画面(確定)

- タイトル画面に「はじめる/続きから」を選ぶと、3枠を縦に並べた選択
  画面を表示する。各枠には、そのスロットの`SaveData`から
  `deepest`・`villageStage`・最終プレイ日時(新設、後述)を短く要約
  して表示する。データが無い枠は「はじめる」の表記にする。
- 新しいUIコンポーネントとしては最小限(既存の一覧UIパターン、
  `plan/archive/quest-board.md`等の拠点内一覧と同じ見た目の流用)に
  留める。
- スロットの削除(やり直し)は、選択画面から該当枠を選んだ状態で
  専用の「消す」操作を1つ用意する(確認ダイアログを挟む。誤操作対策)。

## データ構造

```ts
export interface SaveData {
  // ...既存フィールド
  lastPlayedAt: string; // ISO8601。スロット選択画面の表示用に新設
}
```

`lastPlayedAt`は`saveSave`が呼ばれるたびに現在時刻で更新する。

## 実装への影響の見積もり

- `src/save.ts`: `loadSave`・`saveSave`・`saveSnapshot`・`loadSnapshot`
  への`slot`引数追加、`migrateLegacySaveIfNeeded`の新設、
  `SaveData.lastPlayedAt`の追加(既存のsanitize処理・save-compat新
  フィクスチャも必要)。
- `src/ui/`: タイトル画面(新規)・スロット選択画面(新規)。
- `src/main.ts`: 起動時に`migrateLegacySaveIfNeeded`を呼び、選択された
  スロット番号を以後の`loadSave`/`saveSave`呼び出しに引き回す。

## 未決事項

- タイトル画面自体のビジュアル(本文書はスロット選択の仕組みだけを
  扱う)。
- スロットの「消す」操作の確認ダイアログの具体的な文言・UI。
- 4枠以上への拡張余地(当面3枠固定とし、可変にはしない)。
