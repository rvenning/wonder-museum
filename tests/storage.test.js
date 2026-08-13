// The progress merge.
//
// createStorage keeps blankProgress/mergeProgress in a closure and never
// exposes them, so js/storage.js names them as PROGRESS first and hands that
// object in. This suite loads storage.js on its own with a stub createStorage
// that simply captures the config — which is the only way to test the one
// function in the game that can permanently destroy a save.

const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const { loadScripts } = require("../lib/tools/test-harness.js");

const ROOT = path.join(__dirname, "..");
const noop = () => {};

const S = loadScripts({
  baseDir: ROOT,
  files: ["tests/seed.js", "lib/gk-util.js", "js/rng.js", "js/wings.js", "js/storage.js"],
  exports: ["PROGRESS", "Storage", "LEVELS", "REWARD"],
  browser: true,
  globals: {
    GK: { createStorage: (cfg) => ({ __cfg: cfg }) },
    window: { FIREBASE_CONFIG: {} },
    performance: { now: () => 0 },
    requestAnimationFrame: noop,
  },
});

const { PROGRESS, Storage } = S;
const blank = () => PROGRESS.blank();

// A merge that is order-dependent is a coin toss over which device syncs
// first, so everything below is asserted both ways round.
function both(a, b, check) {
  check(PROGRESS.merge(a, b));
  check(PROGRESS.merge(b, a));
}

test("a blank save has every field the game reads", () => {
  const p = blank();
  for (const k of ["rooms", "coinsEarned", "coinsSpent", "daily", "dailyPlayed",
    "dailyCleared", "bestDaily", "rushBest", "rushRuns", "roomsPlayed", "hintsUsed", "updated"]) {
    assert.ok(k in p, `blank progress is missing ${k}`);
  }
});

test("merging two devices keeps the better of each room", () => {
  const a = blank(); a.rooms = { 3: { stars: 3, time: 40, curiosity: false } };
  const b = blank(); b.rooms = { 3: { stars: 1, time: 22, curiosity: true }, 7: { stars: 2, time: 60 } };
  both(a, b, (m) => {
    assert.equal(m.rooms[3].stars, 3, "stars must keep the best");
    assert.equal(m.rooms[3].time, 22, "time must keep the quickest");
    assert.equal(m.rooms[3].curiosity, true, "a curiosity once found stays found");
    assert.ok(m.rooms[7], "a room only one device has must survive");
  });
});

test("spent coins are never resurrected by a sync", () => {
  // The reason there is no `coins` field anywhere. A balance merged with max()
  // hands back every coin the player has ever spent, the first time two devices
  // meet — and it looks like a bug in the shop, not in the merge.
  const phone = blank(); phone.coinsEarned = 300; phone.coinsSpent = 240;
  const pad = blank(); pad.coinsEarned = 300; pad.coinsSpent = 60;
  both(phone, pad, (m) => {
    assert.equal(Storage.coins(m), 60, "the higher spend must win, so nothing is refunded");
  });
});

test("the daily is decided by the earlier attempt, not the better one", () => {
  const first = blank(); first.daily = { date: "2026-08-13", cleared: false, time: 90, found: 5, total: 8, at: 1000 };
  const later = blank(); later.daily = { date: "2026-08-13", cleared: true, time: 41, found: 8, total: 8, at: 5000 };
  both(first, later, (m) => {
    assert.equal(m.daily.at, 1000, "a second, better-informed go must not replace the first");
    assert.equal(m.daily.cleared, false);
  });

  // A new day is a new puzzle, and yesterday is over.
  const yesterday = blank(); yesterday.daily = { date: "2026-08-12", cleared: true, time: 30, at: 9000 };
  const today = blank(); today.daily = { date: "2026-08-13", cleared: false, time: 80, at: 1 };
  both(yesterday, today, (m) => assert.equal(m.daily.date, "2026-08-13"));
});

test("a best time of zero means never done, not instant", () => {
  const played = blank(); played.bestDaily = 55;
  const fresh = blank();                       // bestDaily 0
  both(played, fresh, (m) => assert.equal(m.bestDaily, 55));

  const quick = blank(); quick.bestDaily = 31;
  both(played, quick, (m) => assert.equal(m.bestDaily, 31));
});

test("a field a newer build added survives an older client's merge", () => {
  const newer = blank(); newer.somethingNew = 7;
  const older = blank();
  assert.equal(PROGRESS.merge(newer, older).somethingNew, 7);
  assert.equal(PROGRESS.merge(older, newer).somethingNew, 7);
});

test("merging is idempotent — syncing twice changes nothing", () => {
  const a = blank();
  a.rooms = { 0: { stars: 2, time: 30, curiosity: true } };
  a.coinsEarned = 90; a.coinsSpent = 20; a.rushBest = 41;
  const once = PROGRESS.merge(a, blank());
  const twice = PROGRESS.merge(once, once);
  assert.deepEqual(twice, once);
});

test("rooms unlock strictly in order, and the last one does not run off the end", () => {
  const p = blank();
  assert.equal(Storage.unlocked(p), 0, "a new visitor starts at the first room");
  p.rooms = { 0: { stars: 1 }, 1: { stars: 1 }, 2: { stars: 1 } };
  assert.equal(Storage.unlocked(p), 3);
  // Clearing a later room out of order (a debug jump, a sync from a device
  // further ahead) must not leave the map pointing past the end of the museum.
  p.rooms[S.LEVELS.length - 1] = { stars: 3 };
  assert.equal(Storage.unlocked(p), S.LEVELS.length - 1);
});

test("stars and exhibits are counted from the rooms, not tracked separately", () => {
  const p = blank();
  p.rooms = { 0: { stars: 3, curiosity: true }, 1: { stars: 2 }, 5: { stars: 1, curiosity: true } };
  assert.equal(Storage.totalStars(p), 6);
  assert.equal(Storage.cleared(p), 3);
  assert.equal(Storage.curiosities(p), 2);
  assert.equal(Storage.campaignDone(p), false);
});
