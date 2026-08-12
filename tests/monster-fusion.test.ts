import { describe, expect, it } from "vitest";
import { Game } from "../src/game";
import { fullSkillSet } from "../src/entities/skills";
import { createAllyFromStored } from "../src/dungeon/populate";
import type { Actor } from "../src/core/types";
import type { GameEvent } from "../src/core/events";
import {
  actorToStoredMonster,
  fuseMonsters,
  initialSave,
  loadSave,
  recordRun,
  takeFromHut,
  type StoredMonster,
} from "../src/save";

function withMockedLocalStorage(run: () => void): void {
  const original = globalThis.localStorage;
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
  };
  try {
    run();
  } finally {
    (globalThis as { localStorage?: unknown }).localStorage = original;
  }
}

function stored(overrides: Partial<StoredMonster> = {}): StoredMonster {
  return {
    uid: 1,
    speciesId: "gajiri",
    level: 1,
    exp: 0,
    skills: [],
    bondSuccessCount: 0,
    recentFusionMaterials: [],
    ...overrides,
  };
}

describe("特技一式(fullSkillSet)", () => {
  it("種族由来のnativeを暗黙で含む", () => {
    expect(fullSkillSet("gajiri")).toEqual(["quickStart"]);
    expect(fullSkillSet("madoromi")).toEqual(["drowsyBreath"]);
  });

  it("夢あわせで得た特技(extra)を重複なく足す", () => {
    const set = fullSkillSet("gajiri", ["softBody"]);
    expect(set).toContain("quickStart");
    expect(set).toContain("softBody");
    expect(set).toHaveLength(2);
  });

  it("nativeとextraが同じなら重複しない", () => {
    expect(fullSkillSet("gajiri", ["quickStart"])).toEqual(["quickStart"]);
  });
});

describe("save.ts: ねむり小屋の永続化", () => {
  it("初期状態はからっぽ", () => {
    expect(initialSave().hut).toEqual([]);
    expect(initialSave().nextHutUid).toBe(1);
  });

  it("actorToStoredMonsterは、生きているAllyの種族・レベル・特技(nativeを除く)を写し取る", () => {
    const actor: Actor = {
      id: 99,
      kind: "ally",
      name: "テスト",
      speciesId: "gajiri",
      model: "gajiri",
      pos: { x: 0, y: 0 },
      facing: 4,
      hp: 10,
      maxHp: 10,
      atk: 5,
      def: 1,
      level: 3,
      statuses: [],
      alive: true,
      skills: fullSkillSet("gajiri", ["softBody"]),
    };
    const s = actorToStoredMonster(5, actor);
    expect(s.uid).toBe(5);
    expect(s.speciesId).toBe("gajiri");
    expect(s.level).toBe(3);
    expect(s.skills).toEqual(["softBody"]); // native(quickStart)は保存しない
  });

  it("recordRunで、生きて連れ帰ったAllyがhutに加わり、nextHutUidが進む", () => {
    let save = initialSave();
    const ally: Actor = {
      id: 1,
      kind: "ally",
      name: "ガジリねずみ",
      speciesId: "gajiri",
      model: "gajiri",
      pos: { x: 0, y: 0 },
      facing: 4,
      hp: 10,
      maxHp: 10,
      atk: 5,
      def: 1,
      level: 1,
      statuses: [],
      alive: true,
      skills: fullSkillSet("gajiri"),
    };
    save = recordRun(save, {
      depth: 3,
      level: 2,
      cleared: true,
      broughtBack: [],
      broughtBackAllies: [ally],
    });
    expect(save.hut).toHaveLength(1);
    expect(save.hut[0]!.speciesId).toBe("gajiri");
    expect(save.nextHutUid).toBe(2);
  });

  it("全滅時(cleared:false)はbroughtBackAlliesを渡さない運用なので、hutは増えない", () => {
    let save = initialSave();
    save = recordRun(save, { depth: 3, level: 2, cleared: false, broughtBack: [] });
    expect(save.hut).toHaveLength(0);
  });

  it("takeFromHutで、指定uidだけが取り出され、hutから消える", () => {
    let save = initialSave();
    save = { ...save, hut: [stored({ uid: 1 }), stored({ uid: 2 }), stored({ uid: 3 })] };
    const { save: after, taken } = takeFromHut(save, [2, 3]);
    expect(taken.map((m) => m.uid).sort()).toEqual([2, 3]);
    expect(after.hut.map((m) => m.uid)).toEqual([1]);
  });

  it("takeFromHutは、存在しないuidを無視する", () => {
    let save = initialSave();
    save = { ...save, hut: [stored({ uid: 1 })] };
    const { taken } = takeFromHut(save, [999]);
    expect(taken).toHaveLength(0);
  });
});

