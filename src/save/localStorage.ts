import type { FloorState, Tile } from "../core/types";
import type { RunSnapshot, RunStatus, SaveData, SaveSlotSummary } from "./types";
import { SAVE_FIELDS, VALID_TRAINING_FOCI, buildSaveData, initialSave, type SaveFieldSpec } from "./initial";
import type { SaveRepository } from "./repository";

const LEGACY_KEY = "garudo-dungeon/v1";
const LEGACY_SNAPSHOT_KEY = "garudo-dungeon/v1/run-snapshot";

/** セーブ枠(plan/save-slots.md)。当面3枠固定 */
export const SAVE_SLOT_COUNT = 3;

function slotKey(slot: number): string {
  return `garudo-dungeon/v1/slot${slot}`;
}

/** ダイブ中オートセーブ(plan/mid-dive-autosave.md)。セーブ枠ごとに1つだけ持つ */
function slotSnapshotKey(slot: number): string {
  return `garudo-dungeon/v1/slot${slot}/run-snapshot`;
}

/**
 * セーブ枠(plan/save-slots.md)導入前の単一キーにデータが残っていれば、
 * slot0として1回だけコピーし、旧キーは削除する。ゲーム起動時に1回だけ呼ぶ。
 */
export function migrateLegacySaveIfNeeded(): void {
  try {
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy !== null && localStorage.getItem(slotKey(0)) === null) {
      localStorage.setItem(slotKey(0), legacy);
      localStorage.removeItem(LEGACY_KEY);
      const legacySnapshot = localStorage.getItem(LEGACY_SNAPSHOT_KEY);
      if (legacySnapshot !== null) {
        localStorage.setItem(slotSnapshotKey(0), legacySnapshot);
        localStorage.removeItem(LEGACY_SNAPSHOT_KEY);
      }
    }
  } catch {
    // 移行できなくても、以後は空のslot0として遊べるので握りつぶす
  }
}

/**
 * セーブ枠(plan/save-slots.md)。現在アクティブな枠番号。既存の
 * loadSave()/saveData()/saveRunSnapshot()/loadRunSnapshot()/clearRunSnapshot()の
 * 呼び出し側(記録まわりの各関数・main.ts・既存テスト)は、枠を意識せずに
 * 呼べば自動的にこの枠を読み書きする。main.tsはスロット選択直後に
 * setActiveSlot()を1回呼ぶだけでよい。
 *
 * SaveRepository interface導入後も、実際に使う実装は常にこの既定の
 * LocalStorageSaveRepositoryインスタンス1つだけなので、モジュール共有の
 * 状態のままにしている(インスタンスごとに分ける意味のある複数同時利用は
 * 想定しない。テストでの差し替えは、この実装まるごとを別実装に置き換える形になる)。
 */
let activeSlot = 0;

function writeSave(data: SaveData, slot: number): void {
  try {
    // lastPlayedAtはsaveDataが呼ばれるたびに現在時刻で更新する(plan/save-slots.md)
    const withTimestamp: SaveData = { ...data, lastPlayedAt: new Date().toISOString() };
    localStorage.setItem(slotKey(slot), JSON.stringify(withTimestamp));
  } catch {
    // 保存できなくても遊べはするので、失敗は握りつぶす
  }
}

let batchDepth = 0;
let pendingSave: SaveData | null = null;
let pendingSlot = 0;

/**
 * 中で何度 saveData() が呼ばれても、書き込みは最後の1回にまとめる。
 *
 * 記録まわりの関数(addKnownCheckpoint / markSpeciesSeen / …)はどれも
 * 「新しい SaveData を返しつつ自分で保存する」作りになっている。1ターンの
 * イベントを処理すると、新しい部屋に入って未見の敵を何体か見た、といった
 * 場合にこれらが立て続けに走り、そのたびにセーブ全体を JSON 化して
 * localStorage へ同期書き込みしてしまう。呼び出し側でまとめられるように、
 * ここで一段挟んでおく。
 *
 * 途中で例外が出ても、それまでの変更は書き出す(finally)。
 */
