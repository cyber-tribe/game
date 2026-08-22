import type { Rng } from "../../core/rng";
import { chebyshev, eq, type Vec2 } from "../../core/grid";
import type { GameEvent } from "../../core/events";
import {
  type Actor,
  type AllyActor,
  type FloorState,
  type RunSkillId,
  actorAt,
  walkLine,
} from "../../core/types";
import { MAX_SATIETY, type PlayerState } from "../../entities/player";
import { displayActorName } from "../../entities/naming";
import { speciesById } from "../../entities/species";
import { isVisible } from "../dungeon/visibility";
import { computeDamage } from "../combat/damageCalculation";
import { itemDef } from "../../entities/itemCatalog";
import { equip, findItem, removeItem } from "./inventory";
import { applyEffect } from "./effects";

/**
 * 草を「使った」ときに満腹度も少し回復する(plan/herb-satiety-bonus.md)。
 * 食料(45)の1/9程度に抑えて、草を食料の代替にはしない
 */
const HERB_SATIETY_BONUS = 5;

/** 松明(plan/region-darkness.md): 使うと持続する視界拡張の効果時間(ターン)。数値は初期案 */
const TORCH_DURATION_TURNS = 20;

const ITEM_THROW_RANGE = 10;

/**
 * useItem/useTool/throwItemが必要とする、narrowなGameアクセス
 * (plan/game/ddd-phase8-game-facade.md)。
 */
export interface ItemActionContext {
  player: PlayerState;
  floor: FloorState;
  allies: AllyActor[];
  rng: Rng;
  runSkills: readonly RunSkillId[];
  damageActor(target: Actor, damage: number, critical: boolean, events: GameEvent[]): void;
  freeSpotNear(center: Vec2): Vec2 | null;
  /** ashfireDust(送り火の粉)専用: status=cleared, gameOverの一連の処理 */
  completeRun(reason: string, events: GameEvent[]): void;
  setTorchTurnsLeft(turns: number): void;
  markUsedItemThisRun(): void;
}

/** スキル「わけあう手」。隣接する仲間全員に、回復量の半分ぶん分け与える */
function applySharingHand(power: number, events: GameEvent[], ctx: ItemActionContext): void {
  const amount = Math.round(power / 2);
  if (amount <= 0) return;
  for (const ally of ctx.allies) {
    if (!ally.alive || chebyshev(ally.pos, ctx.player.pos) !== 1) continue;
    const healed = Math.min(ally.maxHp - ally.hp, amount);
    if (healed <= 0) continue;
    ally.hp += healed;
    events.push({ type: "heal", actorId: ally.id, amount: healed, hpAfter: ally.hp });
    events.push({ type: "message", text: `${displayActorName(ally)}にも分け与え、HPが${healed}回復した。` });
  }
}

/**
 * 道具(plan/protagonist-equipment.md、category: "tool")の効果。
 * 杖・草のような`effect`文字列(domain/item/effects.ts)には乗らない、
 * Gameクラス自身の状態(status・floor・allies)を直接操作する専用アクション。
 */
function useTool(defId: string, events: GameEvent[], ctx: ItemActionContext): boolean {
  switch (defId) {
    case "ashfireDust": {
      // めざめの階段を使わずに、その場で安全に麓へ戻る。踏破と同じ扱い
      // (持ち物・仲間を持ち帰れる)だが、checkpointイベントは出さないので
      // 「めざめの階段を使った」扱いにはならない
      ctx.completeRun("送り火の粉で、その場から麓へ戻った。", events);
      return true;
    }
    // おキヨの見取り図(plan/side-stories-part2.md): 効果は樽の目利きと同等
    case "barrelAppraisal":
    case "okiyoSketchMap": {
      const found = ctx.floor.barrels
        .filter((b) => b.kind === "caught" && b.speciesId && isVisible(ctx.floor, b.pos))
        .map((b) => speciesById(b.speciesId!).name);
      events.push({
        type: "message",
        text:
          found.length > 0
            ? `タルの中身を見分けた: ${found.join("、")}`
            : "視界内にモンスター入りのタルは無かった。",
      });
      return true;
    }
    // オトネの覚え帳(plan/side-stories-part2.md): 効果は望郷の綱と同等
    case "homesickRope":
    case "otoneMemoBook": {
      let recalled = 0;
      for (const ally of ctx.allies) {
        if (!ally.alive) continue;
        const spot = ctx.freeSpotNear(ctx.player.pos);
        if (!spot) continue;
        const from = ally.pos;
        ally.pos = spot;
        events.push({ type: "teleport", actorId: ally.id, from, to: spot });
        recalled++;
      }
      events.push({
        type: "message",
        text: recalled > 0 ? "仲間を呼び寄せた!" : "呼び寄せる仲間がいない。",
      });
      return true;
    }
    case "torch": {
      // 松明(plan/region-darkness.md): 使い直すと残りターンが上書きされる(延長ではなく更新)。
      // 視界の再計算はcommand()側が使用直後に必ず行う(consumedTurn=trueになるため)
      ctx.setTorchTurnsLeft(TORCH_DURATION_TURNS);
      events.push({ type: "message", text: "松明に火を灯した。しばらく視界が広がる。" });
      return true;
    }
    default:
      return false;
  }
}

