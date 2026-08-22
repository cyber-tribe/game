import { ALL_DIRS, type Dir, dirDelta, dirFromDelta, eq } from "../../core/grid";
import type { Vec2 } from "../../core/grid";
import type { Actor, AllyActor, FloorState, MonsterActor, RunSkillId } from "../../core/types";
import {
  STATUS_CONFUSE,
  STATUS_FLINCH,
  STATUS_INVISIBLE,
  STATUS_ROOT,
  STATUS_SLEEP,
  TILE_ROOM,
  actorAt,
  barrelAt,
  hasStatus,
  tileAt,
  walkableAt,
} from "../../core/types";
import type { GameEvent } from "../../core/events";
import type { Rng } from "../../core/rng";
import type { OncePerRunTracker } from "../../core/oncePerRunTracker";
import type { PlayerState } from "../../entities/player";
import type { MoodDef } from "../../entities/moods";
import { GUARD_COUNTER_BONUS, type MonsterAction, buildDistanceField, canStep, decideAllyAction, decideMonsterAction } from "../../entities/ai";
import { speciesById } from "../../entities/species";
import { bondStage } from "../../entities/companionBond";
import { dreamArtDef } from "../../entities/dreamArts";
import { totalDefense } from "../../entities/player";
import { displayActorName } from "../../entities/naming";
import { isVisible } from "../../dungeon/visibility";
import { DREAM_ART_EFFECTS, type DreamArtContext } from "../party/dreamArtEffects";
import { BOSS_MOVES, type BossMoveContext } from "../dungeon/bossMoves";
import { computeDamage } from "../combat/damageCalculation";
import { mitigateIncomingDamage } from "../combat/damageModifier";
import { attack, attemptSteal } from "./attackResolution";

/** 第五地方(なみだの滝つぼ)固有ギミック。奔流タイルで押し流される最大マス数 */
const TORRENT_PUSH_LIMIT = 4;
/** ねむタルを抱えている間、気づかれにくくなる確率 */
const SLEEP_BARREL_CARRY_AWARE_SUPPRESS_CHANCE = 0.4;
/** かつぎばしり: タルを抱えている間、気づかれにくくなる確率(ねむタルと同じ形) */
const STEALTH_CARRY_SUPPRESS_CHANCE = 0.3;
/** はげましの声: 仲間のゆめわざクールダウンの倍率 */
const ENCOURAGEMENT_COOLDOWN_MULTIPLIER = 0.75;
/** ぬしのゆめわざ: なじみ最高段階でのクールダウン短縮率(2割短縮) */
const BOSS_DREAM_ART_BOND_COOLDOWN_MULTIPLIER = 0.8;

export function moveActor(floor: FloorState, actor: Actor, dir: Dir, events: GameEvent[]): void {
  if (!canStep(floor, actor.pos, dir)) return;
  const delta = dirDelta(dir);
  const from = actor.pos;
  const to = { x: from.x + delta.x, y: from.y + delta.y };
  actor.pos = to;
  actor.facing = dir;
  events.push({ type: "move", actorId: actor.id, from, to });
  applyTorrentPush(floor, actor, events);
}

/**
 * 第五地方(なみだの滝つぼ)固有ギミック(plan/waterfall-torrent.md): 奔流タイルへ
 * 移動すると、その向きへ連鎖的に押し流される(最大4マス)。壁・他アクター・タルが
 * あれば手前で止まる。プレイヤー・仲間・モンスターの移動処理の末尾で共通に呼ぶ
 */
export function applyTorrentPush(floor: FloorState, actor: Actor, events: GameEvent[]): Vec2 {
  const start = actor.pos;
  let current = start;
  for (let i = 0; i < TORRENT_PUSH_LIMIT; i++) {
    const tile = tileAt(floor, current);
    if (!tile?.torrent) break;
    const delta = dirDelta(tile.torrent);
    const next = { x: current.x + delta.x, y: current.y + delta.y };
    if (!walkableAt(floor, next) || barrelAt(floor, next)) break;
    const occupant = actorAt(floor, next);
    if (occupant && occupant.id !== actor.id) break;
    current = next;
  }
  if (!eq(current, start)) {
    actor.pos = current;
    events.push({ type: "move", actorId: actor.id, from: start, to: current });
    if (actor.kind === "player") {
      events.push({ type: "message", text: "奔流に押し流された!" });
    }
  }
  return current;
}

