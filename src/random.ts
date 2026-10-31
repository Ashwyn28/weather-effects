// Deterministic particle randomness from an integer seed.
// lowbias32 by Chris Wellons (hash-prospector, public domain).

/**
 * Hashes a 32-bit integer to another well-mixed 32-bit integer.
 *
 * @param x - The integer to hash.
 * @returns An unsigned 32-bit integer.
 */
export function hash32(x: number): number {
  x = (x ^ (x >>> 16)) >>> 0;
  x = Math.imul(x, 0x7feb352d) >>> 0;
  x = (x ^ (x >>> 15)) >>> 0;
  x = Math.imul(x, 0x846ca68b) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}

/**
 * A float in [0, 1) for each seed. The same seed and salt always give the same value.
 *
 * @param seed - Integer seed.
 * @param salt - Selects an independent stream. Defaults to `0x9e3779b9`.
 * @returns A number in [0, 1).
 */
export function particleRandom(seed: number, salt = 0x9e3779b9): number {
  return hash32((seed ^ salt) >>> 0) / 4294967296;
}

/**
 * The centre of one of `bins` equal bins, for choosing among a small set of variants.
 *
 * @param seed - Integer seed.
 * @param bins - Number of equal bins in (0, 1). Defaults to 8.
 * @returns The bin centre, in (0, 1).
 */
export function particleVariant(seed: number, bins = 8): number {
  return (Math.floor(particleRandom(seed) * bins) + 0.5) / bins;
}
