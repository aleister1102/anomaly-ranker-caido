import { RankedResult } from "../../shared/types.js";

/**
 * Simple LRU cache for ranking results.
 */
export class ResultsCache {
  private cache = new Map<string, RankedResult[]>();
  private readonly maxSize: number;

  constructor(maxSize = 500) {
    this.maxSize = maxSize;
  }

  public get(key: string): RankedResult[] | undefined {
    return this.cache.get(key);
  }

  public set(key: string, results: RankedResult[]): void {
    // Evict oldest entry if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, results);
  }

  public clear(): void {
    this.cache.clear();
  }

  public static createKey(ids: string[]): string {
    return `ids:${ids.slice().sort().join(",")}`;
  }
}