export function pushMonster(floor: FloorState, playerId: number, dir: Dir, target: Actor, events: GameEvent[]): boolean {
  if (!canStep(floor, target.pos, dir)) {
    events.push({ type: "bump", actorId: playerId, dir: dirDelta(dir) });
    return false;
  }
  moveActor(floor, target, dir, events);
  return true;
}

/**
 * 地方ボス(plan/region-boss-nushigaeru.md): 深みタイルの上にいる間、毎ターン
 * STATUS_INVISIBLEを付与し直す。深みタイルを離れれば次のupkeepで自然にturnsが尽きて解ける
 */
export function tickQuagmireInvisibility(floor: FloorState, actor: MonsterActor | AllyActor): void {
  if (!actor.alive || !actor.speciesId || !speciesById(actor.speciesId).hidesInQuagmire || !tileAt(floor, actor.pos)?.quagmire) {
    return;
  }
  // upkeepのtickStatusesが同じcommand内で直後に走りturnsを1減らすため、
  // 2を設定して次ターン開始時点でも生存させる(1だとその場で0になり消える)
  const existing = actor.statuses.find((s) => s.kind === STATUS_INVISIBLE);
  if (existing) existing.turns = 2;
  else actor.statuses.push({ kind: STATUS_INVISIBLE, turns: 2 });
}

export function markGroundSpikeWarnings(floor: FloorState, center: Vec2): Vec2[] {
  const candidates: Vec2[] = [
    center,
    { x: center.x - 1, y: center.y },
    { x: center.x + 1, y: center.y },
    { x: center.x, y: center.y - 1 },
    { x: center.x, y: center.y + 1 },
  ];
  const marked: Vec2[] = [];
  for (const pos of candidates) {
    const tile = tileAt(floor, pos);
    if (!tile || tile.kind !== TILE_ROOM) continue;
    tile.crackWarning = true;
    marked.push(pos);
  }
  return marked;
}

export function playerStealthChance(player: PlayerState, runSkills: readonly RunSkillId[]): number {
  if (!player.carrying) return 0;
  let chance = 0;
  if (player.carrying.kind === "sleep") chance = Math.max(chance, SLEEP_BARREL_CARRY_AWARE_SUPPRESS_CHANCE);
  if (runSkills.includes("stealthCarry")) chance = Math.max(chance, STEALTH_CARRY_SUPPRESS_CHANCE);
  return chance;
}

/**
 * runActorsが使う距離場をまとめて用意する。towardsLeaderだけ遅延評価に
 * しているのは、プレイヤーへ向かう距離場は仲間だけが使い、仲間は最大2体で
 * 連れていないことのほうが多いため、実際に必要になるまで作らないため
 */
function buildActionDistanceFields(
  floor: FloorState,
  player: PlayerState,
): {
  towardsFriendly: Int32Array;
  towardsFoe: Int32Array | null;
  towardsLeader: () => Int32Array;
} {
  const alive = (a: Actor) => a.alive;
  // target(樽比べ)は敵でも味方でもない置物なので、モンスターの追跡先候補
  // (friendlyPositions)には含めない
  const friendlyPositions = floor.actors.filter((a) => alive(a) && a.kind !== "monster" && a.kind !== "target").map((a) => a.pos);
  const foePositions = floor.actors.filter((a) => alive(a) && a.kind === "monster").map((a) => a.pos);

  const towardsFriendly = buildDistanceField(floor, friendlyPositions);
  const towardsFoe = foePositions.length > 0 ? buildDistanceField(floor, foePositions) : null;
  let leaderField: Int32Array | null = null;
  const towardsLeader = (): Int32Array => (leaderField ??= buildDistanceField(floor, player.pos));

  return { towardsFriendly, towardsFoe, towardsLeader };
}

export interface RunActorsArgs {
  floor: FloorState;
  rng: Rng;
  player: PlayerState;
  allies: readonly Actor[];
  runSkills: readonly RunSkillId[];
  oncePerRun: OncePerRunTracker;
  mood: MoodDef;
  events: GameEvent[];
  echoAttackTurns: number;
  partyGuardTurns: number;
  isPlaying(): boolean;
  damageActor(target: Actor, damage: number, critical: boolean): void;
  buildBossMoveContext(actor: MonsterActor): BossMoveContext;
  buildDreamArtContext(actor: AllyActor): DreamArtContext;
}

