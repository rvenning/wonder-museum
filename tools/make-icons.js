// Generate icons/ — a brass-framed display case with a letter grid inside it,
// one word lit up across the middle. Run: node tools/make-icons.js
const fs = require("fs");
const path = require("path");
const { makeCanvas, downsample, encodePNG } = require("../lib/tools/png.js");

const OUT = path.join(__dirname, "..", "icons");
fs.mkdirSync(OUT, { recursive: true });

function paint(size, pad) {
  const SS = 4, big = size * SS;
  const cv = makeCanvas(big);
  const u = big / 100;

  const HALL = "#191727";
  const BRASS = "#c9a227", BRASS2 = "#ffd869";
  const CARD = "#f4efe3", INK = "#4a4560";
  const MARK = "#2f86c9";

  cv.fillRect(0, 0, big, big, HALL);
  // Gallery light falling from above, stepped but finely enough to read as a
  // fade rather than as rings.
  const glow = ["#1c1a2b", "#221f31", "#282539", "#2e2b42", "#34304b"];
  for (let i = glow.length - 1; i >= 0; i--) cv.fillCircle(50 * u, 10 * u, (30 - i * 4) * u, glow[i]);

  const s = pad ? 0.74 : 1;
  const at = (v) => 50 * u + (v - 50) * u * s;
  const sz = (v) => v * u * s;

  // The case: brass frame, cream label card inside.
  cv.fillRect(at(11), at(15), sz(78), sz(70), BRASS);
  cv.fillRect(at(15), at(19), sz(70), sz(62), BRASS2);
  cv.fillRect(at(18), at(22), sz(64), sz(56), CARD);

  // A found word, lit across the middle row before the letters go on, so the
  // letters sit on top of it the way they do in the game.
  cv.fillCircle(at(29), at(50), sz(9), MARK);
  cv.fillCircle(at(71), at(50), sz(9), MARK);
  cv.fillRect(at(29), at(41), sz(42), sz(18), MARK);

  // Five columns by four rows of letter blocks. Squares rather than glyphs —
  // real letters vanish at 48px, and a grid of marks reads as one anyway.
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 5; c++) {
      const x = 24 + c * 13, y = 29 + r * 14;
      const onWord = r === 1;
      cv.fillRect(at(x), at(y), sz(7), sz(8), onWord ? "#11101c" : INK);
    }
  }

  return encodePNG(size, size, downsample(cv.px, big, SS));
}

fs.writeFileSync(path.join(OUT, "icon-192.png"), paint(192, false));
fs.writeFileSync(path.join(OUT, "icon-512.png"), paint(512, false));
fs.writeFileSync(path.join(OUT, "maskable-512.png"), paint(512, true));
console.log("icons written to", OUT);
