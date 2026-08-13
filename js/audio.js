// Game sounds, layered on gamekit's defaults. Everything is synthesized — no
// files to load, nothing to cache, and it all works offline.
//
// The palette is warm and wooden, like a museum with a parquet floor. The one
// rule the whole set obeys: a wrong drag must never sound like a buzzer. It is
// a soft wooden knock, because in a word search a wrong guess costs nothing and
// the sound should say so.
//
// `found` climbs the scale as the list empties, so a room ends on a rising
// phrase without anything having to track it.

const Sfx = GK.Sfx;

const SCALE = [392, 440, 494, 523, 587, 659, 740, 784, 880, 988, 1047, 1175];

Object.assign(Sfx, {
  found(n = 1) {
    const f = SCALE[Math.min(SCALE.length - 1, n - 1)] || 392;
    this.tone({ freq: f, type: "triangle", dur: 0.14, vol: 0.16 });
    this.tone({ freq: f * 2, type: "sine", dur: 0.1, vol: 0.07, when: 0.03 });
  },

  // A wrong drag. Two low wooden knocks, quiet and unbothered.
  miss() {
    this.tone({ freq: 210, type: "triangle", dur: 0.05, vol: 0.07 });
    this.tone({ freq: 175, type: "triangle", dur: 0.07, vol: 0.06, when: 0.05 });
  },

  // The hidden word. Deliberately the prettiest thing in the game.
  curiosity() {
    [880, 1175, 1568, 2093].forEach((f, i) =>
      this.tone({ freq: f, type: "sine", dur: 0.16, vol: 0.13, when: i * 0.07, slide: 60 }));
    this.tone({ freq: 440, type: "triangle", dur: 0.5, vol: 0.08, when: 0.12 });
  },

  hint() {
    this.tone({ freq: 660, type: "sine", dur: 0.09, vol: 0.1, slide: 220 });
    this.noise({ dur: 0.14, vol: 0.03, when: 0.05 });
  },

  clear() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => this.tone({ freq: f, type: "triangle", dur: 0.32, vol: 0.19, when: i * 0.12 }));
    notes.forEach((f, i) => this.tone({ freq: f / 2, type: "sine", dur: 0.36, vol: 0.1, when: i * 0.12 }));
  },

  gridClear() {
    [784, 988, 1175].forEach((f, i) =>
      this.tone({ freq: f, type: "square", dur: 0.09, vol: 0.1, when: i * 0.06 }));
  },

  star(n = 1) {
    this.tone({ freq: 620 + n * 210, type: "triangle", dur: 0.22, vol: 0.2, slide: 180 });
  },

  newBest() {
    [784, 988, 1175, 1568].forEach((f, i) =>
      this.tone({ freq: f, type: "square", dur: 0.13, vol: 0.13, when: i * 0.1 }));
  },

  // The last ten seconds of a Rush.
  tickTock(low) {
    this.tone({ freq: low ? 520 : 700, type: "square", dur: 0.05, vol: 0.09 });
  },

  timeUp() {
    this.tone({ freq: 330, type: "sawtooth", dur: 0.5, vol: 0.15, slide: -120 });
    this.noise({ dur: 0.4, vol: 0.08 });
  },
});
