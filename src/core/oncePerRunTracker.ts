/**
 * 「1ラン1回」の特技・効果(ふいうち・ふいのいちげき・ふんばり・とんずら等)が
 * 個体ごとに発動済みかを覚えておく。種類ごとに `Set<number>`(アクターid)を
 * 持つ実装が Game に4つコピペされていたので、キーで引く1つのマップに集約した。
 */
export class OncePerRunTracker {
  private readonly used = new Map<string, Set<number>>();

  hasUsed(key: string, id: number): boolean {
    return this.used.get(key)?.has(id) ?? false;
  }

  markUsed(key: string, id: number): void {
    let set = this.used.get(key);
    if (!set) {
      set = new Set();
      this.used.set(key, set);
    }
    set.add(id);
  }
}
