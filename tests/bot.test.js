// Balance bots.
//
// You cannot simulate looking at a grid, so this suite is honest about the
// split: the ENGINE is the real one — every word is claimed through the same
// Game.select() a finger goes through, which is what proves the campaign is
// completable — and only the CLOCK is modelled.
//
// The model is the same one par is computed from, which is the point. What
// makes a word hard to spot is how many other cells share the letter you are
// hunting, so a brain is really just two dials: WHICH letter it hunts (a
// beginner takes the first one, a confident searcher takes the rarest one on
// the board) and how long it dwells on each candidate. Everything else —
// stars, coins, whether the third star is worth having — falls out of those.
//
// CD-style report: `WM_REPORT=1 node --test tests/bot.test.js`. Gate on an
// environment variable, not argv: node --test runs each file in a child
// process and the trailing `-- --report` never arrives.

const test = require("node:test");
const assert = require("node:assert");
const S = require("./load.js");

const { Game, Grid, LEVELS, RUSH, RNG, REWARD, HINTS, starsFor } = S;
const REPORT = !!process.env.WM_REPORT;

const seedFor = (idx) => RNG.seedFrom(`wonder-museum|room|${idx}`);

/* ---------------------------------------------------------------- brains -- */

// `rare`  hunt the least common letter of the word rather than its first
// `care`  seconds spent per candidate, relative to the model par uses
// `noise` how much any one search runs long or short — a wandering attention
// `curio` chance of stumbling on the hidden word while searching for the rest
const BRAINS = {
  // The expert's edge is WHICH letter it hunts, not how fast it thinks. Giving
  // it a shorter dwell as well made it nearly twice as quick as an ordinary
  // player, which no human is, and three-starred the whole museum.
  expert: { rare: true, care: 0.95, noise: 0, curio: 0.75 },
  ordinary: { rare: false, care: 0.92, noise: 0.45, curio: 0.35 },
  child: { rare: false, care: 1.5, noise: 0.8, curio: 0.2 },
};

function findCost(board, word, brain) {
  const s = Grid.SCAN;
  const cand = brain.rare
    ? Grid.rarest(board.letters, word).count
    : Grid.countLetter(board.letters, word[0]);
  let t = (s.read + s.perCandidate * cand) * brain.care;
  // Noise is symmetric about zero so an imperfect searcher is sometimes quick
  // and sometimes slow, rather than uniformly slower than the model.
  if (brain.noise) t *= 1 + brain.noise * (S.__rand() * 2 - 1);
  return Math.max(0.4, t);
}

function playRoom(idx, brainName, seedOffset = 0) {
  const brain = BRAINS[brainName];
  S.__reseed(0x51ee + idx * 131 + seedOffset);   // same seed => same mistakes, whoever asks first
  Game.start({ mode: "room", levelIdx: idx, seed: seedFor(idx) });
  // What the player's first drag would do. Without it the clock never runs and
  // every room comes back at 0 seconds, which reads as a wildly easy campaign.
  Game.started = true;
  Game.tick(Grid.SCAN.base * brain.care);

  let guard = 0;
  while (Game.running() && guard++ < 400) {
    const left = Game.remaining();
    if (!left.length) break;

    // The curiosity has to be taken BEFORE the last word on the card, because
    // finding the last one ends the room there and then. That is a real rule of
    // the game and not a quirk of the bot — the first version of this loop
    // rolled for the curiosity after the loop and scored 0/112 for every brain,
    // which is exactly what a player would have experienced.
    if (left.length === 1 && Game.board.secret && !Game.secretFound && S.__rand() < brain.curio) {
      const p = Game.placementOf(Game.board.secret);
      if (p) { Game.tick(findCost(Game.board, Game.board.secret, brain)); Game.select(p); }
    }

    const word = left[0];
    Game.tick(findCost(Game.board, word, brain));
    const cells = Game.placementOf(word);
    assert.ok(cells, `${LEVELS[idx].name}: no placement for ${word}`);
    Game.select(cells);
  }
  return Game.last;
}

function campaign(brainName) {
  return LEVELS.map((lv) => playRoom(lv.idx, brainName));
}

