import type { Actor, FloorState, MonsterActor, RunSkillId } from "../../core/types";
import { STATUS_SLEEP, hpOwnerOf } from "../../core/types";
import type { GameEvent } from "../../core/events";
import type { Rng } from "../../core/rng";
import type { IdSource } from "../dungeon/populate";
import { createItem } from "../dungeon/populate";
import type { OncePerRunTracker } from "../../core/oncePerRunTracker";
import type { Inventory } from "../../items/inventory";
import { hasEquipEffect } from "../../items/inventory";
import type { PlayerState, TrainingFocus } from "../../entities/player";
import { hasSkill } from "../../entities/skills";
import { HAJIME_NO_YUME_ID, speciesById } from "../../entities/species";
import { HOKORA_DUST_DEF_ID, MARKS, MARK_STONE_DEF_ID } from "../../entities/forging";
import { rollBossTreasure } from "../../entities/bossTreasure";
import { displayActorName } from "../../entities/naming";
import { gainPlayerExpFromKill } from "../player/leveling";
import { gainAllyExpFromKill } from "../party/allyGrowth";

/** ねぎらい: 敵を倒すたびの仲間の回復量 */
const APPRECIATION_HEAL_AMOUNT = 1;

export interface DamageActorArgs {
  floor: FloorState;
  target: Actor;
  damage: number;
  critical: boolean;
  events: GameEvent[];
  hitThisTurn: Set<number>;
  playerInventory: Inventory;
  runSkills: readonly RunSkillId[];
  oncePerRun: OncePerRunTracker;
  recordPlayerDamageTaken(amount: number): void;
  trueAwakeningEnding(target: MonsterActor): void;
  killActor(target: Actor): void;
}

/** 分身と本体でHPを共有する仕掛け向け。本体のhpを紐づく分身全員のhpフィールドへミラーする(表示用。増減判定には使わない) */
function mirrorSharedHp(floor: FloorState, owner: Actor): void {
  for (const actor of floor.actors) {
    if (actor.kind !== "monster" && actor.kind !== "ally") continue;
    if (actor.sharesHpWith === owner.id) actor.hp = owner.hp;
  }
}

export function damageActor(args: DamageActorArgs): void {
  const {
    floor,
    target,
    damage,
    critical,
    events,
    hitThisTurn,
    playerInventory,
    runSkills,
    oncePerRun,
    recordPlayerDamageTaken,
    trueAwakeningEnding,
    killActor,
  } = args;

  // 地方ボス(plan/region-boss-kodamanonushi.md): 分身はHPを共有する。実際の
  // 増減・生死判定は本体側のActorに対して行う
  const hpOwner = hpOwnerOf(floor, target);
  hpOwner.hp -= damage;
  hitThisTurn.add(target.id);
  if (target.kind === "player") recordPlayerDamageTaken(damage);
  events.push({
    type: "damage",
    actorId: target.id,
    amount: damage,
    hpAfter: Math.max(0, hpOwner.hp),
    critical,
  });
  // 攻撃を受ければ目が覚める
  const sleep = target.statuses.find((s) => s.kind === STATUS_SLEEP);
  if (sleep) {
    sleep.turns = 0;
    events.push({ type: "statusEnd", actorId: target.id, kind: STATUS_SLEEP });
  }
  if (hpOwner.hp <= 0) {
    // 特技「ふんばり」、ホネガラミの印(plan/equipment-forging.md)、または
    // 身がわりの鈴(plan/protagonist-equipment.md): HPが1残っていた状態
    // からの致死ダメージを1ダイブ1回だけ耐える
    const hpBeforeThisHit = hpOwner.hp + damage;
    const hasStubbornEffect =
      (hpOwner.kind === "ally" && hasSkill(hpOwner, "stubborn")) ||
      (hpOwner.kind === "player" && hasEquipEffect(playerInventory, "revivalWard"));
    if (hpBeforeThisHit === 1 && hasStubbornEffect && !oncePerRun.hasUsed("stubborn", hpOwner.id)) {
      hpOwner.hp = 1;
      oncePerRun.markUsed("stubborn", hpOwner.id);
      events.push({ type: "message", text: `${displayActorName(hpOwner)}はふんばりこらえた!` });
    } else if (
      // スキル「目覚めのいのり」(plan/game/archive/run-build-skills.md): 仲間が
      // 倒れる一撃を、そのダイブで一度だけHP1で耐えさせる(ふんばりと違い、
      // 直前のHPを問わない代わりに1ラン合計1回だけ)
      hpOwner.kind === "ally" &&
      runSkills.includes("wakingPrayer") &&
      !oncePerRun.hasUsed("wakingPrayer", 0)
    ) {
      hpOwner.hp = 1;
      oncePerRun.markUsed("wakingPrayer", 0);
      events.push({
        type: "message",
        text: `${displayActorName(hpOwner)}は、目覚めのいのりに支えられて踏みとどまった!`,
      });
    } else if (hpOwner.kind === "monster" && hpOwner.speciesId === HAJIME_NO_YUME_ID) {
      trueAwakeningEnding(hpOwner);
    } else {
      killActor(hpOwner);
    }
  }
  mirrorSharedHp(floor, hpOwner);
}

export interface KillActorArgs {
  floor: FloorState;
  rng: Rng;
  target: Actor;
  events: GameEvent[];
  runSkills: readonly RunSkillId[];
  allies: Actor[];
  player: PlayerState;
  trainingFocus: TrainingFocus;
  depth: number;
  dungeonFloorOffset: number | undefined;
  ids: IdSource;
  defeatedRegionBossesThisRun: Set<string>;
  defeatedRegionBossIdsAtStart: ReadonlySet<string>;
  endRun(reason: string): void;
  removeAlly(id: number): void;
  onLevelUp(levels: number): void;
}

