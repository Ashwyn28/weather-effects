// Deterministic particle randomness from an integer seed.
// lowbias32 by Chris Wellons (hash-prospector, public domain).
export function hash32(x) {
  x = (x ^ (x >>> 16)) >>> 0;
  x = Math.imul(x, 0x7feb352d) >>> 0;
  x = (x ^ (x >>> 15)) >>> 0;
  x = Math.imul(x, 0x846ca68b) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}

// A float in [0, 1) for each seed. `salt` gives independent streams.
export function particleRandom(seed, salt = 0x9e3779b9) {
  return hash32((seed ^ salt) >>> 0) / 4294967296;
}

// The centre of one of `bins` equal bins, for a small set of variants.
export function particleVariant(seed, bins = 8) {
  return (Math.floor(particleRandom(seed) * bins) + .5) / bins;
}
