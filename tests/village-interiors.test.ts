import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { VILLAGER_MODELS } from "../src/modelList";
import { VILLAGE_NPCS } from "../src/entities/village";
import type { StoryChapter } from "../src/entities/story";
import type { Assets } from "../src/view/assets";
import {
  OUTDOOR_VILLAGERS,
  VILLAGE_BUILDINGS,
  VILLAGE_INTERACT_PADDING,
  VILLAGE_BOUNDS,
  VillageView,
  outdoorVillagers,
} from "../src/view/village";
import {
  INTERIOR_VIEW_SHIFT,
  VILLAGE_INTERIORS,
  VillageInteriorView,
  interiorFilmOffset,
  interiorForBuilding,
  interiorResidentModel,
} from "../src/view/villageInterior";

/** plan/game/village-interiors.md の表(建物 → 住人)をそのまま写したもの */
const EXPECTED_RESIDENTS: Readonly<Record<string, string | null>> = {
  storage: "mogurabaa",
  workshop: "gendo",
  sleepHut: "fuku",
  gallery: "okiyo",
  recordsHall: "ito",
  development: null,
  garudoHouse: null,
};

/** 内装を持たない屋外系(旅の看板・依頼板・広場・洞窟の入口) */
const OUTDOOR_BUILDING_IDS = ["board", "questBoard", "npcSquare", "cave"];

describe("view/villageInterior.ts: 建物 → 内装 → 住人の対応", () => {
  it("内装を持つのは屋内系の7件だけ", () => {
    expect(VILLAGE_INTERIORS).toHaveLength(7);
    expect(VILLAGE_INTERIORS.map((def) => def.buildingId).sort()).toEqual(
      Object.keys(EXPECTED_RESIDENTS).sort(),
    );
  });

  it("内装のbuildingIdはすべて村マップに実在する建物", () => {
    const ids = new Set(VILLAGE_BUILDINGS.map((b) => b.id));
    for (const def of VILLAGE_INTERIORS) {
      expect(ids.has(def.buildingId)).toBe(true);
    }
  });

  it("屋外系(旅の看板・依頼板・広場・洞窟の入口)は内装を持たない", () => {
    for (const id of OUTDOOR_BUILDING_IDS) {
      expect(VILLAGE_BUILDINGS.some((b) => b.id === id)).toBe(true);
      expect(interiorForBuilding(id)).toBeUndefined();
      expect(interiorResidentModel(id)).toBeNull();
    }
  });

  it("村マップの建物は、屋内系7件と屋外系4件で過不足なく尽きている", () => {
    expect(VILLAGE_BUILDINGS).toHaveLength(
      VILLAGE_INTERIORS.length + OUTDOOR_BUILDING_IDS.length,
    );
  });

  it("住人はplanの表どおり", () => {
    for (const [buildingId, resident] of Object.entries(EXPECTED_RESIDENTS)) {
      expect(interiorResidentModel(buildingId)).toBe(resident);
    }
  });

  it("住人の村人モデルはVILLAGER_MODELSに載っている", () => {
    for (const def of VILLAGE_INTERIORS) {
      if (def.resident === null) continue;
      expect(VILLAGER_MODELS as readonly string[]).toContain(def.resident);
    }
  });

  it("同じ村人が2つの建物の住人を兼ねない", () => {
    const residents = VILLAGE_INTERIORS.map((def) => def.resident).filter((r) => r !== null);
    expect(new Set(residents).size).toBe(residents.length);
  });

  it("未知のidを渡してもundefined/nullを返すだけで落ちない", () => {
    expect(interiorForBuilding("nowhere")).toBeUndefined();
    expect(interiorResidentModel("nowhere")).toBeNull();
  });
});

/** plan/sound/archive/village-soundscape.md の表(建物 → 入店SFX・室内環境音)をそのまま写したもの */
const EXPECTED_SOUND: Readonly<Record<string, { enterSfx: string; ambientMoodId?: string }>> = {
  storage: { enterSfx: "enterStorage" },
  workshop: { enterSfx: "enterWorkshop", ambientMoodId: "workshop-ambient" },
  sleepHut: { enterSfx: "enterSleepHut", ambientMoodId: "sleep-hut-ambient" },
  gallery: { enterSfx: "enterGallery", ambientMoodId: "gallery-ambient" },
  recordsHall: { enterSfx: "enterRecordsHall" },
  garudoHouse: { enterSfx: "enterGarudoHouse", ambientMoodId: "garudo-house-ambient" },
};

