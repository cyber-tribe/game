/**
 * モンスター種族名の英訳ぐろっさり(plan/game/archive/localization-monster-names-en.md)。
 *
 * design/localization.md が示す将来の `src/i18n/en.ts` の構造(`"species.<id>.name"`
 * というキー形式)を先取りしつつ、この1ファイルはあくまで**モンスター種族名だけの
 * たたき台**であり、`ja.ts` と違って `t()`/`setLocale()`(src/i18n/index.ts)には
 * まだ配線しない。理由は2つ:
 *
 * 1. design/localization.md の優先順位で言えば、種族名は「次点」(優先度2)。
 *    「最優先」(優先度1、操作に直結するシステムメッセージ・メニュー)の
 *    英訳・配線がまだ一切無いため、種族名だけを先に生きた翻訳として選べる
 *    ようにしても、遊べる体験にはならない。
 * 2. この文書自体が「ネイティブ英語話者による通しチェックを別途挟む必要が
 *    ある」たたき台だと明記している(語呂の自然さ・誤読の懸念が残るものを
 *    含む)。未レビューのテキストをプレイヤーに見せる形で配線するのは避けた。
 *
 * `Species.name`(src/entities/species.ts)自体もまだ日本語の直値のままで、
 * `nameKey` のような間接参照には変えていない(design/localization.mdが示す
 * その書き換え自体が優先度1の範囲であり、本書のスコープ外のため)。
 */
export const speciesNamesEn: Readonly<Record<string, string>> = {
  // ---- 基本ロスター(第一〜第三地方をまたぐ初期6種) ----
  "species.purun.name": "Squidge",
  "species.gajiri.name": "Gnawmouse",
  "species.tsubute.name": "Slingfrog",
  "species.madoromi.name": "Snoozecap",
  "species.honegarami.name": "Bonetangle",
  "species.surigarasu.name": "Pilferpane",

  // ---- 夢あわせで成熟した先の姿(companion-evolution) ----
  "species.ishizuenezumi.name": "Cornerstone Mouse",
  "species.tokoshiepurun.name": "Everlasting Squidge",
  "species.yumemirupurun.name": "Dreaming Squidge",

  // ---- 地方ごとの成熟系統(companion-evolution-expansion) ----
  "species.kasumiutsubo.name": "Haze Moray",
  "species.nemurimogura.name": "Deepsleep Mole",
  "species.yoroioiteke.name": "Rearguard Ironshell",
  "species.namidaguma.name": "Tearbear",
  "species.kodamagitsune.name": "Echofox",
  "species.matsurinonushi.name": "Festival Elder",

  // ---- 地方ボス(region-bosses) ----
  "species.oonebosuke.name": "Old Sluggard",
  "species.nushigaeru.name": "Marsh Elder",
  "species.oomadoromi.name": "Old Snoozecap",
  "species.honezukaNoNushi.name": "Boneyard Elder",
  "species.fuchiNoNushi.name": "Pool Elder",
  "species.kodamaNoNushi.name": "Echo Elder",
  "species.misemonoNoNushi.name": "Sideshow Elder",
  "species.horikuiNoNushi.name": "Palisade Elder",

  // ---- 地方別の新種(monster-compendium) ----
  "species.moyautsubo.name": "Mist Moray",
  "species.wasuregani.name": "Forget-me-not Crab",
  "species.yumekuimogura.name": "Dreameater Mole",
  "species.horoholocho.name": "Slumbermoth",
  "species.yoroimukade.name": "Ironshell Centipede",
  "species.oitekeboshi.name": "Trailing Wisp",
  "species.shizukuuo.name": "Teardrop Fish",
  "species.urumiguma.name": "Brimming Bear",
  "species.yamabikogitsune.name": "Hollerfox",
  "species.kodamausagi.name": "Echobun",
  "species.menkaburikozo.name": "Maskling",
  "species.kazaridaruma.name": "Dusty Roly-poly",
  "species.yumemayoinokage.name": "Wayward Shade",
  "species.yorishironozankyo.name": "Sleeper's Echo",

  // ---- 60種化・追加種族(monster-roster-expansion-species) ----
  "species.akubitokage.name": "Yawnlizard",
  "species.mabutamushi.name": "Eyelid Midge",
  "species.kirimizuchi.name": "Mistwyrm",
  "species.nukarumigani.name": "Mireclaw",
  "species.ashiatodori.name": "Trackpecker",
  "species.wasuremizuchi.name": "Forgetwyrm",
  "species.kinokootoko.name": "Toadstool Man",
  "species.houshitobi.name": "Sporeflit",
  "species.madoromigumo.name": "Snoozeweb",
  "species.nebosukegaeru.name": "Snoozehop Frog",
  "species.honedatami.name": "Bonestack",
  "species.wasurebone.name": "Forgetbone",
  "species.katakunagani.name": "Grudgecrab",
  "species.honezukanotsukai.name": "Boneyard Runner",
  "species.nadakaze.name": "Sniffling Wind",
  "species.shioresakura.name": "Witherblossom",
  "species.mizukagami.name": "Watermirror",
  "species.nakimushi.name": "Crybug",
  "species.kodamagumo.name": "Echoweb",
  "species.yamabikooni.name": "Holler-ogre",
  "species.kaerukodama.name": "Bouncefrog",
  "species.nedayamabiko.name": "Rootholler",
  "species.kageboushi.name": "Shadowplay",
  "species.wataamenoobake.name": "Candyfloss Ghost",
  "species.yaguramori.name": "Belfry Haunt",
  "species.chouchinokuri.name": "Fading Lantern",
  "species.subetenopurun.name": "Boundless Squidge",
  "species.mazarinezumi.name": "Mingle-mouse",
  "species.yoseatsume.name": "Hodgepodge",
  "species.mouhitotsunokage.name": "Othershade",

  // ---- 真の目覚め(true-awakening、隠し最終局面) ----
  "species.hajimeNoYume.name": "The First Dream",
};
