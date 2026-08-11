import { Rng } from "./core/rng";
import {
  ALL_DIRS,
  type Dir,
  type Vec2,
  chebyshev,
  dirDelta,
  dirFromDelta,
  eq,
  isDiagonal,
} from "./core/grid";
import type { GameEvent } from "./core/events";
import {
  ALLY_STANCE_NAMES,
  BARREL_NAMES,
  STATUS_CONFUSE,
  STATUS_SLEEP,
  type Actor,
  type AllyStance,
  type Barrel,
  type BarrelKind,
  type FloorGimmickKind,
  type FloorState,
  type Item,
  type Trap,
  actorAt,
  barrelAt,
  hasStatus,
  isFree,
  isHostile,
  roomContains,
  walkableAt,
} from "./core/types";
import { generateFloor } from "./dungeon/generate";
import { GIMMICK_MESSAGES, pickFloorGimmick } from "./dungeon/gimmicks";
import {
  type IdSource,
  choosePlayerStart,
  createAlly,
  createBarrel,
  createItem,
  findFreeTile,
  populateFloor,
  spawnWanderingMonster,
} from "./dungeon/populate";
import { updateVisibility } from "./dungeon/visibility";
import {
  buildDistanceField,
  canStep,
  decideAllyAction,
  decideMonsterAction,
} from "./entities/ai";
import {
  MAX_ALLIES,
  MAX_SATIETY,
  type PlayerState,
  createPlayer,
  gainExp,
  totalAttack,
  totalDefense,
} from "./entities/player";
import { speciesById } from "./entities/species";
import { itemDef } from "./items/catalog";
import { type EffectContext, addStatus, applyEffect } from "./items/effects";
import { addItem, displayName, equip, findItem, isFull, removeItem } from "./items/inventory";
import { computeDamage } from "./systems/combat";

export type Command =
  | { type: "move"; dir: Dir }
  /** 向きだけ変える。ターンを消費しない */
  | { type: "face"; dir: Dir }
  | { type: "wait" }
  | { type: "pickup" }
  | { type: "descend" }
  | { type: "use"; uid: number }
  | { type: "throw"; uid: number }
  | { type: "drop"; uid: number }
  | { type: "equip"; uid: number }
  /** 正面か足元のタルを持ち上げる。抱えていれば下ろす */
  | { type: "liftBarrel" }
  /** 抱えているタルを向いている方向へ投げる */
  | { type: "throwBarrel" }
  /** 仲間への指示(構え)。"all" なら連れている全員に一括で出す */
  | { type: "setStance"; allyId: number | "all"; stance: AllyStance };

export interface RunOptions {
  seed: number;
  /** 倉庫から持ち込んだアイテム */
  startingItems?: Item[];
  /** この階の階段を降りるとクリア */
  maxDepth?: number;
}

export type RunStatus = "playing" | "dead" | "cleared";

/** 満腹度がこのターン数ぶん減る。100 / 0.2 = 500ターンもつ */
const SATIETY_PER_TURN = 0.2;
/** 満腹度がある間、このターンごとにHPが1回復する */
const REGEN_INTERVAL = 8;
/** このターンごとにモンスターが1体湧く */
const SPAWN_INTERVAL = 45;

/** タルの飛距離 */
const BARREL_RANGE = 8;
/** タルをぶつけたときの基本ダメージ */
const BARREL_DAMAGE = 8;
/** 爆発タルの威力と巻き込む範囲 */
const BOMB_DAMAGE = 22;
const BOMB_RADIUS = 1;

/**
 * 空のタルでモンスターを吸い込める確率。
 * 満タンの相手にはめったに効かず、瀕死ならほぼ確実に入る。
 * 「弱らせてから捕まえる」が自然な手順になるように振ってある。
 */
export function captureChance(target: Actor): number {
  const wounded = 1 - target.hp / target.maxHp;
  return Math.min(0.85, 0.12 + 0.68 * wounded);
}

export class Game {
  readonly rng: Rng;
  readonly maxDepth: number;
  floor!: FloorState;
  player: PlayerState;
  depth = 0;
  turnCount = 0;
  status: RunStatus = "playing";
  /** 死亡・クリアの理由。UIの表示に使う */
  endReason = "";

  /** 連れている仲間。フロアをまたいで付いてくるので、floor とは別に持つ */
  allies: Actor[] = [];

  /** 直前のフロアに乗っていたギミック。連続で同じものを選ばないための記憶 */
  private previousGimmick?: FloorGimmickKind;

  /** そのフロアのモンスターハウスについて、もう警告を出したか */
  private monsterHouseWarned = false;

  private actorIdCounter = 1;
  private itemUidCounter = 1;
  private barrelIdCounter = 1;
  private readonly ids: IdSource;

