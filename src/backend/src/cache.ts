
export class ResultsCache<T> {
  private cache = new Map<string, T>();
  private readonly maxSize: number;

  constructor(maxSize = 500) {
    this.maxSize = maxSize;
  }

  public get(key: string): T | undefined {
    return this.cache.get(key);
  }

  public set(key: string, results: T): void {
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