/**
 * runActorsの1アクターぶんの行動実行。決定済みのMonsterActionを実際の
 * イベント・状態変化に変換する。戻り値trueは、大技でゲームオーバーに
 * なったなどの理由でrunActors自体を即座に打ち切るべきことを示す
 * (呼び出し側でreturnする)
 */
export function executeMonsterAction(
  actor: MonsterActor | AllyActor,
  action: MonsterAction,
  args: RunActorsArgs,
): boolean {
  const { floor, rng, player, allies, runSkills, oncePerRun, events, echoAttackTurns, partyGuardTurns, isPlaying, damageActor, buildBossMoveContext, buildDreamArtContext } =
    args;

  switch (action.type) {
    case "wait":
      break;
    case "move":
      moveActor(floor, actor, action.dir, events);
      // スリガラス(plan/shops-and-thieves.md): 盗んだあと、プレイヤーの
      // 視界から外れると、盗んだ金ごと消える
      if (actor.alive && actor.aiKind === "thief" && actor.stolenGold !== undefined && !isVisible(floor, actor.pos)) {
        actor.alive = false;
        floor.actors = floor.actors.filter((a) => a.id !== actor.id);
      }
      break;
    case "attack": {
      const target = floor.actors.find((a) => a.id === action.targetId && a.alive);
      if (!target) break;
      if (actor.aiKind === "thief" && actor.stolenGold === undefined) {
        attemptSteal({ thief: actor, target, player, rng, events });
      } else {
        // 地方ボス(plan/region-bosses.md): 予兆を消費した一撃は大技として、
        // 通常のダメージ計算にmultiplierを掛けたぶんだけ底上げする
        const bossTelegraph = action.empowered && actor.speciesId ? speciesById(actor.speciesId).bossTelegraph : undefined;
        // guard(plan/monster-compendium.md): 隣接されたときの反撃力が高い
        const attackPower = bossTelegraph
          ? Math.round(actor.atk * bossTelegraph.multiplier)
          : actor.aiKind === "guard"
            ? Math.round(actor.atk * GUARD_COUNTER_BONUS)
            : actor.atk;
        attack({
          attacker: actor,
          target,
          attackPower,
          events,
          rng,
          floor,
          player,
          allies,
          runSkills,
          oncePerRun,
          echoAttackTurns,
          partyGuardTurns,
          damageActor,
        });
        if (bossTelegraph) {
          events.push({ type: "message", text: `${displayActorName(actor)}の大技が炸裂した!` });
        }
      }
      break;
    }
    case "telegraph": {
      // 地方ボス(plan/region-bosses.md): この手は攻撃せず、警告メッセージだけ出す。
      // 既存のGameEvent(message)の枠組みで実装し、新規UIは増やさない
      const target = floor.actors.find((a) => a.id === action.targetId && a.alive);
      const telegraph = actor.speciesId ? speciesById(actor.speciesId).bossTelegraph : undefined;
      if (target && telegraph) {
        actor.facing = dirFromDelta(target.pos.x - actor.pos.x, target.pos.y - actor.pos.y);
        events.push({ type: "message", text: `${displayActorName(actor)}は${telegraph.message}――!` });
        // 地方ボス(plan/region-boss-horikuinonushi.md): groundSpikesだけは、
        // 予兆ターンの時点で床にひび割れ(crackWarning)を立てて危険地帯を可視化する
        if (telegraph.effect === "groundSpikes") {
          const positions = markGroundSpikeWarnings(floor, target.pos);
          if (positions.length > 0) events.push({ type: "crackWarning", positions });
        }
      }
      break;
    }
    case "ranged": {
      const target = floor.actors.find((a) => a.id === action.targetId && a.alive);
      if (!target) break;
      actor.facing = dirFromDelta(target.pos.x - actor.pos.x, target.pos.y - actor.pos.y);
      events.push({ type: "attack", attackerId: actor.id, targetId: target.id });
      events.push({ type: "message", text: `${displayActorName(actor)}が つぶてを投げた!` });
      const defense = target.kind === "player" ? totalDefense(player) : target.def;
      const { damage, critical } = computeDamage(rng, actor.atk, defense);
      const finalDamage = mitigateIncomingDamage({
        target,
        damage,
        events,
        rng,
        runSkills,
        player,
        oncePerRun,
        partyGuardTurns,
      });
      events.push({ type: "message", text: `${displayActorName(target)}に${finalDamage}のダメージ!` });
      damageActor(target, finalDamage, critical);
      break;
    }
    case "bossMove": {
      // 地方ボス(plan/region-bosses.md): 予兆を消費した大技本体。種類ごとの
      // 実装は domain/dungeon/bossMoves.ts の BOSS_MOVES レジストリに集約している
      // (大技はdecideMonsterActionだけが生成するため、実際にはactorは常にmonster)
      if (actor.kind !== "monster") break;
      BOSS_MOVES[action.moveId].execute(buildBossMoveContext(actor));
      if (!isPlaying()) return true;
      break;
    }
    case "burrowSurface": {
      // burrow(plan/monster-compendium.md): 潜伏から地上へ現れる。teleportイベントを
      // 出さずに座標だけ書き換えると、表示側(ActorView)が古い位置のまま取り残され、
      // 次に動いたときに離れた本来の位置まで一気に「飛ぶ」ように見えてしまう(#180)
      const from = actor.pos;
      actor.pos = action.to;
      events.push({ type: "teleport", actorId: actor.id, from, to: action.to });
      break;
    }
    case "dreamArt": {
      // ゆめわざ(plan/game/archive/companion-leveling-and-arts.md): 種類ごとの
      // 実装は domain/party/dreamArtEffects.ts の DREAM_ART_EFFECTS レジストリにある
      if (actor.kind !== "ally") break;
      DREAM_ART_EFFECTS[action.id].execute(buildDreamArtContext(actor), action.targetId);
      const def = dreamArtDef(action.id);
      // ぬしのゆめわざ(plan/game/archive/boss-dream-arts.md): なじみ最高段階では
      // クールダウンを2割短縮する(通常種のゆめわざは対象外)
      let cooldown =
        def.isBossExclusive && bondStage(actor.bondSuccessCount ?? 0) === "irreplaceable"
          ? Math.round(def.cooldownTurns * BOSS_DREAM_ART_BOND_COOLDOWN_MULTIPLIER)
          : def.cooldownTurns;
      // スキル「はげましの声」(plan/game/archive/run-build-skills.md): 仲間の
      // ゆめわざのクールダウン-25%(なじみ短縮とは別枠で重ねて掛かる)
      if (runSkills.includes("encouragement")) {
        cooldown = Math.round(cooldown * ENCOURAGEMENT_COOLDOWN_MULTIPLIER);
      }
      actor.dreamArtCooldowns ??= {};
      actor.dreamArtCooldowns[action.id] = cooldown;
      break;
    }
  }
  return false;
}

