import { describe, expect, it } from "vitest";
import type { AllyActor, MonsterActor, RunSkillId } from "../src/core/types";
import type { StoredMonster } from "../src/save";
import { Game } from "../src/game";
import { access } from "./helpers/access";

/**
 * DDD Phase 5(plan/game/ddd-phase5-party-domain.md)の事前ゴールデンテスト。
 * game.ts に残っている Party/Companion・Player成長の接着部分を
 * domain/party・domain/player へ移す前に、実際に1回動かして取得した
 * 正確な値・イベント列を固定する(推測では書かない)。
 */

function ally(game: Game, overrides: Partial<AllyActor> = {}): AllyActor {
  const speciesId = overrides.speciesId ?? "tsubute";
  const a: AllyActor = {
    id: 900,
    kind: "ally",
    name: "テスト用の仲間",
    speciesId,
    model: speciesId,
    pos: { x: 0, y: 0 },
    facing: 4,
    hp: 100,
    maxHp: 100,
    atk: 5,
    def: 5,
    level: 1,
    growthExp: 0,
    statuses: [],
    alive: true,
    ...overrides,
  };
  game.floor.actors.push(a);
  game.allies.push(a);
  return a;
}

function monster(game: Game, overrides: Partial<MonsterActor> = {}): MonsterActor {
  const m: MonsterActor = {
    id: 800,
    kind: "monster",
    name: "テスト用モンスター",
    speciesId: "gajiri",
    model: "gajiri",
    pos: { x: 0, y: 0 },
    facing: 4,
    hp: 1,
    maxHp: 1,
    atk: 0,
    def: 0,
    level: 1,
    statuses: [],
    alive: true,
    aiKind: "melee",
    aware: true,
    exp: 10,
    ...overrides,
  };
  game.floor.actors.push(m);
  return m;
}

describe("game.ts: 敵撃破→プレイヤー経験値→仲間への50%配分→仲間レベルアップ→ゆめわざ習得", () => {
  it("イベント列と結果が固定どおりになる", () => {
    const game = new Game({ seed: 1 });
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    game.player.level = 1;
    game.player.exp = 0;
    // ツブテガエル(tsubute)はLv5で「つぶてなげ」を習得する。Lv4・
    // growthExp=60(Lv5必要量63の直前)にしておき、敵のexp=6(仲間へは
    // 50%配分=3)でちょうど63に届かせる。プレイヤー側は6<Lv2必要量(10)なので
    // レベルアップしない(仲間の成長だけを見るシナリオとして分離する)
    const a = ally(game, { speciesId: "tsubute", level: 4, growthExp: 60 });
    const m = monster(game, { exp: 6 });

    const events: unknown[] = [];
    access(game).killActor(m, events);

    expect(game.player.level).toBe(1);
    expect(game.player.exp).toBe(6);
    expect(a.level).toBe(5);
    expect(a.growthExp).toBe(63);
    expect(a.dreamArts).toEqual(["tsubuteNage"]);
    expect((events as { type: string }[]).map((e) => e.type)).toEqual([
      "die",
      "message",
      "message",
      "levelUp",
      "message",
      "dreamArtLearned",
      "message",
    ]);
  });
});

describe("game.ts: プレイヤーのレベルアップ→スキル3択提示→選択→通常進行への復帰", () => {
  it("イベント列が固定どおりになり、提示中は他コマンドを無視する", () => {
    const game = new Game({ seed: 2 });
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    game.player.level = 1;
    game.player.exp = 0;
    const m = monster(game, { exp: 10, hp: 1, maxHp: 1 });

    const killEvents: unknown[] = [];
    access(game).killActor(m, killEvents);

    expect(game.player.level).toBe(2);
    expect((killEvents as { type: string }[]).map((e) => e.type)).toEqual([
      "die",
      "message",
      "message",
      "levelUp",
      "message",
      "tutorialTip",
      "skillChoiceOffered",
    ]);

    // pendingSkillChoice中はchooseSkill以外のコマンドを無視し、ターンも進めない
    const turnBefore = game.turnCount;
    const blocked = game.command({ type: "wait" });
    expect(blocked).toEqual([]);
    expect(game.turnCount).toBe(turnBefore);

    const offered = (killEvents as { type: string; candidates?: RunSkillId[] }[]).find(
      (e) => e.type === "skillChoiceOffered",
    )!;
    expect(offered.candidates).toEqual(["wideSlash", "captureMastery", "barrelBurst"]);
    const chosen = offered.candidates![0]!;
    const resolveEvents = game.command({ type: "chooseSkill", id: chosen });
    expect(game.runSkills).toEqual([chosen]);
    expect(resolveEvents.map((e) => e.type)).toEqual(["message"]);

    // 選び終えたあとは通常どおり進む
    const afterTurn = game.turnCount;
    game.command({ type: "wait" });
    expect(game.turnCount).toBe(afterTurn + 1);
  });
});

describe("game.ts: 隊列指示(setStance)", () => {
  it("イベントと構え・待機位置が固定どおりになる", () => {
    const game = new Game({ seed: 3 });
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    const a = ally(game, { speciesId: "tsubute", pos: { ...game.player.pos } });

    const events = game.command({ type: "setStance", allyId: a.id, stance: "hold" });

    expect(events).toEqual([{ type: "message", text: "テスト用の仲間に「そこで待て」を指示した。" }]);
    expect(a.stance).toBe("hold");
    expect(a.holdPos).toEqual(game.player.pos);
  });
});

describe("game.ts: 捕獲済みタルの開封→仲間化(なじみボーナスは乗らない・新規仲間の基礎値)", () => {
  it("イベント列と、種族基礎値どおりのステータスが固定どおりになる", () => {
    const game = new Game({ seed: 4 });
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    game.giveBarrel("caught", "tsubute");

    const events = game.command({ type: "openBarrel" });

    expect(events.map((e) => e.type)).toEqual(["message", "barrelBreak", "spawn", "recruit", "message", "tutorialTip"]);
    const recruited = game.allies[0]!;
    // createAlly(なじみ履歴を持たない新規捕獲)なので、種族基礎値からのボーナス無し
    expect({ maxHp: recruited.maxHp, atk: recruited.atk, def: recruited.def }).toEqual({
      maxHp: 18,
      atk: 8,
      def: 3,
    });
    expect(recruited.bondSuccessCount).toBeUndefined();
  });
});

describe("game.ts: ダイブ開始時に連れ出した仲間には、なじみボーナスが乗る", () => {
  it("bondSuccessCountぶんのボーナスがcreateAllyFromStored経由で反映される", () => {
    const stored: StoredMonster = {
      uid: 1,
      speciesId: "tsubute",
      level: 5,
      exp: 0,
      skills: [],
      bondSuccessCount: 30,
      recentFusionMaterials: [],
      dreamArts: [],
    };
    const game = new Game({ seed: 5, bringAllies: [stored] });

    const a = game.allies[0]!;
    expect({ maxHp: a.maxHp, atk: a.atk, def: a.def, bondSuccessCount: a.bondSuccessCount }).toEqual({
      maxHp: 27,
      atk: 12,
      def: 4,
      bondSuccessCount: 30,
    });
  });
});
