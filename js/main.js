// App shell — splash, roster, the museum map, the two timed modes, the exhibit
// album, results and the family leaderboard. Profiles, PINs, sync and install
// all come from gamekit; this file only decides what goes on each screen.

const AVATARS = ["🦕", "🏺", "🚀", "🦉", "🐙", "🦋", "🐝", "🦊", "🐼", "🧭", "🎺", "🐉"];

const App = {
  profile: null,

  el(id) { return document.getElementById(id); },

  init() {
    const settings = Storage.getSettings();
    Sfx.enabled = settings.sound !== false;

    GK.UI.onScreenChange = (name) => {
      Game.active = name === "game";
      if (name !== "game") Engine.stop();
      if (name === "splash") this.refreshSplash();
    };
    GK.UI.bindSoundToggle(Storage);

    GK.Profiles.init({
      storage: Storage,
      avatars: AVATARS,
      meta: (p, prog) =>
        `⭐ ${Storage.totalStars(prog)}/${LEVELS.length * 3} · 🖼️ ${Storage.cleared(prog)}/${LEVELS.length} · 🏅 ${prog.rushBest || 0}`,
      onEnter: (p) => { this.profile = p; this.showMap(); },
      addLabel: "New Visitor",
    });

    GK.initPWA({ appName: "Wonder Museum" });
    Render.boot();

    GK.Debug.init({ storage: Storage, title: "WONDER MUSEUM" })
      .jump("room", LEVELS.length, (n) => this.startRoom(n - 1))
      .action("find all but one", () => {
        if (!Game.board || !Game.running()) return;
        const left = Game.remaining();
        for (const w of left.slice(0, Math.max(0, left.length - 1))) {
          const cells = Game.placementOf(w);
          if (cells) Game.select(cells);
        }
        return Game.remaining();
      });

    this.showScreen("splash");
    Storage.initFirebase().then((ok) => {
      this.el("sync-badge").textContent = ok ? "☁️ family sync on" : "📴 offline";
      if (ok && GK.UI.screen === "profiles") GK.Profiles.renderList();
      if (ok && GK.UI.screen === "splash") this.refreshSplash();
      if (ok && GK.UI.screen === "map") this.showMap();
      if (ok && GK.UI.screen === "leaderboard") this.showLeaderboard(true);
    });
  },

  showScreen(name) { GK.UI.showScreen(name); },
  progress() { return Storage.getProgress(this.profile.id); },

  /* ------------------------------------------------------------- splash -- */

  refreshSplash() {
    const last = GK.Profiles.lastProfile();
    const cont = this.el("btn-continue-as"), start = this.el("btn-start");
    if (last) {
      cont.style.display = "";
      cont.textContent = `🎟️ Continue as ${last.avatar} ${last.name}`;
      cont.onclick = () => { Sfx.init(); GK.Profiles.select(last); };
      start.className = "btn ghost";
      start.textContent = "👥 Switch Visitor";
    } else {
      cont.style.display = "none";
      start.className = "btn big green";
      start.textContent = "🎟️ Go In";
    }
  },

  play() {
    Sfx.init(); Sfx.click();
    GK.Profiles.renderList();
    this.showScreen("profiles");
  },

  howTo() { Sfx.click(); GK.UI.openModal("modal-howto"); },

  /* ---------------------------------------------------------------- map -- */

  showMap() {
    if (!this.profile) return this.play();
    const prog = this.progress();
    const unlocked = Storage.unlocked(prog);
    const done = Storage.campaignDone(prog);

    this.el("map-player").innerHTML = `${this.profile.avatar} <b>${GK.util.esc(this.profile.name)}</b>`;
    this.el("map-coins").textContent = `🪙 ${Storage.coins(prog)}`;

    const cont = this.el("btn-continue");
    const next = LEVELS[unlocked];
    cont.textContent = done
      ? `🖼️ ${WINGS[next.wing].name}: ${next.name} again`
      : `🖼️ ${WINGS[next.wing].name}: ${next.name}`;
    cont.onclick = () => this.startRoom(unlocked);

    const today = RNG.today();
    this.el("btn-daily").textContent = Storage.dailyFor(prog, today) ? "📅 Daily ✓" : "📅 Daily";

    this.el("wing-list").innerHTML = WINGS.map((wing, wi) => {
      const cells = wing.rooms.map((room, ri) => {
        const idx = wi * 8 + ri;
        const rec = prog.rooms && prog.rooms[idx];
        const open = idx <= unlocked;
        const stars = rec ? rec.stars : 0;
        return `<button class="room${open ? "" : " locked"}${idx === unlocked && !done ? " next" : ""}"
          ${open ? `onclick="App.startRoom(${idx})"` : "disabled"}
          aria-label="${open ? `Room ${ri + 1}, ${GK.util.esc(room.name)}, ${stars} of 3 stars` : `Room ${ri + 1}, locked`}">
          <span class="rm-n">${open ? ri + 1 : "🔒"}</span>
          <span class="rm-name">${open ? GK.util.esc(room.name) : "???"}</span>
          <span class="rm-stars">${open ? "★".repeat(stars) + "☆".repeat(3 - stars) : ""}${rec && rec.curiosity ? " 🔎" : ""}</span>
        </button>`;
      }).join("");
      const wingStars = wing.rooms.reduce((s, _, ri) => s + ((prog.rooms[wi * 8 + ri] || {}).stars || 0), 0);
      return `<section class="wing" style="--wc:${wing.edge}">
        <h3>${wing.icon} ${GK.util.esc(wing.name)} <span class="wing-stars">⭐ ${wingStars}/24</span></h3>
        <p class="wing-blurb">${GK.util.esc(wing.blurb)}</p>
        <div class="room-grid">${cells}</div>
      </section>`;
    }).join("");

    this.showScreen("map");
  },

  /* --------------------------------------------------------------- play -- */

  enterGame(title, hint) {
    this.el("hud-title").textContent = title;
    const h = this.el("game-hint");
    h.textContent = hint || "";
    h.style.display = hint ? "" : "none";
    this.showScreen("game");
    // The stage measures 0x0 while the screen is hidden, so this has to run
    // after showScreen, not before it.
    Render.resize();
    Render.words();
    this.refreshHintButtons();
    Engine.start();
  },

  startRoom(idx) {
    Sfx.init(); Sfx.click();
    const lv = LEVELS[idx];
    const rec = this.progress().rooms[idx];
    Game.start({
      mode: "room", levelIdx: idx,
      seed: RNG.seedFrom(`wonder-museum|room|${idx}`),
      curiosityAlready: !!(rec && rec.curiosity),
    });
    this.enterGame(
      `${WINGS[lv.wing].icon} ${lv.name}`,
      `Find all ${lv.words.length} words. One more is hidden that is not on the list — look for it before the last one.`,
    );
  },

  startDaily() {
    const date = RNG.today();
    if (Storage.dailyFor(this.progress(), date)) { GK.UI.toast("You have had your go today"); return; }
    Sfx.init(); Sfx.click();
    const seed = RNG.seedFrom("wonder-museum|daily|" + date);
    const rng = RNG.sub(seed, "words");
    const pool = [];
    for (const lv of LEVELS) for (const w of lv.words) if (w.length >= 4 && w.length <= DAILY.cols) pool.push(w);
    const words = [];
    const seen = new Set();
    let guard = 0;
    while (words.length < DAILY.words && guard++ < 600) {
      const w = rng.pick(pool);
      if (seen.has(w)) continue;
      seen.add(w); words.push(w);
    }
    Game.start({
      mode: "daily", date, seed,
      spec: { cols: DAILY.cols, rows: DAILY.rows, dirs: DAILY.dirs, words, secret: null },
    });
    this.enterGame(`📅 ${date}`, "One go. The same grid as everybody else in the family.");
  },

  startRush() {
    Sfx.init(); Sfx.click();
    Game.start({ mode: "rush", seed: Math.floor(Math.random() * 0xffffffff) });
    this.enterGame("🏅 Rush", "Three minutes. Every word scores, and a cleared grid is worth two more.");
  },

  /* -------------------------------------------------------------- hints -- */

  refreshHintButtons() {
    if (!this.profile) return;
    const coins = Storage.coins(this.progress());
    for (const [kind, cfg] of Object.entries(HINTS)) {
      const b = this.el(`btn-hint-${kind}`);
      if (!b) continue;
      b.textContent = `${cfg.label} 🪙${cfg.cost}`;
      b.disabled = coins < cfg.cost || Game.mode === "rush" || !Game.running();
    }
    const c = this.el("hud-coins");
    if (c) c.textContent = `🪙 ${coins}`;
  },

  hint(kind) {
    const cfg = HINTS[kind];
    if (!cfg || !Game.running()) return;
    if (Game.mode === "rush") { GK.UI.toast("No hints in Rush — the clock is the whole point"); return; }
    if (!Storage.spend(this.profile.id, cfg.cost)) {
      GK.UI.toast(`You need ${cfg.cost} coins for that`);
      Sfx.wrong();
      return;
    }
    const r = Game.hint(kind);
    if (!r) GK.UI.toast("Nothing left to point at");
    this.refreshHintButtons();
  },

  /* ------------------------------------------------------------ in-game -- */

  pause() {
    if (!Game.running()) return;
    Game.paused = true;
    Sfx.click();
    GK.UI.openModal("modal-pause");
  },

  resume() { Game.paused = false; GK.UI.closeModal("modal-pause"); Sfx.click(); },

  restart() {
    GK.UI.closeModal("modal-pause");
    Game.paused = false;
    if (Game.mode === "daily") { GK.UI.toast("The Daily Puzzle is one go only"); return; }
    if (Game.mode === "rush") this.startRush();
    else this.startRoom(Game.levelIdx);
  },

  quitRoom() {
    GK.UI.closeModal("modal-pause");
    Game.paused = false;
    Game.quit();
  },

  /* ------------------------------------------------------------ results -- */

  roomOver(res) {
    if (!res) { Engine.stop(); this.showMap(); return; }
    // The board stays up for a moment so the last capsule is actually seen,
    // rather than being replaced instantly by a results card.
    setTimeout(() => this.showResults(res), 900);
  },

  showResults(res) {
    Engine.stop();
    let prog;
    if (res.mode === "room") prog = Storage.recordRoom(this.profile.id, res);
    else if (res.mode === "rush") prog = Storage.recordRush(this.profile.id, res);
    else prog = Storage.recordDaily(this.profile.id, res);

    const lv = res.mode === "room" ? LEVELS[res.levelIdx] : null;

    this.el("res-emoji").textContent = res.mode === "rush" ? "🏅" : (lv ? lv.exhibitIcon : "📅");
    this.el("res-title").textContent = res.mode === "rush"
      ? "Time!"
      : res.mode === "daily" ? "Daily done" : "Room complete";
    this.el("res-stars").textContent = res.mode === "room" ? "★".repeat(res.stars) + "☆".repeat(3 - res.stars) : "";
    this.el("res-score").textContent = res.mode === "rush"
      ? `${res.score} words`
      : Render.time(res.time);

    const bits = [];
    if (res.mode === "rush") {
      bits.push(`🧩 ${res.gridsCleared} grids cleared`);
      bits.push(`🏆 best ${prog.rushBest}`);
    } else {
      bits.push(`🎯 par ${Render.time(res.par)}`);
      bits.push(`📋 ${res.found}/${res.total} words`);
      if (res.hints) bits.push(`🔦 ${res.hints} hint${res.hints > 1 ? "s" : ""}`);
      if (res.mode === "room") bits.push(res.curiosity ? "🔎 curiosity found" : "🔎 curiosity missed");
    }
    bits.push(`🪙 ${Storage.coins(prog)}`);
    this.el("res-stats").innerHTML = bits.map((b) => `<div>${b}</div>`).join("");

    // The exhibit is the reward, so it gets its own card rather than a line in
    // the stats grid.
    const ex = this.el("res-exhibit");
    if (lv && res.cleared) {
      ex.style.display = "";
      ex.innerHTML = `<span class="ex-icon">${lv.exhibitIcon}</span>
        <span class="ex-body"><b>${GK.util.esc(lv.exhibit)}</b> added to the ${GK.util.esc(WINGS[lv.wing].name)} wing
        <small>${GK.util.esc(lv.fact)}</small></span>`;
    } else ex.style.display = "none";

    const note = this.el("res-note");
    const retry = this.el("res-retry"), next = this.el("res-next");
    retry.style.display = "none"; next.style.display = "none";
    this.el("res-finished").style.display = "none";

    if (res.mode === "room") {
      note.textContent = res.stars === 1
        ? `Every word found. Beat par (${Render.time(res.par)}) for a second star.`
        : res.stars === 2
          ? `Under par. The third star wants ${Render.time(res.par * 0.7)} with no hints.`
          : "Three stars. Nothing left to prove in this room.";
      retry.style.display = "";
      retry.textContent = "↻ Same room";
      retry.onclick = () => this.startRoom(res.levelIdx);
      const nextIdx = res.levelIdx + 1;
      if (nextIdx < LEVELS.length) {
        next.style.display = "";
        next.textContent = `▶️ ${LEVELS[nextIdx].name}`;
        next.onclick = () => this.startRoom(nextIdx);
      } else this.el("res-finished").style.display = "";
      for (let i = 0; i < res.stars; i++) setTimeout(() => Sfx.star(i + 1), 320 + i * 240);
    } else if (res.mode === "rush") {
      note.textContent = res.score >= prog.rushBest
        ? "A new best. That is the number on the family board."
        : `Your best is ${prog.rushBest}. The grids get wider the further you get.`;
      if (res.score >= prog.rushBest && res.score > 0) setTimeout(() => Sfx.newBest(), 300);
      retry.style.display = "";
      retry.textContent = "↻ Go again";
      retry.onclick = () => this.startRush();
      next.style.display = "";
      next.textContent = "🏆 Family board";
      next.onclick = () => this.showLeaderboard();
    } else {
      note.textContent = "That is your go for today. See how the family got on.";
      next.style.display = "";
      next.textContent = "📅 Today's standings";
      next.onclick = () => this.showDaily();
    }

    this.showScreen("results");
  },

  /* ---------------------------------------------------- daily / rush / album -- */

  showDaily() {
    Sfx.click();
    const date = RNG.today();
    const prog = this.progress();
    const mine = Storage.dailyFor(prog, date);
    this.el("daily-date").textContent = date;

    this.el("daily-body").innerHTML = mine
      ? `<div class="mode-card">
           <span class="mode-big">${mine.cleared ? Render.time(mine.time) : `${mine.found}/${mine.total}`}</span>
           <span class="mode-meta">${mine.cleared ? "cleared today" : "you left some behind today"}</span>
           <span class="mode-meta">One go a day. A fresh grid tomorrow.</span>
         </div>`
      : `<div class="mode-card">
           <span class="mode-big">📅</span>
           <span class="mode-meta">${DAILY.cols}×${DAILY.rows}, ${DAILY.words} words, all eight directions — the same grid for everybody today.</span>
           <span class="mode-meta"><b>You get one go.</b> The clock starts on your first drag.</span>
           <button class="btn green wide" onclick="App.startDaily()">📅 Take today's puzzle</button>
         </div>`;

    const rows = Storage.dailyBoard(date);
    this.el("daily-rows").innerHTML = rows.length
      ? rows.map((r, i) => `<div class="lb-row${r.profile.id === this.profile.id ? " me" : ""}">
          <span class="lb-rank">${r.entry.cleared ? i + 1 : "—"}</span>
          <span class="lb-avatar">${r.profile.avatar}</span>
          <span class="lb-name">${GK.util.esc(r.profile.name)}</span>
          <span class="lb-stat">${r.entry.cleared ? `⏱ ${Render.time(r.entry.time)}` : `${r.entry.found}/${r.entry.total}`}</span>
        </div>`).join("")
      : `<p class="nudge">Nobody has been in today. Be first.</p>`;

    this.showScreen("daily");
  },

  showRush() {
    Sfx.click();
    const prog = this.progress();
    this.el("rush-body").innerHTML = `<div class="mode-card">
        <span class="mode-big">${prog.rushBest || 0}</span>
        <span class="mode-meta">your best in three minutes${prog.rushRuns ? ` · ${prog.rushRuns} runs` : ""}</span>
        <span class="mode-meta">Words come from every wing. Clear a grid and the next one is wider — and starts hiding words backwards and diagonally.</span>
        <button class="btn green wide" onclick="App.startRush()">🏅 Start the clock</button>
      </div>`;
    this.showScreen("rush");
  },

  showAlbum() {
    Sfx.click();
    const prog = this.progress();
    this.el("album-count").textContent = `🖼️ ${Storage.cleared(prog)}/${LEVELS.length} · 🔎 ${Storage.curiosities(prog)}`;
    this.el("album-list").innerHTML = WINGS.map((wing, wi) => {
      const items = wing.rooms.map((room, ri) => {
        const idx = wi * 8 + ri;
        const rec = prog.rooms && prog.rooms[idx];
        if (!rec) return `<div class="ex locked"><span class="ex-icon">🔒</span><span class="ex-body">Not collected yet</span></div>`;
        return `<div class="ex"><span class="ex-icon">${room.icon}</span>
          <span class="ex-body"><b>${GK.util.esc(room.exhibit)}</b>${rec.curiosity ? " 🔎" : ""}
          <small>${GK.util.esc(room.fact)}</small></span></div>`;
      }).join("");
      const got = wing.rooms.filter((_, ri) => prog.rooms[wi * 8 + ri]).length;
      return `<section class="wing" style="--wc:${wing.edge}">
        <h3>${wing.icon} ${GK.util.esc(wing.name)} <span class="wing-stars">${got}/8</span></h3>
        <div class="ex-list">${items}</div>
      </section>`;
    }).join("");
    this.showScreen("album");
  },

  /* -------------------------------------------------------- leaderboard -- */

  // Ranked on Rush, because it is the only number in the game that means the
  // same thing for everybody: same clock, same rules, no campaign progress
  // behind it. Stars and exhibits are shown, but they measure how far somebody
  // has got rather than how well they play.
  showLeaderboard(silent) {
    if (!silent) Sfx.click();
    GK.Profiles.renderLeaderboard("lb-rows", {
      cols: (r) => `<span class="lb-stat">🏅 ${r.progress.rushBest || 0}</span>
        <span class="lb-stat">⭐ ${Storage.totalStars(r.progress)}</span>`,
      sort: (a, b) => (b.progress.rushBest || 0) - (a.progress.rushBest || 0)
        || Storage.totalStars(b.progress) - Storage.totalStars(a.progress),
      meId: this.profile?.id,
      empty: "Nobody in the museum yet — tap Go In!",
    });
    this.showScreen("leaderboard");
  },
};

// Pinch zoom sticks forever on iOS once it happens, and there is no way to
// reset it from script — so it has to be blocked at the source.
document.addEventListener("gesturestart", (e) => e.preventDefault());
document.addEventListener("gesturechange", (e) => e.preventDefault());

// Run init on DOMContentLoaded rather than inline at the bottom of <body>:
// rendering the first screen before layout settles resolves viewport-relative
// clamp() font sizes against the inherited value on that one render.
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => App.init());
else App.init();