export function killActor(args: KillActorArgs): void {
  const {
    floor,
    rng,
    target,
    events,
    runSkills,
    allies,
    player,
    trainingFocus,
    depth,
    dungeonFloorOffset,
    ids,
    defeatedRegionBossesThisRun,
    defeatedRegionBossIdsAtStart,
    endRun,
    removeAlly,
    onLevelUp,
  } = args;

  target.alive = false;
  target.hp = 0;
  const diedSpeciesId = target.kind === "monster" || target.kind === "ally" ? target.speciesId : undefined;
  events.push({ type: "die", actorId: target.id, kind: target.kind, speciesId: diedSpeciesId });

  if (target.kind === "player") {
    endRun(`地下${depth}階で力尽きた……`);
    return;
  }

  if (target.kind === "ally") {
    removeAlly(target.id);
    events.push({ type: "message", text: `${displayActorName(target)}は力尽きた……` });
    return;
  }

  // 樽比べ(plan/tarukurabe-minigame.md)の的は、専用のresolveTarukurabeHitで
  // 処理されるためkillActorには本来到達しないが、型上は残る分岐として明示しておく
  if (target.kind === "target") return;

  events.push({ type: "message", text: `${displayActorName(target)}をたおした!` });
  // スキル「ねぎらい」(plan/game/archive/run-build-skills.md): 敵を倒すたび仲間全員が少し回復する
  if (runSkills.includes("appreciation")) {
    for (const ally of allies) {
      if (!ally.alive) continue;
      const healed = Math.min(ally.maxHp - ally.hp, APPRECIATION_HEAL_AMOUNT);
      if (healed <= 0) continue;
      ally.hp += healed;
      events.push({ type: "heal", actorId: ally.id, amount: healed, hpAfter: ally.hp });
    }
  }
  // スリガラス(plan/shops-and-thieves.md): 盗品を持ったまま倒すと、その場に落とす
  if (target.aiKind === "thief" && target.stolenGold !== undefined) {
    floor.goldPiles.push({
      id: ids.nextItemUid(),
      pos: { ...target.pos },
      amount: target.stolenGold,
    });
    events.push({ type: "message", text: "盗まれた金を取り戻した!" });
  }
  // かがやきの夢のかけら(plan/monster-compendium.md): 倒すと上質な素材を1つ落とす
  if (target.shining) {
    const materialIds = [HOKORA_DUST_DEF_ID, ...MARKS.map((m) => MARK_STONE_DEF_ID[m.id])];
    const defId = rng.pick(materialIds);
    floor.items.push({ item: createItem(ids.nextItemUid(), defId), pos: { ...target.pos } });
    events.push({ type: "message", text: "かがやく残り香から、上質な素材が現れた!" });
  }
  // 地方ボス(plan/region-bosses.md): 撃破すると、その地方限定の素材を確定ドロップする
  const bossDrop = target.speciesId ? speciesById(target.speciesId).bossGuaranteedDrop : undefined;
  if (bossDrop) {
    floor.items.push({ item: createItem(ids.nextItemUid(), bossDrop), pos: { ...target.pos } });
    events.push({ type: "message", text: "地方ボスの証となる、特別な素材が現れた!" });
  }
  // 山の芯(plan/mountain-core.md): 撃破した地方ボスを記録する
  if (target.speciesId && speciesById(target.speciesId).isRegionBoss) {
    defeatedRegionBossesThisRun.add(target.speciesId);
    // ぬしの置き土産(plan/game/dungeon-boss-rooms.md): 確定ドロップとは
    // 別に、宝箱相当の報酬をもう1つ落とす。2回目以降の踏破では一段軽くなる
    const firstClear = !defeatedRegionBossIdsAtStart.has(target.speciesId);
    const tableDepth = depth + (dungeonFloorOffset ?? 0);
    const treasure = rollBossTreasure(rng, () => ids.nextItemUid(), tableDepth, firstClear);
    for (const item of treasure) floor.items.push({ item, pos: { ...target.pos } });
    if (treasure.length > 0) {
      events.push({ type: "message", text: "ぬしの置き土産を見つけた!" });
    }
    // ボスの間の階段(plan/game/dungeon-boss-rooms.md): 撃破するまで壁と
    // 同じく通れなかった階段が、ここで通れるようになる
    if (floor.stairsBlocked) {
      floor.stairsBlocked = false;
      events.push({ type: "message", text: "奥に、踏破の階段が現れた!" });
    }
  }
  const exp = target.exp ?? 0;
  if (exp > 0) {
    gainPlayerExpFromKill({ player, exp, trainingFocus, events, onLevelUp });
    gainAllyExpFromKill(floor, exp, events);
  }

  // 地方ボス(plan/region-boss-kodamanonushi.md): 本体が倒れたら、紐づく分身も
  // 同時に消える。経験値・ドロップの重複を避けるため、通常のkillActor処理は
  // 分身側には通さない
  for (const echo of floor.actors) {
    if (echo.kind !== "monster") continue;
    if (echo.id === target.id || echo.sharesHpWith !== target.id || !echo.alive) continue;
    echo.alive = false;
    echo.hp = 0;
    events.push({ type: "die", actorId: echo.id, kind: echo.kind, speciesId: echo.speciesId });
  }
}
