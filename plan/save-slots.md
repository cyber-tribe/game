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