function table(name, rows) {
  if (!REPORT) return;
  const stars = [0, 0, 0, 0];
  for (const r of rows) stars[r.stars]++;
  const overPar = rows.filter((r) => r.time > r.par);
  console.log(`\n=== ${name} ===`);
  console.log(`  stars  0:${stars[0]}  1:${stars[1]}  2:${stars[2]}  3:${stars[3]}`);
  console.log(`  mean time/par ${(rows.reduce((s, r) => s + r.time / r.par, 0) / rows.length).toFixed(2)}`);
  console.log(`  over par: ${overPar.length}/${rows.length}`);
  console.log(`  curiosities ${rows.filter((r) => r.curiosity).length}/${rows.length}`);
  for (let w = 0; w < 14; w++) {
    const slice = rows.slice(w * 8, w * 8 + 8);
    console.log(`  wing ${String(w + 1).padStart(2)}  par ${(slice.reduce((s, r) => s + r.par, 0) / 8).toFixed(0).padStart(4)}s`
      + `  took ${(slice.reduce((s, r) => s + r.time, 0) / 8).toFixed(0).padStart(4)}s`
      + `  ratio ${(slice.reduce((s, r) => s + r.time / r.par, 0) / 8).toFixed(2)}`
      + `  stars ${slice.reduce((s, r) => s + r.stars, 0)}/24`);
  }
}

/* --------------------------------------------------------- the campaign -- */

const expert = campaign("expert");
const ordinary = campaign("ordinary");
const child = campaign("child");

test("every room in the museum can be finished", () => {
  // The anti-stuck guarantee, and the only one that really matters: a word
  // search has no fail state, so what would end the game is a room holding a
  // word that cannot be claimed. Every claim here goes through the real
  // Game.select(), so this is that check end to end, 112 times.
  const fails = [];
  for (const [name, rows] of [["expert", expert], ["ordinary", ordinary], ["child", child]]) {
    rows.forEach((r, i) => {
      if (!r || !r.cleared) fails.push(`${name}: ${LEVELS[i].name}`);
      else if (r.found !== r.total) fails.push(`${name}: ${LEVELS[i].name} ${r.found}/${r.total}`);
    });
  }
  assert.deepEqual(fails, []);
});

test("a confident searcher beats par everywhere — par is never a wall", () => {
  table("expert", expert);
  // Map to names FIRST: filtering renumbers the index, so mapping afterwards
  // names whichever rooms happen to sit at 0,1,2… and not the ones that failed.
  const over = expert.map((r, i) => (r.time > r.par ? LEVELS[i].name : null)).filter(Boolean);
  assert.deepEqual(over, []);
});

test("the third star is real but has to be earned", () => {
  // If a strong player three-stars everything, the ladder has one rung; if
  // nobody ever gets three, it may as well not exist.
  const expert3 = expert.filter((r) => r.stars === 3).length;
  const child3 = child.filter((r) => r.stars === 3).length;
  assert.ok(expert3 >= 45, `a confident searcher three-stars only ${expert3}/112`);
  assert.ok(child3 <= 25, `a wandering searcher three-stars ${child3}/112 — the top star is free`);
});

test("an ordinary player beats par most of the time", () => {
  table("ordinary", ordinary);
  const two = ordinary.filter((r) => r.stars >= 2).length;
  assert.ok(two >= 70, `only ${two}/112 rooms reach two stars`);
  assert.ok(two <= 108, `${two}/112 rooms reach two stars — par is not asking anything`);
});

test("a wandering searcher still finishes everything, and is slower without being blocked", () => {
  table("child", child);
  assert.deepEqual(child.map((r, i) => (r.stars < 1 ? LEVELS[i].name : null)).filter(Boolean), []);
  const ratio = child.reduce((s, r) => s + r.time / r.par, 0) / child.length;
  assert.ok(ratio > 1.15, `a wandering searcher takes ${ratio.toFixed(2)}x par — par is not measuring anything`);
  assert.ok(ratio < 2.4, `a wandering searcher takes ${ratio.toFixed(2)}x par — the rooms are a slog`);
});

test("doing nothing achieves nothing", () => {
  // The control. In a game with no clock and no fail state, an idle player
  // cannot lose — so the assertion is on results, not on losing: ten minutes of
  // staring at the board finds no words and finishes no room.
  Game.start({ mode: "room", levelIdx: 30, seed: seedFor(30) });
  Game.started = true;
  for (let i = 0; i < 600; i++) Game.tick(1);
  assert.equal(Game.state, "playing");
  assert.equal(Game.foundCount(), 0);
  assert.equal(starsFor(Game.result(false)), 0);
});

test("a random drag almost never spells anything", () => {
  // The other control: flailing is not a strategy. Two thousand random straight
  // drags across a mid-campaign board should turn up a trivial number of words.
  S.__reseed(4242);
  Game.start({ mode: "room", levelIdx: 60, seed: seedFor(60) });
  Game.started = true;
  const n = Game.n;
  for (let i = 0; i < 2000; i++) {
    const a = Math.floor(S.__rand() * n);
    const b = Math.floor(S.__rand() * n);
    Game.selectRay(a, b);
  }
  assert.ok(Game.foundCount() <= 2, `random dragging found ${Game.foundCount()} of ${Game.board.words.length}`);
});

/* -------------------------------------------------------------- the hint -- */

