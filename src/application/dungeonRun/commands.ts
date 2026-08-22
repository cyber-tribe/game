import { ALL_DIRS, eq } from "../../core/grid";
import type { GameEvent } from "../../core/events";
import { STATUS_CONFUSE, hasStatus } from "../../core/types";
import { TARUKURABE_ID } from "../../entities/dungeons";
import { liftOrPutBarrel } from "../../domain/barrel/barrelLift";
import { castBarrelArt as domainCastBarrelArt } from "../../domain/barrel/barrelArt";
import type { Command, Game } from "./game";

/**
 * コマンド種別 → 処理関数の網羅dispatch表(plan/game/ddd-phase8-game-facade.md)。
 * 新しいCommand種別を追加すると、ここに対応するエントリを書き忘れた時点で
 * typecheckが落ちる(網羅チェック)。各エントリはContext組み立て+domain/Game
 * 呼び出しだけの薄い関数で、1コマンド1クラスにはしない(ADR 0016 実装ルール10)。
 */
type CommandHandlers = {
  [K in Command["type"]]: (game: Game, cmd: Extract<Command, { type: K }>, events: GameEvent[]) => boolean;
};

const HANDLERS: CommandHandlers = {
  face: (game, cmd, events) => {
    game.player.facing = cmd.dir;
    events.push({ type: "face", actorId: game.player.id, dir: cmd.dir });
    return false;
  },

  wait: (game, _cmd, _events) => {
    game.player.guarding = true;
    // スキル「がまんのかまえ」(plan/game/archive/run-build-skills.md):
    // 足踏みの直後1撃だけ与ダメージ2倍
    if (game.runSkills.includes("braced")) game.player.bracedReady = true;
    return true;
  },

  move: (game, cmd, events) => {
    let dir = cmd.dir;
    if (hasStatus(game.player, STATUS_CONFUSE) && game.rng.chance(0.6)) {
      dir = game.rng.pick(ALL_DIRS);
      events.push({ type: "message", text: "足元がおぼつかない!" });
    }
    game.player.facing = dir;
    return game.movePlayer(dir, events);
  },

  // 攻撃専用キー(plan/attack-button.md)。移動キーで敵の方向へ進んだ場合は
  // 「押し出し」になる(movePlayer参照)ため、実際にダメージを与える経路は
  // ここ一本に絞られる。空振り(敵がいない・不可視 等)でもターンは消費する
  attack: (game, _cmd, events) => {
    game.resolvePlayerAttack(game.player.facing, events);
    return true;
  },

  pickup: (game, _cmd, events) => game.pickUp(events),

  descend: (game, _cmd, events) => {
    const player = game.player;
    // 第七地方(わすれられた祭りの跡)固有ギミック(plan/festival-mirage.md): 偽の階段
    const decoyIdx = game.floor.decoyStairsPositions?.findIndex((p) => eq(p, player.pos)) ?? -1;
    if (decoyIdx >= 0) {
      game.floor.decoyStairsPositions!.splice(decoyIdx, 1);
      events.push({ type: "message", text: "――幻だったらしい。" });
      return true;
    }
    if (!eq(player.pos, game.floor.stairs)) {
      events.push({ type: "message", text: "ここには階段がない。" });
      return false;
    }
    // ボスの間の階段(plan/game/dungeon-boss-rooms.md): 通常の移動では
    // walkableAtがこの階段マスへの到達自体を防ぐが、念のため二重に守る
    if (game.floor.stairsBlocked) {
      events.push({ type: "message", text: "ここには階段がない。" });
      return false;
    }
    // タルを抱えたままの階段降りを禁止する(plan/barrel-stairs-safeguard.md)
    if (player.carrying) {
      events.push({ type: "message", text: "タルを抱えたままでは降りられない。" });
      game.pushBackFromStairs(events);
      return true;
    }
    game.descend(events);
    return true;
  },

  bank: (game, _cmd, events) => game.bankRun(events),

  openDoor: (game, _cmd, events) => game.openDoor(events),

  enterBranch: (game, _cmd, events) => game.enterBranchTile(events),

  use: (game, cmd, events) => game.useItem(cmd.uid, events),

  throw: (game, cmd, events) => game.throwItem(cmd.uid, events),

  drop: (game, cmd, events) => game.dropItem(cmd.uid, events),

  equip: (game, cmd, events) => game.equipItem(cmd.uid, events),

  liftBarrel: (game, _cmd, events) =>
    liftOrPutBarrel({ floor: game.floor, rng: game.rng, player: game.player, events }),

  throwBarrel: (game, _cmd, events) => {
    const consumed = game.throwCarriedBarrel(events);
    // 樽比べ(plan/tarukurabe-minigame.md): 実際に1投消費した場合だけ、
    // 残りタル数・終了条件を進める(「タルを持っていない」等の不発は数えない)
    if (consumed && game.dungeon.id === TARUKURABE_ID && game.status === "playing") {
      game.finishTarukurabeThrow(events);
    }
    return consumed;
  },

  openBarrel: (game, _cmd, events) => game.openCarriedBarrel(events),

  castBarrelArt: (game, cmd, events) =>
    domainCastBarrelArt({ player: game.player, allies: game.allies, allyId: cmd.allyId, events }),

  setStance: (game, cmd, events) => game.setAllyStance(cmd.allyId, cmd.stance, events),

  useArt: (game, cmd, events) => game.useArt(cmd.id, events),

  // レベルアップ時のスキル選択(plan/game/archive/run-build-skills.md):
  // 提示中はcommand()の先頭で丸ごと横取りするため、ここには来ない
  chooseSkill: () => false,
};

export function resolveCommandDispatch(game: Game, cmd: Command, events: GameEvent[]): boolean {
  const handler = HANDLERS[cmd.type] as (game: Game, cmd: Command, events: GameEvent[]) => boolean;
  return handler(game, cmd, events);
}
