// Persistence — gamekit storage configured for Wonder Museum.
// wm_* localStorage keys, "wondermuseum" Firestore collection.
//
// Everything saved here is monotonic except one field, which is why the merge
// is worth reading rather than skimming:
//
//   rooms      best of each: more stars, quicker time, and a curiosity once
//              found stays found.
//   coins      NOT a balance. `coinsEarned` and `coinsSpent` are separate
//              counters, each max()-merged, and the balance is derived. A
//              stored balance max()-merged across two devices resurrects every
//              coin the player has ever spent, the first time they meet.
//   daily      one attempt a day, so two devices meeting must not let a
//              second, better-informed go quietly replace the first. The
//              record carries when it was set and the EARLIER one wins.
//
// blank/merge are named before being handed to createStorage, because
// createStorage keeps them in a closure and never exposes them, and merge is
// the one function here that can permanently destroy a save.

const PROGRESS = {
  blank: () => ({
    rooms: {},          // { [levelIdx]: { stars, time, curiosity } }
    coinsEarned: 0,
    coinsSpent: 0,
    daily: null,        // { date, cleared, time, found, total, at }
    dailyPlayed: 0,
    dailyCleared: 0,
    bestDaily: 0,       // quickest Daily Puzzle ever cleared, in seconds
    rushBest: 0,        // most words in one three-minute Rush
    rushRuns: 0,
    roomsPlayed: 0,
    hintsUsed: 0,
    updated: 0,
  }),

  merge: (a, b) => {
    const rooms = { ...(a.rooms || {}) };
    for (const [idx, r] of Object.entries(b.rooms || {})) {
      const cur = rooms[idx];
      if (!cur) { rooms[idx] = r; continue; }
      rooms[idx] = {
        stars: Math.max(cur.stars || 0, r.stars || 0),
        time: Math.min(cur.time || 1e9, r.time || 1e9),
        curiosity: !!(cur.curiosity || r.curiosity),
      };
    }

    let daily = a.daily || null;
    if (b.daily) {
      if (!daily) daily = b.daily;
      else if (b.daily.date > daily.date) daily = b.daily;
      else if (b.daily.date === daily.date && (b.daily.at || 0) < (daily.at || 0)) daily = b.daily;
    }

    // "Best" for a time means the smaller one, but only once there is one at
    // all — a zero here means never done, not instantaneous.
    const quicker = (x, y) => (x > 0 && y > 0 ? Math.min(x, y) : Math.max(x || 0, y || 0));

    return {
      // Spread first so a field a newer build added survives an older client's
      // merge, then pin everything we know how to reconcile.
      ...a, ...b,
      rooms, daily,
      coinsEarned: Math.max(a.coinsEarned || 0, b.coinsEarned || 0),
      coinsSpent: Math.max(a.coinsSpent || 0, b.coinsSpent || 0),
      dailyPlayed: Math.max(a.dailyPlayed || 0, b.dailyPlayed || 0),
      dailyCleared: Math.max(a.dailyCleared || 0, b.dailyCleared || 0),
      bestDaily: quicker(a.bestDaily || 0, b.bestDaily || 0),
      rushBest: Math.max(a.rushBest || 0, b.rushBest || 0),
      rushRuns: Math.max(a.rushRuns || 0, b.rushRuns || 0),
      roomsPlayed: Math.max(a.roomsPlayed || 0, b.roomsPlayed || 0),
      hintsUsed: Math.max(a.hintsUsed || 0, b.hintsUsed || 0),
    };
  },
};

const Storage = GK.createStorage({
  prefix: "wm",
  collection: "wondermuseum",
  firebaseConfig: window.FIREBASE_CONFIG,
  blankProgress: PROGRESS.blank,
  mergeProgress: PROGRESS.merge,
});

Object.assign(Storage, {
  coins(p) { return Math.max(0, (p.coinsEarned || 0) - (p.coinsSpent || 0)); },

  totalStars(p) {
    return Object.values(p.rooms || {}).reduce((s, r) => s + (r.stars || 0), 0);
  },

  cleared(p) { return Object.keys(p.rooms || {}).length; },

  curiosities(p) {
    return Object.values(p.rooms || {}).filter((r) => r.curiosity).length;
  },

  // Rooms open in order: the one after the deepest you have finished.
  unlocked(p) {
    let max = -1;
    for (const k of Object.keys(p.rooms || {})) max = Math.max(max, Number(k));
    return Math.min(max + 1, LEVELS.length - 1);
  },

  wingOpen(p, wingIdx) { return this.unlocked(p) >= wingIdx * 8; },

  campaignDone(p) { return this.cleared(p) >= LEVELS.length; },

  award(prog, n) { prog.coinsEarned = (prog.coinsEarned || 0) + n; return prog; },

  spend(profileId, n) {
    const prog = this.getProgress(profileId);
    if (this.coins(prog) < n) return null;
    prog.coinsSpent = (prog.coinsSpent || 0) + n;
    prog.hintsUsed = (prog.hintsUsed || 0) + 1;
    this.saveProgress(profileId, prog);
    return prog;
  },

  recordRoom(profileId, res) {
    const prog = this.getProgress(profileId);
    prog.roomsPlayed = (prog.roomsPlayed || 0) + 1;
    if (res.cleared) {
      const cur = prog.rooms[res.levelIdx];
      if (!cur) prog.rooms[res.levelIdx] = { stars: res.stars, time: res.time, curiosity: !!res.curiosity };
      else {
        cur.stars = Math.max(cur.stars || 0, res.stars);
        cur.time = Math.min(cur.time || 1e9, res.time);
        cur.curiosity = !!(cur.curiosity || res.curiosity);
      }
      this.award(prog, REWARD.level(res.stars) + (res.curiosity && !res.curiosityAlready ? REWARD.curiosity : 0));
    }
    this.saveProgress(profileId, prog);
    return prog;
  },

  recordRush(profileId, res) {
    const prog = this.getProgress(profileId);
    prog.rushRuns = (prog.rushRuns || 0) + 1;
    prog.rushBest = Math.max(prog.rushBest || 0, res.score);
    this.award(prog, res.score * REWARD.rushWord);
    this.saveProgress(profileId, prog);
    return prog;
  },

  /* -------------------------------------------------------- daily puzzle -- */

  dailyFor(p, date) { return p.daily && p.daily.date === date ? p.daily : null; },

  recordDaily(profileId, res, now = Date.now()) {
    const prog = this.getProgress(profileId);
    if (prog.daily && prog.daily.date === res.date) return prog;   // one attempt, already taken
    prog.daily = {
      date: res.date, cleared: !!res.cleared, time: res.time,
      found: res.found, total: res.total, at: now,
    };
    prog.dailyPlayed = (prog.dailyPlayed || 0) + 1;
    if (res.cleared) {
      prog.dailyCleared = (prog.dailyCleared || 0) + 1;
      if (!prog.bestDaily || res.time < prog.bestDaily) prog.bestDaily = res.time;
      this.award(prog, REWARD.dailyClear);
    }
    this.saveProgress(profileId, prog);
    return prog;
  },

  // Today's standings across the family — everybody played the same grid, so
  // this is the one number in the campaign that compares directly.
  dailyBoard(date) {
    const rows = [];
    for (const p of this.getProfiles()) {
      const d = this.getProgress(p.id).daily;
      if (d && d.date === date) rows.push({ profile: p, entry: d });
    }
    return rows.sort((x, y) =>
      (y.entry.cleared ? 1 : 0) - (x.entry.cleared ? 1 : 0)
      || (y.entry.found || 0) - (x.entry.found || 0)
      || x.entry.time - y.entry.time);
  },
});