  constructor(opts: RunOptions) {
    this.rng = new Rng(opts.seed);
    this.maxDepth = opts.maxDepth ?? 10;
    this.ids = {
      nextActorId: () => ++this.actorIdCounter,
      nextItemUid: () => ++this.itemUidCounter,
      nextBarrelId: () => ++this.barrelIdCounter,
    };
    this.player = createPlayer(1);

    for (const item of opts.startingItems ?? []) {
      // 持ち込み品の uid は採番済みなので、衝突しないようカウンタを進めておく
      this.itemUidCounter = Math.max(this.itemUidCounter, item.uid);
      addItem(this.player.inventory, item);
    }

    this.enterFloor(1);
  }

  // ------------------------------------------------------------ フロア遷移

  private enterFloor(depth: number): void {
    this.depth = depth;
    this.monsterHouseWarned = false;
    const gimmick = pickFloorGimmick(this.rng, depth, this.previousGimmick);
    this.previousGimmick = gimmick;
    this.floor = generateFloor(this.rng, { depth, gimmick });
    const start = choosePlayerStart(this.rng, this.floor);
    this.player.pos = start;
    this.floor.actors.push(this.player);
    populateFloor(this.rng, this.floor, this.ids, start);

    // 仲間は階段について来る。プレイヤーの周りの空いたマスに並べる
    for (const ally of this.allies) {
      const spot = this.freeSpotNear(start);
      if (!spot) continue;
      ally.pos = spot;
      ally.aware = true;
      this.floor.actors.push(ally);
    }

    updateVisibility(this.floor, this.player.pos);
  }

  /** 指定位置の近くで、誰も立っていないマスを探す */
  private freeSpotNear(center: Vec2, maxRing = 3): Vec2 | null {
    for (let ring = 1; ring <= maxRing; ring++) {
      const candidates: Vec2[] = [];
      for (let dy = -ring; dy <= ring; dy++) {
        for (let dx = -ring; dx <= ring; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
          const p = { x: center.x + dx, y: center.y + dy };
          if (isFree(this.floor, p)) candidates.push(p);
        }
      }
      if (candidates.length > 0) return this.rng.pick(candidates);
    }
    return null;
  }

  private descend(events: GameEvent[]): void {
    if (this.depth >= this.maxDepth) {
      this.status = "cleared";
      this.endReason = `${this.maxDepth}階を踏破した!`;
      events.push({ type: "message", text: this.endReason });
      events.push({ type: "gameOver", reason: this.endReason });
      return;
    }
    this.enterFloor(this.depth + 1);
    events.push({ type: "descend", depth: this.depth });
    events.push({ type: "message", text: `地下${this.depth}階に降りた。` });
    if (this.floor.gimmick) {
      events.push({ type: "message", text: GIMMICK_MESSAGES[this.floor.gimmick] });
    }
  }

  // ------------------------------------------------------------ コマンド処理

  command(cmd: Command): GameEvent[] {
    const events: GameEvent[] = [];
    if (this.status !== "playing") return events;

    const consumedTurn = this.resolvePlayerCommand(cmd, events);

    if (consumedTurn && this.status === "playing") {
      this.runActors(events);
      this.upkeep(events);
      this.turnCount++;
    }

    updateVisibility(this.floor, this.player.pos);
    return events;
  }

  private resolvePlayerCommand(cmd: Command, events: GameEvent[]): boolean {
    const player = this.player;

    // 眠っている間は何をしようとしてもターンだけが過ぎる
    if (hasStatus(player, STATUS_SLEEP)) {
      events.push({ type: "message", text: "ガルドは眠っている……" });
      return true;
    }

    switch (cmd.type) {
      case "face":
        player.facing = cmd.dir;
        return false;

      case "wait":
        return true;

      case "move": {
        let dir = cmd.dir;
        if (hasStatus(player, STATUS_CONFUSE) && this.rng.chance(0.6)) {
          dir = this.rng.pick(ALL_DIRS);
          events.push({ type: "message", text: "足元がおぼつかない!" });
        }
        player.facing = dir;
        return this.movePlayer(dir, events);
      }

      case "pickup":
        return this.pickUp(events);

      case "descend": {
        if (!eq(player.pos, this.floor.stairs)) {
          events.push({ type: "message", text: "ここには階段がない。" });
          return false;
        }
        this.descend(events);
        return true;
      }

      case "use":
        return this.useItem(cmd.uid, events);

      case "throw":
        return this.throwItem(cmd.uid, events);

      case "drop":
        return this.dropItem(cmd.uid, events);

      case "equip": {
        const item = findItem(player.inventory, cmd.uid);
        if (!item) return false;
        equip(player.inventory, cmd.uid);
        events.push({ type: "equip", actorId: player.id, itemUid: cmd.uid, name: itemDef(item.defId).name });
        events.push({
          type: "message",
          text: `${displayName(player.inventory, item)}を装備した。`,
        });
        return true;
      }

      case "liftBarrel":
        return this.liftOrPutBarrel(events);

      case "throwBarrel":
        return this.throwCarriedBarrel(events);

      case "setStance":
        return this.setAllyStance(cmd.allyId, cmd.stance, events);
    }
  }

