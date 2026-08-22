import type { Vec2 } from "../../core/grid";
import type { AllyActor, Barrel, FloorState } from "../../core/types";
import type { GameEvent } from "../../core/events";
import type { IdSource } from "../dungeon/populate";
import { createAlly } from "../dungeon/populate";
import { MAX_ALLIES } from "../../entities/player";
import { speciesById } from "../../entities/species";
import { t } from "../../i18n";

export interface RecruitFromBarrelArgs {
  floor: FloorState;
  barrel: Barrel;
  spot: Vec2;
  allies: AllyActor[];
  ids: IdSource;
  events: GameEvent[];
}

/**
 * 仲間化(パーティへの加入処理)。捕獲(タルから中身が出てくるところ)とは
 * releaseFromBarrelの中で境界を切ってある
 */
export function recruitFromBarrel(args: RecruitFromBarrelArgs): void {
  const { floor, barrel, spot, allies, ids, events } = args;
  if (barrel.speciesId === undefined) return;
  if (allies.length >= MAX_ALLIES) {
    events.push({ type: "message", text: "これ以上は連れて歩けない。" });
    return;
  }

  const species = speciesById(barrel.speciesId);
  const ally = createAlly(ids.nextActorId(), species, spot);
  allies.push(ally);
  floor.actors.push(ally);
  events.push({ type: "spawn", actorId: ally.id });
  events.push({ type: "recruit", actorId: ally.id, name: ally.name });
  events.push({ type: "message", text: t("msg.recruit", { name: ally.name }) });
  events.push({ type: "tutorialTip", id: "capture" });
  if (allies.length === 2) events.push({ type: "tutorialTip", id: "allyOrders" });
}
