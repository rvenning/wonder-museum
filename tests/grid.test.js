// The data linter. This is the suite that has to be right, because everything
// it checks is invisible until a child is stuck on a room with a word that
// isn't in it.
//
// 112 hand-authored word lists is far too many to check by eye, and the failure
// mode is silent: a word one letter too long for the grid simply never gets
// placed, and the room becomes impossible to finish. So every campaign board is
// actually dealt here and then READ BACK — the assertion is not "the placer
// said yes", it is "scanning the finished letters finds this word".
//
// Failures are collected into arrays and asserted with deepEqual(fails, []) so
// one run names every offender rather than stopping at the first.

const test = require("node:test");
const assert = require("node:assert");
const S = require("./load.js");

const { Grid, WINGS, LEVELS, DIRSETS, DAILY, RUSH, RNG, UNWANTED } = S;

const seedFor = (idx) => RNG.seedFrom(`wonder-museum|room|${idx}`);
const deals = LEVELS.map((lv) => Grid.deal(
  { cols: lv.cols, rows: lv.rows, dirs: lv.dirs, words: lv.words, secret: lv.secret },
  seedFor(lv.idx),
));

/* ------------------------------------------------------------- the content -- */

test("the museum is 14 wings of 8 rooms", () => {
  assert.equal(WINGS.length, 14);
  assert.deepEqual(WINGS.filter((w) => w.rooms.length !== 8).map((w) => w.name), []);
  assert.equal(LEVELS.length, 112);
});

test("every word is plain uppercase letters, long enough to be worth finding", () => {
  const fails = [];
  for (const lv of LEVELS) {
    for (const w of lv.words.concat(lv.secret ? [lv.secret] : [])) {
      if (!/^[A-Z]{4,}$/.test(w)) fails.push(`${lv.name}: ${w}`);
    }
  }
  assert.deepEqual(fails, []);
});

test("no word is longer than its grid is wide", () => {
  // Wider than the grid and a word can only ever be hidden vertically, which
  // quietly makes the longest words the easiest ones on the board.
  const fails = [];
  for (const lv of LEVELS) {
    for (const w of lv.words.concat([lv.secret])) {
      if (w && w.length > lv.cols) fails.push(`${lv.name}: ${w} (${w.length}) in ${lv.cols} cols`);
    }
  }
  assert.deepEqual(fails, []);
});

test("no room repeats a word, and the curiosity is not on its own list", () => {
  const fails = [];
  for (const lv of LEVELS) {
    const seen = new Set();
    for (const w of lv.words) {
      if (seen.has(w)) fails.push(`${lv.name}: ${w} twice`);
      seen.add(w);
    }
    if (lv.secret && seen.has(lv.secret)) fails.push(`${lv.name}: curiosity ${lv.secret} is on the card`);
  }
  assert.deepEqual(fails, []);
});

test("no word on a card contains another word on the same card", () => {
  // Selecting part of a longer word would credit the shorter one, which is
  // generous but reads as a bug: you drag over CAT, and CATERPILLAR ticks too.
  const fails = [];
  for (const lv of LEVELS) {
    const all = lv.words.concat(lv.secret ? [lv.secret] : []);
    for (const a of all) {
      for (const b of all) {
        if (a === b) continue;
        const rb = b.split("").reverse().join("");
        if (a.includes(b) || a.includes(rb)) fails.push(`${lv.name}: ${b} inside ${a}`);
      }
    }
  }
  assert.deepEqual(fails, []);
});

test("the word count climbs across the museum", () => {
  // The curve is the point of fourteen wings. Five words in the first wing,
  // eleven in the last, and never a step backwards between wings.
  const perWing = WINGS.map((w) => Math.round(w.rooms.reduce((s, r) => s + r.words.length, 0) / 8));
  const fails = [];
  for (let i = 1; i < perWing.length; i++) {
    if (perWing[i] < perWing[i - 1]) fails.push(`wing ${i + 1} (${perWing[i]}) has fewer than wing ${i} (${perWing[i - 1]})`);
  }
  assert.deepEqual(fails, []);
  assert.ok(perWing[0] <= 5, `first wing averages ${perWing[0]} words`);
  assert.ok(perWing[13] >= 10, `last wing averages ${perWing[13]} words`);
});

test("the direction sets only ever get harder", () => {
  const rank = { plain: 0, down: 1, diag: 2, back: 3, all: 4 };
  const fails = [];
  for (let i = 1; i < WINGS.length; i++) {
    if (rank[WINGS[i].dirs] < rank[WINGS[i - 1].dirs]) fails.push(WINGS[i].name);
  }
  assert.deepEqual(fails, []);
  assert.equal(WINGS[0].dirs, "plain");
  assert.equal(WINGS[13].dirs, "all");
});

test("every room has an exhibit and a fact, and no exhibit is used twice", () => {
  const seen = new Map();
  const fails = [];
  for (const lv of LEVELS) {
    if (!lv.exhibit || !lv.fact || !lv.exhibitIcon) fails.push(`${lv.name}: incomplete exhibit`);
    if (seen.has(lv.exhibit)) fails.push(`${lv.exhibit} in both ${seen.get(lv.exhibit)} and ${lv.name}`);
    seen.set(lv.exhibit, lv.name);
  }
  assert.deepEqual(fails, []);
});

