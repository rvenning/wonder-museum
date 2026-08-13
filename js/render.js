// Canvas, input, the word list and the frame loop. The engine never calls into
// here and this file never decides anything about the game — it draws whatever
// Game is holding and turns pointers into Game calls.
//
// The input model is the part worth reading. A 13-wide grid on a phone gives
// roughly 27px letters, and a drag has to run exactly along one of eight rays
// to mean anything, which a finger does not do. So the end of the drag is
// SNAPPED to the nearest legal ray (Grid.snapEnd) and the whole selection is
// drawn under the finger as it goes — you see the word you are about to claim
// before you let go, and a slightly crooked sweep still works.
//
// Tapping is supported as well as dragging, because it is the kinder gesture
// on a small screen and on a trackpad: tap the first letter, tap the last. Both
// paths end in the same Game.selectRay call, so they can never behave
// differently from each other.

// Fitting the grid to the stage is right on a phone and silly on a monitor,
// where an 8-wide room would give 70px letters.
const MAX_CELL = 52;

// Colours for found words, cycled. Deliberately soft: eleven saturated capsules
// on one board is unreadable, and the letters have to stay legible underneath.
const MARK_COLOURS = [
  "#4f9bd6", "#7bd88a", "#d67fb8", "#e0a34a", "#8b7fd6",
  "#4fc4bd", "#d67a6a", "#9bbf4f", "#6f8fd6", "#c98bd6", "#4fbf8a",
];
const SECRET_COLOUR = "#ffc23d";