describe("view/villageInterior.ts: 建物ごとの音(plan/sound/archive/village-soundscape.md)", () => {
  it("village-soundscape.mdの表に載っている6件は、そのとおりの入店SFX・室内環境音を持つ", () => {
    for (const [buildingId, expected] of Object.entries(EXPECTED_SOUND)) {
      const def = interiorForBuilding(buildingId);
      expect(def?.enterSfx).toBe(expected.enterSfx);
      expect(def?.ambientMoodId).toBe(expected.ambientMoodId);
    }
  });

  it("表に載っていないdevelopmentには、入店SFX・室内環境音のどちらも割り当てない", () => {
    const def = interiorForBuilding("development");
    expect(def?.enterSfx).toBeUndefined();
    expect(def?.ambientMoodId).toBeUndefined();
  });

  it("室内環境音を持たない(静けさの)建物はstorage・recordsHallの2件だけ", () => {
    const silent = VILLAGE_INTERIORS.filter((def) => def.ambientMoodId === undefined && def.enterSfx !== undefined);
    expect(silent.map((def) => def.buildingId).sort()).toEqual(["recordsHall", "storage"]);
  });

  it("入店SFX・室内環境音のidに重複が無い(同じ音を取り違えて2つの建物に割り当てていない)", () => {
    const sfxIds = VILLAGE_INTERIORS.map((def) => def.enterSfx).filter((id) => id !== undefined);
    expect(new Set(sfxIds).size).toBe(sfxIds.length);
    const moodIds = VILLAGE_INTERIORS.map((def) => def.ambientMoodId).filter((id) => id !== undefined);
    expect(new Set(moodIds).size).toBe(moodIds.length);
  });
});

