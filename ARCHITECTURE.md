# Diamond Dash (Baseball3): architecture

How the code is organized and the rules every file follows. Decisions about what the game does are in `DESIGN.md`; the build order is in `docs/plan.md`. Everything here is **Claude's default** unless marked otherwise.

## Hard rules
- **No build step, no dependencies.** Every file is a plain script loaded by `index.html` in a fixed order, and attaches to one global namespace, **`B3`**.
- **Works opened straight from disk** (`file://`): no ES modules, no web workers, no fetching local files. Data the game needs is a script that sets a value on `B3`.
- **Logic files never touch the DOM** (or `window`, `localStorage`, `indexedDB`), so Node can load and test them. All logic lives in `js/core/`.
- **No `Math.random` in `js/core/`.** All randomness goes through `B3.rng` (from M1), so a seed fixes everything and tests repeat exactly.
- **Names:** real U.S. cities with invented nicknames, as listed in DESIGN.md section 6. Players, coaches and logos are invented. No real MLB team or player names.
- **Saves use Baseball3's own names** (below), so they never collide with Baseball1 on `merrill3.github.io`.

`node tools/test.js` checks the rules it can: every script tag points at a file that exists, no `type="module"`, no `import`/`export`, `fetch(` or `Worker(` in `js/`, and no DOM, browser storage or `Math.random` in `js/core/`.

## Folders and load order

| Folder | What goes there | Touches the DOM? |
|---|---|---|
| `js/core/` | rules, engine, league, season, saving format: everything Node tests | never |
| `js/view/` | canvas drawing: the batter's view and the field view (from M4) | canvas only |
| `js/ui/` | screens, navigation, popups, browser storage, startup | yes |
| `css/` | styles | n/a |
| `tools/` | Node tests and measuring tools; `tools/e2e/` browser checks | n/a |

`index.html` loads `js/core/` first (in dependency order), then `js/view/`, then `js/ui/`, with `js/ui/boot.js` last. Node tests read the `js/core/` script tags from `index.html` and load those files in the same order (`tools/lib/load.js`), so there is one load order for both.

**Every script** follows this pattern:
```js
(function (root) {
  'use strict';
  const B3 = root.B3 = root.B3 || {};
  // ... attach one object, e.g. B3.rng = { ... };
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

## Files

**Built (M0 skeleton)**

| File | What it does |
|---|---|
| `index.html` | the page; loads every script in order |
| `css/style.css` | base styles with color tokens (placeholder look until the M3 design interview) |
| `js/core/b3.js` | creates `B3`; `B3.VERSION`, `B3.NAME` (working title), `B3.SAVE` (save names) |
| `js/ui/boot.js` | starts the page: shows the title, the version, and that the game is in development |
| `tools/test.js` | runs every `tools/tests/*.test.js` file; prints `all tests passed` or the failures and exits 1 |
| `tools/lib/load.js` | loads the `js/core/` scripts into Node in `index.html` order |
| `tools/tests/rules.test.js` | the hard-rule checks above |
| `tools/tests/core.test.js` | the core scripts load in Node and define `B3` |
| `tools/e2e/boot-check.js` | Playwright: opens `index.html` from `file://` at 1280×800 and 390×844; checks the title shows, no console errors, no sideways scroll |

**Planned** (names and split are settled at each milestone's plan check)
- M1 engine, in `js/core/`: `rng.js` (seeded random numbers with saveable state), `data.js` (pitch types, positions, field size), `game.js` (game state and rules, decision points), `pitch.js` (pitch flight, location, swing, contact), `ball.js` (ball flight, fielding, throws, baserunning, the play script), `ratings.js` (ratings to sim numbers), `manager.js` (CPU choices), `box.js` (box score and play log). Tools: `tools/calibrate.js` and `tools/lib/testteams.js`.
- M2 league, in `js/core/`: `teams.js` (the 30 teams), `players.js` (generation, overall), `league.js`, `schedule.js`, `season.js`, `stats.js`, `staff.js` (rotation, bullpen rest, injuries), `war.js`, `save.js` (save format, version, upgrade steps). In `js/ui/`: `storage.js` (IndexedDB). Tools: `tools/seasontest.js`.

## The engine (planned for M1)
- **One engine for every game.** Simulated games, games you play, Quick Game, spring, All-Star and postseason games all run through the same code and the same physics.
- **Decision points.** The engine stops at each choice: the pitch (type and target), the swing (take, or swing with a timing offset), a steal, a tag-up, a pitching change. In a simulated game the CPU answers every one. In a game you play, your side's choices come from your input, and the rest is unchanged.
- **Ball in play.** Contact gives exit speed, launch angle and direction. The ball's flight, the fielders (positions, range, arms) and the runners (speed) decide the result, which comes with a **play script**: timed positions for the ball, fielders and runners that the field view animates in M4.
- **Calibration** lives in one settings object with a comment on each value. `tools/calibrate.js` plays thousands of seeded games and prints the target table (DESIGN.md section 7) plus "10 rating points are worth" for every rating.

## Saving (planned for M2)
- **Names:** the IndexedDB database `baseball3`, object store `saves`, key `franchise`. Small settings and records go in localStorage under keys starting with `baseball3.`. (Baseball1 uses `diamond-dash`, `diamond-dash-franchise` and `diamond-dash-v1`.) These are in `B3.SAVE` (js/core/b3.js).
- **Format:** `{ saveVersion, gameVersion, savedAt, league }`. Loading runs the upgrade steps in order, from the save's version to the current one. A newer or broken file is refused with a plain message.
- **Export** downloads the save as a JSON file and **Import** reads one back (asking before it overwrites). Both work from `file://`.
- **Size:** full box scores are kept only for your games and recent days. The save's size is measured at the end of every milestone.

## Testing
- `node tools/test.js`: every Node test. It must print `all tests passed` after every change.
- `node tools/e2e/boot-check.js [outDir]`: browser check from `file://` at both sizes; screenshots go to `outDir` (default `tools/e2e/out/`, not committed). Needs Playwright (`require('playwright')`).
- From M1: `node tools/calibrate.js`. From M2: `node tools/seasontest.js`. Each joins this list with its target.
