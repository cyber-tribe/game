import type { Actor } from "../core/types";

/** plan/companion-naming.md: 名前の文字数上限 */
export const MAX_NICKNAME_LENGTH = 8;

/** 表示用の名前。名前(nickname)があれば「タロ(ぷるん)」の形にする */
export function displayActorName(actor: Actor): string {
  return actor.nickname ? `${actor.nickname}(${actor.name})` : actor.name;
}

/** 前後の空白を落とし、文字数上限で切る。空文字は「名付けない」とみなしundefinedにする */
export function sanitizeNickname(input: string): string | undefined {
  const trimmed = input.trim().slice(0, MAX_NICKNAME_LENGTH);
  return trimmed.length > 0 ? trimmed : undefined;
}