describe("save.ts: 夢あわせ(fuseMonsters)", () => {
  it("レベルは 軸.level + floor(糧.level/2) + 1 になる", () => {
    let save = initialSave();
    save = {
      ...save,
      hut: [stored({ uid: 1, level: 3, speciesId: "gajiri" }), stored({ uid: 2, level: 4, speciesId: "purun" })],
    };
    const result = fuseMonsters(save, 1, 2);
    expect(result).not.toBeNull();
    expect(result!.result.level).toBe(3 + Math.floor(4 / 2) + 1);
  });

  it("糧は消え、軸は種族を維持したままhutに残る", () => {
    let save = initialSave();
    save = { ...save, hut: [stored({ uid: 1, speciesId: "gajiri" }), stored({ uid: 2, speciesId: "purun" })] };
    const result = fuseMonsters(save, 1, 2);
    expect(result).not.toBeNull();
    expect(result!.save.hut).toHaveLength(1);
    expect(result!.save.hut[0]!.uid).toBe(1);
    expect(result!.save.hut[0]!.speciesId).toBe("gajiri");
  });

  it("糧が持つ、軸が未所持の特技を1つ引き継ぐ(MAX_SKILLSまで)", () => {
    let save = initialSave();
    save = {
      ...save,
      hut: [
        stored({ uid: 1, speciesId: "gajiri", skills: [] }), // native: quickStart
        stored({ uid: 2, speciesId: "purun", skills: [] }), // native: softBody
      ],
    };
    const result = fuseMonsters(save, 1, 2)!;
    expect(result.result.skills).toContain("softBody");
  });

  it("軸・糧が同じ、または見つからなければ null を返す", () => {
    let save = initialSave();
    save = { ...save, hut: [stored({ uid: 1 })] };
    expect(fuseMonsters(save, 1, 1)).toBeNull();
    expect(fuseMonsters(save, 1, 999)).toBeNull();
    expect(fuseMonsters(save, 999, 1)).toBeNull();
  });
});

describe("save.ts: 壊れたセーブデータの復元", () => {
  it("hutが壊れていても初期化され、既知のspeciesId・skillIdだけが残る", () => {
    withMockedLocalStorage(() => {
      localStorage.setItem(
        "garudo-dungeon/v1/slot0",
        JSON.stringify({
          hut: [
            { uid: 1, speciesId: "gajiri", level: 2, exp: 0, skills: ["quickStart", "げきから"] },
            { uid: 1, speciesId: "gajiri", level: 1, exp: 0, skills: [] }, // uid重複は捨てる
            { uid: 2, speciesId: "みしらぬもの", level: 1, exp: 0, skills: [] }, // 未知種族は捨てる
            { uid: 3, level: 0, exp: 0, skills: [] }, // level<1は捨てる
          ],
        }),
      );
      const loaded = loadSave();
      expect(loaded.hut).toHaveLength(1);
      expect(loaded.hut[0]!.uid).toBe(1);
      expect(loaded.hut[0]!.skills).toEqual(["quickStart"]);
    });
  });
});

