# Wonder Museum 🏛️

A word search with a museum wrapped round it. Fourteen wings, eight rooms each —
dinosaurs, Ancient Egypt, space, knights, the deep sea, inventions, volcanoes,
weather, the human body, music, myths, minibeasts, Ancient Rome and explorers.
Every room you finish adds a real exhibit to your album with a fact on the back
of it, and every room hides one extra word that is not on the card.

**[▶ Play it](https://rvenning.github.io/wonder-museum/)**

## Features

- **112 rooms** across 14 wings, opening in order, with three stars each.
- **A curve that is built into the wings, not sprinkled over them.** Wing 1 is an
  8×9 grid with five words running only along and down; wing 14 is 13×15 with
  eleven words in all eight directions. No word is ever longer than its grid is
  wide, so nothing is findable only one way.
- **The curiosity** — one hidden word per room that is not on the card. Worth
  🪙25 and a 🔎 in the album. Find it *before* the last word on the card, because
  finding that one closes the room.
- **Par computed from the board you were actually dealt**, never a flat rate per
  level: what makes a word hard to spot is how many other cells share the letter
  you are hunting, so that is what the estimate counts. One star for finishing,
  two for beating par, three for beating it comfortably with no hint bought.
- **Hints** cost coins, and coins come from finishing rooms and finding
  curiosities. A hint always points at the word the grid is hiding best.
- **📅 Daily Puzzle** — one grid a day, identical for everybody in the family,
  one attempt, ranked on time.
- **🏅 Rush** — three minutes, one grid after another, each wider and sneakier
  than the last. That score is what the family leaderboard ranks.
- **🖼️ The Album** — all 112 exhibits, collected.
- Drag across a word in either direction (a crooked drag snaps to the nearest
  straight line), or tap the first letter and then the last.
- Family profiles with PINs, a shared leaderboard, cross-device sync, and
  offline play once installed.

## Built on gamekit

Screens, profiles, PINs, sounds, storage/sync, effects and the install prompt
all come from [gamekit](https://github.com/rvenning/gamekit), vendored into
`lib/`. To pull in a newer kit:

```
node "D:\OneDrive\Documents\Claude Code\gamekit\tools\sync-to-game.js" "D:\OneDrive\Documents\Claude Code\wonder-museum"
```

Then bump the cache name in `sw.js`, or devices keep serving the old build.

## How the code is laid out

| File | What it does |
|---|---|
| `js/wings.js` | the museum: 14 wings × 8 rooms, word lists, curiosities, exhibits and facts, plus the per-wing grid/direction curve |
| `js/grid.js` | placing words, filling the gaps, reading a board back, snapping a crooked drag to a ray, and the par model |
| `js/game.js` | the engine — selecting, matching, the clock, hints, terminal checks. No DOM, no canvas, no `Math.random` |
| `js/render.js` | canvas, pointer input, the word list and the frame loop |
| `js/main.js` | app shell: splash, map, results, daily, rush, album, leaderboard |
| `js/storage.js` | progress shape and the cross-device merge |
| `js/rng.js` | seeds derived from what a draw is *for*, so a board is a pure function of (room, seed) |

## Tests

```
npm test
```

`tests/grid.test.js` is the one that matters: it deals all 112 campaign boards
and reads every word back off the finished letters, because "the placer said
yes" is not the same claim as "this word is in this grid". `tests/bot.test.js`
plays the whole campaign through the real `Game.select()` with three searchers
of different skill and checks par means something at each of them. For the
balance table:

```
WM_REPORT=1 node --test tests/bot.test.js
```

## Local development

```
npx http-server . -p 8117 -c-1
```

## Storage

`localStorage` under the `wm_` prefix, synced to the `wondermuseum` Firestore
collection in the shared `wordvoyage-e5a5c` project. The Firebase config in
`js/firebase-config.js` is a public client config, not a secret — the key is
restricted to the Cloud Firestore API and the rules require an anonymous
sign-in. There is no coin *balance* stored anywhere: `coinsEarned` and
`coinsSpent` are separate monotonic counters and the balance is derived, so a
sync between two devices can never refund coins that were spent.
