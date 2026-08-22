import { dirDelta } from "../../core/grid";
import type { GameEvent } from "../../core/events";
import type { FloorState } from "../../core/types";
import { barrelAt, freeSpotNear, isFree } from "../../core/types";
import type { Rng } from "../../core/rng";
import type { PlayerState } from "../../entities/player";
import { barrelDisplayName } from "../../entities/displayNames";

export interface LiftOrPutBarrelArgs {
  floor: FloorState;
  rng: Rng;
  player: PlayerState;
  events: GameEvent[];
}

/** 正面(第七地方の偽タルは持ち上げると消える)のタルを持ち上げる。抱えていれば代わりに置く */
export function liftOrPutBarrel(args: LiftOrPutBarrelArgs): boolean {
  const { floor, rng, player, events } = args;

  if (player.carrying) {
    const delta = dirDelta(player.facing);
    const front = { x: player.pos.x + delta.x, y: player.pos.y + delta.y };
    const spot = isFree(floor, front) ? front : freeSpotNear(floor, rng, player.pos, 1);
    if (!spot) {
      events.push({ type: "message", text: "タルを置く場所がない。" });
      return false;
    }
    const barrel = player.carrying;
    player.carrying = null;
    barrel.pos = spot;
    floor.barrels.push(barrel);
    events.push({ type: "putBarrel", actorId: player.id, barrelId: barrel.id, pos: spot });
    events.push({ type: "message", text: `${barrelDisplayName(barrel)}を置いた。` });
    return true;
  }

  // 正面を優先し、無ければ足元を見る
  const delta = dirDelta(player.facing);
  const front = { x: player.pos.x + delta.x, y: player.pos.y + delta.y };
  const barrel = barrelAt(floor, front) ?? barrelAt(floor, player.pos);
  if (!barrel) {
    events.push({ type: "message", text: "持ち上げられるタルがない。" });
    return false;
  }

  // 第七地方(わすれられた祭りの跡)固有ギミック(plan/festival-mirage.md): 偽のタル
  if (barrel.decoy) {
    floor.barrels = floor.barrels.filter((b) => b.id !== barrel.id);
    events.push({ type: "message", text: "――タルだと思ったが、幻だった。" });
    return true;
  }

  floor.barrels = floor.barrels.filter((b) => b.id !== barrel.id);
  player.carrying = barrel;
  events.push({
    type: "liftBarrel",
    actorId: player.id,
    barrelId: barrel.id,
    kind: barrel.kind,
  });
  events.push({ type: "message", text: `${barrelDisplayName(barrel)}を持ち上げた。` });
  events.push({ type: "tutorialTip", id: "barrel" });
  return true;
}
