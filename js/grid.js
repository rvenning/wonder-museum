// Building a board, reading a board, and working out how long it ought to take.
//
// Pure functions over plain arrays — no DOM, no canvas, no Math.random. Every
// board is a function of (spec, seed), which is what lets the Daily Puzzle be
// genuinely the same board for everybody and lets the test suite deal all 112
// campaign boards and check them.
//
// Two decisions worth knowing before reading:
//
// A selection is matched by the LETTERS IT SPELLS, not by where the word was
// hidden. If the filler happens to spell CORAL somewhere else in the grid and a
// player drags across it, that counts. The alternative — insisting on the one
// blessed set of cells — means telling a child who has genuinely found the word
// that she has not, which is the single worst thing this game could do.
//
// Par is computed from the board that was actually dealt, never from a flat
// rate per level. What makes a word hard to spot is how many OTHER cells share
// its first letter, so that is what the estimate counts. A ten-letter word
// starting with X is found instantly; a five-letter word starting with S in a
// grid full of S is the one that costs you the star.

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

// Strings we would rather the random filler did not spell in a children's
// game. Checked in all eight directions after filling; a hit re-rolls the fill.
const UNWANTED = ["ARSE", "CRAP", "DAMN", "SHIT", "FUCK", "PISS", "TWAT", "SLUT", "TITS", "WANK"];