describe("populate.ts: createAllyFromStored", () => {
  it("レベルが高いほどステータスが伸び、nativeとextraの両方の特技を持つ", () => {
    const low = createAllyFromStored(1, stored({ level: 1, speciesId: "honegarami" }), { x: 0, y: 0 });
    const high = createAllyFromStored(
      2,
      stored({ level: 10, speciesId: "honegarami", skills: ["softBody"] }),
      { x: 0, y: 0 },
    );
    expect(high.maxHp).toBeGreaterThan(low.maxHp);
    expect(high.atk).toBeGreaterThan(low.atk);
    expect(high.skills).toContain("stubborn"); // honegarami native
    expect(high.skills).toContain("softBody"); // 夢あわせで得た分
    expect(high.level).toBe(10);
  });

  it("ニックネームがあればActor.nicknameに反映する(種族名はnameのまま維持)", () => {
    const ally = createAllyFromStored(1, stored({ nickname: "ぽち" }), { x: 0, y: 0 });
    expect(ally.nickname).toBe("ぽち");
    expect(ally.name).not.toBe("ぽち");
  });
});

describe("Game: ねむり小屋から連れ出す(bringAllies)", () => {
  it("RunOptions.bringAlliesが初期allyListとして反映される", () => {
    const game = new Game({
      seed: 1,
      bringAllies: [stored({ uid: 1, speciesId: "gajiri", level: 5 })],
    });
    expect(game.allyList).toHaveLength(1);
    expect(game.allyList[0]!.speciesId).toBe("gajiri");
    expect(game.allyList[0]!.level).toBe(5);
    expect(game.allyList[0]!.kind).toBe("ally");
  });

  it("MAX_ALLIESを超える分は無視する", () => {
    const game = new Game({
      seed: 1,
      bringAllies: [stored({ uid: 1 }), stored({ uid: 2 }), stored({ uid: 3 })],
    });
    expect(game.allyList).toHaveLength(2);
  });
});

describe("特技の戦闘効果", () => {
  it("ふいうち: 仲間のそのダイブ最初の1手は必ず会心になる", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const game = new Game({ seed, bringAllies: [stored({ uid: 1, speciesId: "gajiri" })] });
      const ally = game.allyList[0]!;
      const monster = game.floor.actors.find((a) => a.kind === "monster" && a.alive);
      if (!monster) continue;
      ally.pos = { x: monster.pos.x - 1, y: monster.pos.y };
      monster.hp = 100000;
      monster.maxHp = 100000;
      monster.def = 0;

      // Actor配列に反映(テストのため直接位置調整した仲間の並びを揃える)
      const events = game.command({ type: "wait" });
      const damage = events.find(
        (e): e is Extract<(typeof events)[number], { type: "damage" }> =>
          e.type === "damage" && e.actorId === monster.id,
      );
      if (!damage) continue; // 隣接していない/その仲間が動けなかった場合は次のseedへ
      expect(damage.critical, `seed=${seed}`).toBe(true);
      return;
    }
    throw new Error("仲間が攻撃するseedが見つからなかった");
  });

  it("ふんばり: HP1の状態で致死ダメージを受けても、1ラン1回だけ耐える", () => {
    const game = new Game({ seed: 1, bringAllies: [stored({ uid: 1, speciesId: "honegarami" })] });
    const ally = game.allyList[0]!;
    ally.hp = 1;
    ally.maxHp = 999;

    // damageActorはprivateだが、特技の効果自体(戦闘のダメージ計算そのものではない)を
    // 検証したいので、AIの位置取りに依存しない直接呼び出しで検証する
    const damageActor = (
      game as unknown as {
        damageActor: (target: Actor, damage: number, critical: boolean, events: GameEvent[]) => void;
      }
    ).damageActor.bind(game);

    const events1: GameEvent[] = [];
    damageActor(ally, 500, false, events1);
    expect(ally.hp).toBe(1);
    expect(ally.alive).toBe(true);
    expect(events1.some((e) => e.type === "message" && e.text.includes("ふんばりこらえた"))).toBe(true);

    // 1ラン1回だけなので、2回目の致死ダメージは耐えられない
    ally.hp = 1;
    const events2: GameEvent[] = [];
    damageActor(ally, 500, false, events2);
    expect(ally.alive).toBe(false);
  });
});
