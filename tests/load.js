// Shared loader for the test suites.
//
// The game ships plain <script> files with top-level `const` and no bundler, so
// the suites run the real sources in a vm sandbox with just enough of a browser
// stubbed out. Order must match index.html's, or a file that reads another's
// top-level const crashes on load.
//
// render.js and main.js are deliberately absent: everything asserted on here is
// engine or data, and leaving the drawing out is what keeps game.js honest
// about not touching the DOM.

const path = require("node:path");
const { loadScripts } = require("../lib/tools/test-harness.js");

const ROOT = path.join(__dirname, "..");
const noop = () => {};

const S = loadScripts({
  baseDir: ROOT,
  files: [
    "tests/seed.js",
    "lib/gk-util.js",
    "js/rng.js",
    "js/wings.js",
    "js/grid.js",
    "js/game.js",
  ],
  exports: [
    "GK", "__reseed", "__rand",
    "RNG", "DIRSETS", "WINGS", "LEVELS", "DAILY", "RUSH", "REWARD", "HINTS",
    "Grid", "ALPHABET", "UNWANTED",
    "Game", "starsFor",
  ],
  browser: true,
  globals: {
    Sfx: new Proxy({}, { get: () => noop }),
    App: { roomOver: noop },
    performance: { now: () => 0 },
    requestAnimationFrame: noop,
  },
});

module.exports = S;