describe("view/villageInterior.ts: メニューパネルを避ける画角", () => {
  /** 内装の中心(原点)が、実際に画面のどのあたり(NDC)へ来るかを測る */
  function ndcXOfOrigin(fov: number, aspect: number, shift: number): number {
    const camera = new THREE.PerspectiveCamera(fov, aspect, 0.1, 40);
    camera.position.set(0, 1, 5);
    camera.lookAt(0, 1, 0);
    camera.filmOffset = interiorFilmOffset(fov, aspect, shift, camera.filmGauge);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    return new THREE.Vector3(0, 1, 0).project(camera).x;
  }

  it("シフト0なら中央に写る(既定の画角と変わらない)", () => {
    expect(ndcXOfOrigin(42, 16 / 9, 0)).toBeCloseTo(0, 5);
    expect(interiorFilmOffset(42, 16 / 9, 0)).toBeCloseTo(0, 10);
  });

  it("指定したぶんだけ右へ寄る(パネルは左に置くので符号は正)", () => {
    expect(INTERIOR_VIEW_SHIFT).toBeGreaterThan(0);
    expect(ndcXOfOrigin(42, 16 / 9, 0.36)).toBeCloseTo(0.36, 5);
  });

  it("画面の縦横比が変わっても寄る量(画面上の割合)は変わらない", () => {
    for (const aspect of [4 / 3, 16 / 9, 21 / 9, 3 / 4]) {
      expect(ndcXOfOrigin(42, aspect, INTERIOR_VIEW_SHIFT)).toBeCloseTo(INTERIOR_VIEW_SHIFT, 5);
    }
  });

  it("CSS側もパネルを左へ寄せている(3Dの寄せ方向と食い違わない)", () => {
    const html = readFileSync(join(__dirname, "..", "index.html"), "utf8");
    const rule = html.match(/#ui\.village-interior #town \{[^}]*\}/);
    expect(rule).not.toBeNull();
    expect(rule![0]).toContain("justify-content: flex-start");
  });
});

describe("view/villageInterior.ts: VillageInteriorView", () => {
  it("屋内系の建物に入ると、その部屋がシーンに現れる", () => {
    const view = new VillageInteriorView(emptyAssets());
    expect(view.currentBuildingId).toBeNull();
    expect(view.enter("workshop")).toBe(true);
    expect(view.currentBuildingId).toBe("workshop");
    expect(view.scene.children.filter((c) => c.visible)).toHaveLength(1);
  });

  it("屋外系の建物を渡しても何も起きない", () => {
    const view = new VillageInteriorView(emptyAssets());
    expect(view.enter("cave")).toBe(false);
    expect(view.currentBuildingId).toBeNull();
    expect(view.scene.children).toHaveLength(0);
  });

  it("出入りを繰り返しても部屋は組み直さない(使い回す)", () => {
    const view = new VillageInteriorView(emptyAssets());
    view.enter("storage");
    view.leave();
    view.enter("storage");
    expect(view.scene.children).toHaveLength(1);
    expect(view.currentBuildingId).toBe("storage");
  });

  it("別の建物に入ると、前の部屋は隠れて新しい部屋だけが見える", () => {
    const view = new VillageInteriorView(emptyAssets());
    view.enter("storage");
    view.enter("gallery");
    expect(view.scene.children).toHaveLength(2);
    expect(view.scene.children.filter((c) => c.visible)).toHaveLength(1);
  });

  it("村なか歩きへ戻ると、どの部屋も表示されない", () => {
    const view = new VillageInteriorView(emptyAssets());
    view.enter("storage");
    view.leave();
    expect(view.currentBuildingId).toBeNull();
    expect(view.scene.children.filter((c) => c.visible)).toHaveLength(0);
  });

  it("住人のモデルが届いていれば、1体だけ立たせる(毎フレーム増えない)", () => {
    const { assets, instantiated } = villagerAssets();
    const view = new VillageInteriorView(assets);
    view.enter("storage");
    for (let i = 0; i < 30; i++) view.update(0.016);
    expect(instantiated).toEqual(["mogurabaa"]);
  });

  it("住人がいない建物では村人モデルを読み込まない", () => {
    const { assets, instantiated, requested } = villagerAssets();
    const view = new VillageInteriorView(assets);
    view.enter("garudoHouse");
    for (let i = 0; i < 30; i++) view.update(0.016);
    expect(instantiated).toEqual([]);
    expect(requested).toEqual([]);
  });

  it("モデルがまだ届いていなければ、背景での読み込みを頼んで待つ", () => {
    const { assets, instantiated, requested } = villagerAssets(new Set());
    const view = new VillageInteriorView(assets);
    view.enter("workshop");
    view.update(0.016);
    expect(instantiated).toEqual([]);
    expect(requested).toContain("gendo");
  });

  it("入った一拍で`talk`を1回だけ流し、そのあとは待機に戻る", () => {
    const { assets, played } = villagerAssets();
    const view = new VillageInteriorView(assets);
    view.enter("workshop");
    for (let i = 0; i < 10; i++) view.update(0.016);
    // ActorViewのコンストラクタがidleを流したあと、入った合図としてtalkが1回
    expect(played).toEqual(["idle", "talk"]);
  });

  it("入り直すたびに一拍(`talk`)をやり直す", () => {
    const { assets, played } = villagerAssets();
    const view = new VillageInteriorView(assets);
    view.enter("workshop");
    view.update(0.016);
    view.leave();
    view.enter("workshop");
    view.update(0.016);
    expect(played.filter((name) => name === "talk")).toHaveLength(2);
  });

  it("別の建物に移ると、前の住人は片付けて次の住人を立たせる", () => {
    const { assets, instantiated } = villagerAssets();
    const view = new VillageInteriorView(assets);
    view.enter("storage");
    view.update(0.016);
    view.enter("recordsHall");
    view.update(0.016);
    expect(instantiated).toEqual(["mogurabaa", "ito"]);
  });
});

/**
 * plan/models/village-interior-brightness.md: 「暗い中に光源がある」から
 * 「明るい部屋に、性格づけの光が差している」へ基準を変える
 */
describe("view/villageInterior.ts: 内装の明るさ(village-interior-brightness)", () => {
  function ambientLightsOf(view: VillageInteriorView, buildingId: string): THREE.AmbientLight[] {
    view.enter(buildingId);
    const room = view.scene.children.find((c) => c.visible)!;
    const lights: THREE.AmbientLight[] = [];
    room.traverse((o) => {
      if (o instanceof THREE.AmbientLight) lights.push(o);
    });
    return lights;
  }

  it("どの内装にも、床・壁が判別できる明るさの基準ambientがある", () => {
    for (const def of VILLAGE_INTERIORS) {
      const view = new VillageInteriorView(emptyAssets());
      const lights = ambientLightsOf(view, def.buildingId);
      // 基準光(ニュートラル)+性格づけの薄いアクセントの2灯構成
      expect(lights.length).toBeGreaterThanOrEqual(2);
      const brightest = Math.max(...lights.map((l) => l.intensity));
      // 屋外の昼(ambientIntensity=1.9)の6割程度を下限にする(ねむり小屋の
      // 例外を含めても、これを下回らない)
      expect(brightest).toBeGreaterThanOrEqual(1.9 * 0.5);
    }
  });

  it("ねむり小屋だけ、寝かしつけの場として基準の1段下になっている", () => {
    const other = new VillageInteriorView(emptyAssets());
    const otherBase = Math.max(...ambientLightsOf(other, "workshop").map((l) => l.intensity));

    const sleepHut = new VillageInteriorView(emptyAssets());
    const sleepBase = Math.max(...ambientLightsOf(sleepHut, "sleepHut").map((l) => l.intensity));

    expect(sleepBase).toBeLessThan(otherBase);
    // 暗くしすぎて寝床・名札が判別できなくならない下限は保つ
    expect(sleepBase).toBeGreaterThanOrEqual(1.9 * 0.4);
  });

  it("部屋の色(def.ambient)は、基準光を上回って全体を支配しない", () => {
    for (const def of VILLAGE_INTERIORS) {
      const view = new VillageInteriorView(emptyAssets());
      const lights = ambientLightsOf(view, def.buildingId);
      const base = Math.max(...lights.map((l) => l.intensity));
      const accent = lights.find((l) => l.color.getHex() === new THREE.Color(def.ambient).getHex());
      expect(accent).toBeDefined();
      expect(accent!.intensity).toBeLessThan(base);
    }
  });

  it("炉・夜色などの性格づけの点光源は、周囲2〜3mのアクセントに絞ってある", () => {
    for (const buildingId of ["workshop", "sleepHut", "storage", "gallery", "recordsHall", "development", "garudoHouse"]) {
      const view = new VillageInteriorView(emptyAssets());
      view.enter(buildingId);
      const room = view.scene.children.find((c) => c.visible)!;
      room.traverse((o) => {
        if (o instanceof THREE.PointLight) {
          expect(o.distance).toBeGreaterThan(0);
          expect(o.distance).toBeLessThanOrEqual(3);
        }
      });
    }
  });
});

describe("view/village.ts: 屋外の村人", () => {
  it("オトネ・ポチ・おたまの3人。モデルはVILLAGER_MODELSに載っている", () => {
    expect(OUTDOOR_VILLAGERS.map((v) => v.npcId)).toEqual(["otone", "pochi", "otama"]);
    for (const villager of OUTDOOR_VILLAGERS) {
      expect(VILLAGER_MODELS as readonly string[]).toContain(villager.model);
    }
  });

  it("npcIdはentities/village.tsのNPC表に実在する(出現条件の出どころを一本化する)", () => {
    const ids = new Set(VILLAGE_NPCS.map((npc) => npc.id));
    for (const villager of OUTDOOR_VILLAGERS) {
      expect(ids.has(villager.npcId)).toBe(true);
    }
  });

  it("内装を持つ建物の住人とは重複しない(屋内に立つ村人は屋外に出てこない)", () => {
    const indoor = new Set(VILLAGE_INTERIORS.map((def) => def.resident));
    for (const villager of OUTDOOR_VILLAGERS) {
      expect(indoor.has(villager.model)).toBe(false);
    }
  });

  it("第二章より前は、広場におたまがいない", () => {
    for (const chapter of [0, 1] as StoryChapter[]) {
      expect(outdoorVillagers(chapter).map((v) => v.npcId)).toEqual(["otone", "pochi"]);
    }
  });

  it("第二章の救出後は、広場におたまも現れる", () => {
    for (const chapter of [2, 3, 4, 5] as StoryChapter[]) {
      expect(outdoorVillagers(chapter).map((v) => v.npcId)).toEqual(["otone", "pochi", "otama"]);
    }
  });

  it("村の境界の内側に立っている", () => {
    for (const villager of OUTDOOR_VILLAGERS) {
      expect(villager.x).toBeGreaterThan(VILLAGE_BOUNDS.minX);
      expect(villager.x).toBeLessThan(VILLAGE_BOUNDS.maxX);
      expect(villager.z).toBeGreaterThan(VILLAGE_BOUNDS.minZ);
      expect(villager.z).toBeLessThan(VILLAGE_BOUNDS.maxZ);
    }
  });

  it("どの建物の近接判定の中にも立っていない(建物へ入る位置と重ならない)", () => {
    for (const villager of OUTDOOR_VILLAGERS) {
      for (const building of VILLAGE_BUILDINGS) {
        const dist = Math.hypot(villager.x - building.x, villager.z - building.z);
        expect(dist).toBeGreaterThan(building.radius + VILLAGE_INTERACT_PADDING);
      }
    }
  });

  it("オトネは依頼板のそば、ポチとおたまは広場にいる", () => {
    const near = (id: string, npcId: string) => {
      const building = VILLAGE_BUILDINGS.find((b) => b.id === id)!;
      const villager = OUTDOOR_VILLAGERS.find((v) => v.npcId === npcId)!;
      return Math.hypot(villager.x - building.x, villager.z - building.z);
    };
    expect(near("questBoard", "otone")).toBeLessThan(3);
    expect(near("npcSquare", "pochi")).toBeLessThan(3);
    expect(near("npcSquare", "otama")).toBeLessThan(3);
  });

  it("村人同士が重なって立っていない", () => {
    for (let i = 0; i < OUTDOOR_VILLAGERS.length; i++) {
      for (let j = i + 1; j < OUTDOOR_VILLAGERS.length; j++) {
        const a = OUTDOOR_VILLAGERS[i]!;
        const b = OUTDOOR_VILLAGERS[j]!;
        expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(1);
      }
    }
  });
});

describe("view/village.ts: VillageViewへの屋外の村人の配置", () => {
  it("序章では、オトネとポチだけがシーンに立つ", () => {
    const { assets, instantiated } = villagerAssets();
    const view = new VillageView(assets);
    for (let i = 0; i < 5; i++) view.update(0.016, null);
    // garudo(村なかの自分の姿)は既存の配線で別に作られるので、村人だけを見る
    expect(villagersOnly(instantiated)).toEqual(["otone", "pochi"]);
  });

  it("第二章に入っていれば、おたまもシーンに立つ", () => {
    const { assets, instantiated } = villagerAssets();
    const view = new VillageView(assets);
    view.setStoryChapter(2);
    for (let i = 0; i < 5; i++) view.update(0.016, null);
    expect(villagersOnly(instantiated)).toEqual(["otone", "pochi", "otama"]);
  });

  it("章が進んでも、既に立っている村人を作り直さない", () => {
    const { assets, instantiated } = villagerAssets();
    const view = new VillageView(assets);
    for (let i = 0; i < 5; i++) view.update(0.016, null);
    view.setStoryChapter(2);
    for (let i = 0; i < 5; i++) view.update(0.016, null);
    expect(villagersOnly(instantiated)).toEqual(["otone", "pochi", "otama"]);
  });
});

/** 作られたモデルのうち村人だけを、作られた順に抜き出す */
function villagersOnly(instantiated: readonly string[]): string[] {
  return instantiated.filter((name) => (VILLAGER_MODELS as readonly string[]).includes(name));
}

// ------------------------------------------------------------ テスト用の Assets

function emptyAssets(): Assets {
  return {
    has: () => false,
    instantiate: () => ({ root: new THREE.Group(), mixer: null, actions: new Map() }),
    loadInBackground: () => {},
  } as unknown as Assets;
}

/**
 * 村人モデルが読めている(既定)ことにした`Assets`。何を作らせたか・
 * どのクリップを流したかを記録して検査できるようにする
 */
function villagerAssets(loaded: ReadonlySet<string> | null = null): {
  assets: Assets;
  instantiated: string[];
  requested: string[];
  played: string[];
} {
  const instantiated: string[] = [];
  const requested: string[] = [];
  const played: string[] = [];
  const available = loaded ?? new Set<string>([...VILLAGER_MODELS, "garudo"]);
  const assets = {
    has: (name: string) => available.has(name),
    instantiate: (name: string) => {
      instantiated.push(name);
      // ActorView.play()は該当のactionが無ければ何もしないので、
      // 村人の2本(idle/talk)ぶんだけ最低限のスタブを持たせる
      const actions = new Map(
        ["idle", "talk"].map((clip) => [clip, stubAction(clip, played)] as const),
      );
      return { root: new THREE.Group(), mixer: null, actions };
    },
    loadInBackground: (names: readonly string[]) => requested.push(...names),
  } as unknown as Assets;
  return { assets, instantiated, requested, played };
}

/** `THREE.AnimationAction`のうち、`ActorView.play()`が触るところだけのスタブ */
function stubAction(clip: string, played: string[]): unknown {
  const action = {
    reset: () => action,
    setLoop: () => action,
    clampWhenFinished: false,
    enabled: false,
    timeScale: 1,
    setEffectiveWeight: () => action,
    getClip: () => ({ duration: 0.8 }),
    fadeIn: () => action,
    fadeOut: () => action,
    play: () => {
      played.push(clip);
      return action;
    },
  };
  return action;
}
