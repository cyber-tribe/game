# DDD Phase 7: Save 境界に SaveRepository を導入する

関連: [ADR 0016](../adr/0016-incremental-ddd-for-game-rules.md) Phase 7
前提: なし(Phase 2〜6 と独立に実施できる。ただし型の移動が絡むため
並行作業は避け、着手時点の main から始めること)

## 目的

`src/save.ts`(約2,000行)を `src/save/` パッケージに分割し、
localStorage への直接アクセスを `SaveRepository` interface の背後に
隔離する。挙動・保存フォーマットは一切変えない。

現状認識: save.ts は見かけより健全で、エクスポートの大半は
`(current: SaveData, ...) => SaveData` の**純粋な遷移関数**
(recordRun / recordDeepest / developVillage / releaseCompanion など)。
localStorage を触るのは約17箇所で、`migrateLegacySaveIfNeeded` /
`listSaveSlotSummaries` / `deleteSaveSlot` / `loadSave` / `saveData` /
`setActiveSlot` / `batchSaves` に集中している。分割は素直にできる。

## 守るべきテスト

ADR 0009 のセーブ互換フィクスチャ回帰テストを**無変更で pass** させる
ことが挙動保存の証明。追加のゴールデンテストは不要(フィクスチャが
その役割を既に果たしている)。ストレージキー
(`garudo-dungeon/v1/...`)・JSONフォーマット・レガシー移行の挙動は
1ビットも変えない。

## 分割仕様

```
src/save/
├── index.ts            # 既存 save.ts と同じ公開面を re-export(呼び出し側の import 変更を1PRに閉じ込める)
├── types.ts            # SaveData, StoredItem, SaveSlotSummary, DiveRecords, ArenaRecord, FontSize, CompendiumStatus 等の型と定数
├── initial.ts          # initialSave() と各フィールドの既定値
├── transitions.ts      # 純粋な遷移関数すべて(recordRun, recordDeepest, markTutorialTipSeen, setXxx, developVillage, buyFestivalItem, equipCostume, refreshUnlockedCostumes, recordTarukurabeResult, recordHinataClear, ...)
├── storedMonster.ts    # actorToStoredMonster, takeFromHut, releaseCompanion, renameStoredMonster(倉庫まわり)
├── repository.ts       # SaveRepository interface(下記)
└── localStorage.ts     # LocalStorageSaveRepository 実装 + レガシー移行 + batchSaves + activeSlot 管理
```

```ts
// save/repository.ts
export interface SaveRepository {
  load(slot?: number): SaveData;
  save(data: SaveData, slot?: number): void;
  delete(slot: number): void;
  listSummaries(): SaveSlotSummary[];
  setActiveSlot(slot: number): void;
  loadRunSnapshot(slot?: number): RunSnapshot | null;
  saveRunSnapshot(snapshot: RunSnapshot | null, slot?: number): void;
}
```

- 現行の module-level 関数(`loadSave` / `saveData` …)は `index.ts` で
  「デフォルトの LocalStorageSaveRepository インスタンスへの委譲」として
  残す。**呼び出し側(main.ts / ui/town.ts / ui/slot-select.ts /
  entities/dialogue.ts)の書き換えはこのPhaseではしない**(公開面を
  変えないことで移行を1方向にする)。テストからは repository を
  差し替えられるようになる(インメモリ実装での UI テストが可能になる)。
- `batchSaves` は「書き込みをまとめる」ストレージ側の関心なので
  `localStorage.ts` へ。
- JSONの parse/stringify と後方互換の穴埋め(古いセーブに無いフィールド
  への既定値補完)は `localStorage.ts` の private 関数として現行ロジックを
  そのまま移す。フォーマット変更・正規化は**やらない**。

## RunSnapshot の置き場所

`save.ts` が `game.ts` から `RunSnapshot` / `RunStatus` /
`TARUKURABE_PERFECT_SCORE` を import している逆流がある(保存層が
Game 実装ファイルに依存)。このPhaseで `RunSnapshot` / `RunStatus` 型を
`src/core/runSnapshot.ts` へ移し、`game.ts` と `save/` の双方が core を
参照する形にする(Phase 8 で application/dungeonRun へ移す布石。
`TARUKURABE_PERFECT_SCORE` も同様に定数の定義元を core 側へ)。

## entities/dialogue.ts の依存

会話条件が save を読むのは「メタ進行の参照」であり正当。ただし読むのは
`SaveData`(型と値)だけにし、repository へは触らせない(現状を確認し、
localStorage 直読みがあれば `SaveData` を引数で受ける形に直す)。

## PR分割の目安

1. `src/save/` へのファイル分割(公開面は index.ts で不変。save.ts 削除)
2. `SaveRepository` interface + LocalStorageSaveRepository 化
   (module-level 関数は委譲に)
3. `RunSnapshot` / `RunStatus` の core への移動

## 完了条件

- `localStorage` を触るファイルが `src/save/localStorage.ts`(と、
  もしあれば設定系の独立ストア)だけになっている
- ADR 0009 のフィクスチャテストが無変更で pass
- `src/save/` から `src/game.ts` への import が無い
- 呼び出し側の import 先が `save/`(index)のままで動いている
