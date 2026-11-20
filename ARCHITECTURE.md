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

**Built (M1 step 1.1: rules and game loop)**, loaded in this order after `b3.js`

| File | What it does |
|---|---|
| `js/core/rng.js` | `B3.rng`: seeded random numbers (sfc32). `create(seed)`, `restore(state)`, `is(x)`; each generator has `next`, `int`, `range`, `chance`, `normal`, `pick`, `weighted`, `save()` (four numbers) and `load(state)` |
| `js/core/data.js` | `B3.data`: lineup positions, position names, the 7 pitch types (speed and movement from step 1.2), the strike zone and `inZone(x, z)`, and (step 1.2) the field: `FIELD` (bases, fence, wall height, where fielders stand and how far they shade to the pull side), `fenceAt(spray)`, `polar(r, spray)`, `FIELDERS` |
| `js/core/placeholder.js` | **deleted in step 1.2** (task 7): its stand-in outcomes are replaced by `pitch.js` and `ball.js` |
| `js/core/manager.js` | `B3.manager.cpu`: the CPU's answer to each decision (placeholder logic; step 1.3 bases it on ratings) |
| `js/core/game.js` | `B3.game`: game state, rules and the decision loop (see "The engine") |
| `js/core/box.js` | `B3.box`: the box score (`build`, `text`), the play-by-play (`plays`) and `ip(outs)`, all built from the game log |
| `tools/lib/testteams.js` | two plain test teams (`pair()`), labeled like "AWY SS"; ratings come in step 1.3 |
| `tools/lib/gamecheck.js` | checks a finished game against the rules from its log alone; also counts which rule cases came up |
| `tools/gametest.js` | `node tools/gametest.js [games] [seed] [--show]`: plays seeded games of all six types and checks each; `--show` prints the first game's box score and play-by-play |
| `tools/tests/rng.test.js`, `game.test.js`, `decisions.test.js`, `box.test.js` | the step 1.1 tests |

**Built (M1 step 1.2: pitches, swings, ball in play)**, loaded after `data.js`

