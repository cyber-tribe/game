import { chebyshev, eq, type Vec2 } from "../../core/grid";
import type { FloorDoor, FloorGimmickKind, FloorState, Room } from "../../core/types";
import { roomContains } from "../../core/types";
import type { GameEvent } from "../../core/events";
import type { PlayerState } from "../../entities/player";
import { isCheckpointFloor, regionIndexForDungeonId } from "../../entities/dungeons";
import { speciesById } from "../../entities/species";
import { hasEquipEffect } from "../item/inventory";
import { itemDef } from "../../entities/itemCatalog";
import { GIMMICK_MESSAGES } from "./gimmicks";
import { t } from "../../i18n";

/**
 * 地方固有ギミックの適用条件。今いるダンジョン自身がその地方か、または
 * 第八地方(めざめの前庭)固有ギミック(plan/dream-garden-mosaic.md)で
 * その地方番号が今回のフロアのmosaicRegionsに選ばれていれば true
 */
export function regionGimmickApplies(region: number, dungeonId: string, mosaicRegions: readonly number[]): boolean {
  return regionIndexForDungeonId(dungeonId) === region || mosaicRegions.includes(region);
}

export interface DescendArgs {
  depth: number;
  maxDepth: number;
  isInBranchDungeon: boolean;
  events: GameEvent[];
  enterFloor(depth: number): { depth: number; gimmick: FloorGimmickKind | undefined };
  returnFromBranchDungeon(events: GameEvent[]): void;
  maybePlayMountainCoreEnding(events: GameEvent[]): void;
  completeRun(reason: string, events: GameEvent[]): void;
}

export function descend(args: DescendArgs): void {
  const { depth, maxDepth, isInBranchDungeon, events, enterFloor, returnFromBranchDungeon, maybePlayMountainCoreEnding, completeRun } =
    args;
  if (depth >= maxDepth) {
    // 横穴(分岐ダンジョン、plan/game/dungeon-per-region.md): 分岐ダンジョンの
    // 最終階では、ダイブを終わらせず元の地方ダンジョンの階へ戻すだけにする
    if (isInBranchDungeon) {
      returnFromBranchDungeon(events);
      return;
    }
    maybePlayMountainCoreEnding(events);
    completeRun(`${maxDepth}階を踏破した!`, events);
    return;
  }
  const entered = enterFloor(depth + 1);
  events.push({ type: "descend", depth: entered.depth });
  events.push({ type: "message", text: t("msg.descend", { depth: entered.depth }) });
  if (entered.gimmick) {
    events.push({ type: "message", text: GIMMICK_MESSAGES[entered.gimmick] });
  }
}

export interface BankRunArgs {
  playerPos: Vec2;
  stairs: Vec2;
  isCarrying: boolean;
  depth: number;
  events: GameEvent[];
  pushBackFromStairs(events: GameEvent[]): void;
  maybePlayMountainCoreEnding(events: GameEvent[]): void;
  completeRun(reason: string, events: GameEvent[]): void;
}

/**
 * めざめの階段を使って、ここで区切ってダイブを成功させる
 * (plan/checkpoint-select.md)。持ち物・仲間・所持金を持ち帰れる点は
 * 通常の踏破と同じ。以後の深い階は次回以降のダイブに持ち越す。
 */
export function bankRun(args: BankRunArgs): boolean {
  const { playerPos, stairs, isCarrying, depth, events, pushBackFromStairs, maybePlayMountainCoreEnding, completeRun } = args;
  if (!eq(playerPos, stairs)) {
    events.push({ type: "message", text: "ここには階段がない。" });
    return false;
  }
  // タルを抱えたままの階段降りを禁止する(plan/barrel-stairs-safeguard.md)
  if (isCarrying) {
    events.push({ type: "message", text: "タルを抱えたままでは降りられない。" });
    pushBackFromStairs(events);
    return true;
  }
  maybePlayMountainCoreEnding(events);
  completeRun(t("msg.checkpointReached", { depth }), events);
  return true;
}

/**
 * ボスの間の扉を開ける(plan/game/dungeon-boss-rooms.md)。扉のすぐ前
 * (8方向いずれかの隣接マス)に立っていなければ弾く。開けるとその場で
 * ボスの気配を告げるメッセージを出し、doorOpenedイベントでBGM切り替えを
 * main.ts側に伝える。開閉そのものはターンを消費しない(仕度を挟める、
 * というdocの意図どおり)
 */
