import { dirDelta } from "../../core/grid";
import type { GameEvent } from "../../core/events";
import { actorAt, isHostile, type FloorState } from "../../core/types";
import type { PlayerState } from "../../entities/player";
import { type ArtId, artDef } from "../../entities/arts";

export interface UseArtContext {
  player: PlayerState;
  floor: FloorState;
}

export function useArt(id: ArtId, events: GameEvent[], ctx: UseArtContext): boolean {
  const player = ctx.player;
  const def = artDef(id);

  if (player.level < def.unlockLevel) {
    events.push({ type: "message", text: "まだ覚えていない技だ。" });
    return false;
  }
  if ((player.artCooldowns[id] ?? 0) > 0) {
    events.push({ type: "message", text: `「${def.name}」はまだ使えない。` });
    return false;
  }

  events.push({ type: "message", text: `「${def.name}」を繰り出した!` });

  switch (id) {
    case "critBarrel":
      player.critBarrelReady = true;
      break;
    case "pierce":
      player.pierceReady = true;
      break;
    case "ukemi":
      player.ukemiReady = true;
      break;
    case "soothe": {
      const delta = dirDelta(player.facing);
      const target = actorAt(ctx.floor, { x: player.pos.x + delta.x, y: player.pos.y + delta.y });
      if (target && target.kind === "monster" && isHostile(player, target)) {
        target.captureBonus = Math.min(1, (target.captureBonus ?? 0) + 0.4);
        events.push({ type: "message", text: `${target.name}の勢いをそいだ!` });
      } else {
        events.push({ type: "message", text: "しかし何も起こらなかった。" });
      }
      break;
    }
    case "shout":
      events.push({ type: "message", text: "しかし、それらしい気配はなかった。" });
      break;
  }

  player.artCooldowns[id] = def.cooldownTurns;
  return true;
}