  // ------------------------------------------------------------ 仲間への指示

  /** 構えを設定する。指示そのものはターンを消費しない */
  private setAllyStance(
    allyId: number | "all",
    stance: AllyStance,
    events: GameEvent[],
  ): boolean {
    const targets = allyId === "all" ? this.allies : this.allies.filter((a) => a.id === allyId);
    if (targets.length === 0) return false;

    for (const ally of targets) {
      ally.stance = stance;
      ally.holdPos = stance === "hold" ? { ...ally.pos } : undefined;
    }

    const label = allyId === "all" ? "全員" : targets[0]!.name;
    events.push({
      type: "message",
      text: `${label}に「${ALLY_STANCE_NAMES[stance]}」を指示した。`,
    });
    return false;
  }

  // ------------------------------------------------------------ タル

  /** 抱えていなければ持ち上げ、抱えていれば下ろす */
  private liftOrPutBarrel(events: GameEvent[]): boolean {
    const player = this.player;

    if (player.carrying) {
      const delta = dirDelta(player.facing);
      const front = { x: player.pos.x + delta.x, y: player.pos.y + delta.y };
      const spot = isFree(this.floor, front) ? front : this.freeSpotNear(player.pos, 1);
      if (!spot) {
        events.push({ type: "message", text: "タルを置く場所がない。" });
        return false;
      }
      const barrel = player.carrying;
      player.carrying = null;
      barrel.pos = spot;
      this.floor.barrels.push(barrel);
      events.push({ type: "putBarrel", actorId: player.id, barrelId: barrel.id, pos: spot });
      events.push({ type: "message", text: `${BARREL_NAMES[barrel.kind]}を置いた。` });
      return true;
    }

    // 正面を優先し、無ければ足元を見る
    const delta = dirDelta(player.facing);
    const front = { x: player.pos.x + delta.x, y: player.pos.y + delta.y };
    const barrel = barrelAt(this.floor, front) ?? barrelAt(this.floor, player.pos);
    if (!barrel) {
      events.push({ type: "message", text: "持ち上げられるタルがない。" });
      return false;
    }

    this.floor.barrels = this.floor.barrels.filter((b) => b.id !== barrel.id);
    player.carrying = barrel;
    events.push({
      type: "liftBarrel",
      actorId: player.id,
      barrelId: barrel.id,
      kind: barrel.kind,
    });
    events.push({ type: "message", text: `${BARREL_NAMES[barrel.kind]}を持ち上げた。` });
    return true;
  }

  /**
   * 抱えているタルを投げる。飛んでいって最初に当たったものに応じて結果が変わる。
   *   空のタル      → 相手にダメージ。確率で吸い込んで「モンスター入り」になる
   *   爆発タル      → その場で爆発し、周囲もろとも巻き込む
   *   モンスター入り → 中身が飛び出して仲間になる
   */
  private throwCarriedBarrel(events: GameEvent[]): boolean {
    const player = this.player;
    const barrel = player.carrying;
    if (!barrel) {
      events.push({ type: "message", text: "タルを持っていない。" });
      return false;
    }

    player.carrying = null;
    const delta = dirDelta(player.facing);
    const from = player.pos;
    let landing = from;
    let hit: Actor | null = null;

    for (let step = 1; step <= BARREL_RANGE; step++) {
      const p = { x: from.x + delta.x * step, y: from.y + delta.y * step };
      if (!walkableAt(this.floor, p)) break;
      const blocker = barrelAt(this.floor, p);
      if (blocker) break;
      landing = p;
      const actor = actorAt(this.floor, p);
      if (actor && actor.id !== player.id) {
        hit = actor;
        break;
      }
    }

    events.push({
      type: "throwBarrel",
      actorId: player.id,
      barrelId: barrel.id,
      from,
      to: landing,
    });
    events.push({ type: "message", text: `${BARREL_NAMES[barrel.kind]}を投げた!` });

    switch (barrel.kind) {
      case "bomb":
        this.explode(landing, events, player.id);
        events.push({ type: "barrelBreak", barrelId: barrel.id, pos: landing });
        return true;

      case "caught":
        this.releaseFromBarrel(barrel, landing, events);
        return true;

      case "empty":
        return this.resolveEmptyBarrel(barrel, landing, hit, events);
    }
  }

