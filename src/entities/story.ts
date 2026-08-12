/**
 * 章立て(plan/story-chapters.md)。design/story.mdの全6章構成
 * (序章・第一〜第四章・終章)を、既存のdeepest・storyClearedから
 * 導出する。SaveDataに章番号そのものを保存するフィールドは作らない。
 */
export type StoryChapter = 0 | 1 | 2 | 3 | 4 | 5;

export function storyChapter(deepest: number, storyCleared: boolean): StoryChapter {
  if (storyCleared) return 5; // 終章。山の芯クリア後
  if (deepest >= 42) return 4; // 第四章: 第七〜第八地方
  if (deepest >= 30) return 3; // 第三章: 第五〜第六地方
  if (deepest >= 18) return 2; // 第二章: 近道屋の裏穴+第三〜第四地方
  if (deepest >= 6) return 1; // 第一章: 第一〜第二地方
  return 0; // 序章: 第一地方
}

/**
 * 章に入った瞬間だけ1回流す導入メッセージ。序章(0)は開始時点の状態
 * なので対象外。design/story.mdの各章の冒頭描写を1〜2行に要約したもの
 */
export const STORY_CHAPTER_MESSAGES: Readonly<Record<Exclude<StoryChapter, 0>, string>> = {
  1: "近ごろ、山の様子がおかしいという噂を耳にする。",
  2: "村はずれで、山肌に杭のようなものが打ち込まれているのを見つけた。",
  3: "ヨリシロの眠りが、さらに深く乱れ始めている。",
  4: "夢の最奥で、近道屋がヨリシロの意識の核に手を出そうとしている。",
  5: "山は再び、ゆっくりとした寝息に戻っていった。",
};

/** 章に入った事実をseenVillageEventsへ記録する際に使うid */
export function storyChapterEventId(chapter: StoryChapter): string {
  return `chapter:${chapter}`;
}