test("a hint finds the word it was paid for, and costs the third star", () => {
  Game.start({ mode: "room", levelIdx: 50, seed: seedFor(50) });
  Game.started = true;
  const before = Game.remaining().length;
  const r = Game.hint("word");
  assert.ok(r, "the whole-word hint returned nothing");
  assert.equal(Game.remaining().length, before - 1, "a whole-word hint must tick the word off");
  // A first-letter hint points without claiming.
  const n = Game.remaining().length;
  const r2 = Game.hint("letter");
  assert.equal(r2.cells.length, 1);
  assert.equal(Game.remaining().length, n, "a first-letter hint must not claim the word");
  assert.equal(starsFor({ cleared: true, mode: "room", time: 1, par: 100, hints: 2 }), 2);
  assert.equal(starsFor({ cleared: true, mode: "room", time: 1, par: 100, hints: 0 }), 3);
});

test("a hint always points at the word the board is hiding best", () => {
  Game.start({ mode: "room", levelIdx: 80, seed: seedFor(80) });
  Game.started = true;
  const worst = Game.hardestRemaining();
  const counts = Game.board.words.map((w) => Grid.countLetter(Game.board.letters, w[0]));
  assert.equal(Grid.countLetter(Game.board.letters, worst[0]), Math.max(...counts));
});

/* --------------------------------------------------------- coin economy -- */

test("hints are affordable but never free", () => {
  // Measured against the run a player actually has: each room played once, in
  // order, banking what that result really paid. "No coins at all" and "every
  // coin in the game" are both situations nobody is ever in.
  let earned = 0;
  ordinary.forEach((r) => {
    earned += REWARD.level(r.stars) + (r.curiosity ? REWARD.curiosity : 0);
  });
  const hints = earned / HINTS.word.cost;
  if (REPORT) console.log(`\n  ordinary run earns ${earned} coins = ${hints.toFixed(0)} whole-word hints over 112 rooms`);
  assert.ok(hints > 20, `only ${hints.toFixed(0)} hints across the whole museum — help is out of reach`);
  assert.ok(hints < 80, `${hints.toFixed(0)} hints for 112 rooms — most of the museum could be bought`);
});

/* --------------------------------------------------------------- rush -- */

function playRush(brainName, seed) {
  const brain = BRAINS[brainName];
  S.__reseed(0x7115 + seed);
  Game.start({ mode: "rush", seed });
  Game.started = true;
  let guard = 0;
  while (Game.running() && guard++ < 4000) {
    const left = Game.remaining();
    if (!left.length) break;
    const word = left[0];
    Game.tick(findCost(Game.board, word, brain));
    if (!Game.running()) break;
    const cells = Game.placementOf(word);
    if (!cells) break;
    Game.select(cells);
  }
  return Game.last;
}

test("Rush always ends on the clock, even for a perfect player", () => {
  // An endless mode bounded by anything other than time never ends for someone
  // who does not make the mistake it is counting.
  const fails = [];
  for (let s = 1; s <= 8; s++) {
    const r = playRush("expert", s * 7919);
    if (!r) { fails.push(`seed ${s}: never finished`); continue; }
    if (Math.abs(r.time - RUSH.seconds) > 0.001) fails.push(`seed ${s}: ended at ${r.time}s`);
  }
  assert.deepEqual(fails, []);
});

test("Rush separates players, and escalates while it does", () => {
  const strong = [1, 2, 3, 4].map((s) => playRush("expert", s * 104729).score);
  const weak = [1, 2, 3, 4].map((s) => playRush("child", s * 104729).score);
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  if (REPORT) console.log(`\n  rush: expert ${mean(strong).toFixed(1)} words, child ${mean(weak).toFixed(1)} words`);
  assert.ok(mean(strong) > mean(weak) * 1.4, `expert ${mean(strong).toFixed(1)} vs child ${mean(weak).toFixed(1)} — Rush does not reward skill`);
  assert.ok(mean(weak) > 4, `a slower player only manages ${mean(weak).toFixed(1)} words — Rush is not for them`);

  // The grids must actually get harder, or a long run is the same puzzle over.
  const r = playRush("expert", 555);
  assert.ok(r.gridsCleared >= 4, `only ${r.gridsCleared} grids cleared in three minutes`);
  assert.ok(RUSH.cols(r.gridsCleared) > RUSH.cols(0), "the grid never widened");
  assert.notEqual(RUSH.dirsFor(r.gridsCleared), RUSH.dirsFor(0), "the directions never got harder");
});

test("doing nothing in Rush scores nothing", () => {
  Game.start({ mode: "rush", seed: 31337 });
  Game.started = true;
  for (let i = 0; i < 400; i++) Game.tick(1);
  assert.equal(Game.state, "won");        // the clock still ends it
  assert.equal(Game.last.score, 0);
});