export function batchSaves<T>(run: () => T): T {
  batchDepth++;
  try {
    return run();
  } finally {
    batchDepth--;
    if (batchDepth === 0 && pendingSave !== null) {
      const data = pendingSave;
      const slot = pendingSlot;
      pendingSave = null;
      writeSave(data, slot);
    }
  }
}

// ---------------------------------------------------------------- ダイブ中オートセーブ

// ---- スナップショットの保存形式 ----
//
// タイル格子をそのまま JSON にすると、1マスあたり
// {"kind":0,"roomId":-1,"explored":false,"visible":false} で55バイト、
// 48×36=1728マスで94KBになる。実際に持っている情報は1マス数ビットで、
// これを毎ターン同期で localStorage に書くのは割に合わない
// (実測: スナップショット全体100KBのうち94%がタイル)。
//
// そこで地形は1マス1文字の文字列、探索済みフラグはビット列に畳む。
// visible と roomId は保存しない。
//   visible … プレイヤー位置から決まる導出値。復帰時に再計算する
//   roomId  … 部屋の矩形から決まる。paintRoom が矩形内を必ず塗り、
//             digCorridor は壁しか書き換えないので、矩形から厳密に復元できる
// 深みタイルと奔流タイルは数が少ないので、位置の一覧で持つ。

/** 6ビットを1文字に詰めるときの並び。URLに出しても安全な字だけを使う */
const BIT_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function packBits(flags: readonly boolean[]): string {
  let out = "";
  for (let i = 0; i < flags.length; i += 6) {
    let six = 0;
    for (let b = 0; b < 6; b++) if (flags[i + b]) six |= 1 << b;
    out += BIT_CHARS[six];
  }
  return out;
}

function unpackBits(packed: string, count: number): boolean[] {
  const flags: boolean[] = new Array(count).fill(false);
  for (let i = 0; i < packed.length; i++) {
    const six = BIT_CHARS.indexOf(packed[i]!);
    if (six < 0) continue;
    for (let b = 0; b < 6; b++) {
      const at = i * 6 + b;
      if (at < count) flags[at] = (six & (1 << b)) !== 0;
    }
  }
  return flags;
}

interface PackedTiles {
  /** 1マス1文字。TileKind をそのまま10進1桁で並べる */
  kind: string;
  /** 一度でも見えたマスのビット列 */
  explored: string;
  /** いま見えているマスのビット列 */
  visible: string;
  /** 深みタイルの位置。無ければ省く */
  quagmire?: number[];
  /** 奔流タイルの位置と向きの組。無ければ省く */
  torrent?: [number, number][];
}

type PackedFloor = Omit<FloorState, "tiles"> & { tiles: PackedTiles };
type PackedSnapshot = Omit<RunSnapshot, "floor"> & { floor: PackedFloor };

function packSnapshot(snapshot: RunSnapshot): PackedSnapshot {
  const tiles = snapshot.floor.tiles;
  let kind = "";
  const explored: boolean[] = new Array(tiles.length);
  const visible: boolean[] = new Array(tiles.length);
  const quagmire: number[] = [];
  const torrent: [number, number][] = [];
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i]!;
    kind += String(t.kind);
    explored[i] = t.explored;
    visible[i] = t.visible;
    if (t.quagmire) quagmire.push(i);
    if (t.torrent !== undefined) torrent.push([i, t.torrent]);
  }
  const packed: PackedTiles = {
    kind,
    explored: packBits(explored),
    visible: packBits(visible),
  };
  if (quagmire.length > 0) packed.quagmire = quagmire;
  if (torrent.length > 0) packed.torrent = torrent;
  // tiles を上書きする形にすることで、フロアの他のフィールドの並びを崩さない
  return { ...snapshot, floor: { ...snapshot.floor, tiles: packed } };
}