/* -------------------------------------------------------------- the boards -- */

test("every campaign room can actually be dealt", () => {
  assert.deepEqual(LEVELS.filter((lv, i) => !deals[i]).map((lv) => lv.name), []);
});

test("every word is really in its grid, readable in one of the allowed directions", () => {
  // The end-to-end check: not "the placer reported success" but "scanning the
  // finished letters back finds it". A word that failed to place, or that was
  // overwritten by a later one, only shows up here.
  const fails = [];
  LEVELS.forEach((lv, i) => {
    const d = deals[i];
    if (!d) return;
    const allowed = DIRSETS[lv.dirs];
    for (const w of lv.words.concat(lv.secret ? [lv.secret] : [])) {
      const hits = Grid.findAll(d.letters, d.cols, d.rows, w);
      if (!hits.length) { fails.push(`${lv.name}: ${w} is not on the board`); continue; }
      // At least one occurrence must run in a direction this wing allows —
      // otherwise the room teaches a rule the board then breaks.
      const ok = hits.some((path) => {
        const dc = (path[1] % d.cols) - (path[0] % d.cols);
        const dr = Math.floor(path[1] / d.cols) - Math.floor(path[0] / d.cols);
        return allowed.some(([a, b]) => a === dc && b === dr);
      });
      if (!ok) fails.push(`${lv.name}: ${w} only appears in a direction this wing does not use`);
    }
  });
  assert.deepEqual(fails, []);
});

test("no authored word contains an unwanted string, forwards or backwards", () => {
  // Worth its own test because the board-level check below cannot be satisfied
  // by re-rolling the fill when the cause is a real word: GOSSIP read backwards
  // spells one of these, so every board that room ever deals carries it and the
  // symptom appears twenty lines away from the cause.
  const fails = [];
  for (const lv of LEVELS) {
    for (const w of lv.words.concat(lv.secret ? [lv.secret] : [])) {
      const rev = w.split("").reverse().join("");
      for (const bad of UNWANTED) {
        if (w.includes(bad) || rev.includes(bad)) fails.push(`${lv.name}: ${w}`);
      }
    }
  }
  assert.deepEqual(fails, []);
});

test("no board spells anything we would rather it did not", () => {
  const fails = [];
  deals.forEach((d, i) => {
    if (!d) return;
    for (const bad of UNWANTED) {
      if (Grid.findAll(d.letters, d.cols, d.rows, bad).length) fails.push(`${LEVELS[i].name}: ${bad}`);
    }
  });
  assert.deepEqual(fails, []);
});

test("boards are dense enough to be a puzzle and loose enough to be a search", () => {
  // All fill and the words stand out; all words and there is nothing to search
  // through. Real word searches sit around half letters-that-matter.
  const fails = [];
  deals.forEach((d, i) => {
    if (!d) return;
    const used = new Set();
    for (const p of d.placed) for (const c of p.cells) used.add(c);
    const density = used.size / (d.cols * d.rows);
    if (density < 0.28 || density > 0.72) fails.push(`${LEVELS[i].name}: ${(density * 100).toFixed(0)}% word letters`);
  });
  assert.deepEqual(fails, []);
});

test("dealing the same room twice gives the identical board", () => {
  // The whole save format depends on this, and so does the Daily being shared.
  const lv = LEVELS[40];
  const spec = { cols: lv.cols, rows: lv.rows, dirs: lv.dirs, words: lv.words, secret: lv.secret };
  const a = Grid.deal(spec, seedFor(lv.idx));
  const b = Grid.deal(spec, seedFor(lv.idx));
  assert.deepEqual(a.letters, b.letters);
  const c = Grid.deal(spec, seedFor(lv.idx) + 1);
  assert.notDeepEqual(a.letters, c.letters);
});

test("par grows with the room and stays in a sane band", () => {
  const fails = [];
  deals.forEach((d, i) => {
    if (!d) return;
    if (d.par < 12 || d.par > 260) fails.push(`${LEVELS[i].name}: par ${d.par}s`);
  });
  assert.deepEqual(fails, []);
  const firstWing = deals.slice(0, 8).reduce((s, d) => s + d.par, 0) / 8;
  const lastWing = deals.slice(104).reduce((s, d) => s + d.par, 0) / 8;
  assert.ok(lastWing > firstWing * 2, `par barely moves: ${firstWing.toFixed(0)}s -> ${lastWing.toFixed(0)}s`);
});

/* -------------------------------------------------- the two timed modes -- */

