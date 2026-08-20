import { describe, expect, it } from "vitest";
import type { AllyActor } from "../src/core/types";
import { MAX_NICKNAME_LENGTH, displayActorName, sanitizeNickname } from "../src/entities/naming";
import { actorToStoredMonster, initialSave, renameStoredMonster, type StoredMonster } from "../src/save";

function actor(overrides: Partial<AllyActor> = {}): AllyActor {
  return {
    id: 1,
    kind: "ally",
    name: "ぷるん",
    model: "purun",
    pos: { x: 0, y: 0 },
    facing: 4,
    hp: 10,
    maxHp: 10,
    atk: 1,
    def: 1,
    level: 1,
    statuses: [],
    alive: true,
    ...overrides,
  };
}

describe("displayActorName", () => {
  it("名前が無ければ種族名をそのまま表示する", () => {
    expect(displayActorName(actor())).toBe("ぷるん");
  });

  it("名前があれば「タロ(ぷるん)」の形にする", () => {
    expect(displayActorName(actor({ nickname: "タロ" }))).toBe("タロ(ぷるん)");
  });
});

describe("sanitizeNickname", () => {
  it("前後の空白を落とす", () => {
    expect(sanitizeNickname("  タロ  ")).toBe("タロ");
  });

  it("空欄はundefined(名付けない)になる", () => {
    expect(sanitizeNickname("")).toBeUndefined();
    expect(sanitizeNickname("   ")).toBeUndefined();
  });

  it(`${MAX_NICKNAME_LENGTH}文字を超える分は切り捨てる`, () => {
    const long = "あ".repeat(MAX_NICKNAME_LENGTH + 5);
    expect(sanitizeNickname(long)).toBe("あ".repeat(MAX_NICKNAME_LENGTH));
  });
});

function stored(overrides: Partial<StoredMonster> = {}): StoredMonster {
  return {
    uid: 1,
    speciesId: "gajiri",
    level: 1,
    exp: 0,
    skills: [],
    bondSuccessCount: 0,
    recentFusionMaterials: [],
    dreamArts: [],
    ...overrides,
  };
}

describe("save.ts: actorToStoredMonsterはnicknameを引き継ぐ", () => {
  it("Actor.nicknameがあればStoredMonster.nicknameにも写す", () => {
    const s = actorToStoredMonster(1, actor({ nickname: "タロ" }));
    expect(s.nickname).toBe("タロ");
  });

  it("Actor.nicknameが無ければundefinedのまま", () => {
    const s = actorToStoredMonster(1, actor());
    expect(s.nickname).toBeUndefined();
  });
});

describe("save.ts: renameStoredMonster", () => {
  it("指定uidのnicknameだけを書き換える", () => {
    let save = initialSave();
    save = { ...save, hut: [stored({ uid: 1 }), stored({ uid: 2 })] };
    const renamed = renameStoredMonster(save, 1, "タロ");
    expect(renamed).not.toBeNull();
    expect(renamed!.hut.find((m) => m.uid === 1)!.nickname).toBe("タロ");
    expect(renamed!.hut.find((m) => m.uid === 2)!.nickname).toBeUndefined();
  });

  it("undefinedを渡すと名前を消す", () => {
    let save = initialSave();
    save = { ...save, hut: [stored({ uid: 1, nickname: "タロ" })] };
    const renamed = renameStoredMonster(save, 1, undefined);
    expect(renamed!.hut[0]!.nickname).toBeUndefined();
  });

  it("存在しないuidはnullを返す", () => {
    const save = initialSave();
    expect(renameStoredMonster(save, 999, "タロ")).toBeNull();
  });
});