/** 畳んだ形を元に戻す。形が合わなければ null(古い保存や壊れた保存) */
function unpackSnapshot(packed: PackedSnapshot | null): RunSnapshot | null {
  const floor = packed?.floor;
  const packedTiles = floor?.tiles as PackedTiles | undefined;
  if (!floor || !packedTiles || typeof packedTiles.kind !== "string") return null;

  const count = floor.width * floor.height;
  if (packedTiles.kind.length !== count) return null;

  const explored = unpackBits(packedTiles.explored ?? "", count);
  const visible = unpackBits(packedTiles.visible ?? "", count);
  const tiles: Tile[] = new Array(count);
  for (let i = 0; i < count; i++) {
    tiles[i] = {
      kind: Number(packedTiles.kind[i]) as Tile["kind"],
      roomId: -1,
      explored: explored[i] ?? false,
      visible: visible[i] ?? false,
    };
  }
  for (const i of packedTiles.quagmire ?? []) {
    const t = tiles[i];
    if (t) t.quagmire = true;
  }
  for (const [i, dir] of packedTiles.torrent ?? []) {
    const t = tiles[i];
    if (t) t.torrent = dir as NonNullable<Tile["torrent"]>;
  }
  // roomId は部屋の矩形から引き直す
  for (const room of floor.rooms ?? []) {
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        const t = tiles[y * floor.width + x];
        if (t) t.roomId = room.id;
      }
    }
  }
  return { ...packed, floor: { ...floor, tiles } } as RunSnapshot;
}

const VALID_RUN_STATUSES: readonly RunStatus[] = ["playing", "dead", "cleared"];

function isValidSnapshot(value: Partial<RunSnapshot>): value is RunSnapshot {
  return (
    typeof value.rngState === "number" &&
    typeof value.maxDepth === "number" &&
    typeof value.depth === "number" &&
    typeof value.turnCount === "number" &&
    typeof value.actorIdCounter === "number" &&
    typeof value.itemUidCounter === "number" &&
    typeof value.barrelIdCounter === "number" &&
    typeof value.endReason === "string" &&
    typeof value.status === "string" &&
    VALID_RUN_STATUSES.includes(value.status as RunStatus) &&
    typeof value.floor === "object" &&
    value.floor !== null &&
    typeof value.player === "object" &&
    value.player !== null &&
    Array.isArray(value.allies) &&
    typeof value.trainingFocus === "string" &&
    (VALID_TRAINING_FOCI as readonly string[]).includes(value.trainingFocus)
  );
}

/**
 * localStorageへの直接アクセスを隔離する`SaveRepository`実装
 * (plan/game/ddd-phase7-save-boundary.md PR2)。挙動はPR1以前のsave.tsと
 * 1ビットも変えていない――既存のモジュール関数が使っていたのと同じ
 * ヘルパー・同じ共有状態(activeSlot・batchDepth等)をそのまま使う。
 */
export class LocalStorageSaveRepository implements SaveRepository {
  load(slot: number = activeSlot): SaveData {
    try {
      const raw = localStorage.getItem(slotKey(slot));
      if (!raw) return initialSave();
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      return buildSaveData((key) => (SAVE_FIELDS[key] as SaveFieldSpec<unknown>).sanitize(parsed));
    } catch {
      // 壊れた保存データで起動できなくなるほうが困るので、黙って初期値に戻す
      return initialSave();
    }
  }

  save(data: SaveData, slot: number = activeSlot): void {
    if (batchDepth > 0) {
      // まとめ書きの最中。最後の1つだけが本物なので、上書きしていく
      pendingSave = data;
      pendingSlot = slot;
      return;
    }
    writeSave(data, slot);
  }

  delete(slot: number): void {
    try {
      localStorage.removeItem(slotKey(slot));
      localStorage.removeItem(slotSnapshotKey(slot));
    } catch {
      // 消せなくても遊べはするので握りつぶす
    }
  }