const Render = {
  W: 360, H: 460, cell: 30, ox: 0, oy: 0,
  anchor: -1,        // first cell of the selection in progress (or an armed tap)
  cursor: -1,        // snapped end of the selection in progress
  dragging: false,
  flash: null,       // { cells, until } — a hint lighting up

  boot() {
    this.cv = document.getElementById("cv");
    this.ctx = this.cv.getContext("2d");
    this.stage = document.getElementById("game-stage");
    this.bindInput();

    // iOS settles its viewport lazily, and the stage can change size with no
    // resize event at all (a web font landing, the word list rewrapping), so
    // the loop watches for drift as well.
    addEventListener("resize", () => this.resize());
    addEventListener("orientationchange", () => setTimeout(() => this.resize(), 350));
    if (window.visualViewport) visualViewport.addEventListener("resize", () => this.resize());
  },

  resize() {
    if (!this.stage) return;
    const box = this.stage.getBoundingClientRect();
    if (box.width < 50 || box.height < 50) return;   // hidden screen: keep the last good layout
    this.W = box.width; this.H = box.height;

    // Display size comes from the stylesheet (width/height 100%); only the
    // backing store is sized here, or the canvas renders at its attribute size
    // and overflows every retina screen by the device pixel ratio.
    const dpr = window.devicePixelRatio || 1;
    this.cv.width = Math.round(this.W * dpr);
    this.cv.height = Math.round(this.H * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.layout();
  },

  layout() {
    const cols = Game.cols || 10, rows = Game.rows || 12;
    const pad = 8;
    this.cell = Math.max(8, Math.min(MAX_CELL,
      Math.floor(Math.min((this.W - pad * 2) / cols, (this.H - pad * 2) / rows))));
    this.bw = this.cell * cols;
    this.bh = this.cell * rows;
    this.ox = Math.round((this.W - this.bw) / 2);
    this.oy = Math.round((this.H - this.bh) / 2);
  },

  cellAt(x, y) {
    const c = Math.floor((x - this.ox) / this.cell);
    const r = Math.floor((y - this.oy) / this.cell);
    if (c < 0 || r < 0 || c >= Game.cols || r >= Game.rows) return -1;
    return r * Game.cols + c;
  },

  centre(i) {
    return {
      x: this.ox + (i % Game.cols) * this.cell + this.cell / 2,
      y: this.oy + Math.floor(i / Game.cols) * this.cell + this.cell / 2,
    };
  },

  /* -------------------------------------------------------------- input -- */

  bindInput() {
    const local = (x, y) => {
      const r = this.cv.getBoundingClientRect();
      return this.cellAt(x - r.left, y - r.top);
    };

    this.cv.addEventListener("pointerdown", (e) => {
      if (!Game.running() || Game.paused) return;
      e.preventDefault();
      const i = local(e.clientX, e.clientY);
      if (i < 0) { this.clearSelection(); return; }
      this.startX = e.clientX; this.startY = e.clientY;
      this.moved = false;

      // A second tap while an anchor is armed completes the word. Set the
      // gesture state BEFORE capturing: setPointerCapture throws whenever the
      // browser does not consider this pointer active, and an unguarded throw
      // takes the rest of the handler with it.
      if (this.anchor >= 0 && !this.dragging && this.armed) {
        this.armed = false;
        this.cursor = i;
        this.commit();
        return;
      }
      this.anchor = i;
      this.cursor = i;
      this.dragging = true;
      this.armed = false;
      try { this.cv.setPointerCapture?.(e.pointerId); } catch { /* not capturable; the gesture still works */ }
    }, { passive: false });

    const move = (x, y) => {
      if (!this.dragging || this.anchor < 0) return;
      if (Math.abs(x - this.startX) > 4 || Math.abs(y - this.startY) > 4) this.moved = true;
      const r = this.cv.getBoundingClientRect();
      const raw = this.cellAt(x - r.left, y - r.top);
      if (raw < 0) return;
      this.cursor = Grid.snapEnd(Game.cols, Game.rows, this.anchor, raw);
    };

    // PointerEvent.pressure is 0 for ordinary touch on iOS, so asking about the
    // button state here would drop every move of a real drag.
    this.cv.addEventListener("pointermove", (e) => {
      if (e.pointerType === "touch" || e.pointerType === "mouse" || e.buttons) { e.preventDefault(); move(e.clientX, e.clientY); }
    }, { passive: false });
    this.cv.addEventListener("touchmove", (e) => {
      e.preventDefault();
      if (e.touches[0]) move(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: false });

    this.cv.addEventListener("pointerup", () => {
      if (!this.dragging) return;
      this.dragging = false;
      // A press and lift on one square is not a failed drag, it is the first
      // half of a tap-tap. Arm it and wait.
      if (!this.moved && this.cursor === this.anchor) { this.armed = true; return; }
      this.commit();
    });
    this.cv.addEventListener("pointercancel", () => this.clearSelection());
  },

  clearSelection() { this.anchor = -1; this.cursor = -1; this.dragging = false; this.armed = false; },

  commit() {
    const a = this.anchor, b = this.cursor;
    this.clearSelection();
    if (a < 0 || b < 0 || a === b) return;
    const res = Game.selectRay(a, b);
    if (res && res.already) GK.UI.toast("Found that one already");
    return res;
  },

  /* -------------------------------------------------------------- frame -- */

  drainEvents() {
    for (const ev of Game.events) {
      if (ev.type === "found") {
        const c = this.centre(ev.cells[Math.floor(ev.cells.length / 2)]);
        if (ev.secret) {
          Fx.burst(c.x, c.y, SECRET_COLOUR, 26, 170, 0.8, 3);
          Fx.text(c.x, c.y, "curiosity!", { color: SECRET_COLOUR, size: 16 });
        } else {
          Fx.burst(c.x, c.y, "#ffffff", 8, 110, 0.4, 2);
          // Finding the last word on the card ends the room immediately, so the
          // curiosity has to be hunted BEFORE it. Say so at the one moment it
          // matters, or the reward is lost to a rule nobody was told about.
          if (Game.mode === "room" && Game.remaining().length === 1 && Game.board.secret && !Game.secretFound) {
            GK.UI.toast("One word left — find the hidden one first!");
          }
        }
      } else if (ev.type === "miss") {
        const c = this.centre(ev.cells[0]);
        Fx.dust(c.x, c.y, 3, "#8a93a0");
      } else if (ev.type === "hint") {
        this.flash = { cells: ev.cells, until: 2.6 };
      } else if (ev.type === "gridclear") {
        Fx.confetti(this.W, this.H, ["#ffc23d", "#7bd88a", "#6fb2ff"], 26);
        this.layout();
      } else if (ev.type === "deal") {
        this.flash = null;
        this.clearSelection();
        this.layout();
      } else if (ev.type === "win") {
        Fx.confetti(this.W, this.H, ["#ffc23d", "#7bd88a", "#6fb2ff", "#ffe9a8"], 80);
      } else if (ev.type === "rushend") {
        Fx.addFlash(0.3, "#ffc23d");
      }
      if (ev.type === "found" || ev.type === "deal" || ev.type === "gridclear") this.words();
    }
    Game.events.length = 0;
  },

  update(dt) {
    // The stage can resize with no event of its own; noticing the drift here is
    // cheaper than chasing every cause.
    const b = this.stage.getBoundingClientRect();
    if (b.width > 50 && b.height > 50 && (Math.abs(b.width - this.W) > 1 || Math.abs(b.height - this.H) > 1)) this.resize();

    const before = Math.ceil(Game.timeLeft());
    Game.tick(dt);
    if (Game.mode === "rush" && Game.running()) {
      const now = Math.ceil(Game.timeLeft());
      if (now !== before && now <= 10) Sfx.tickTock(now <= 3);
    }
    this.drainEvents();
    if (this.flash) { this.flash.until -= dt; if (this.flash.until <= 0) this.flash = null; }
    Fx.update(dt);
    this.hud();
  },

  hud() {
    const el = (id) => document.getElementById(id);
    const t = el("hud-time"), f = el("hud-found");
    if (!t || !Game.board) return;
    t.textContent = Game.mode === "rush" ? this.time(Game.timeLeft()) : this.time(Game.clock());
    t.classList.toggle("urgent", Game.mode === "rush" && Game.timeLeft() <= 15);
    f.textContent = Game.mode === "rush"
      ? `🏅 ${Game.score}`
      : `📋 ${Game.foundCount()}/${Game.board.words.length}`;
  },

  // The word list. Re-rendered only when something changes, not every frame.
  words() {
    const box = document.getElementById("word-list");
    if (!box || !Game.board) return;
    box.innerHTML = Game.board.words.map((w, i) => {
      const done = Game.found.has(w);
      const colour = MARK_COLOURS[i % MARK_COLOURS.length];
      return `<span class="wchip${done ? " done" : ""}"${done ? ` style="--wc:${colour}"` : ""}>${GK.util.esc(w)}</span>`;
    }).join("");
  },

  time(t) {
    const m = Math.floor(t / 60), s = Math.floor(t % 60);
    return m ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`;
  },

  /* --------------------------------------------------------------- draw -- */

  rrect(x, y, w, h, r) {
    const c = this.ctx;
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  },

  capsule(a, b, width, fill, alpha = 1) {
    const c = this.ctx;
    const p = this.centre(a), q = this.centre(b);
    c.save();
    c.globalAlpha = alpha;
    c.strokeStyle = fill;
    c.lineWidth = width;
    c.lineCap = "round";
    c.beginPath();
    c.moveTo(p.x, p.y);
    c.lineTo(q.x, q.y);
    c.stroke();
    c.restore();
  },

  draw() {
    const c = this.ctx;
    if (!c || this.W < 2 || !Game.board) return;
    c.save();
    c.clearRect(0, 0, this.W, this.H);

    // Gallery wall: warm light from above falling on a panelled room, so the
    // grid reads as a display case rather than a table floating in a void.
    const g = c.createLinearGradient(0, 0, 0, this.H);
    g.addColorStop(0, "#2c2a3f");
    g.addColorStop(0.6, "#221f31");
    g.addColorStop(1, "#191727");
    c.fillStyle = g;
    c.fillRect(0, 0, this.W, this.H);

    const [shx, shy] = Fx.shakeOffset();
    c.translate(shx, shy);

    // The case: a brass frame and a paper card inside it.
    c.fillStyle = "#8a6d3a";
    this.rrect(this.ox - 9, this.oy - 9, this.bw + 18, this.bh + 18, 12);
    c.fill();
    c.fillStyle = "#f4efe3";
    this.rrect(this.ox - 4, this.oy - 4, this.bw + 8, this.bh + 8, 8);
    c.fill();

    const s = this.cell;

    // Found words, underneath the letters so nothing is ever obscured.
    Game.board.words.forEach((w, i) => {
      const cells = Game.found.get(w);
      if (!cells) return;
      this.capsule(cells[0], cells[cells.length - 1], s * 0.74, MARK_COLOURS[i % MARK_COLOURS.length], 0.34);
    });
    if (Game.secretFound && Game.board.secret) {
      const p = Game.placementOf(Game.board.secret);
      if (p) this.capsule(p[0], p[p.length - 1], s * 0.8, SECRET_COLOUR, 0.5);
    }

    // A hint, pulsing until it times out.
    if (this.flash && this.flash.cells.length) {
      const a = 0.3 + 0.3 * Math.sin(this.flash.until * 9);
      const f = this.flash.cells;
      this.capsule(f[0], f[f.length - 1], s * 0.86, SECRET_COLOUR, a);
    }

    // The selection in progress.
    if (this.anchor >= 0 && this.cursor >= 0) {
      this.capsule(this.anchor, this.cursor, s * 0.82, "#3b3554", 0.55);
      if (this.armed) {
        const p = this.centre(this.anchor);
        c.strokeStyle = "#8a6d3a";
        c.lineWidth = 2;
        c.beginPath();
        c.arc(p.x, p.y, s * 0.42, 0, Math.PI * 2);
        c.stroke();
      }
    }

    c.textAlign = "center";
    c.textBaseline = "middle";
    c.font = `700 ${Math.round(s * 0.56)}px 'Baloo 2', system-ui, sans-serif`;
    for (let i = 0; i < Game.n; i++) {
      const x = this.ox + (i % Game.cols) * s;
      const y = this.oy + Math.floor(i / Game.cols) * s;
      c.fillStyle = Game.revealed.has(i) ? "#1c1a2b" : "#4a4560";
      c.fillText(Game.board.letters[i], x + s / 2, y + s / 2 + s * 0.03);
    }

    Fx.render(c);
    c.restore();
  },
};

// The frame loop. `loop` is a plain method so it can be stepped by hand — rAF
// is frozen in the preview, and a terminal path that is only ever reached by
// calling the engine directly is a path nobody has tested the wiring of.
const Engine = {
  raf: 0,
  last: 0,

  loop(t) {
    const dt = Math.min(0.05, (t - this.last) / 1000);
    this.last = t;
    GK.Debug.frame(dt);
    // Pausing has to stop the whole frame, not just the simulation: the effects
    // clock, the event queue and anything keyed on the render clock all keep
    // running otherwise. One static frame keeps the board on screen.
    if (Game.paused) { this.draw0(); return; }
    Render.update(dt);
    Render.draw();
  },

  draw0() { Render.draw(); },

  start() {
    if (this.raf) return;
    this.last = performance.now();
    const step = (t) => {
      this.raf = requestAnimationFrame(step);
      this.loop(t);
    };
    this.raf = requestAnimationFrame(step);
  },

  stop() { if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0; },
};
