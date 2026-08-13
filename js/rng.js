// Deterministic randomness for laying out grids.
//
// The rule the family games follow: never draw from a running stream. Derive a
// generator from what the draw is FOR — RNG.sub(seed, "fill", wordIndex) — so
// nothing depends on how much was generated before it.
//
// Here it buys two things. A level's grid is a pure function of (level, seed),
// so a saved result can name the board it came from; and the Daily Puzzle is a
// function of the date alone, which is what makes everyone's time comparable —
// same letters, same words, same hiding places, whatever order anybody plays in.

const RNG = {
  // FNV-1a: any string to a 32-bit seed. "2026-08-13" is today's puzzle.
  seedFrom(str) {
    const s = String(str);
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  },

  make(seed = 0) {
    let a = seed >>> 0;
    const next = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    next.int = (lo, hi) => Math.floor(lo + next() * (hi - lo + 1));
    next.pick = (arr) => arr[Math.floor(next() * arr.length)];
    // Fisher-Yates on a copy, so a caller can shuffle without owning the array.
    next.shuffle = (arr) => {
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    };
    return next;
  },

  // The derived SEED, as an integer. Anything that passes a seed on to another
  // generator wants this rather than `sub(...)()` — that returns a float in
  // [0,1), which the next `^` truncates to 0, silently collapsing every board
  // in the game onto the same one.
  subSeed(seed, ...parts) {
    return (seed ^ RNG.seedFrom(parts.join("|"))) >>> 0;
  },

  sub(seed, ...parts) {
    return RNG.make(RNG.subSeed(seed, ...parts));
  },

  // Today's date on the player's own calendar — that is the puzzle they get.
  today(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  },
};

if (typeof window === "undefined") Object.assign(globalThis, { RNG });
