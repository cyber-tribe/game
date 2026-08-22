import { type Dir, dirDelta, eq } from "../../core/grid";
import type { Vec2 } from "../../core/grid";
import type { Actor, FloorState } from "../../core/types";
import { isFree, isHostile, tileAt } from "../../core/types";
import type { GameEvent } from "../../core/events";
import type { PlayerState } from "../../entities/player";
import type { DifficultyMode } from "../../entities/difficulty";
import { runActors, type RunActorsArgs } from "./actorActions";
import {
  tickArtCooldowns,
  tickHunger,
  tickRegen,
  tickStatuses,
  tickTorch,
} from "./statusTicks";

const OVERLAP_ESCAPE_DIRS: readonly Dir[] = [0, 2, 4, 6, 1, 3, 5, 7];

function adjacentFreeSpot(floor: FloorState, center: Vec2): Vec2 | null {
  for (const dir of OVERLAP_ESCAPE_DIRS) {
    const delta = dirDelta(dir);
    const p = { x: center.x + delta.x, y: center.y + delta.y };
    if (isFree(floor, p)) return p;
  }
  return null;
}

/**
 * プレイヤーと敵モンスターは同じマスに同時に存在しない、という不変条件の
 * フェイルセーフ(plan/actor-overlap-failsafe.md)。根本原因(#180)を問わず、
 * 万一重なりが起きた場合は毎ターン検知して後始末する。
 * 味方(仲間)との重なりは対象外(README記載の入れ替え仕様のまま)。
 */
export function resolveActorOverlaps(
  floor: FloorState,
  events: GameEvent[],
  player: PlayerState,
  playerPosBeforeCommand: Vec2,
): void {
  const overlapping = floor.actors.find(
    (a) => a.alive && a.kind === "monster" && isHostile(player, a) && eq(a.pos, player.pos),
  );
  if (!overlapping) return;

  const spot = adjacentFreeSpot(floor, player.pos);
  if (spot) {
    const from = overlapping.pos;
    overlapping.pos = spot;
    events.push({ type: "move", actorId: overlapping.id, from, to: spot });
    return;
  }

  // 退避先が一切見つからない極端な場合は、プレイヤー側を直前にいたマスへ1歩押し戻す
  if (!eq(player.pos, playerPosBeforeCommand)) {
    const from = player.pos;
    player.pos = playerPosBeforeCommand;
    events.push({ type: "move", actorId: player.id, from, to: playerPosBeforeCommand });
  }
}

export interface UpkeepArgs {
  floor: FloorState;
  player: PlayerState;
  events: GameEvent[];
  turnCount: number;
  dungeonSatietyDrainMul: number | undefined;
  difficulty: DifficultyMode;
  hitThisTurn: Set<number>;
  torchTurnsLeft: number;
  isPlaying(): boolean;
  damageActor(target: Actor, damage: number, critical: boolean): void;
  // フロアギミック系のtickはPhase 6(Dungeon)の領分なのでコールバックのまま残し、
  // ここからは順序だけを固定して名前で呼ぶ
  tickDreamArts(): void;
  tickSporeRooms(): void;
  tickSummonedTorrentTiles(): void;
  tickBoneWalls(): void;
  tickMirrors(): void;
  spawnIfDue(): void;
  removeDead(): void;
}

/**
 * ターン終了時のtick処理。仕様として固定された順序
 * (tickStatuses→tickHunger→tickArtCooldowns→tickDreamArts→tickRegen→
 * tickSporeRooms→tickSummonedTorrentTiles→tickBoneWalls→tickMirrors→tickTorch
 * →湧き→死体除去)を、この関数の並びそのもので表す。新しいtorchTurnsLeftを返す
 */
export function upkeep(args: UpkeepArgs): number {
  const { floor, player, events, turnCount, dungeonSatietyDrainMul, difficulty, hitThisTurn, isPlaying, damageActor } =
    args;

  tickStatuses({ floor, events, damageActor, isPlaying });
  tickHunger({ player, floor, dungeonSatietyDrainMul, difficulty, turnCount, events, isPlaying, damageActor });
  tickArtCooldowns(player);
  args.tickDreamArts();
  tickRegen({ floor, turnCount, hitThisTurn });
  args.tickSporeRooms();
  args.tickSummonedTorrentTiles();
  args.tickBoneWalls();
  args.tickMirrors();
  const torchTurnsLeft = tickTorch(args.torchTurnsLeft, events);

  if (!isPlaying()) return torchTurnsLeft;

  args.spawnIfDue();
  args.removeDead();
  return torchTurnsLeft;
}

export interface ResolveTurnArgs extends RunActorsArgs {
  posBeforeCommand: Vec2;
  upkeep(): void;
  incrementTurnCount(): void;
}

/**
 * 1ターンの解決。プレイヤーの行動が確定した後に呼ぶ。
 *   runActors          … 敵・仲間の行動
 *   (quagmire なら runActors をもう1回)
 *   upkeep             … ターン終了処理
 *   turnCount++
 *   resolveActorOverlaps
 */
export function resolveTurn(args: ResolveTurnArgs): void {
  const { floor, player, events, posBeforeCommand, upkeep, incrementTurnCount, isPlaying } = args;

  runActors(args);
  // 第二地方(忘れ潮の湿地)固有ギミック(plan/wetland-quagmire.md): 実際に
  // 移動して深みタイルへ足を踏み入れた直後だけ、モンスター行動をもう1手
  // ぶん先に進める(「足を取られてワンテンポ遅れる」)。攻撃・アイテム
  // 使用のような移動を伴わない行動には適用しない
  const moved = !eq(posBeforeCommand, player.pos);
  if (moved && tileAt(floor, player.pos)?.quagmire) {
    runActors(args);
  }
  upkeep();
  incrementTurnCount();
  if (isPlaying()) resolveActorOverlaps(floor, events, player, posBeforeCommand);
}