const Grid = {
  /* ------------------------------------------------------------- helpers -- */

  idx(cols, c, r) { return r * cols + c; },
  colOf(cols, i) { return i % cols; },
  rowOf(cols, i) { return Math.floor(i / cols); },

  // The straight ray from cell a to cell b, or null if a and b do not line up
  // on one of the eight directions. This is what turns a drag into a word.
  lineCells(cols, rows, a, b) {
    const c1 = a % cols, r1 = Math.floor(a / cols);
    const c2 = b % cols, r2 = Math.floor(b / cols);
    const dc = c2 - c1, dr = r2 - r1;
    if (dc === 0 && dr === 0) return [a];
    const len = Math.max(Math.abs(dc), Math.abs(dr));
    // Straight only: along, down, or a true 45-degree diagonal.
    if (dc !== 0 && dr !== 0 && Math.abs(dc) !== Math.abs(dr)) return null;
    const sc = Math.sign(dc), sr = Math.sign(dr);
    const out = [];
    for (let k = 0; k <= len; k++) {
      const c = c1 + sc * k, r = r1 + sr * k;
      if (c < 0 || r < 0 || c >= cols || r >= rows) return null;
      out.push(r * cols + c);
    }
    return out;
  },

  // The nearest legal ray end for a drag that is not exactly on one. Without
  // this a selection only registers when the finger happens to land on the
  // perfect diagonal, which on a 27px cell is most of the time not.
  snapEnd(cols, rows, a, b) {
    const c1 = a % cols, r1 = Math.floor(a / cols);
    const c2 = b % cols, r2 = Math.floor(b / cols);
    let dc = c2 - c1, dr = r2 - r1;
    if (dc === 0 && dr === 0) return a;
    const adc = Math.abs(dc), adr = Math.abs(dr);
    // Whichever of the three shapes (along / down / diagonal) the drag is
    // closest to in angle wins, then the length is taken from the longer axis.
    let sc = Math.sign(dc), sr = Math.sign(dr);
    if (adc > adr * 2) sr = 0;
    else if (adr > adc * 2) sc = 0;
    let len = sc && sr ? Math.round((adc + adr) / 2) : Math.max(adc, adr);

    // Shorten the ray to stay on the board — never clamp the endpoint's
    // coordinates. Clamping x and y independently pulls the end OFF the ray
    // (a diagonal running past the top edge came back as a cell that lined up
    // with nothing), and the selection then silently matches no word at all.
    let maxLen = Infinity;
    if (sc > 0) maxLen = Math.min(maxLen, cols - 1 - c1);
    if (sc < 0) maxLen = Math.min(maxLen, c1);
    if (sr > 0) maxLen = Math.min(maxLen, rows - 1 - r1);
    if (sr < 0) maxLen = Math.min(maxLen, r1);
    len = Math.max(0, Math.min(len, maxLen));

    return (r1 + sr * len) * cols + (c1 + sc * len);
  },

  letters(deal, cells) { return cells.map((i) => deal.letters[i]).join(""); },

  /* ---------------------------------------------------------------- deal -- */

  // Place every word, then fill what is left. Returns null if the words could
  // not all be placed in this many tries, so the caller can reseed rather than
  // hand out a board with a word missing from it.
  place(cols, rows, dirs, words, rng, tries = 260) {
    const n = cols * rows;
    const dirList = typeof dirs === "string" ? DIRSETS[dirs] : dirs;

    for (let attempt = 0; attempt < tries; attempt++) {
      const cells = new Array(n).fill("");
      const placed = [];
      // Longest first: the hardest word to fit should choose from an empty
      // grid, not from whatever is left after the short ones have scattered.
      const order = words.slice().sort((a, b) => b.length - a.length);
      let ok = true;

      for (const word of order) {
        const spots = [];
        for (const [dc, dr] of dirList) {
          const maxC = dc > 0 ? cols - word.length : dc < 0 ? cols - 1 : cols - 1;
          const minC = dc < 0 ? word.length - 1 : 0;
          const maxR = dr > 0 ? rows - word.length : dr < 0 ? rows - 1 : rows - 1;
          const minR = dr < 0 ? word.length - 1 : 0;
          for (let r = minR; r <= maxR; r++) {
            for (let c = minC; c <= maxC; c++) {
              let fits = true, overlap = 0;
              const path = [];
              for (let k = 0; k < word.length; k++) {
                const cc = c + dc * k, rr = r + dr * k;
                if (cc < 0 || rr < 0 || cc >= cols || rr >= rows) { fits = false; break; }
                const i = rr * cols + cc;
                const cur = cells[i];
                if (cur && cur !== word[k]) { fits = false; break; }
                if (cur) overlap++;
                path.push(i);
              }
              if (fits) spots.push({ path, overlap });
            }
          }
        }
        if (!spots.length) { ok = false; break; }

        // A light pull toward overlapping placements. Crossing words are what
        // makes a word search look like one rather than like a word list
        // sprinkled over noise, and they leave more room for the long entries.
        const best = Math.max(...spots.map((s) => s.overlap));
        const pool = spots.filter((s) => s.overlap >= Math.min(best, 1));
        const pick = rng.pick(pool.length ? pool : spots);
        pick.path.forEach((i, k) => { cells[i] = word[k]; });
        placed.push({ word, cells: pick.path });
      }

      if (ok) return { cells, placed };
    }
    return null;
  },

  // Fill the gaps from the letters the words themselves used. Uniform random
  // letters make the hidden words stand out as the only vowel-rich runs on the
  // board — the fill has to look like it came from the same language.
  fill(cells, rng) {
    const bag = [];
    for (const ch of cells) if (ch) bag.push(ch);
    // A little of the whole alphabet as well, or a board of one topic ends up
    // repeating six letters and reads as a pattern.
    for (const ch of ALPHABET) bag.push(ch);
    const out = cells.slice();
    for (let i = 0; i < out.length; i++) if (!out[i]) out[i] = rng.pick(bag);
    return out;
  },

  // Anything in UNWANTED spelled anywhere on the finished board, in any
  // direction. Returns the offending cells so a re-roll knows what to disturb.
  unwanted(letters, cols, rows) {
    for (const bad of UNWANTED) {
      const hits = this.findAll(letters, cols, rows, bad);
      if (hits.length) return hits[0];
    }
    return null;
  },

  deal(spec, seed) {
    const { cols, rows, dirs } = spec;
    const words = spec.words.slice();
    const all = spec.secret ? words.concat([spec.secret]) : words;

    let put = null;
    for (let a = 0; a < 8 && !put; a++) put = this.place(cols, rows, dirs, all, RNG.sub(seed, "place", a));
    if (!put) return null;

    let letters = null;
    for (let a = 0; a < 12; a++) {
      const candidate = this.fill(put.cells, RNG.sub(seed, "fill", a));
      if (!this.unwanted(candidate, cols, rows)) { letters = candidate; break; }
    }
    // Twelve re-rolls without a clean fill has never happened; if it ever does,
    // blanking the offending run is better than shipping it.
    if (!letters) {
      letters = this.fill(put.cells, RNG.sub(seed, "fill", 99));
      let bad;
      while ((bad = this.unwanted(letters, cols, rows))) {
        const i = bad[bad.length - 1];
        if (put.cells[i]) break;        // part of a real word: leave it alone
        letters[i] = "E";
      }
    }

    const deal = {
      cols, rows, dirs, seed, letters,
      words: spec.words.slice(),
      secret: spec.secret || null,
      placed: put.placed,
    };
    deal.par = this.parFor(deal);
    return deal;
  },

  /* --------------------------------------------------------------- reading -- */

  // Every place a word appears on the board, in any of the eight directions.
  // Used by the linter (is it really in there?) and by the hint system.
  findAll(letters, cols, rows, word) {
    const out = [];
    const n = word.length;
    if (!n) return out;
    for (const [dc, dr] of DIRSETS.all) {
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const endC = c + dc * (n - 1), endR = r + dr * (n - 1);
          if (endC < 0 || endR < 0 || endC >= cols || endR >= rows) continue;
          const path = [];
          let ok = true;
          for (let k = 0; k < n; k++) {
            const i = (r + dr * k) * cols + (c + dc * k);
            if (letters[i] !== word[k]) { ok = false; break; }
            path.push(i);
          }
          if (ok) out.push(path);
        }
      }
    }
    return out;
  },

  /* ------------------------------------------------------------------ par -- */

  // How many cells on the board carry a given letter.
  countLetter(letters, ch) {
    let n = 0;
    for (const c of letters) if (c === ch) n++;
    return n;
  },

  // The letter of `word` that appears least often on this board. A confident
  // searcher hunts the rare letter (the Q, the X, the double L); a beginner
  // hunts the first one. The two together are the skill range of the genre.
  rarest(letters, word) {
    let best = word[0], bestN = Infinity;
    for (const ch of word) {
      const n = this.countLetter(letters, ch);
      if (n < bestN) { bestN = n; best = ch; }
    }
    return { ch: best, count: bestN };
  },

  // Seconds a search is expected to take, derived from this board.
  // `read` is the beat of taking a word off the list and holding it in mind;
  // `perCandidate` is the cost of eyeing up one cell that could be its start.
  SCAN: { base: 7, read: 1.9, perCandidate: 0.62 },

  scanEstimate(deal, mode = "first") {
    const s = this.SCAN;
    let t = s.base;
    for (const w of deal.words) {
      const cand = mode === "rare"
        ? this.rarest(deal.letters, w).count
        : this.countLetter(deal.letters, w[0]);
      t += s.read + s.perCandidate * cand;
    }
    return t;
  },

  // Par IS the model's time for a searcher working from first letters, with no
  // multiplier on top. Two stars means beating the model; three means beating
  // it by a clear margin without buying help.
  //
  // It was calibrated against the bots rather than guessed: an ordinary
  // searcher lands around 0.9 of it (so par is usually but not always beaten),
  // a confident one who hunts the rare letter instead lands around 0.65, and a
  // wandering one around 1.5. Tightening it by the 0.82 it started at put the
  // ordinary player over par in 102 rooms out of 112, which is not a par, it is
  // a wall.
  parFor(deal) {
    return Math.round(this.scanEstimate(deal, "first") * 10) / 10;
  },
};

if (typeof window === "undefined") Object.assign(globalThis, { Grid, ALPHABET, UNWANTED });