  private resolveEmptyBarrel(
    barrel: Barrel,
    landing: Vec2,
    hit: Actor | null,
    events: GameEvent[],
  ): boolean {
    if (!hit) {
      this.dropBarrelNear(barrel, landing, events);
      return true;
    }

    const { damage, critical } = computeDamage(this.rng, BARREL_DAMAGE, hit.def);
    events.push({ type: "message", text: `${hit.name}に${damage}のダメージ!` });
    this.damageActor(hit, damage, critical, events);

    // 倒れてしまったら吸い込めない。タルは砕けずその場に落ちる
    if (!hit.alive) {
      this.dropBarrelNear(barrel, landing, events);
      return true;
    }

    // 仲間にできるのはモンスターだけ。すでに手一杯なら吸い込まない
    if (hit.kind !== "monster" || hit.speciesId === undefined) {
      this.dropBarrelNear(barrel, landing, events);
      return true;
    }
    if (this.allies.length >= MAX_ALLIES) {
      events.push({ type: "message", text: "これ以上は連れて歩けない。" });
      this.dropBarrelNear(barrel, landing, events);
      return true;
    }

    if (!this.rng.chance(captureChance(hit))) {
      events.push({ type: "captureFailed", actorId: hit.id, name: hit.name });
      events.push({ type: "message", text: `${hit.name}は吸い込まれなかった。` });
      this.dropBarrelNear(barrel, landing, events);
      return true;
    }

    // 吸い込み成功。モンスターは盤面から消え、タルが中身入りになって落ちる
    hit.alive = false;
    this.floor.actors = this.floor.actors.filter((a) => a.id !== hit.id);
    barrel.kind = "caught";
    barrel.speciesId = hit.speciesId;
    events.push({ type: "capture", actorId: hit.id, barrelId: barrel.id, name: hit.name });
    events.push({ type: "message", text: `${hit.name}をタルに吸い込んだ!` });
    this.dropBarrelNear(barrel, hit.pos, events);
    return true;
  }

  /** タルを着地点に置く。塞がっていれば近くの空きマスへ転がす */
  private dropBarrelNear(barrel: Barrel, preferred: Vec2, events: GameEvent[]): void {
    const spot = isFree(this.floor, preferred) ? preferred : this.freeSpotNear(preferred, 2);
    if (!spot) {
      // 置き場所が無ければ壊れたことにする。宙に浮かせるよりは筋が通る
      events.push({ type: "barrelBreak", barrelId: barrel.id, pos: preferred });
      events.push({ type: "message", text: `${BARREL_NAMES[barrel.kind]}は砕けてしまった。` });
      return;
    }
    barrel.pos = spot;
    this.floor.barrels.push(barrel);
  }

  /** 中身入りのタルを開けて、モンスターを仲間として盤面に出す */
  private releaseFromBarrel(barrel: Barrel, landing: Vec2, events: GameEvent[]): void {
    events.push({ type: "barrelBreak", barrelId: barrel.id, pos: landing });

    if (barrel.speciesId === undefined) return;
    const spot = isFree(this.floor, landing) ? landing : this.freeSpotNear(landing, 2);
    if (!spot) {
      events.push({ type: "message", text: "出てくる場所がなかった……" });
      return;
    }
    if (this.allies.length >= MAX_ALLIES) {
      events.push({ type: "message", text: "これ以上は連れて歩けない。" });
      return;
    }

    const species = speciesById(barrel.speciesId);
    const ally = createAlly(this.ids.nextActorId(), species, spot);
    this.allies.push(ally);
    this.floor.actors.push(ally);
    events.push({ type: "spawn", actorId: ally.id });
    events.push({ type: "recruit", actorId: ally.id, name: ally.name });
    events.push({ type: "message", text: `${ally.name}が仲間になった!` });
  }

  /**
   * 爆発。中心とその周囲にいるものをまとめて巻き込む。
   *
   * 投げた本人だけはダメージを半分にしている。飛距離は壁までなので、
   * 狭い通路では真横に落ちることがあり、満タンから一撃で倒れてしまうと
   * 理不尽に感じる。半分でも十分痛いので、危険であることは伝わる。
   */
  private explode(center: Vec2, events: GameEvent[], throwerId?: number): void {
    events.push({ type: "explosion", pos: center, radius: BOMB_RADIUS });
    events.push({ type: "message", text: "タルが爆発した!" });

    const caught = this.floor.actors.filter(
      (a) => a.alive && chebyshev(a.pos, center) <= BOMB_RADIUS,
    );
    for (const actor of caught) {
      const result = computeDamage(this.rng, BOMB_DAMAGE, actor.def);
      const isThrower = actor.id === throwerId;
      const damage = isThrower ? Math.max(1, Math.floor(result.damage / 2)) : result.damage;
      events.push({
        type: "message",
        text: isThrower
          ? `巻き込まれた! ${actor.name}に${damage}のダメージ!`
          : `${actor.name}に${damage}のダメージ!`,
      });
      this.damageActor(actor, damage, result.critical, events);
      if (this.status !== "playing") return;
    }

    // 巻き込まれたタルは誘爆させず、その場で壊れるだけにしておく。
    // 連鎖させると1発で階が壊滅しかねない
    const destroyed = this.floor.barrels.filter((b) => chebyshev(b.pos, center) <= BOMB_RADIUS);
    for (const barrel of destroyed) {
      events.push({ type: "barrelBreak", barrelId: barrel.id, pos: barrel.pos });
    }
    this.floor.barrels = this.floor.barrels.filter(
      (b) => chebyshev(b.pos, center) > BOMB_RADIUS,
    );
  }

