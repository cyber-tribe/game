import type { Rng } from "../../core/rng";
import { type Dir, type Vec2, dirDelta, eq, isDiagonal } from "../../core/grid";
import type { GameEvent } from "../../core/events";
import {
  TILE_CORRIDOR,
  type AllyActor,
  type FieldSkillId,
  type FloorState,
  actorAt,
  barrelAt,
  isHostile,
  tileAt,
  walkableAt,
} from "../../core/types";
import type { PlayerState } from "../../entities/player";
import { displayActorName } from "../../entities/naming";
import { speciesById } from "../../entities/species";
import { HOKORA_DUST_DEF_ID, MARK_STONE_DEF_ID, MARKS } from "../../entities/forging";
import { type IdSource, createItem } from "../dungeon/populate";
import { applyTorrentPush, pushMonster } from "./actorActions";

/** 忘れ物蔵(plan/lost-and-found-vault.md)。隠し壁へバンプするたびに崩れる確率 */
const SECRET_PASSAGE_REVEAL_CHANCE = 0.25;

/** あうんの呼吸(plan/ally-field-gimmicks.md)。障害物の前で表示するヒント文言 */
const FIELD_SKILL_HINTS: Record<FieldSkillId, string> = {
  break: "力持ちの",
  squeeze: "すばしっこい",
  leap: "跳べる",
  dig: "掘れる",
};

/**
 * movePlayerが必要とする、narrowなGameアクセス(plan/game/ddd-phase8-game-facade.md)。
 * checkTrap/collectGold/checkShoplifting/announceGround/checkMonsterHouseWarning/
 * checkSecretPassageHintは、まだGame側に残っている(checkShoplifting等は
 * domain/dungeon/shop.tsへ移す別PRのスコープ)ためコールバックのまま渡す。
 * pushMonster/applyTorrentPushは同じdomain/turn/内のactorActions.tsを直接呼ぶ。
 */
export interface MovePlayerContext {
  player: PlayerState;
  floor: FloorState;
  rng: Rng;
  allies: AllyActor[];
  ids: IdSource;
  checkTrap(pos: Vec2, events: GameEvent[]): void;
  collectGold(pos: Vec2, events: GameEvent[]): void;
  checkShoplifting(from: Vec2, to: Vec2, events: GameEvent[]): void;
  announceGround(pos: Vec2, events: GameEvent[]): void;
  checkMonsterHouseWarning(pos: Vec2, events: GameEvent[]): void;
  checkSecretPassageHint(pos: Vec2, events: GameEvent[]): void;
}

export function movePlayer(dir: Dir, events: GameEvent[], ctx: MovePlayerContext): boolean {
  const player = ctx.player;
  const delta = dirDelta(dir);
  const to = { x: player.pos.x + delta.x, y: player.pos.y + delta.y };

  const target = actorAt(ctx.floor, to);
  if (target && target.id !== player.id) {
    if (isHostile(player, target)) {
      return pushMonster(ctx.floor, player.id, dir, target, events);
    }
    // 仲間とは位置を入れ替える。通せんぼで足止めされては連れ歩けない
    const from = player.pos;
    player.pos = to;
    target.pos = from;
    events.push({ type: "swap", aId: player.id, bId: target.id });
    return true;
  }

  // 忘れ物蔵(plan/lost-and-found-vault.md)の隠し通路。壁の姿のまま
  // バンプするたびに確率で崩れて通路になる。無関係な壁は素通り扱い
  const secretPassage = ctx.floor.secretPassages.find((s) => eq(s.pos, to));
  if (secretPassage && !walkableAt(ctx.floor, to)) {
    events.push({ type: "bump", actorId: player.id, dir: delta });
    if (ctx.rng.chance(SECRET_PASSAGE_REVEAL_CHANCE)) {
      const tile = tileAt(ctx.floor, to);
      if (tile) tile.kind = TILE_CORRIDOR;
      events.push({ type: "message", text: "壁が崩れ、道ができた!" });
      events.push({ type: "secretPassageFound", regionId: secretPassage.regionId });
    } else {
      events.push({ type: "message", text: "壁を崩せそうな手ごたえがあった……" });
    }
    return false;
  }

  if (!walkableAt(ctx.floor, to)) {
    events.push({ type: "bump", actorId: player.id, dir: delta });
    return false;
  }

  // タルは押しのけられない。持ち上げるか、回り込む
  if (barrelAt(ctx.floor, to)) {
    events.push({ type: "bump", actorId: player.id, dir: delta });
    events.push({ type: "message", text: "タルが道をふさいでいる。" });
    return false;
  }
  // あうんの呼吸(plan/ally-field-gimmicks.md): 対応する性質を持つ仲間を
  // 連れていなければ通れない。連れていれば自動的に道が開く
  const obstacle = ctx.floor.fieldObstacles.find((o) => !o.opened && eq(o.pos, to));
  if (obstacle) {
    const helper = ctx.allies.find(
      (a) => a.alive && a.speciesId !== undefined && speciesById(a.speciesId).fieldSkill === obstacle.requires,
    );
    if (!helper) {
      events.push({ type: "bump", actorId: player.id, dir: delta });
      events.push({
        type: "message",
        text: `${FIELD_SKILL_HINTS[obstacle.requires]}仲間となら、ここを越えられそうだ。`,
      });
      return false;
    }
    obstacle.opened = true;
    const materialIds = [HOKORA_DUST_DEF_ID, ...MARKS.map((m) => MARK_STONE_DEF_ID[m.id])];
    const defId = ctx.rng.pick(materialIds);
    ctx.floor.items.push({ item: createItem(ctx.ids.nextItemUid(), defId), pos: { ...obstacle.pos } });
    events.push({
      type: "message",
      text: `${displayActorName(helper)}の力を借りて、道を切り開いた!`,
    });
  }
  // 斜めの角抜けは禁止
  if (isDiagonal(dir)) {
    if (!walkableAt(ctx.floor, { x: player.pos.x, y: to.y })) {
      events.push({ type: "bump", actorId: player.id, dir: delta });
      return false;
    }
    if (!walkableAt(ctx.floor, { x: to.x, y: player.pos.y })) {
      events.push({ type: "bump", actorId: player.id, dir: delta });
      return false;
    }
  }

  const from = player.pos;
  player.pos = to;
  events.push({ type: "move", actorId: player.id, from, to });
  const landed = applyTorrentPush(ctx.floor, player, events);

  ctx.checkTrap(landed, events);
  ctx.collectGold(landed, events);
  ctx.checkShoplifting(from, landed, events);
  ctx.announceGround(landed, events);
  ctx.checkMonsterHouseWarning(landed, events);
  ctx.checkSecretPassageHint(landed, events);
  return true;
}
