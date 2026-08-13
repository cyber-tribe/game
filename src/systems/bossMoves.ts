/**
 * 地方ボスの大技(plan/region-bosses.md)。予兆(bossTelegraph、core/types.ts)を
 * 消費した1手の実装をここに集約する。
 *
 * 以前は「大技の種類」が types.ts(effect union)・ai.ts(MonsterActionの型・
 * effectからの変換if)・game.ts(実装switch)の4箇所に個別の分岐として
 * 並んでいた(ボスを1体追加するたびに4箇所すべてに手を入れる必要が
 * あった)。ここでは BOSS_MOVES という「大技id→実装」のレジストリ1つを
 * 単一の情報源にし、ai.ts の MonsterAction は種類を区別しない汎用の
 * `{ type: "bossMove"; moveId }` だけを持つ。
 *
 * Game クラスの private メソッドに直接依存すると循環参照になるため、
 * 各大技が実際に必要とする最小限の操作だけを BossMoveContext という
 * narrow なインターフェースで受け取る。
 */
import {
  type Actor,
  type BossMoveId,
  type FloorState,
  type MonsterActor,
  type StatusKind,
  STATUS_SEAL,
  STATUS_SLEEP,
  TILE_ROOM,
  actorAt,
  roomContains,
  tileAt,
} from "../core/types";
import type { GameEvent } from "../core/events";
import { type Vec2, dirFromDelta } from "../core/grid";
import type { Rng } from "../core/rng";
import { type IdSource, createMonster } from "../dungeon/populate";
import { displayActorName } from "../entities/naming";
import { speciesById } from "../entities/species";
import { computeDamage } from "./combat";

/**
 * 第三地方ボス(plan/region-boss-oomadoromi.md)の大技(aoeSleep)。
 * まどろみの茸林の胞子部屋パルス(plan/spore-grove.md、game.tsのtickSporeRooms)
 * と同じ確率・持続ターンをあえて共有している
 */
export const SPORE_SLEEP_CHANCE = 0.6;
export const SPORE_SLEEP_TURNS = 3;

/** 地方ボス(plan/region-boss-honezuka.md): 大技(aoeSeal)の封じ確率・持続ターン */
const HONEZUKA_SEAL_CHANCE = 0.6;
const HONEZUKA_SEAL_TURNS = 3;

/** 地方ボス(plan/region-boss-fuchinonushi.md): 大技(summonTorrent)で設置する奔流タイルの持続ターン */
const SUMMON_TORRENT_DURATION = 3;

/** 地方ボス(plan/region-boss-misemonononushi.md): 大技(summonMirror)の幻影が自然に消えるまでのターン数 */
const MIRROR_AUTO_DISPEL_TURNS = 5;

/** 地方ボス(plan/region-boss-horikuinonushi.md): 大技(groundSpikes)の威力 */
const GROUND_SPIKES_DAMAGE = 26;

/** "targetedStrike"(通常の隣接攻撃強化)は専用の大技実装を持たないため除く */
export type BossMoveActionId = Exclude<BossMoveId, "targetedStrike">;

/** 大技の実行に必要な最小限のGameアクセス */
export interface BossMoveContext {
  actor: MonsterActor;
  floor: FloorState;
  rng: Rng;
  ids: IdSource;
  events: GameEvent[];
  applyRoomWideStatus: (
    occupants: readonly Actor[],
    kind: StatusKind,
    chance: number,
    turns: number,
    verb: string,
    events: GameEvent[],
  ) => void;
  freeSpotNear: (center: Vec2) => Vec2 | null;
  damageActor: (target: Actor, damage: number, critical: boolean, events: GameEvent[]) => void;
  /** groundSpikesが1体倒すごとに確認する。trueならその場で残りのマスの処理を打ち切る */
  isGameOver: () => boolean;
}

export interface BossMoveDef {
  execute(ctx: BossMoveContext): void;
}

function roomOccupantsOf(ctx: BossMoveContext): readonly Actor[] {
  const room = ctx.floor.rooms.find((r) => roomContains(r, ctx.actor.pos));
  if (!room) return [];
  return ctx.floor.actors.filter((a) => a.alive && roomContains(room, a.pos));
}

/** summonEcho・summonMirrorで共通の「呼べるだけ分身を並べる」処理 */
function spawnCopies(
  ctx: BossMoveContext,
  count: number,
  tag: (copy: MonsterActor) => void,
): void {
  const species = ctx.actor.speciesId ? speciesById(ctx.actor.speciesId) : undefined;
  if (!species) return;
  for (let i = 0; i < count; i++) {
    const spot = ctx.freeSpotNear(ctx.actor.pos);
    if (!spot) break;
    const copy = createMonster(ctx.ids.nextActorId(), species, spot);
    tag(copy);
    copy.aware = true;
    ctx.floor.actors.push(copy);
  }
}