  private movePlayer(dir: Dir, events: GameEvent[]): boolean {
    const player = this.player;
    const delta = dirDelta(dir);
    const to = { x: player.pos.x + delta.x, y: player.pos.y + delta.y };

    const target = actorAt(this.floor, to);
    if (target && target.id !== player.id) {
      if (isHostile(player, target)) {
        this.attack(player, target, totalAttack(player), events);
        return true;
      }
      // 仲間とは位置を入れ替える。通せんぼで足止めされては連れ歩けない
      const from = player.pos;
      player.pos = to;
      target.pos = from;
      events.push({ type: "swap", aId: player.id, bId: target.id });
      return true;
    }

    if (!walkableAt(this.floor, to)) {
      events.push({ type: "bump", actorId: player.id, dir: delta });
      return false;
    }

    // タルは押しのけられない。持ち上げるか、回り込む
    if (barrelAt(this.floor, to)) {
      events.push({ type: "bump", actorId: player.id, dir: delta });
      events.push({ type: "message", text: "タルが道をふさいでいる。" });
      return false;
    }
    // 斜めの角抜けは禁止
    if (isDiagonal(dir)) {
      if (!walkableAt(this.floor, { x: player.pos.x, y: to.y })) {
        events.push({ type: "bump", actorId: player.id, dir: delta });
        return false;
      }
      if (!walkableAt(this.floor, { x: to.x, y: player.pos.y })) {
        events.push({ type: "bump", actorId: player.id, dir: delta });
        return false;
      }
    }

    const from = player.pos;
    player.pos = to;
    events.push({ type: "move", actorId: player.id, from, to });

    this.checkTrap(to, events);
    this.announceGround(to, events);
    this.checkMonsterHouseWarning(to, events);
    return true;
  }

  private announceGround(pos: Vec2, events: GameEvent[]): void {
    const ground = this.floor.items.find((gi) => eq(gi.pos, pos));
    if (ground) {
      events.push({
        type: "message",
        text: `${itemDef(ground.item.defId).name}が落ちている。`,
      });
    }
    if (eq(pos, this.floor.stairs)) {
      events.push({ type: "message", text: "階段がある。" });
    }
  }

  /**
   * モンスターハウス(plan/monster-house.md)の予告。部屋の外(通路側)から
   * 隣接した時点で、1フロアにつき一度だけ気配のメッセージを出す。
   * 部屋の中に入ってからでは手遅れなので、中にいる間は出さない。
   */
  private checkMonsterHouseWarning(pos: Vec2, events: GameEvent[]): void {
    if (this.monsterHouseWarned) return;
    const room = this.floor.rooms.find((r) => r.kind === "monsterHouse");
    if (!room || roomContains(room, pos)) return;

    const adjacent = ALL_DIRS.some((dir) => {
      const delta = dirDelta(dir);
      return roomContains(room, { x: pos.x + delta.x, y: pos.y + delta.y });
    });
    if (!adjacent) return;

    this.monsterHouseWarned = true;
    events.push({ type: "message", text: "――部屋の奥で何かがひしめいている気配がする。" });
  }

  // ------------------------------------------------------------ 戦闘

  private attack(attacker: Actor, target: Actor, attackPower: number, events: GameEvent[]): void {
    attacker.facing = dirFromDelta(target.pos.x - attacker.pos.x, target.pos.y - attacker.pos.y);
    events.push({ type: "attack", attackerId: attacker.id, targetId: target.id });
    events.push({ type: "message", text: `${attacker.name}のこうげき!` });

    const defense = target.kind === "player" ? totalDefense(this.player) : target.def;
    const { damage, critical } = computeDamage(this.rng, attackPower, defense);
    if (critical) events.push({ type: "message", text: "会心の一撃!" });
    events.push({ type: "message", text: `${target.name}に${damage}のダメージ!` });
    this.damageActor(target, damage, critical, events);

    // 攻撃してきた相手には気づく
    if (target.kind === "monster") target.aware = true;

    if (target.alive && attacker.inflicts && this.rng.chance(attacker.inflicts.chance)) {
      addStatus(
        this.effectContext(events),
        target,
        attacker.inflicts.kind,
        attacker.inflicts.turns,
        attacker.inflicts.kind === STATUS_SLEEP ? "眠ってしまった" : "混乱した",
      );
    }
  }

