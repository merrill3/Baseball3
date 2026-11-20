# Session state (for resuming)

Written Nov 20, 2026, mid Session 3, because the owner's usage window was nearly full. Read this after CLAUDE.md and the **Stopped at:** line in `docs/plan.md`. Delete this file when step 1.2 is done.

## Where things are
- **Branch:** `claude/baseball3-session-3-m1-u6m8f7` (holds all of Sessions 1–2 from `ccr-6e229fc2-je0w02`). Nothing is merged to `main`.
- **Done and pushed:** the step 1.2 plan check (docs version 9; the owner chose handedness with a small platoon edge) and **task 6** (docs version 10): `js/core/tune.js`, `js/core/pitch.js`, `tools/contact.js`, `tools/tests/pitch.test.js`.
- **Task 7 is in progress, committed as work in progress** (this commit):
  - `js/core/ball.js` is written and wired into `game.js`: flight (drag, lift, bounces, exact rolling, the wall), catches (including foul flies and leaps at the wall), ground balls (force plays, double plays, fielder's choices, infield hits), outfield hits (runners judge extra bases against the throw), errors (fumbles, wild throws, dropped flies), steals, tag-ups, runners who were stealing get their jump (and can be doubled off), and a play script on `g.lastPlay`.
  - `js/core/placeholder.js` is **deleted**; `index.html` loads `ball.js` instead. `tools/tests/game.test.js` stubs `B3.ball.inPlay`, `steal` and `tagup` now.
  - `tune.js` gained FLD (Range, Hands, Arm hooks), POS, RUN (Speed, Baserunning), BALL, ERR, STEAL. `data.js` gained FIELD, `fenceAt`, `polar`, `FIELDERS`.
  - The tag-up decision now carries `dist` (catch depth); the placeholder CPU tags from third only at 220 ft or deeper.
  - New tool: `node tools/hits.js 300` (hit types, where hits land, steals, tag-ups, batting line).
- **Checks at this commit:** `node tools/test.js` prints `all tests passed (46)`; `node tools/gametest.js 1000 7` prints `all checks passed` (checksum `7986a86d`, about 5 s, so about 5 ms a game and about 13 s a season: over the 10 s budget, but **the owner said 13 s a season is fine for now: don't spend effort on speed** (Nov 20, 2026; recorded at task 13 in docs/plan.md)). The browser boot check was last run after task 6 (passed); re-run it.

## Numbers from `node tools/hits.js 300` (placeholder choices, not calibrated)
Runs 4.25 per team-game, AVG .272, OBP .319, SLG .458, BABIP .325, K 22.5%, BB 6.7%, 3.41 pitches per PA. Per team-game: singles 5.66, doubles 2.74, triples 0.04, home runs 1.28, errors 0.25, double plays 0.52. Steals 68% safe. Tag-ups 137 safe, 158 out.

## What to do next (rest of task 7)
1. **Fix what looks wrong** (diagnosed, not fixed yet):
   - Ground balls get through too often: hit rate on grounders .371 (real about .240). Look at `infieldStop` in `ball.js` (infielders' reach and the `B.infield + 45` cutoff) and the ground-ball speed (`bounceOn`, `rollDecel`).
   - Too many doubles (2.74; real about 1.7), mostly line drives into the gaps (pickup at a median 5.4 s). Too few triples (0.04; target 0.2 or fewer, real about 0.15).
   - Tag-ups thrown out too often: from third, 53 out against 71 safe (median catch 306 ft for outs). Throws are probably too fast over long distances (`throwLong` 0.8; try about 0.7) or the runner too slow.
   - Errors 0.25 per team-game (target about 0.5): raise `ERR` rates.
   - Home runs 1.28 (target 1.4–1.55).
   These are step 1.2 "sane" fixes; exact calibration is step 1.4. Re-run `node tools/hits.js 300` and `node tools/gametest.js 1000 7` after each change.
2. **Write `tools/tests/ball.test.js`:** flight distances (100 mph at 28° about 390 ft), each fielding and running hook moves its own numbers (Range: more outs; Hands: fewer errors, more double plays; Arm: more runners thrown out; catcher Arm and release: fewer steals; Speed: more infield hits and extra bases; Baserunning: steals and extra bases), home runs only over the wall, foul flies caught only in foul ground. Plant a bug and confirm a test fails.
3. **Docs for task 7:** tick task 7 in `docs/plan.md` with its result; ARCHITECTURE.md (ball.js, the field, the new hooks, `g.lastPlay`, the tag-up `dist`, placeholder.js gone, `tools/hits.js`); README code layout (placeholder.js line → ball.js; add hits.js); DESIGN.md section 2 rules details (errors always put the batter on base; batter-runners are never thrown out stretching a hit in M1; runners who were stealing can be doubled off; one standard park; foul flies can be caught; leaps at the wall can rob home runs; the earned-run rule from the plan check). Bump the Docs version.
4. Commit and push.

## Then task 8 (the play script)
`B3.ball` already builds a script for every ball in play (`play.script`, kept on `g.lastPlay`; format in the comment at the top of `ball.js`). Task 8 adds a test that checks, over many seeded plays: every track's times only go forward; speeds stay within each runner's and fielder's top speed and the ball's exit speed or the thrower's arm; every runner ends where the result says (`end` matches `play.runners` and `play.batter`, 4 scored, 0 out); at each out the ball is at that base; at each catch the fielder is at the ball. Fix what it finds, write the docs, commit, push, and end the session with the summary CLAUDE.md asks for.

## Prompt to resume
"Continue Session 3 of Baseball3 (merrill3/Baseball3) on the branch claude/baseball3-session-3-m1-u6m8f7. Read CLAUDE.md, then the "Stopped at:" line in docs/plan.md, then state.md. Finish M1 step 1.2 only (the rest of task 7, then task 8). Baseball1 is reference only; never change it."
