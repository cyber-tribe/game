import { describe, expect, it } from "vitest";
import { Game } from "../src/game";
import { addItem, equip } from "../src/items/inventory";
import type { Actor } from "../src/core/types";
import { mitigateIncomingDamage as domainMitigateIncomingDamage } from "../src/domain/combat/damageModifier";
import type { OncePerRunTracker } from "../src/core/oncePerRunTracker";
import type { GameEvent } from "../src/core/events";

function mitigate(game: Game, target: Actor, damage: number, events: unknown[]): number {
  const internals = game as unknown as { oncePerRun: OncePerRunTracker; partyGuardTurns: number };
  return domainMitigateIncomingDamage({
    target,
    damage,
    events: events as GameEvent[],
    rng: game.rng,
    runSkills: game.runSkills,
    player: game.player,
    oncePerRun: internals.oncePerRun,
    partyGuardTurns: internals.partyGuardTurns,
  });
}

/**
 * plan/hidden-synergies.md「防御手段は重ね掛けできる」の検証。
 * 樽受け身(items/effects.tsを介さない、Game独自のukemiReadyフラグ)と
 * 身がわりの鈴(装身具。damageActorのhasStubbornEffect)は、互いに
 * 独立した「1ダイブ1回」の保険なので、同じダイブ内で両方とも
 * 一度ずつ発動できる(=本来なら倒れていた一撃を2回まで凌げる)はず。
 */
describe("特技・装備の重ね掛け(身がわりの鈴 + 樽受け身)", () => {
  it("樽受け身が先に致死ダメージを無効化し、続く一撃は身がわりの鈴がHP1で耐える", () => {
    const game = new Game({ seed: 1 });
    addItem(game.player.inventory, { uid: 9999, defId: "guardianBell" });
    equip(game.player.inventory, 9999);
    game.player.hp = 1;
    game.player.maxHp = 999;
    game.player.ukemiReady = true;

    const damageActor = (
      game as unknown as {
        damageActor: (target: Actor, damage: number, critical: boolean, events: unknown[]) => void;
      }
    ).damageActor.bind(game);
    // 1発目: 樽受け身がダメージそのものを0にする(hpは1のまま)
    const events1: { type: string; text?: string }[] = [];
    const finalDamage1 = mitigate(game, game.player, 500, events1);
    expect(finalDamage1).toBe(0);
    expect(game.player.ukemiReady).toBe(false); // 1回使うと消費される
    damageActor(game.player, finalDamage1, false, events1);
    expect(game.player.hp).toBe(1);
    expect(game.status).toBe("playing");

    // 2発目: 樽受け身はもう無い(ukemiReady=false)ので減衰なしで通るが、
    // 身がわりの鈴(1ダイブ1回)がHP1のまま耐える
    const events2: { type: string; text?: string }[] = [];
    const finalDamage2 = mitigate(game, game.player, 500, events2);
    expect(finalDamage2).toBe(500); // 樽受け身は使い切ったので軽減されない
    damageActor(game.player, finalDamage2, false, events2);
    expect(game.player.hp).toBe(1);
    expect(game.status).toBe("playing");
    expect(events2.some((e) => e.type === "message" && e.text?.includes("ふんばりこらえた"))).toBe(
      true,
    );

    // 3発目: 樽受け身も身がわりの鈴も使い切ったので、今度こそ力尽きる
    game.player.hp = 1;
    const events3: unknown[] = [];
    damageActor(game.player, 500, false, events3);
    expect(game.status).toBe("dead");
  });
});
