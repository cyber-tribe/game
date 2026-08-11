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
  STATUS_CONFUSE,
  STATUS_SLEEP,
  type Actor,
  type FloorState,
  type Item,
  type Trap,
  actorAt,
  hasStatus,
  walkableAt,
} from "./core/types";
import { generateFloor } from "./dungeon/generate";
import {
  type IdSource,
  choosePlayerStart,
  createItem,
  findFreeTile,
  populateFloor,
  spawnWanderingMonster,
} from "./dungeon/populate";
import { updateVisibility } from "./dungeon/visibility";
import { buildDistanceField, canStep, decideMonsterAction } from "./entities/ai";
import {
  MAX_SATIETY,
  type PlayerState,
  createPlayer,
  gainExp,
  totalAttack,
  totalDefense,
} from "./entities/player";
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
  | { type: "equip"; uid: number };

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

  private actorIdCounter = 1;
  private itemUidCounter = 1;
  private readonly ids: IdSource;

  constructor(opts: RunOptions) {
    this.rng = new Rng(opts.seed);
    this.maxDepth = opts.maxDepth ?? 10;
    this.ids = {
      nextActorId: () => ++this.actorIdCounter,
      nextItemUid: () => ++this.itemUidCounter,
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
    this.floor = generateFloor(this.rng, { depth });
    const start = choosePlayerStart(this.rng, this.floor);
    this.player.pos = start;
    this.floor.actors.push(this.player);
    populateFloor(this.rng, this.floor, this.ids, start);
    updateVisibility(this.floor, this.player.pos);
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
  }

  // ------------------------------------------------------------ コマンド処理

  command(cmd: Command): GameEvent[] {
    const events: GameEvent[] = [];
    if (this.status !== "playing") return events;

    const consumedTurn = this.resolvePlayerCommand(cmd, events);

    if (consumedTurn && this.status === "playing") {
      this.runMonsters(events);
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
    }
  }

  private movePlayer(dir: Dir, events: GameEvent[]): boolean {
    const player = this.player;
    const delta = dirDelta(dir);
    const to = { x: player.pos.x + delta.x, y: player.pos.y + delta.y };

    const target = actorAt(this.floor, to);
    if (target && target.id !== player.id) {
      this.attack(player, target, totalAttack(player), events);
      return true;
    }

    if (!walkableAt(this.floor, to)) {
      events.push({ type: "bump", actorId: player.id, dir: delta });
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

  private runMonsters(events: GameEvent[]): void {
    const field = buildDistanceField(this.floor, this.player.pos);
    // 行動中に配列が変化しても安全なようにコピーしてから回す
    const monsters = this.floor.actors.filter((a) => a.kind === "monster" && a.alive);

    for (const monster of monsters) {
      if (!monster.alive || this.status !== "playing") continue;

      if (hasStatus(monster, STATUS_SLEEP)) continue;

      if (hasStatus(monster, STATUS_CONFUSE)) {
        const options = ALL_DIRS.filter((d) => canStep(this.floor, monster.pos, d));
        if (options.length > 0) {
          const dir = this.rng.pick(options);
          this.moveMonster(monster, dir, events);
        }
        continue;
      }

      const action = decideMonsterAction(this.rng, this.floor, monster, this.player, field);
      switch (action.type) {
        case "wait":
          break;
        case "move":
          this.moveMonster(monster, action.dir, events);
          break;
        case "attack":
          this.attack(monster, this.player, monster.atk, events);
          break;
        case "ranged": {
          monster.facing = dirFromDelta(
            this.player.pos.x - monster.pos.x,
            this.player.pos.y - monster.pos.y,
          );
          events.push({ type: "attack", attackerId: monster.id, targetId: this.player.id });
          events.push({ type: "message", text: `${monster.name}が つぶてを投げた!` });
          const { damage, critical } = computeDamage(this.rng, monster.atk, totalDefense(this.player));
          events.push({ type: "message", text: `${this.player.name}に${damage}のダメージ!` });
          this.damageActor(this.player, damage, critical, events);
          break;
        }
      }
    }
  }

  private moveMonster(monster: Actor, dir: Dir, events: GameEvent[]): void {
    if (!canStep(this.floor, monster.pos, dir)) return;
    const delta = dirDelta(dir);
    const from = monster.pos;
    const to = { x: from.x + delta.x, y: from.y + delta.y };
    monster.pos = to;
    monster.facing = dir;
    events.push({ type: "move", actorId: monster.id, from, to });
  }

  // ------------------------------------------------------------ 毎ターンの処理

  private upkeep(events: GameEvent[]): void {
    this.tickStatuses(events);
    this.tickHunger(events);

    if (this.status !== "playing") return;

    if (this.turnCount > 0 && this.turnCount % SPAWN_INTERVAL === 0) {
      spawnWanderingMonster(this.rng, this.floor, this.ids, this.player.pos);
    }

    // 倒されたモンスターを取り除く。プレイヤーは死んでも参照が要るので残す
    this.floor.actors = this.floor.actors.filter((a) => a.alive || a.kind === "player");
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
    player.satiety = Math.max(0, player.satiety - SATIETY_PER_TURN);

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
