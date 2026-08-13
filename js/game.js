// The engine. Selecting, matching, the clock, hints, and the terminal checks.
//
// Nothing in here touches the DOM or a canvas, which is what lets the test bots
// play the real game headlessly — every balance number in tests/bot.test.js
// comes from this file rather than from a model of it.
//
// Three decisions worth knowing before reading:
//
// A campaign room cannot be LOST. This is the relaxed format on purpose: the
// pressure lives in par and in the two timed modes, not in a fail state. What
// that costs is the usual difficulty dial, so the star ladder has to carry it —
// one star for finishing, two for beating a par computed from the board you
// were actually dealt, three for beating it comfortably without a hint.
//
// A selection is judged on the letters it spells, in either direction. Dragging
// from the last letter to the first is how half of all words get found, and a
// child who has plainly found CORAL must never be told she has not.
//
// Rush deals a fresh grid the moment one is cleared, inside the same run. The
// clock is the only thing that ends it, so a perfect player cannot run out of
// board — and because each grid is a little wider than the last, a strong run
// is not just the same puzzle done faster.

const Game = {
  events: [],       // drained by the renderer; the engine never draws
  active: false,    // set from the screen change hook

  start(cfg) {
    this.mode = cfg.mode || "room";          // room | daily | rush
    this.levelIdx = cfg.levelIdx ?? -1;
    this.date = cfg.date || null;
    this.seed = cfg.seed ?? Math.floor(Math.random() * 0xffffffff);

    this.state = "playing";
    this.started = false;                    // the clock waits for the first drag
    this.paused = false;
    this.elapsed = 0;
    this.hints = 0;
    this.score = 0;                          // rush: words found across all grids
    this.gridsCleared = 0;
    this.curiosityAlready = !!cfg.curiosityAlready;
    this.events.length = 0;

    this.deal(cfg.spec || this.specFor());
    return this;
  },

  // What board this mode wants next. Rush is the only mode that asks twice.
  specFor() {
    if (this.mode === "rush") {
      const c = this.gridsCleared;
      return {
        cols: RUSH.cols(c), rows: RUSH.rows(c), dirs: RUSH.dirsFor(c),
        words: this.rushWords(c), secret: null,
      };
    }
    const lv = LEVELS[this.levelIdx];
    return { cols: lv.cols, rows: lv.rows, dirs: lv.dirs, words: lv.words, secret: lv.secret };
  },

  // Rush pulls its words from the whole museum, so a run is a tour rather than
  // one wing over and over. Drawn by grid index, never from a running stream,
  // so a replayed seed deals the identical run.
  rushWords(gridNo) {
    const rng = RNG.sub(this.seed, "rush", gridNo);
    const want = RUSH.words(gridNo);
    const cap = RUSH.cols(gridNo);
    const pool = [];
    for (const lv of LEVELS) for (const w of lv.words) if (w.length <= cap && w.length >= 4) pool.push(w);
    const out = [];
    const seen = new Set();
    let guard = 0;
    while (out.length < want && guard++ < 500) {
      const w = rng.pick(pool);
      if (seen.has(w)) continue;
      seen.add(w);
      out.push(w);
    }
    return out;
  },

  deal(spec) {
    let d = null;
    for (let a = 0; a < 6 && !d; a++) d = Grid.deal(spec, RNG.subSeed(this.seed, "grid", this.gridsCleared, a));
    // Grid.deal only fails if the words genuinely cannot be fitted, which the
    // level linter rules out for the campaign; rush composes its own lists, so
    // it drops the longest word and tries again rather than ending the run.
    if (!d && spec.words.length > 2) {
      const shorter = { ...spec, words: spec.words.slice().sort((a, b) => a.length - b.length).slice(0, spec.words.length - 1) };
      return this.deal(shorter);
    }
    this.board = d;
    this.cols = d.cols; this.rows = d.rows; this.n = d.cols * d.rows;
    this.found = new Map();          // word -> cells
    this.secretFound = false;
    this.revealed = new Set();       // cells belonging to something found
    this.par = d.par;
    this.events.push({ type: "deal" });
    return d;
  },

  /* -------------------------------------------------------------- state -- */

  running() { return this.state === "playing"; },
  clock() { return this.elapsed; },
  timeLeft() { return this.mode === "rush" ? Math.max(0, RUSH.seconds - this.elapsed) : 0; },
  remaining() { return this.board.words.filter((w) => !this.found.has(w)); },
  foundCount() { return this.board.words.filter((w) => this.found.has(w)).length; },

  tick(dt) {
    if (this.state !== "playing" || this.paused || !this.started) return;
    this.elapsed += dt;
    // The clock is the only thing that can end a Rush, and this is the one path
    // every driver goes through — the frame loop and the headless bots alike.
    if (this.mode === "rush" && this.elapsed >= RUSH.seconds) {
      this.elapsed = RUSH.seconds;
      this.state = "won";
      this.events.push({ type: "rushend" });
      this.finish(true);
    }
  },

  /* --------------------------------------------------------------- play -- */

  // The renderer hands in two cell indices; everything else follows from the
  // board. Returns what happened so the caller can react without re-deriving it.
  selectRay(a, b) {
    const cells = Grid.lineCells(this.cols, this.rows, a, b);
    if (!cells) return { hit: null, reason: "notstraight" };
    return this.select(cells);
  },

  select(cells) {
    if (this.state !== "playing" || this.paused) return { hit: null, reason: "over" };
    if (!cells || cells.length < 2) return { hit: null, reason: "short" };
    this.started = true;

    const fwd = Grid.letters(this.board, cells);
    const rev = fwd.split("").reverse().join("");

    // Already found: say so warmly rather than silently doing nothing, or a
    // player re-finding a word thinks the drag did not register.
    for (const [w, cs] of this.found) {
      if (w === fwd || w === rev) return { hit: w, already: true, cells: cs };
    }
    if (this.secretFound && this.board.secret && (fwd === this.board.secret || rev === this.board.secret)) {
      return { hit: this.board.secret, already: true, secret: true, cells };
    }

    for (const w of this.board.words) {
      if (this.found.has(w)) continue;
      if (w === fwd || w === rev) return this.take(w, cells, false);
    }
    if (this.board.secret && !this.secretFound && (fwd === this.board.secret || rev === this.board.secret)) {
      return this.take(this.board.secret, cells, true);
    }

    this.events.push({ type: "miss", cells });
    Sfx.miss();
    return { hit: null, reason: "nomatch", cells };
  },

  take(word, cells, secret) {
    if (secret) this.secretFound = true;
    else this.found.set(word, cells);
    for (const i of cells) this.revealed.add(i);
    if (this.mode === "rush") this.score++;
    this.events.push({ type: "found", word, cells, secret });
    if (secret) Sfx.curiosity(); else Sfx.found(this.foundCount());
    this.checkCleared();
    return { hit: word, cells, secret, taken: true };
  },

  /* -------------------------------------------------------------- hints -- */

  // Where a word is hidden, according to the placement rather than to wherever
  // the filler happens to repeat it — the hint should point at the one the
  // board was built around.
  placementOf(word) {
    const p = this.board.placed.find((x) => x.word === word);
    if (p) return p.cells;
    const all = Grid.findAll(this.board.letters, this.cols, this.rows, word);
    return all.length ? all[0] : null;
  },

  // Both hints pick the word with the MOST candidate cells sharing its first
  // letter — the one the board is actually hiding best, not simply the first
  // one left on the list.
  hardestRemaining() {
    const left = this.remaining();
    if (!left.length) return null;
    let best = left[0], bestN = -1;
    for (const w of left) {
      const n = Grid.countLetter(this.board.letters, w[0]);
      if (n > bestN) { bestN = n; best = w; }
    }
    return best;
  },

  hint(kind) {
    if (this.state !== "playing" || this.paused) return null;
    const word = this.hardestRemaining();
    if (!word) return null;
    const cells = this.placementOf(word);
    if (!cells) return null;
    this.hints++;
    this.started = true;
    const show = kind === "word" ? cells : [cells[0]];
    this.events.push({ type: "hint", kind, word, cells: show });
    Sfx.hint();
    // A whole-word hint is a find, not a nudge: leaving it unticked would mean
    // paying 45 coins and still having to drag over letters already lit up.
    if (kind === "word") this.take(word, cells, false);
    return { word, cells: show };
  },

  /* ----------------------------------------------------------- terminal -- */

  // Every driver passes through here — the pointer handler, the hint, the bots.
  checkCleared() {
    if (this.state !== "playing") return false;
    if (this.remaining().length) return false;

    if (this.mode === "rush") {
      this.gridsCleared++;
      this.score += 2;                       // a small bounty for clearing one
      this.events.push({ type: "gridclear", n: this.gridsCleared });
      Sfx.gridClear();
      this.deal(this.specFor());
      return false;
    }

    this.state = "won";
    this.events.push({ type: "win" });
    Sfx.clear();
    this.finish(true);
    return true;
  },

  result(cleared) {
    const res = {
      mode: this.mode, levelIdx: this.levelIdx, date: this.date, seed: this.seed,
      cleared, time: Math.round(this.clock() * 10) / 10, par: this.par,
      found: this.foundCount(), total: this.board.words.length,
      curiosity: this.secretFound, curiosityAlready: this.curiosityAlready,
      hints: this.hints, cols: this.cols, rows: this.rows,
      score: this.score, gridsCleared: this.gridsCleared,
    };
    res.stars = starsFor(res);
    return res;
  },

  finish(cleared) {
    this.last = this.result(cleared);
    if (typeof App !== "undefined" && App.roomOver) App.roomOver(this.last);
    return this.last;
  },

  quit() {
    this.state = "quit";
    if (typeof App !== "undefined" && App.roomOver) App.roomOver(null);
  },
};

// One star for finding every word, two for beating the board's own par, three
// for beating it comfortably with no hint spent. The third has its own, tighter
// threshold rather than piggy-backing on the second: without that, anybody who
// never buys a hint gets two and three at the same instant, and the ladder has
// only two rungs.
function starsFor(res) {
  if (!res.cleared || res.mode === "rush") return 0;
  let s = 1;
  if (res.time <= res.par) s = 2;
  if (s === 2 && res.time <= res.par * 0.7 && res.hints === 0) s = 3;
  return s;
}

if (typeof window === "undefined") Object.assign(globalThis, { Game, starsFor });