export function runActors(args: RunActorsArgs): void {
  const { floor, rng, player, runSkills, events, mood, isPlaying } = args;
  const { towardsFriendly, towardsFoe, towardsLeader } = buildActionDistanceFields(floor, player);

  // 行動中に配列が変化しても安全なようにコピーしてから回す。
  // target(樽比べ、plan/tarukurabe-minigame.md)はaiKindを持たない非戦闘
  // アクターなので、モンスター/仲間と同じ枠で動かそうとしない
  const movers = floor.actors.filter((a): a is MonsterActor | AllyActor => a.alive && a.kind !== "player" && a.kind !== "target");

  for (const actor of movers) {
    if (!actor.alive || !isPlaying()) continue;
    if (hasStatus(actor, STATUS_SLEEP)) continue;
    // ゆめわざ「おどしなき」(plan/game/archive/companion-leveling-and-arts.md):
    // 1手を丸ごと奪う。眠りと同じく行動そのものを試みさせない
    if (hasStatus(actor, STATUS_FLINCH)) continue;

    if (hasStatus(actor, STATUS_CONFUSE)) {
      const options = ALL_DIRS.filter((d) => canStep(floor, actor.pos, d));
      if (options.length > 0) moveActor(floor, actor, rng.pick(options), events);
      continue;
    }

    let action =
      actor.kind === "ally"
        ? decideAllyAction(rng, floor, actor, player, towardsFoe ?? towardsLeader(), towardsLeader())
        : decideMonsterAction(rng, floor, actor, player, towardsFriendly, mood.awareDistanceMul ?? 1, playerStealthChance(player, runSkills));
    // ゆめわざ「ねばりつき」: 移動だけを封じる。攻撃・遠隔等の他の行動は
    // そのまま通す(隣接していれば反撃できる)ため、moveのときだけ差し替える
    if (hasStatus(actor, STATUS_ROOT) && action.type === "move") action = { type: "wait" };

    if (executeMonsterAction(actor, action, args)) return;
    tickQuagmireInvisibility(floor, actor);
  }
}