export function openDoor(door: FloorDoor | undefined, playerPos: Vec2, events: GameEvent[]): boolean {
  if (!door || chebyshev(playerPos, door.pos) > 1) {
    events.push({ type: "message", text: "ここに扉はない。" });
    return false;
  }
  if (door.open) return false;
  door.open = true;
  const bossName = speciesById(door.bossSpeciesId).name;
  events.push({ type: "message", text: `扉を開けた。${bossName}の気配が強まる――` });
  events.push({ type: "doorOpened", bossSpeciesId: door.bossSpeciesId });
  return false;
}

/**
 * 忘れ物蔵(plan/lost-and-found-vault.md)。隠し通路に初めて隣接した
 * ターンにだけ、気配のヒントを1回出す。
 */
export function checkSecretPassageHint(floor: FloorState, pos: Vec2, events: GameEvent[]): void {
  for (const secret of floor.secretPassages) {
    if (secret.hinted) continue;
    if (chebyshev(pos, secret.pos) <= 1) {
      secret.hinted = true;
      events.push({ type: "message", text: "――かすかに隙間の風を感じる。" });
    }
  }
}

/** 床に落ちている金貨(plan/shops-and-thieves.md)を、踏んだ瞬間に自動で拾う */
export function collectGold(floor: FloorState, player: PlayerState, pos: Vec2, events: GameEvent[]): void {
  const idx = floor.goldPiles.findIndex((g) => eq(g.pos, pos));
  if (idx < 0) return;
  const [pile] = floor.goldPiles.splice(idx, 1);
  player.gold += pile!.amount;
  events.push({ type: "message", text: t("msg.goldPicked", { amount: pile!.amount }) });
}

export interface AnnounceGroundArgs {
  floor: FloorState;
  pos: Vec2;
  dungeonId: string;
  depth: number;
  events: GameEvent[];
}

export function announceGround(args: AnnounceGroundArgs): void {
  const { floor, pos, dungeonId, depth, events } = args;
  const ground = floor.items.find((gi) => eq(gi.pos, pos));
  if (ground) {
    const price = ground.forSale ? `(${ground.forSale.price}ゴールド)` : "";
    events.push({
      type: "message",
      text: `${itemDef(ground.item.defId).name}${price}が落ちている。`,
    });
  }
  if (eq(pos, floor.stairs)) {
    events.push({ type: "message", text: "階段がある。" });
    // 表の寝穴では、地方の最終階(6階ごと)の階段だけが「めざめの階段」
    // として既知になる(plan/region-expansion.md)。他のダンジョン
    // (近道屋の裏穴・夜ごとの夢・腕試しの間)は地方の概念を持たないため
    // 従来どおりどの階の階段でも既知になる。
    // 足を踏み入れた瞬間に「既知」となる。ダイブの結果によらず記録されるべき
    // 事実なので、保存は呼び出し側(main.ts)が checkpoint イベントを見て行う
    if (isCheckpointFloor(dungeonId, depth)) {
      events.push({ type: "checkpoint", depth });
      events.push({ type: "tutorialTip", id: "checkpoint" });
    }
  }
}

/** posが、部屋の外縁からチェビシェフ距離rangeマス以内にあるか(部屋の中ならtrue) */
function isNearRoom(room: Room, pos: Vec2, range: number): boolean {
  const dx = Math.max(room.x - pos.x, 0, pos.x - (room.x + room.w - 1));
  const dy = Math.max(room.y - pos.y, 0, pos.y - (room.y + room.h - 1));
  return Math.max(dx, dy) <= range;
}

export interface CheckMonsterHouseWarningArgs {
  floor: FloorState;
  pos: Vec2;
  player: PlayerState;
  monsterHouseWarned: boolean;
  events: GameEvent[];
}

/**
 * モンスターハウス(plan/monster-house.md)の予告。部屋の外(通路側)から
 * 隣接した時点で、1フロアにつき一度だけ気配のメッセージを出す。
 * 部屋の中に入ってからでは手遅れなので、中にいる間は出さない。
 * 千里眼の輪(plan/protagonist-equipment.md)を装備していれば、
 * さらに1マス手前(距離2)から察知できる。新しいmonsterHouseWarnedを返す
 */
export function checkMonsterHouseWarning(args: CheckMonsterHouseWarningArgs): boolean {
  const { floor, pos, player, monsterHouseWarned, events } = args;
  if (monsterHouseWarned) return true;
  const room = floor.rooms.find((r) => r.kind === "monsterHouse");
  if (!room || roomContains(room, pos)) return monsterHouseWarned;

  const range = hasEquipEffect(player.inventory, "farsight") ? 2 : 1;
  if (!isNearRoom(room, pos, range)) return monsterHouseWarned;

  events.push({ type: "message", text: "――部屋の奥で何かがひしめいている気配がする。" });
  return true;
}