  private damageActor(target: Actor, damage: number, critical: boolean, events: GameEvent[]): void {
    target.hp -= damage;
    events.push({
      type: "damage",
      actorId: target.id,
      amount: damage,
      hpAfter: Math.max(0, target.hp),
      critical,
    });
    // 攻撃を受ければ目が覚める
    const sleep = target.statuses.find((s) => s.kind === STATUS_SLEEP);
    if (sleep) {
      sleep.turns = 0;
      events.push({ type: "statusEnd", actorId: target.id, kind: STATUS_SLEEP });
    }
    if (target.hp <= 0) this.killActor(target, events);
  }

  private killActor(target: Actor, events: GameEvent[]): void {
    target.alive = false;
    target.hp = 0;
    events.push({ type: "die", actorId: target.id });

    if (target.kind === "player") {
      this.status = "dead";
      this.endReason = `地下${this.depth}階で力尽きた……`;
      events.push({ type: "message", text: this.endReason });
      events.push({ type: "gameOver", reason: this.endReason });
      return;
    }

    if (target.kind === "ally") {
      this.allies = this.allies.filter((a) => a.id !== target.id);
      events.push({ type: "message", text: `${target.name}は力尽きた……` });
      return;
    }

    events.push({ type: "message", text: `${target.name}をたおした!` });
    const exp = target.exp ?? 0;
    if (exp > 0) {
      const levels = gainExp(this.player, exp);
      events.push({ type: "message", text: `経験値を${exp}かくとく。` });
      for (let i = 0; i < levels; i++) {
        events.push({ type: "levelUp", actorId: this.player.id, level: this.player.level });
        events.push({ type: "message", text: `レベルが${this.player.level}に上がった!` });
      }
    }
  }

  // ------------------------------------------------------------ アイテム

  private pickUp(events: GameEvent[]): boolean {
    if (this.player.carrying) {
      events.push({ type: "message", text: "タルで手がふさがっている。" });
      return false;
    }
    const idx = this.floor.items.findIndex((gi) => eq(gi.pos, this.player.pos));
    if (idx < 0) {
      events.push({ type: "message", text: "足元には何もない。" });
      return false;
    }
    if (isFull(this.player.inventory)) {
      events.push({ type: "message", text: "持ち物がいっぱいだ。" });
      return false;
    }
    const [ground] = this.floor.items.splice(idx, 1);
    const item = ground!.item;
    addItem(this.player.inventory, item);
    const name = itemDef(item.defId).name;
    events.push({ type: "pickup", actorId: this.player.id, itemUid: item.uid, name });
    events.push({ type: "message", text: `${name}をひろった。` });
    return true;
  }

  private useItem(uid: number, events: GameEvent[]): boolean {
    const inv = this.player.inventory;
    const item = findItem(inv, uid);
    if (!item) return false;
    const def = itemDef(item.defId);

    if (def.category === "weapon" || def.category === "shield") {
      equip(inv, uid);
      events.push({ type: "equip", actorId: this.player.id, itemUid: uid, name: def.name });
      events.push({ type: "message", text: `${def.name}を装備した。` });
      return true;
    }

    if (def.category === "staff") {
      if ((item.charges ?? 0) <= 0) {
        events.push({ type: "message", text: `${def.name}は もう振れない。` });
        return false;
      }
    }

    events.push({ type: "useItem", actorId: this.player.id, itemUid: uid, name: def.name });
    events.push({ type: "message", text: `${def.name}を使った。` });

    const worked = applyEffect(
      this.effectContext(events),
      def.effect ?? "",
      def.power ?? 0,
      this.player.facing,
    );

    if (def.category === "staff") {
      if (worked) item.charges = (item.charges ?? 1) - 1;
    } else {
      removeItem(inv, uid);
    }
    return true;
  }

  private throwItem(uid: number, events: GameEvent[]): boolean {
    const inv = this.player.inventory;
    const item = findItem(inv, uid);
    if (!item) return false;
    const def = itemDef(item.defId);
    removeItem(inv, uid);

    const delta = dirDelta(this.player.facing);
    const from = this.player.pos;
    let landing = from;
    let hit: Actor | null = null;

    for (let step = 1; step <= 10; step++) {
      const p = { x: from.x + delta.x * step, y: from.y + delta.y * step };
      if (!walkableAt(this.floor, p)) break;
      landing = p;
      const actor = actorAt(this.floor, p);
      if (actor && actor.id !== this.player.id) {
        hit = actor;
        break;
      }
    }

    events.push({ type: "throwItem", actorId: this.player.id, itemUid: uid, from, to: landing });
    events.push({ type: "message", text: `${def.name}を投げた。` });

    if (hit) {
      if (def.category === "herb" && def.effect === "heal") {
        // 草をぶつけると相手が回復してしまう
        const healed = Math.min(hit.maxHp - hit.hp, def.power ?? 0);
        hit.hp += healed;
        events.push({ type: "heal", actorId: hit.id, amount: healed, hpAfter: hit.hp });
        events.push({ type: "message", text: `${hit.name}のHPが${healed}回復した。` });
      } else {
        const { damage, critical } = computeDamage(this.rng, 6, hit.def);
        events.push({ type: "message", text: `${def.name}が${hit.name}に当たった!` });
        this.damageActor(hit, damage, critical, events);
      }
      return true;
    }

    // 誰にも当たらなければその場に落ちる
    if (!this.floor.items.some((gi) => eq(gi.pos, landing)) && !eq(landing, from)) {
      this.floor.items.push({ item, pos: landing });
    }
    return true;
  }