| File | What it does |
|---|---|
| `js/core/tune.js` | `B3.tune`: the one settings object (every engine number, with a comment) and the rating hooks: `inputs(player)` gives `{ bats, throws, bat, pit, fld, run }` in physical units, from the placeholder values here, overridden by `player.sim` (see "Rating hooks"). `POS` holds each position's first step, arm and catch-to-throw time; `BALL`, `ERR` and `STEAL` the ball-in-play physics |
| `js/core/pitch.js` | `B3.pitch`: `throw(g, { type, x, z })` (speed, movement, Command's scatter, fatigue), `call` (the umpire, Framing), `resolve(g, pitch, swing)` (the two-error swing into whiff, foul or contact `{ ev, la, sp }`), `cpuTiming` (a CPU hitter's *when* error), `expect` (the *where* error's mean and spread), `flightMs`, `who` |
| `tools/contact.js` | `node tools/contact.js [games] [seed]`: prints pitch and contact distributions by pitch type, speed, timing and matchup (checks nothing) |
| `tools/tests/pitch.test.js` | each pitch and swing hook moves its own numbers the right way |
| `js/core/ball.js` | `B3.ball`: `inPlay(g, contact, steal)` (the play, with its script), `steal(g, from, pitch)`, `tagup(g, play, from)`, `flight(contact)` (the ball's path), `runTime`, `throwTime` (see "Ball in play") |
| `tools/hits.js` | `node tools/hits.js [games] [seed]`: prints hit types, where hits land, errors, steals, tag-ups and the batting line (checks nothing) |
| `tools/tests/ball.test.js` | flight distances, home runs only over the wall, foul flies only in foul ground, and each fielding and running hook moving its own numbers |
| `tools/tests/script.test.js` | every play script from 300 seeded games (with frequent steals and tag-ups) is continuous and agrees with its result (see "The play script") |

**Planned** (names and split are settled at each milestone's plan check)
- M1 engine, still to come in `js/core/`: `ratings.js` in steps 1.3–1.4 (every rating in DESIGN.md section 10 to the hook inputs: the steep curve past 85, the capped combination bonus, the tendencies). Tools: `tools/calibrate.js` (with the equal-value check); `tools/lib/testteams.js` gains ratings.
- M2 league, in `js/core/`: `teams.js` (the 30 teams), `players.js` (generation, overall), `league.js`, `schedule.js`, `season.js`, `stats.js`, `staff.js` (rotation, bullpen rest, injuries), `war.js`, `save.js` (save format, version, upgrade steps). In `js/ui/`: `storage.js` (IndexedDB). Tools: `tools/seasontest.js`.

## The engine (M1; step 1.1 built the rules and the loop)
- **One engine for every game.** Simulated games, games you play, Quick Game, spring, All-Star and postseason games all run through the same code and the same physics.
- **Decision points.** The engine stops at each choice: the pitch (type and target), the swing (take, or swing with a timing offset), a steal, a tag-up, a pitching change. In a simulated game the CPU answers every one. In a game you play, your side's choices come from your input, and the rest is unchanged.
- **The API** (`js/core/game.js`, built in step 1.1):
  - `B3.game.create({ type, innings, away, home, rng })`. `type` is `regular`, `spring`, `postseason` or `quick`; `innings` is 1, 3 or 9 for `quick` and 9 otherwise. `rng` is required (no default generator). A team is `{ id, name, code, players: { id: { name, pitches, role } }, lineup: [{ id, pos }] × 9, pitcher, bullpen: [id] }`, with the designated hitter in the lineup and the pitcher out of it.
  - `g.pending` is the waiting decision; `B3.game.answer(g, answer)` applies an answer and returns the next decision. A bad answer throws and leaves the game unchanged.
  - `B3.game.play(g, [awayController, homeController])` answers everything; a controller is `{ change, steal, pitch, swing, tagup }`, each `(decision, g) → answer`, and anything missing falls back to `B3.manager.cpu`. `B3.game.sim(opts)` is create plus play with the CPU on both sides.
  - The decisions and answers, in order before each pitch: `change` (fielding side: `null` or `{ pitcher }` from `bullpen`), `steal` (batting side, only when a runner can go: `null` or `{ runners: [1, 2] }`), `pitch` (fielding side: `{ type, x, z }`, the target in feet from the middle of the plate and above the ground), `swing` (batting side, given the pitch as thrown, `{ type, speed, x, z, zone, ms }`: `{ swing: false }` or `{ swing: true, timing }` in ms from perfect timing, below 0 early), and after a catch `tagup` for the lead runner (`{ go }`; the decision carries `dist`, the catch's distance from home plate in feet).
  - The game is plain data plus its `rng`: `g.inning`, `g.half` (0 top, 1 bottom), `g.outs`, `g.balls`, `g.strikes`, `g.bases` (`[first, second, third]`, each `null` or `{ id, resp, earned }`), `g.score`, `g.line`, `g.teams`, `g.log`, `g.over`, `g.result` (`{ winner: 0 | 1 | null, reason: final | walkoff | mercy | tie, score, innings }`).
  - **The log** is a list of events, each with the inning `i` and half `h`: `pitch` (pitcher, batter, type, speed, location, count before, result B/C/S/F/X, timing if swung), `pa` (batter, pitcher, result code, outs on the play `out`, outs after `o`, runs `sc` with the charged pitcher and earned flag, `rbi`, bases after `bs`, fielder `fl`, tag-up), `sb`, `cs`, `adv`, `sub`, `placed`, `half` (runs, outs, left on base) and `end`. The box score and play-by-play are built from it.
  - Each pitch goes through `B3.pitch`, and each ball in play, steal and tag-up through `B3.ball` (step 1.2). A ball in play comes back as a play: `{ code, bb, fielder, caught, batter, runners: [first, second, third], runsCount, meta, script }`, with each runner's end base (0 out, 4 scored); `game.js` checks it (no runner passes another, no two on a base, at most 3 outs) and applies the scoring rules. `meta` (on a catch) holds what a tag-up needs: the catch's time, place, fielder and depth, when each runner who was going got back, and `free` (who has the ball, where and since when, after any runner was doubled off). A foul nobody caught comes back as `{ foul: true, script }`.
  - `g.lastPlay` is the last ball in play (or uncaught foul): `{ i, h, b, res, script }`. The script stays out of the log, so logs and saves stay small.
- **Pitches and swings** (`js/core/pitch.js`, step 1.2). A pitch has a type, a speed (a share of the pitcher's fastball, less when tired), movement (inches, mirrored for left-handers, scaled by the pitch's grade, with the shape's extra drop) and where it crosses the plate (the target plus Command's scatter). `ms` is its flight time to the ideal contact point: a swing's `timing` is measured from that moment, so the game view's tap and the CPU's timing mean the same thing. A swing has two errors: *when* (timing, ms) and *where* (inches between bat and ball). Whiff, foul or contact follow from them, then exit speed, launch angle and spray. The CPU hitter's *when* error comes from `B3.pitch.cpuTiming`; your own comes from your tap. The `pitch` log event gains `ev`, `la` and `sp` on a ball in play.
- **Rating hooks.** The physics reads no ratings. `B3.game.create` gives every player one input object from `B3.tune.inputs(player)`, kept as `team.inp[id]`: physical numbers such as `bat.contactSd` (inches), `bat.timingSd` (ms), `bat.batSpeed` (mph), `pit.commandSd` (feet), `pit.grades` and `pit.shapes` per pitch type, `fld.framing` (feet); for fielding `fld.react` and `fld.route` (Range: first step in seconds, share of top speed kept on the route), `fld.hands` (error multiplier) and `fld.release` (seconds off every catch-and-throw; both Hands), `fld.arm` (mph); for running `run.speed` (feet per second, also a fielder's speed), `run.read`, `run.jump` and `run.judge` (Baserunning, in seconds). The margin a runner wants before taking an extra base is one engine number for everyone (`BALL.dare`, owner's choice), not a player input. A `null` react or arm takes the position's value from `B3.tune.POS`. Step 1.2 uses placeholder values (an average player); a test sets `player.sim = { bat: { contactSd: 1.0 } }` to move one. Step 1.3's `ratings.js` fills the same inputs from ratings. Players also have `bats` (R, L or S) and `throws` (R or L), R if missing.
- **Ball in play** (`js/core/ball.js`, step 1.2). Contact gives exit speed, launch angle and direction. `flight` integrates the ball with drag and backspin lift (lift grows with launch angle up to `BALL.liftFull`), bounces it, rolls it to a stop at a steady rate, and stops it at the wall; it clears the wall only in the air above the wall's height (one standard park, `B3.data.FIELD`). The fielders stand at their spots, shaded toward the batter's pull side, and get to a point in their first step plus a run (top speed times their route, a steady acceleration) to within a glove's reach (`BALL.glove`); a dive reaches `BALL.diveReach` farther. In order: a fly or liner the best-placed fielder can reach is caught (a close one by chance; a leap at the wall can take back a home run; foul flies are caught only in foul ground); a grounder an infielder reaches before it leaves the infield (or dives for) is fielded, and the defense takes the lead forced runner when it's a sure out (with a relay for a double play) or the batter at first; anything else is a hit, and runners take extra bases when they judge they beat the throw by their margin. Errors (Hands) are fumbles, wild throws and dropped flies, and always put the batter on base in M1. Throws slow as they get longer. Steals race the runner's jump and speed against the delivery, the pitch and the catcher's release and arm; tag-ups race the runner from the catch against the throw. Close plays are decided by a logistic chance on the time margin.
- **The play script.** Every ball in play returns timed tracks for the ball (`[t, x, y, z]`), each fielder and each runner (`[t, x, y]`, with `from` and `end` bases), and events (contact, catch, field, throw, out, safe, score, error, wall, land, hr, foul; `dive` marks a diving catch or stop), all from the same times that decide the play. The batter has a track on every play (on a catch he runs toward first until the ball is caught), runners who hold go back to their bag, and the fielder taking a throw runs to the bag. `B3.ball.tagup` adds the runner, the throw and the cover man to the play's script. The format is in the comment at the top of `ball.js`. `tools/tests/script.test.js` checks it on every play: times only go forward; nobody runs faster than his top speed and the ball never beats its exit speed or the thrower's arm; every runner ends where the play says; at each out the ball and a fielder are on that base and the runner is on the base path short of it; at each catch or stop the fielder is within reach of the ball. The field view animates it in M4.
- **Calibration** lives in one settings object with a comment on each value. `tools/calibrate.js` plays thousands of seeded games and prints the target table (DESIGN.md section 7) plus "10 rating points are worth" for every rating.

## Saving (planned for M2)
- **Names:** the IndexedDB database `baseball3`, object store `saves`, key `franchise`. Small settings and records go in localStorage under keys starting with `baseball3.`. (Baseball1 uses `diamond-dash`, `diamond-dash-franchise` and `diamond-dash-v1`.) These are in `B3.SAVE` (js/core/b3.js).
- **Format:** `{ saveVersion, gameVersion, savedAt, league }`. Loading runs the upgrade steps in order, from the save's version to the current one. A newer or broken file is refused with a plain message.
- **Export** downloads the save as a JSON file and **Import** reads one back (asking before it overwrites). Both work from `file://`.
- **Size:** full box scores are kept only for your games and recent days. The save's size is measured at the end of every milestone.

## Testing
- `node tools/test.js`: every Node test (about 40 s). It must print `all tests passed` after every change. The Node loader (`tools/lib/load.js`) makes `Math.random` throw, so any stray call in `js/core/` fails while tests and tools run.
- `node tools/gametest.js 1000 7`: 1,000 seeded games of all six types, each checked by `tools/lib/gamecheck.js`; prints `all checks passed` and a checksum that repeats from run to run (about 6 s with the full physics).
- `node tools/e2e/boot-check.js [outDir]`: browser check from `file://` at both sizes; screenshots go to `outDir` (default `tools/e2e/out/`, not committed). Needs Playwright (`require('playwright')`).
- `node tools/contact.js 300`: pitch and contact distributions to read (step 1.2); it checks nothing.
- `node tools/hits.js 300`: hit types, where hits land, errors, steals, tag-ups and the batting line (step 1.2); it checks nothing.
- From M1: `node tools/calibrate.js`. From M2: `node tools/seasontest.js`. Each joins this list with its target.
