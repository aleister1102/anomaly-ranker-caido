/**
 * SimHash implementation for fingerprinting response bodies.
 * Based on the SimHash algorithm by Moses Charikar.
 */

export class SimHash {
  private static readonly HASH_BITS = 64;

  private static readonly POPCOUNT_TABLE = new Uint8Array(256).map((_, i) => {
    let count = 0;
    let temp = i;
    while (temp) {
      count += temp & 1;
      temp >>= 1;
    }
    return count;
  });

  /**
   * Computes a 64-bit SimHash fingerprint for the given text.
   */
  public static calculate(text: string): bigint {
    if (!text) return 0n;

    const tokens = this.tokenize(text);
    const v = new Int32Array(this.HASH_BITS);

    for (const token of tokens) {
      const hash = this.hash64(token);
      for (let i = 0; i < this.HASH_BITS; i++) {
        const bit = (hash >> BigInt(i)) & 1n;
        if (bit === 1n) {
          v[i]++;
        } else {
          v[i]--;
        }
      }
    }

    let fingerprint = 0n;
    for (let i = 0; i < this.HASH_BITS; i++) {
      if (v[i] > 0) {
        fingerprint |= (1n << BigInt(i));
      }
    }

    return fingerprint;
  }

  /**
   * Calculates the Hamming distance between two fingerprints.
   */
  public static hammingDistance(h1: bigint, h2: bigint): number {
    let x = h1 ^ h2;
    let distance = 0;
    for (let i = 0; i < 8; i++) {
      distance += this.POPCOUNT_TABLE[Number(x & 0xffn)];
      x >>= 8n;
    }
    return distance;
  }

  /**
   * Tokenizes text into words.
   */
  private static tokenize(text: string): string[] {
    const tokens: string[] = [];
    let start = -1;
    const lower = text.toLowerCase();
    for (let i = 0; i <= lower.length; i++) {
      const c = lower.charCodeAt(i);
      const isWord = (c >= 97 && c <= 122) || (c >= 48 && c <= 57); // a-z, 0-9
      if (isWord && start === -1) {
        start = i;
      } else if (!isWord && start !== -1) {
        tokens.push(lower.slice(start, i));
        start = -1;
      }
    }
    return tokens;
  }

  /**
   * A simple 64-bit hash function (FNV-1a variant).
   */
  private static hash64(str: string): bigint {
    let hash = 0xcbf29ce484222325n;
    for (let i = 0; i < str.length; i++) {
      hash ^= BigInt(str.charCodeAt(i));
      hash *= 0x100000001b3n;
      hash &= 0xffffffffffffffffn;
    }
    return hash;
  }
}