  private dropItem(uid: number, events: GameEvent[]): boolean {
    const pos = this.player.pos;
    if (this.floor.items.some((gi) => eq(gi.pos, pos))) {
      events.push({ type: "message", text: "ここには既に何か置いてある。" });
      return false;
    }
    const item = removeItem(this.player.inventory, uid);
    if (!item) return false;
    this.floor.items.push({ item, pos });
    events.push({ type: "drop", actorId: this.player.id, itemUid: uid, pos });
    events.push({ type: "message", text: `${itemDef(item.defId).name}を置いた。` });
    return true;
  }

  // ------------------------------------------------------------ 罠

  private checkTrap(pos: Vec2, events: GameEvent[]): void {
    const trap = this.floor.traps.find((t) => eq(t.pos, pos));
    if (!trap) return;
    trap.revealed = true;
    events.push({ type: "trap", pos, kind: trap.kind });
    this.triggerTrap(trap, events);
  }

  private triggerTrap(trap: Trap, events: GameEvent[]): void {
    switch (trap.kind) {
      case "damage": {
        const damage = 4 + this.depth;
        events.push({ type: "message", text: `矢が飛んできた! ${damage}のダメージ!` });
        this.damageActor(this.player, damage, false, events);
        break;
      }
      case "sleep": {
        events.push({ type: "message", text: "眠りガスが噴き出した!" });
        addStatus(this.effectContext(events), this.player, STATUS_SLEEP, 4, "眠ってしまった");
        break;
      }
      case "alarm": {
        events.push({ type: "message", text: "けたたましい音が鳴り響いた!" });
        for (const actor of this.floor.actors) {
          if (actor.kind === "monster" && actor.alive) actor.aware = true;
        }
        break;
      }
      case "pitfall": {
        events.push({ type: "message", text: "落とし穴だ!" });
        this.descend(events);
        break;
      }
    }
  }

  // ------------------------------------------------------------ モンスターの行動

  /**
   * プレイヤー以外の全員を動かす。仲間もモンスターも同じ枠で処理する。
   *
   * 距離場は陣営ごとに1本ずつ作って全員で使い回す。始点を「その陣営の敵全員」に
   * しておけば、各自が自然といちばん近い相手へ向かう。
   */
  private runActors(events: GameEvent[]): void {
    const alive = (a: Actor) => a.alive;
    const friendlyPositions = this.floor.actors
      .filter((a) => alive(a) && a.kind !== "monster")
      .map((a) => a.pos);
    const foePositions = this.floor.actors
      .filter((a) => alive(a) && a.kind === "monster")
      .map((a) => a.pos);

    const towardsFriendly = buildDistanceField(this.floor, friendlyPositions);
    const towardsFoe =
      foePositions.length > 0 ? buildDistanceField(this.floor, foePositions) : null;
    const towardsLeader = buildDistanceField(this.floor, this.player.pos);

    // 行動中に配列が変化しても安全なようにコピーしてから回す
    const movers = this.floor.actors.filter((a) => alive(a) && a.kind !== "player");

    for (const actor of movers) {
      if (!actor.alive || this.status !== "playing") continue;
      if (hasStatus(actor, STATUS_SLEEP)) continue;

      if (hasStatus(actor, STATUS_CONFUSE)) {
        const options = ALL_DIRS.filter((d) => canStep(this.floor, actor.pos, d));
        if (options.length > 0) this.moveActor(actor, this.rng.pick(options), events);
        continue;
      }

      const action =
        actor.kind === "ally"
          ? decideAllyAction(
              this.rng,
              this.floor,
              actor,
              this.player,
              towardsFoe ?? towardsLeader,
              towardsLeader,
            )
          : decideMonsterAction(this.rng, this.floor, actor, this.player, towardsFriendly);

      switch (action.type) {
        case "wait":
          break;
        case "move":
          this.moveActor(actor, action.dir, events);
          break;
        case "attack": {
          const target = this.floor.actors.find((a) => a.id === action.targetId && a.alive);
          if (target) this.attack(actor, target, actor.atk, events);
          break;
        }
        case "ranged": {
          const target = this.floor.actors.find((a) => a.id === action.targetId && a.alive);
          if (!target) break;
          actor.facing = dirFromDelta(target.pos.x - actor.pos.x, target.pos.y - actor.pos.y);
          events.push({ type: "attack", attackerId: actor.id, targetId: target.id });
          events.push({ type: "message", text: `${actor.name}が つぶてを投げた!` });
          const defense =
            target.kind === "player" ? totalDefense(this.player) : target.def;
          const { damage, critical } = computeDamage(this.rng, actor.atk, defense);
          events.push({ type: "message", text: `${target.name}に${damage}のダメージ!` });
          this.damageActor(target, damage, critical, events);
          break;
        }
      }
    }
  }

