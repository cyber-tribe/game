import type { AllyActor } from "../core/types";
import { MAX_RECENT_FUSION_MATERIALS, tryEvolve } from "../entities/evolution";
import { HOKORA_DUST_DEF_ID } from "../entities/forging";
import { MAX_SKILLS, NATIVE_SKILL_BY_SPECIES, fullSkillSet } from "../entities/skills";
import { foodValueMultiplier, speciesById } from "../entities/species";
import type { CompendiumStatus, SaveData, StoredMonster } from "./types";
import { saveData } from "./localStorage";
import { checkAchievements } from "./transitions";

/** ダイブ中のAllyアクターを、ねむり小屋に保存する形へ変換する */
export function actorToStoredMonster(uid: number, actor: AllyActor): StoredMonster {
  const speciesId = actor.speciesId ?? "";
  const native = NATIVE_SKILL_BY_SPECIES[speciesId];
  return {
    uid,
    speciesId,
    level: actor.level,
    // 仲間の経験値・レベルアップ(plan/game/archive/companion-leveling-and-arts.md)
    exp: actor.growthExp ?? 0,
    dreamArts: actor.dreamArts ?? [],
    // native(種族由来)はfullSkillSetで暗黙に復元されるため、夢あわせで得た分だけ保存する
    skills: actor.skills ? actor.skills.filter((s) => s !== native) : [],
    nickname: actor.nickname,
    // なじみ(plan/companion-bond-growth.md): この呼び出し自体が「生きて連れ帰った」
    // 成功なので+1する。連れ出していない新規個体はactor.bondSuccessCountがundefinedのまま
    bondSuccessCount: (actor.bondSuccessCount ?? 0) + 1,
    // 成熟(plan/companion-evolution.md): ダイブ中は変化しないため、そのまま引き継ぐ
    recentFusionMaterials: actor.recentFusionMaterials ?? [],
  };
}

/**
 * ねむり小屋から、出発に連れて行く仲間を取り出す(小屋からは消える)。
 * 見つからないuidは無視する。
 */
export function takeFromHut(
  current: SaveData,
  uids: readonly number[],
): { save: SaveData; taken: StoredMonster[] } {
  const taken: StoredMonster[] = [];
  const remaining: StoredMonster[] = [];
  for (const m of current.hut) {
    if (uids.includes(m.uid) && taken.length < uids.length) taken.push(m);
    else remaining.push(m);
  }
  const next: SaveData = { ...current, hut: remaining };
  saveData(next);
  return { save: next, taken };
}

/** 夢に還す(plan/release-companion.md)ときに残すほこら粉の数。ごくわずか、に留める */
export const RELEASE_COMPANION_HOKORA_DUST = 1;

/**
 * 夢に還す(plan/release-companion.md)。ねむり小屋からuidの個体を取り除き、
 * ごくわずかなほこら粉を残す。図鑑(plan/monster-compendium.md)の記録は
 * hut配列とは独立しているため、何もしなくても消えない。見つからないuidは無視する
 */
export function releaseCompanion(current: SaveData, uid: number): SaveData {
  const target = current.hut.find((m) => m.uid === uid);
  // お気に入りロック(plan/companion-favorite-lock.md): 誤操作防止のガード。
  // 通常はUI側(先にお気に入りを外させる)が呼ばせないが、念のためここでも弾く
  if (!target || target.favorite) return current;
  const next: SaveData = {
    ...current,
    hut: current.hut.filter((m) => m.uid !== uid),
    storage: [
      ...current.storage,
      ...Array.from({ length: RELEASE_COMPANION_HOKORA_DUST }, () => ({ defId: HOKORA_DUST_DEF_ID })),
    ],
  };
  saveData(next);
  return next;
}

/**
 * ねむり小屋の個体を改名する(plan/companion-naming.md)。
 * uidが見つからなければ null を返す(何もしない)。nicknameにundefinedを
 * 渡すと、名前を消して種族名表示に戻す。
 */
export function renameStoredMonster(
  current: SaveData,
  uid: number,
  nickname: string | undefined,
): SaveData | null {
  if (!current.hut.some((m) => m.uid === uid)) return null;
  const hut = current.hut.map((m) => (m.uid === uid ? { ...m, nickname } : m));
  const next: SaveData = { ...current, hut };
  saveData(next);
  return next;
}

/**
 * お気に入り(plan/companion-favorite-lock.md)の切り替え。
 * uidが見つからなければ null を返す(何もしない)。
 */
export function toggleFavorite(current: SaveData, uid: number): SaveData | null {
  if (!current.hut.some((m) => m.uid === uid)) return null;
  const hut = current.hut.map((m) => (m.uid === uid ? { ...m, favorite: !m.favorite } : m));
  const next: SaveData = { ...current, hut };
  saveData(next);
  return next;
}

/**
 * 夢あわせ。軸(残す側)に糧(消える側)を溶け込ませる。
 * どちらかのuidが見つからなければ null を返す(何もしない)。
 */
export function fuseMonsters(
  current: SaveData,
  axisUid: number,
  foodUid: number,
): { save: SaveData; result: StoredMonster } | null {
  if (axisUid === foodUid) return null;
  const axis = current.hut.find((m) => m.uid === axisUid);
  const food = current.hut.find((m) => m.uid === foodUid);
  if (!axis || !food) return null;
  // お気に入りロック(plan/companion-favorite-lock.md): 糧側だけを禁止する。
  // 軸(残る側)は消えないため制限しない。通常はUI側が呼ばせないが念のため
  if (food.favorite) return null;

  // 種族由来(native)の特技は暗黙で持つため、比較・上限判定は完全な特技一式で行う。
  // 実際に保存するのは夢あわせで追加した分だけ
  const axisFull = fullSkillSet(axis.speciesId, axis.skills);
  const foodFull = fullSkillSet(food.speciesId, food.skills);
  const inheritable = foodFull.find((s) => !axisFull.includes(s));
  const skills =
    inheritable && axisFull.length < MAX_SKILLS ? [...axis.skills, inheritable] : [...axis.skills];

  // 成熟(plan/companion-evolution.md): 直近の糧の種族履歴を更新してから、成熟条件を判定する
  const recentFusionMaterials = [...axis.recentFusionMaterials, food.speciesId].slice(
    -MAX_RECENT_FUSION_MATERIALS,
  );
  const fused: StoredMonster = {
    ...axis,
    level: axis.level + Math.floor((food.level * foodValueMultiplier(speciesById(food.speciesId))) / 2) + 1,
    skills,
    recentFusionMaterials,
  };
  const result = tryEvolve(fused);

  const hut = current.hut
    .filter((m) => m.uid !== foodUid)
    .map((m) => (m.uid === axisUid ? result : m));
  // 図鑑(plan/monster-compendium.md): 夢あわせの糧にした種族も「捕まえた」扱いにする。
  // 成熟が起きた場合は、進化後の姿も別エントリとして「捕まえた」にする
  const compendium: Record<string, CompendiumStatus> = {
    ...current.compendium,
    [axis.speciesId]: "captured",
    [food.speciesId]: "captured",
    ...(result.speciesId !== fused.speciesId ? { [result.speciesId]: "captured" as const } : {}),
  };
  const next: SaveData = { ...current, hut, compendium };
  const withAchievements = checkAchievements(next);
  saveData(withAchievements);
  return { save: withAchievements, result };
}