export const BOSS_MOVES: Readonly<Record<BossMoveActionId, BossMoveDef>> = {
  aoeSleep: {
    // 地方ボス(plan/region-boss-oomadoromi.md): 予兆を消費した大技。
    // 隣接攻撃ではなく、自分のいる部屋の全アクターに睡眠を放つ
    execute(ctx) {
      ctx.events.push({ type: "message", text: `${displayActorName(ctx.actor)}が胞子をまき散らした!` });
      ctx.applyRoomWideStatus(
        roomOccupantsOf(ctx),
        STATUS_SLEEP,
        SPORE_SLEEP_CHANCE,
        SPORE_SLEEP_TURNS,
        "眠ってしまった",
        ctx.events,
      );
    },
  },
  aoeSeal: {
    // 地方ボス(plan/region-boss-honezuka.md): 予兆を消費した大技。
    // 隣接攻撃ではなく、自分のいる部屋の全アクターに封じを放つ
    execute(ctx) {
      ctx.events.push({ type: "message", text: `${displayActorName(ctx.actor)}の骨が一斉に鳴り響いた!` });
      ctx.applyRoomWideStatus(
        roomOccupantsOf(ctx),
        STATUS_SEAL,
        HONEZUKA_SEAL_CHANCE,
        HONEZUKA_SEAL_TURNS,
        "封じられた",
        ctx.events,
      );
    },
  },
  summonTorrent: {
    // 地方ボス(plan/region-boss-fuchinonushi.md): 予兆を消費した大技。
    // 隣接攻撃ではなく、自分のいる部屋の外周タイルへ一時的に奔流を呼び込む
    execute(ctx) {
      ctx.events.push({ type: "message", text: `${displayActorName(ctx.actor)}が奔流を呼び込んだ!` });
      const room = ctx.floor.rooms.find((r) => roomContains(r, ctx.actor.pos));
      if (!room) return;
      ctx.actor.summonedTorrentTiles ??= [];
      const cx = room.x + (room.w >> 1);
      const cy = room.y + (room.h >> 1);
      for (let x = room.x; x < room.x + room.w; x++) {
        for (let y = room.y; y < room.y + room.h; y++) {
          const onPerimeter = x === room.x || x === room.x + room.w - 1 || y === room.y || y === room.y + room.h - 1;
          if (!onPerimeter) continue;
          const tile = tileAt(ctx.floor, { x, y });
          if (!tile || tile.kind !== TILE_ROOM) continue;
          tile.torrent = dirFromDelta(cx - x, cy - y);
          ctx.actor.summonedTorrentTiles.push({ pos: { x, y }, expiresIn: SUMMON_TORRENT_DURATION });
        }
      }
    },
  },
  summonEcho: {
    // 地方ボス(plan/region-boss-kodamanonushi.md): 予兆を消費した大技。
    // HPを共有する分身を、既存の生存数に応じて最大2体まで補充する
    execute(ctx) {
      const existingEchoes = ctx.floor.actors.filter(
        (a): a is MonsterActor => a.alive && a.kind === "monster" && a.sharesHpWith === ctx.actor.id,
      );
      const toSpawn = Math.max(0, 2 - existingEchoes.length);
      if (toSpawn > 0 && ctx.actor.speciesId) {
        ctx.events.push({ type: "message", text: `${displayActorName(ctx.actor)}が分身を呼び出した!` });
      }
      spawnCopies(ctx, toSpawn, (copy) => {
        copy.sharesHpWith = ctx.actor.id;
        copy.hp = ctx.actor.hp;
        copy.atk = Math.round(ctx.actor.atk * 0.5);
      });
    },
  },
  summonMirror: {
    // 地方ボス(plan/region-boss-misemonononushi.md): 予兆を消費した大技。
    // 本体そっくりの幻影を3体呼び出す。当てても消えるだけの偽物で、
    // 本体を選び当てる駆け引きになる
    execute(ctx) {
      if (!ctx.actor.speciesId) return;
      ctx.events.push({ type: "message", text: `${displayActorName(ctx.actor)}の周りに幻影が現れた!` });
      spawnCopies(ctx, 3, (copy) => {
        copy.mirrorOf = ctx.actor.id;
      });
      ctx.actor.mirrorTurnsLeft = MIRROR_AUTO_DISPEL_TURNS;
    },
  },
  groundSpikes: {
    // 地方ボス(plan/region-boss-horikuinonushi.md): 予兆を消費した大技。
    // crackWarningの立つ全マスについて、上にいるアクターへダメージを
    // 適用し、その後crackWarningをすべて解除する
    execute(ctx) {
      ctx.events.push({ type: "message", text: `${displayActorName(ctx.actor)}が地面から杭を突き上げた!` });
      for (let i = 0; i < ctx.floor.tiles.length; i++) {
        const tile = ctx.floor.tiles[i]!;
        if (!tile.crackWarning) continue;
        tile.crackWarning = false;
        const pos = { x: i % ctx.floor.width, y: Math.floor(i / ctx.floor.width) };
        const hit = actorAt(ctx.floor, pos);
        if (!hit || !hit.alive) continue;
        const result = computeDamage(ctx.rng, GROUND_SPIKES_DAMAGE, hit.def);
        ctx.events.push({ type: "message", text: `${displayActorName(hit)}に${result.damage}のダメージ!` });
        ctx.damageActor(hit, result.damage, result.critical, ctx.events);
        if (ctx.isGameOver()) return;
      }
    },
  },
};