  private moveActor(actor: Actor, dir: Dir, events: GameEvent[]): void {
    if (!canStep(this.floor, actor.pos, dir)) return;
    const delta = dirDelta(dir);
    const from = actor.pos;
    const to = { x: from.x + delta.x, y: from.y + delta.y };
    actor.pos = to;
    actor.facing = dir;
    events.push({ type: "move", actorId: actor.id, from, to });
  }

  // ------------------------------------------------------------ 毎ターンの処理

  private upkeep(events: GameEvent[]): void {
    this.tickStatuses(events);
    this.tickHunger(events);

    if (this.status !== "playing") return;

    if (this.turnCount > 0 && this.turnCount % SPAWN_INTERVAL === 0) {
      spawnWanderingMonster(this.rng, this.floor, this.ids, this.player.pos);
    }

    // 倒された者を取り除く。プレイヤーは死んでも参照が要るので残す
    this.floor.actors = this.floor.actors.filter((a) => a.alive || a.kind === "player");
    this.allies = this.allies.filter((a) => a.alive);
  }

  private tickStatuses(events: GameEvent[]): void {
    for (const actor of this.floor.actors) {
      if (!actor.alive) continue;
      for (const status of actor.statuses) {
        if (status.turns <= 0) continue;
        status.turns--;
        if (status.turns === 0) {
          events.push({ type: "statusEnd", actorId: actor.id, kind: status.kind });
          if (actor.kind === "player") {
            events.push({
              type: "message",
              text: status.kind === STATUS_SLEEP ? "目が覚めた。" : "混乱がおさまった。",
            });
          }
        }
      }
      actor.statuses = actor.statuses.filter((s) => s.turns > 0);
    }
  }

  private tickHunger(events: GameEvent[]): void {
    const player = this.player;
    const before = player.satiety;
    const rate = this.floor.gimmick === "feast" ? SATIETY_PER_TURN / 2 : SATIETY_PER_TURN;
    player.satiety = Math.max(0, player.satiety - rate);

    if (before > 20 && player.satiety <= 20) {
      events.push({ type: "hungerWarning", level: "low" });
      events.push({ type: "message", text: "おなかがへってきた……" });
    }
    if (before > 0 && player.satiety === 0) {
      events.push({ type: "hungerWarning", level: "empty" });
      events.push({ type: "message", text: "おなかがすいて目がまわる!" });
    }

    if (player.satiety <= 0) {
      this.damageActor(player, 1, false, events);
    } else if (this.turnCount % REGEN_INTERVAL === 0 && player.hp < player.maxHp) {
      player.hp = Math.min(player.maxHp, player.hp + 1);
    }
  }

  // ------------------------------------------------------------ 補助

  private effectContext(events: GameEvent[]): EffectContext {
    return { rng: this.rng, floor: this.floor, player: this.player, events };
  }

  /** テストとデバッグ用。指定した種類のアイテムを持ち物に足す */
  giveItem(defId: string): Item | null {
    const def = itemDef(defId);
    const item = createItem(this.ids.nextItemUid(), def.id, def.charges);
    return addItem(this.player.inventory, item) ? item : null;
  }

  /** テストとデバッグ用。タルを抱えた状態にする */
  giveBarrel(kind: BarrelKind, speciesId?: string): Barrel {
    const barrel = createBarrel(this.ids.nextBarrelId(), kind, this.player.pos, speciesId);
    this.player.carrying = barrel;
    return barrel;
  }

  /** 連れている仲間(表示や判定の入口) */
  get allyList(): readonly Actor[] {
    return this.allies;
  }

  /** 満腹度の割合(0〜1) */
  get satietyRatio(): number {
    return this.player.satiety / MAX_SATIETY;
  }

  /** 空いているマスを1つ返す。デバッグやテストでの配置に使う */
  freeTile(): Vec2 | null {
    return findFreeTile(this.rng, this.floor, {});
  }

  /** プレイヤーから見えているモンスター */
  visibleMonsters(): Actor[] {
    return this.floor.actors.filter(
      (a) =>
        a.kind === "monster" &&
        a.alive &&
        (this.floor.tiles[a.pos.y * this.floor.width + a.pos.x]?.visible ?? false),
    );
  }

  /** 隣にいるモンスター。UIの攻撃対象表示に使う */
  adjacentMonsters(): Actor[] {
    return this.floor.actors.filter(
      (a) => a.kind === "monster" && a.alive && chebyshev(a.pos, this.player.pos) === 1,
    );
  }
}
