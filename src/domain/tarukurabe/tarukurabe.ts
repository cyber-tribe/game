import type { Vec2 } from "../../core/grid";
import type { GameEvent } from "../../core/events";
import { TILE_ROOM, TILE_WALL, type FloorState, type TargetActor, type Tile } from "../../core/types";
import type { PlayerState } from "../../entities/player";
import { type IdSource, createBarrel } from "../dungeon/populate";
import { updateVisibility } from "../dungeon/visibility";

/** 持ち込めるタルの数(固定10個)。専用モード内で完結し、通常の倉庫は消費しない */
const TARUKURABE_BARREL_COUNT = 10;

interface TarukurabeTargetLayout {
  /** 部屋のローカル座標(プレイヤーの投擲台を基準にした相対値ではなく絶対値) */
  pos: Vec2;
  points: number;
}

/**
 * 樽比べの部屋。既存の乱数生成(generateFloor)は使わず、山の芯・真の目覚めの
 * 「短い固定進行」の方針をさらに一歩進めて、手作りの固定Floorを直接組み立てる
 * (座標を毎回同じにすることで「自己ベストを縮める」比較が成立する、という
 * 計画書の要件を、生成パラメータの調整ではなく確実に満たすため)。
 *
 * プレイヤーは部屋中央寄りの投擲台(TARUKURABE_PLAYER_POS)に立ち、以後移動
 * できない。的は北(近・距離3)・東(中・距離6)・南(遠・距離9)の3方向に
 * 1つずつ配置する。「大きい的ほど命中判定のマス数が広い」という計画書の
 * 表現は、この投擲(8方向・1マス単位の直線)の仕組みでは的の物理的な広さを
 * 増やす手段が無いため、距離と配点だけで難度カーブを表現する簡略化とした
 */
const TARUKURABE_ROOM_WIDTH = 11;
const TARUKURABE_ROOM_HEIGHT = 17;
const TARUKURABE_PLAYER_POS: Vec2 = { x: 2, y: 5 };
const TARUKURABE_TARGETS: readonly TarukurabeTargetLayout[] = [
  { pos: { x: 2, y: 2 }, points: 1 }, // 近(北、距離3)
  { pos: { x: 8, y: 5 }, points: 2 }, // 中(東、距離6)
  { pos: { x: 2, y: 14 }, points: 3 }, // 遠(南、距離9)
];

/**
 * enterTarukurabeFloor/resolveTarukurabeHit/finishTarukurabeThrowが必要とする、
 * narrowなGameアクセス(plan/game/ddd-phase8-game-facade.md)。
 */
export interface TarukurabeContext {
  floor: FloorState;
  player: PlayerState;
  ids: IdSource;
  getScore(): number;
  setScore(score: number): void;
  getBarrelsLeft(): number;
  setBarrelsLeft(n: number): void;
  scoredLanes: Set<number>;
  /** finishTarukurabeThrow専用: status=cleared, gameOverの一連の処理 */
  completeRun(reason: string, events: GameEvent[]): void;
}

/** 樽比べ専用: 投擲台(プレイヤーの足元)に次の1個を供給する */
function spawnTarukurabeBarrel(ctx: Pick<TarukurabeContext, "floor" | "player" | "ids">): void {
  ctx.floor.barrels.push(createBarrel(ctx.ids.nextBarrelId(), "empty", { ...ctx.player.pos }));
}

export interface EnterTarukurabeFloorContext {
  depth: number;
  ids: IdSource;
  player: PlayerState;
  scoredLanes: Set<number>;
  visionExtraRange(): number;
}

export interface EnterTarukurabeFloorResult {
  floor: FloorState;
  tarukurabeScore: number;
  tarukurabeBarrelsLeft: number;
}

export function enterTarukurabeFloor(ctx: EnterTarukurabeFloorContext): EnterTarukurabeFloorResult {
  const width = TARUKURABE_ROOM_WIDTH;
  const height = TARUKURABE_ROOM_HEIGHT;
  const tiles: Tile[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const isWall = x === 0 || y === 0 || x === width - 1 || y === height - 1;
      tiles.push({
        kind: isWall ? TILE_WALL : TILE_ROOM,
        roomId: isWall ? -1 : 0,
        explored: false,
        visible: false,
      });
    }
  }

  const floor: FloorState = {
    depth: ctx.depth,
    width,
    height,
    tiles,
    rooms: [{ id: 0, x: 1, y: 1, w: width - 2, h: height - 2 }],
    // 投擲台から動けないため、実際には誰も踏まない位置(降りる/区切るコマンドは
    // 「ここには階段がない」で無害に弾かれる)
    stairs: { x: width - 2, y: height - 2 },
    actors: [],
    items: [],
    traps: [],
    barrels: [],
    goldPiles: [],
    fieldObstacles: [],
    secretPassages: [],
  };

  ctx.player.pos = { ...TARUKURABE_PLAYER_POS };
  ctx.player.facing = 0; // 北(近の的)を向いて開始
  ctx.player.carrying = null;
  floor.actors.push(ctx.player);

  for (const target of TARUKURABE_TARGETS) {
    floor.actors.push({
      id: ctx.ids.nextActorId(),
      kind: "target",
      name: "的",
      // 専用の3Dモデルは新規に作らず、既存の空樽モデルを的として流用する
      // (BarrelKindのempty用modelと同じ"barrel"。BARREL_MODELS定数は
      // modelList.ts側にのみ定義されているため、ここでは直接値を書く)
      model: "barrel",
      pos: { ...target.pos },
      facing: 0,
      hp: 1,
      maxHp: 1,
      atk: 0,
      def: 0,
      level: 1,
      statuses: [],
      alive: true,
      tarukurabePoints: target.points,
    });
  }

  ctx.scoredLanes.clear();
  spawnTarukurabeBarrel({ floor, player: ctx.player, ids: ctx.ids });

  updateVisibility(floor, ctx.player.pos, ctx.visionExtraRange());

  return { floor, tarukurabeScore: 0, tarukurabeBarrelsLeft: TARUKURABE_BARREL_COUNT };
}

export function resolveTarukurabeHit(hit: TargetActor, events: GameEvent[], ctx: TarukurabeContext): void {
  const points = hit.tarukurabePoints ?? 0;
  if (ctx.scoredLanes.has(points)) return;
  ctx.scoredLanes.add(points);
  const newScore = ctx.getScore() + points;
  ctx.setScore(newScore);
  hit.alive = false;
  events.push({
    type: "message",
    text: `的に命中! ${points}点(合計${newScore}点)。`,
  });
}

/**
 * 樽比べ(plan/tarukurabe-minigame.md): 1投の解決後に呼ぶ。タルを1個消費し、
 * 終了条件(全ての的に命中済み、またはタルを使い切った)を満たしていれば
 * 専用モードを終了する。満たしていなければ次の1個を投擲台に供給する
 */
export function finishTarukurabeThrow(events: GameEvent[], ctx: TarukurabeContext): void {
  ctx.setBarrelsLeft(ctx.getBarrelsLeft() - 1);
  const allTargetsHit = ctx.scoredLanes.size >= TARUKURABE_TARGETS.length;
  if (!allTargetsHit && ctx.getBarrelsLeft() > 0) {
    spawnTarukurabeBarrel(ctx);
    return;
  }
  const reason = `樽比べ終了! 合計${ctx.getScore()}点。`;
  events.push({ type: "tarukurabeFinished", score: ctx.getScore() });
  ctx.completeRun(reason, events);
}
