/**
 * 地方(design/regions.md)。表の寝穴(MAIN_CAVE_ID)を8つに分ける、
 * 階層範囲・地方ボスの単一の対応表。
 *
 * これまで REGION_BOSS_FLOORS(階数→ボス)と REGION_BOSS_ORDER(出現順の
 * 一覧)という同じ情報の2つの見え方が species.ts に個別に手書きされていた
 * (adr/0012 参照)。ここではその情報を REGIONS 1本にまとめ、
 * REGION_BOSS_FLOORS・REGION_BOSS_ORDER はこの配列からの導出にする。
 */
export interface RegionDef {
  /** 1始まりの地方番号 */
  index: number;
  /** design/regions.md の地方名 */
  name: string;
  /** 表の寝穴でのこの地方の階範囲 [開始, 終了](両端含む) */
  floors: readonly [number, number];
  /** この地方のボスの種族id。地方の最終階(floors[1])にだけ配置する */
  bossSpeciesId: string;
}

export const REGIONS: readonly RegionDef[] = [
  { index: 1, name: "うたたねの参道", floors: [1, 6], bossSpeciesId: "oonebosuke" },
  { index: 2, name: "忘れ潮の湿地", floors: [7, 12], bossSpeciesId: "nushigaeru" },
  { index: 3, name: "まどろみの茸林", floors: [13, 18], bossSpeciesId: "oomadoromi" },
  { index: 4, name: "骨積みの回廊", floors: [19, 24], bossSpeciesId: "honezukaNoNushi" },
  { index: 5, name: "なみだの滝つぼ", floors: [25, 30], bossSpeciesId: "fuchiNoNushi" },
  { index: 6, name: "こだまの尾根", floors: [31, 36], bossSpeciesId: "kodamaNoNushi" },
  { index: 7, name: "わすれられた祭りの跡", floors: [37, 42], bossSpeciesId: "misemonoNoNushi" },
  { index: 8, name: "めざめの前庭", floors: [43, 48], bossSpeciesId: "horikuiNoNushi" },
];

/**
 * 地方ボス(plan/region-bosses.md)。表の寝穴で、その階の地方の最終階
 * (6階目)にだけ専用に配置する種族id。REGIONS から導出する。
 */
export const REGION_BOSS_FLOORS: Readonly<Record<number, string>> = Object.fromEntries(
  REGIONS.map((r) => [r.floors[1], r.bossSpeciesId]),
);

/**
 * 地方ボスを地方の順番どおりに並べたもの(plan/hidden-dungeon.mdの
 * 腕試しの間で使う)。REGION_BOSS_FLOORSの値と同じ集合だが、表の寝穴の
 * 具体的な階数とは切り離した「出現順」だけの一覧にする。REGIONS から導出する。
 */
export const REGION_BOSS_ORDER: readonly string[] = REGIONS.map((r) => r.bossSpeciesId);
