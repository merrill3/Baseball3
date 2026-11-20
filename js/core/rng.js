// Seeded random numbers whose state can be saved and restored. Logic file: no DOM.
// All randomness in js/core/ goes through a B3.rng object passed in by the caller; nothing has a default
// generator, so a seed fixes every result. (Baseball1's lesson: a missed unseeded call made bugs unrepeatable.)
// Generator: sfc32 (128-bit state), seeded by hashing the seed's text with cyrb128.
(function (root) {
  'use strict';
  const B3 = root.B3 = root.B3 || {};

  // Hashes a string into four 32-bit words.
  function hash128(str) {
    let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
    for (let i = 0; i < str.length; i++) {
      const k = str.charCodeAt(i);
      h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
      h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
      h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
      h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
    }
    h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
    h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
    h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
    h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
    h1 ^= (h2 ^ h3 ^ h4); h2 ^= h1; h3 ^= h1; h4 ^= h1;
    return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
  }

  function Rng(state) {
    this.load(state);
  }

  Rng.prototype = {
    // A 32-bit unsigned integer.
    uint32: function () {
      const t = (((this.a + this.b) | 0) + this.d) | 0;
      this.d = (this.d + 1) | 0;
      this.a = this.b ^ (this.b >>> 9);
      this.b = (this.c + (this.c << 3)) | 0;
      this.c = (this.c << 21) | (this.c >>> 11);
      this.c = (this.c + t) | 0;
      return t >>> 0;
    },
    // A number in [0, 1).
    next: function () { return this.uint32() / 4294967296; },
    // An integer in [0, n).
    int: function (n) { return Math.floor(this.next() * n); },
    // A number in [lo, hi).
    range: function (lo, hi) { return lo + (hi - lo) * this.next(); },
    // True with probability p.
    chance: function (p) { return this.next() < p; },
    // A normal draw (Box-Muller; no cached second value, so the state stays four words).
    normal: function (mean, sd) {
      const u = 1 - this.next(); // (0, 1], so log is finite
      const v = this.next();
      const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
      return (mean || 0) + (sd === undefined ? 1 : sd) * z;
    },
    // One item of an array.
    pick: function (arr) { return arr[this.int(arr.length)]; },
    // An index chosen by weight: weights is an array of non-negative numbers.
    weighted: function (weights) {
      let total = 0;
      for (let i = 0; i < weights.length; i++) total += weights[i];
      let x = this.next() * total;
      for (let i = 0; i < weights.length; i++) {
        x -= weights[i];
        if (x < 0) return i;
      }
      return weights.length - 1;
    },
    // The state as plain data (four 32-bit words), safe to put in a save.
    save: function () { return [this.a >>> 0, this.b >>> 0, this.c >>> 0, this.d >>> 0]; },
    // Replaces the state with one from save().
    load: function (state) {
      if (!Array.isArray(state) || state.length !== 4 ||
          !state.every((w) => Number.isInteger(w) && w >= 0 && w <= 4294967295)) {
        throw new Error('B3.rng: a state is four integers from 0 to 4294967295');
      }
      this.a = state[0] | 0; this.b = state[1] | 0; this.c = state[2] | 0; this.d = state[3] | 0;
      return this;
    }
  };

  B3.rng = {
    // A new generator. The seed is a number or a string; create(7) and create('7') are the same.
    create: function (seed) {
      if (typeof seed !== 'number' && typeof seed !== 'string') {
        throw new Error('B3.rng.create: the seed must be a number or a string');
      }
      const r = new Rng(hash128(String(seed)));
      for (let i = 0; i < 12; i++) r.uint32(); // mix the seed in
      return r;
    },
    // A generator that continues from a saved state.
    restore: function (state) { return new Rng(state); },
    // True for an object made by create or restore.
    is: function (x) { return x instanceof Rng; }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