  /** スロット選択画面に並べる、全スロットぶんの要約を返す */
  listSummaries(): SaveSlotSummary[] {
    const summaries: SaveSlotSummary[] = [];
    for (let slot = 0; slot < SAVE_SLOT_COUNT; slot++) {
      const raw = (() => {
        try {
          return localStorage.getItem(slotKey(slot));
        } catch {
          return null;
        }
      })();
      if (raw === null) {
        summaries.push({ slot, exists: false, deepest: 0, villageStage: 1 });
        continue;
      }
      const data = this.load(slot);
      summaries.push({
        slot,
        exists: true,
        deepest: data.deepest,
        villageStage: data.villageStage,
        lastPlayedAt: data.lastPlayedAt,
      });
    }
    return summaries;
  }

  setActiveSlot(slot: number): void {
    activeSlot = slot;
  }

  /**
   * ダイブ中の状態をまるごと書き出す。プレイヤーの入力で1ターンが解決する
   * たびに呼ぶ想定(README「core が1ターン分を即座に解決する」の直後)。
   * snapshotにnullを渡すと、復帰した瞬間・通常の終了(全滅・踏破・区切り)で
   * 消費するとき(旧clearRunSnapshot)と同じ動作になる。
   */
  saveRunSnapshot(snapshot: RunSnapshot | null, slot: number = activeSlot): void {
    if (snapshot === null) {
      try {
        localStorage.removeItem(slotSnapshotKey(slot));
      } catch {
        // 消せなくても致命的ではない
      }
      return;
    }
    try {
      localStorage.setItem(slotSnapshotKey(slot), JSON.stringify(packSnapshot(snapshot)));
    } catch {
      // オートセーブが書き込めなくても遊べはするので、失敗は握りつぶす
    }
  }

  /**
   * 残っているスナップショットを読む。壊れている・形が合わない場合は
   * 復帰できるものが無かったものとして null を返す(1回限りの保証なので、
   * 中途半端な状態を無理に復元するより諦めた方が安全)。
   *
   * 保存形式が変わったあとに残っていた古いスナップショットも、ここで
   * 「形が合わないもの」として捨てられる。ダイブ中の一時状態なので、
   * 移行を書くより拠点から始め直してもらう方が安全で単純。
   */
  loadRunSnapshot(slot: number = activeSlot): RunSnapshot | null {
    try {
      const raw = localStorage.getItem(slotSnapshotKey(slot));
      if (!raw) return null;
      const unpacked = unpackSnapshot(JSON.parse(raw) as PackedSnapshot);
      if (!unpacked) return null;
      return isValidSnapshot(unpacked) ? unpacked : null;
    } catch {
      return null;
    }
  }
}

const defaultRepository = new LocalStorageSaveRepository();

/** @param slot セーブ枠(plan/save-slots.md)。省略時は現在のアクティブ枠 */
export function loadSave(slot: number = activeSlot): SaveData {
  return defaultRepository.load(slot);
}

/** @param slot セーブ枠(plan/save-slots.md)。省略時は現在のアクティブ枠 */
export function saveData(data: SaveData, slot: number = activeSlot): void {
  defaultRepository.save(data, slot);
}

/** スロットの削除(やり直し)。本編セーブ・ダイブ中スナップショットの両方を消す */
export function deleteSaveSlot(slot: number): void {
  defaultRepository.delete(slot);
}

/** スロット選択画面に並べる、全スロットぶんの要約を返す */
export function listSaveSlotSummaries(): SaveSlotSummary[] {
  return defaultRepository.listSummaries();
}

export function setActiveSlot(slot: number): void {
  defaultRepository.setActiveSlot(slot);
}

export function saveRunSnapshot(snapshot: RunSnapshot, slot: number = activeSlot): void {
  defaultRepository.saveRunSnapshot(snapshot, slot);
}

export function loadRunSnapshot(slot: number = activeSlot): RunSnapshot | null {
  return defaultRepository.loadRunSnapshot(slot);
}

/** 復帰した瞬間、または通常の終了(全滅・踏破・区切り)で消費する */
export function clearRunSnapshot(slot: number = activeSlot): void {
  defaultRepository.saveRunSnapshot(null, slot);
}