test("the Daily deals cleanly for a year of dates", () => {
  const fails = [];
  for (let day = 0; day < 365; day += 7) {
    const date = RNG.today(new Date(2026, 7, 13 + day));
    const seed = RNG.seedFrom("wonder-museum|daily|" + date);
    const rng = RNG.sub(seed, "words");
    const pool = [];
    for (const lv of LEVELS) for (const w of lv.words) if (w.length >= 4 && w.length <= DAILY.cols) pool.push(w);
    const words = []; const seen = new Set();
    let guard = 0;
    while (words.length < DAILY.words && guard++ < 600) {
      const w = rng.pick(pool);
      if (seen.has(w)) continue;
      seen.add(w); words.push(w);
    }
    if (words.length !== DAILY.words) { fails.push(`${date}: only ${words.length} words`); continue; }
    const d = Grid.deal({ cols: DAILY.cols, rows: DAILY.rows, dirs: DAILY.dirs, words, secret: null }, seed);
    if (!d) { fails.push(`${date}: undealable`); continue; }
    for (const w of words) if (!Grid.findAll(d.letters, d.cols, d.rows, w).length) fails.push(`${date}: ${w} missing`);
  }
  assert.deepEqual(fails, []);
});

test("every Rush grid a long run can reach is dealable", () => {
  // The escalation must not walk off the end of what the placer can do: nine
  // words in a 12-wide grid is the tightest it ever gets.
  const fails = [];
  for (let n = 0; n <= 20; n++) {
    const cols = RUSH.cols(n), rows = RUSH.rows(n);
    const want = RUSH.words(n);
    const rng = RNG.sub(12345, "rush", n);
    const pool = [];
    for (const lv of LEVELS) for (const w of lv.words) if (w.length <= cols && w.length >= 4) pool.push(w);
    const words = []; const seen = new Set();
    let guard = 0;
    while (words.length < want && guard++ < 500) {
      const w = rng.pick(pool);
      if (seen.has(w)) continue;
      seen.add(w); words.push(w);
    }
    if (words.length !== want) { fails.push(`grid ${n}: only ${words.length}/${want} words`); continue; }
    const d = Grid.deal({ cols, rows, dirs: RUSH.dirsFor(n), words, secret: null }, RNG.subSeed(999, "grid", n, 0));
    if (!d) fails.push(`grid ${n}: undealable (${cols}x${rows}, ${want} words)`);
  }
  assert.deepEqual(fails, []);
});

/* --------------------------------------------------------------- geometry -- */

test("lineCells only accepts the eight straight rays", () => {
  const cols = 6, rows = 6;
  assert.deepEqual(Grid.lineCells(cols, rows, 0, 3), [0, 1, 2, 3]);          // along
  assert.deepEqual(Grid.lineCells(cols, rows, 0, 18), [0, 6, 12, 18]);       // down
  assert.deepEqual(Grid.lineCells(cols, rows, 0, 21), [0, 7, 14, 21]);       // diagonal
  assert.deepEqual(Grid.lineCells(cols, rows, 21, 0), [21, 14, 7, 0]);       // and backwards
  assert.equal(Grid.lineCells(cols, rows, 0, 13), null);                     // knight's move
});

test("a crooked drag snaps to the ray it was closest to", () => {
  const cols = 8, rows = 8;
  const from = 3 * cols + 3;                       // (3,3)
  // Nearly horizontal, one row out.
  assert.equal(Grid.snapEnd(cols, rows, from, 4 * cols + 7), 3 * cols + 7);
  // Nearly vertical, one column out.
  assert.equal(Grid.snapEnd(cols, rows, from, 7 * cols + 4), 7 * cols + 3);
  // An exact diagonal is left alone.
  assert.equal(Grid.snapEnd(cols, rows, from, 7 * cols + 7), 7 * cols + 7);

  // For everything else, assert the two properties that matter rather than an
  // exact cell: the result is always on a legal ray, and never more than one
  // cell from where the finger actually was. Pinning exact indices here means
  // re-deriving the projection by hand in the test, which is how you end up
  // asserting your own arithmetic mistake.
  const fails = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const raw = r * cols + c;
      const snapped = Grid.snapEnd(cols, rows, from, raw);
      if (snapped < 0 || snapped >= cols * rows) { fails.push(`(${c},${r}) left the board`); continue; }
      if (!Grid.lineCells(cols, rows, from, snapped)) fails.push(`(${c},${r}) snapped off any ray`);
      const dc = Math.abs((snapped % cols) - c), dr = Math.abs(Math.floor(snapped / cols) - r);
      if (dc > 1 || dr > 1) fails.push(`(${c},${r}) snapped ${dc},${dr} cells away`);
    }
  }
  assert.deepEqual(fails, []);
});

test("the fill is drawn from the language of the words, not the whole alphabet", () => {
  // Uniform random letters make the hidden words the only vowel-rich runs on
  // the board, which is a giveaway you cannot un-see once you have seen it.
  let vowels = 0, total = 0;
  for (const d of deals) {
    if (!d) continue;
    const used = new Set();
    for (const p of d.placed) for (const c of p.cells) used.add(c);
    for (let i = 0; i < d.letters.length; i++) {
      if (used.has(i)) continue;
      total++;
      if ("AEIOU".includes(d.letters[i])) vowels++;
    }
  }
  const rate = vowels / total;
  assert.ok(rate > 0.22 && rate < 0.48, `filler vowel rate ${(rate * 100).toFixed(1)}%`);
});