export function useItem(uid: number, events: GameEvent[], ctx: ItemActionContext): boolean {
  const inv = ctx.player.inventory;
  const item = findItem(inv, uid);
  if (!item) return false;
  const def = itemDef(item.defId);

  if (
    def.category === "weapon" ||
    def.category === "shield" ||
    def.category === "head" ||
    def.category === "charm"
  ) {
    equip(inv, uid);
    events.push({ type: "equip", actorId: ctx.player.id, itemUid: uid, name: def.name });
    events.push({ type: "message", text: `${def.name}を装備した。` });
    return true;
  }

  if (def.category === "material") {
    // ゲンドの工房(拠点)専用の素材。ダンジョン内で使い道はない
    events.push({ type: "message", text: `「${def.name}」は素材だ。ここでは使えない。` });
    return false;
  }

  if (def.category === "tool") {
    const handled = useTool(item.defId, events, ctx);
    if (handled) {
      // 実績帳「挑戦」カテゴリ(plan/challenge-achievements.md)
      ctx.markUsedItemThisRun();
      removeItem(inv, uid);
    }
    return handled;
  }

  if (def.category === "staff") {
    if ((item.charges ?? 0) <= 0) {
      events.push({ type: "message", text: `${def.name}は もう振れない。` });
      return false;
    }
  }

  // 実績帳「挑戦」カテゴリ(plan/challenge-achievements.md): 装備・素材
  // (上の早期returnで除外済み)を除く、実際に道具を使う操作を記録する
  ctx.markUsedItemThisRun();

  events.push({ type: "useItem", actorId: ctx.player.id, itemUid: uid, name: def.name });
  events.push({ type: "message", text: `${def.name}を使った。` });

  const worked = applyEffect(
    { rng: ctx.rng, floor: ctx.floor, player: ctx.player, events },
    def.effect ?? "",
    def.power ?? 0,
    ctx.player.facing,
  );

  // 草は葉っぱを食べている(plan/herb-satiety-bonus.md): 「使う」操作の
  // ときだけ満腹度も少し回復する。敵への投げ当ては食べていないので
  // 対象外(そちらはthrow系の経路で、ここを通らない)。満タン時は黙る
  if (def.category === "herb") {
    const satietyBefore = ctx.player.satiety;
    ctx.player.satiety = Math.min(MAX_SATIETY, ctx.player.satiety + HERB_SATIETY_BONUS);
    if (ctx.player.satiety > satietyBefore) {
      events.push({ type: "message", text: "……少しだけおなかが満たされた。" });
    }
    // スキル「わけあう手」(plan/game/archive/run-build-skills.md): 回復の
    // 草を使うと、隣接する仲間にも半分の効果が及ぶ
    if (def.effect === "heal" && ctx.runSkills.includes("sharingHand")) {
      applySharingHand(def.power ?? 0, events, ctx);
    }
  }

  if (def.category === "staff") {
    if (worked) item.charges = (item.charges ?? 1) - 1;
  } else {
    removeItem(inv, uid);
  }
  return true;
}

export function throwItem(uid: number, events: GameEvent[], ctx: ItemActionContext): boolean {
  const inv = ctx.player.inventory;
  const item = findItem(inv, uid);
  if (!item) return false;
  const def = itemDef(item.defId);
  removeItem(inv, uid);

  const from = ctx.player.pos;
  let landing = from;
  let hit: Actor | null = null;

  for (const p of walkLine(ctx.floor, from, ctx.player.facing, ITEM_THROW_RANGE)) {
    landing = p;
    const actor = actorAt(ctx.floor, p);
    if (actor && actor.id !== ctx.player.id) {
      hit = actor;
      break;
    }
  }

  events.push({ type: "throwItem", actorId: ctx.player.id, itemUid: uid, from, to: landing });
  events.push({ type: "message", text: `${def.name}を投げた。` });

  if (hit) {
    if (def.category === "herb" && def.effect === "heal") {
      // 草をぶつけると相手が回復してしまう
      const healed = Math.min(hit.maxHp - hit.hp, def.power ?? 0);
      hit.hp += healed;
      events.push({ type: "heal", actorId: hit.id, amount: healed, hpAfter: hit.hp });
      events.push({ type: "message", text: `${displayActorName(hit)}のHPが${healed}回復した。` });
    } else {
      const { damage, critical } = computeDamage(ctx.rng, 6, hit.def);
      events.push({ type: "message", text: `${def.name}が${displayActorName(hit)}に当たった!` });
      ctx.damageActor(hit, damage, critical, events);
    }
    return true;
  }

  // 誰にも当たらなければその場に落ちる
  if (!ctx.floor.items.some((gi) => eq(gi.pos, landing)) && !eq(landing, from)) {
    ctx.floor.items.push({ item, pos: landing });
  }
  return true;
}
