# Session 6 state (Nov 21, 2026): stopped mid-session at the owner's request

Branch: `ccr-5b4b0818-qu6w9c`. Everything below is committed and pushed there. `main` is at Session 5's end (`1feb3da`); this branch's work is **not** merged into `main`.

## 1. Done this session
- **Session 5 merged into `main`** (owner's OK, Session 6): `main` fast-forwarded from `e47207f` to `1feb3da` (M1 step 1.4, Docs version 21). Before the merge: 78 tests passed, `gametest.js 1000 7` passed (checksum `2458fd5e`), the boot check passed.
- **Step 2.1 plan check**, reported to the owner:
  - The prompt named no "Based on" version; the current one was 21. `docs/plan.md` has no detailed M2 plan, only the roadmap row for 2.1, so step 2.1's plan gets written from that row, DESIGN.md and the interview.
  - The engine takes teams in the shape a league needs (`B3.game.create`: players with ratings, arsenal, tendencies, roles SP/CL/SU/MR/LR; lineup, starter, bullpen).
  - Gap: Range and Arm are graded against the position a player is playing, so the league needs a rule for playing off a main position (answered below).
  - The overall's position weights need the "elsewhere" values for every position (step 1.4 measured the key spots), measured with the same paired replays.
  - Per-player targets (standouts, .300 hitters, batting champion) need seasons, so they are checked in step 2.2. Step 2.1 sets the generation spread.
  - Session 5's notes for M2: none blocks 2.1. The plan's own risk: 2.1 may need to split.
- **Step 2.1 interview, question 1 (positions): owner's choice, Session 6.** Each player has a main position. Infield ladder: SS → 2B or 3B → 1B. A player moves only down the ladder, never back up, and each move down costs a few fielding points. 2B↔3B is a sideways move at the same small cost. Outfield: LF, CF and RF swap freely at a very small cost. Infield↔outfield: only a rare few players (about 1 in 20, mostly bench utility men), at a bigger cost. Only catchers catch, and a catcher can move down to 1B. Anyone can DH at no cost. Exact costs: Claude's default, set and reported later. (Also in DESIGN.md section 5.)

## 2. Interrupted: base running (raised by the owner mid-interview)
The owner raised Session 5's two notes: runners are too timid, and Speed's range is narrow. The owner's message ended at "Let's try to model", so **what exactly the owner wants is not confirmed**. Claude started modeling it. None of this is calibrated, and all of it is work in progress.

**New tools (committed):**
- `node tools/running.js [games=1000] [seed=1] [--avg]`: extra bases taken against rough real rates (second to home on a single, first to third on a single, first to home on a double, XBT%, outs trying; double plays, sac flies, steals per team-game), plus a Speed table (ft/s and home to first by rating). It checks nothing.
- `node tools/running-sweep.js '[{...}, {...}]' [games]`: runs `running.js` once per set of `B3.tune.BALL` overrides, side by side.

**The cause, measured** (`running.js 1000 1` on `main`): runners waited at halfway on *every* ball in the air until it landed, even ones no fielder could reach. They had no secondary lead or running start, and long throws arrived faster than real ones. On a single with a runner on first, the runner reached third 0.24–1.06 s after the throw on average (worst on balls to left). On doubles, the throw home beat the runner from first by about 1 s.

**Physics changes in the working tree (committed as work in progress; each is Claude's default, not yet decided):**
1. A runner judges whether a ball in the air will drop (the best fielder's catch margin, with an error from his Baserunning). If it clearly drops, he goes after a short freeze. Otherwise he goes halfway and waits, as before. (`BALL.dropSure` 0.4 s, `dropJudge` 1, `airRead` 2 reads)
2. A secondary lead: a runner who isn't stealing is a few feet farther off at contact and still moving. (`BALL.shuffle` [6, 8, 5] ft, `shuffleV` 5 ft/s)
3. A runner on second who isn't forced holds on a grounder hit in front of him (left of `BALL.frontSp` = 5°) until it's through the infield.
4. An outfielder who charged in to field a hit throws sooner. (`BALL.chargeFt` 15 ft, `chargeGain` 0.3 s)
5. `BALL.throwFar` (300 ft, the old value) is now a setting: the distance where a throw slows to `throwLong`'s share.

**Results so far** (1,000 games, seed 1; noise about ±2–3 points on each rate):

| Settings | Runs | 2nd→home on 1B (all / <2 out / 2 out) | 1st→3rd on 1B | 1st→home on 2B (all / <2 / 2) | XBT% | DP | SF |
|---|---|---|---|---|---|---|---|
| `main` (before) | 4.57 | 45 / 31 / 63 | 9 | 11 / 3 / 22 | 22 | 0.85 | 0.19 |
| committed defaults (changes 1–5) | 4.64 | 66 / 52 / 83 | 18 | 35 / 20 / 58 | 37 | 0.97 | 0.18 |
| + throwFar 250 | 4.75 | 73 / 60 / 91 | 22 | 34 / 20 / 56 | 40 | 0.92 | 0.19 |
| + throwFar 220, throwLong 0.66, chargeGain 0.45 | 4.74 | 72 / 57 / 90 | 24 | 40 / 24 / 63 | 42 | 0.90 | 0.20 |
| + throwFar 250, throwLong 0.64, chargeGain 0.4 | 4.84 | 77 / 63 / 95 | 22 | 45 / 29 / 65 | 44 | 0.92 | 0.21 |
| rough real rates (Claude's notes) | 4.3–4.6 | about 55–65 / 50–55 / 75–85 | about 25–30 | about 40–45 | about 40 | about 0.7–0.9 | about 0.25 |

**Still open:** first to third stays low (about 18–24%), second to home runs high with two outs, and runs rise to about 4.65–4.85 (the band is 4.3–4.6). The "real" rates are from general baseball knowledge, not research. Finishing needs:
1. Pick the settings.
2. Bring runs back into the band.
3. Re-fit the step tables (`node tools/calibrate.js --part=fit`, about 10 minutes), because Arm, Baserunning and Speed change value.
4. Run the full `node tools/calibrate.js` (about 10 minutes).
5. Update the tests, and DESIGN.md sections 7 and 10.

**Speed's range (owner's decision needed):** a realistic range is about 23.5 ft/s at 20, 27 at 60 and 30.5–31.5 at 99. That is about 2.8 times today's ft/s per point (today 25.75 to 28.6). The tweak is one line: `B3.tune.RATE.run.speed[2] *= 2.8`. Its value in center field was being measured (`node tools/calibrate.js --part=defense --only=speed --tweak=<that file>`) when the session stopped, so **it is not measured**. Expect Speed to be worth well over a full hitting point in CF. That would break the equal-value rule, unless the physics makes each ft/s worth less or the owner relaxes the rule for Speed. Better running (above) also raises Speed's and Baserunning's worth.

## 3. Tests on this branch (work in progress)
With the work-in-progress physics:
- `node tools/test.js`: **77 of 78 pass; 1 fails.** `script.test.js` found 1 bad script in 16,707: on a caught line drive (LO), a runner gets back to his bag too fast ("19.9 ft in 0.62 s", top speed 27 ft/s). The cause: the bigger secondary lead. The return-to-bag time in `ball.js` (`0.3 + rn.s0 / (0.8 * rn.run.speed)`, in the caught-ball code) doesn't allow for the extra lead or the runner's momentum away from the bag. Fix it before anything merges.
- `node tools/gametest.js 1000 7`: all checks pass; checksum `475ec425` (was `2458fd5e`; it changes with any physics change).
- Worth a look: fielder's choices in gametest fell from 2,198 to 755, and double plays rose from 1,274 to 1,420 (line-drive double-offs with bigger leads). The secondary lead makes force throws harder. Check against real rates when tuning.
- The boot check is unaffected (no screen changes).

## 4. Decisions waiting for the owner
1. **Order:** finish the base-running work (section 2) before step 2.1, or set it aside (revert the physics, keep the tools) and go on with the 2.1 interview? It is M1 engine work, so step 2.1's own work would slide a session.
2. **Speed's range:** keep it narrow, go realistic and let Speed be worth more than a point, or go realistic and tone down how much each ft/s is worth.
3. **Step 2.1 interview, remaining questions** (one at a time, then a summary):
   - Q2 the overall's scale (asked, not answered): stretched 20–99 (Claude's recommendation), plain weighted average, or wins not a rating.
   - Q3 the schedule's mix (division, league, interleague).
   - Q4 the reserve squad's size.
   - Q5 starting balance between teams.
   - Q6 player names' style.
   - Then a summary with Claude's defaults for the owner to confirm: one standard park for now, market sizes, ages, the calendar, the handedness mix, arsenal sizes, tendency shares, the team overall.

## 5. Prompt for the next session
"Start Session 7 of Baseball3 (merrill3/Baseball3). Use the branch the session environment gives you, starting from the branch `ccr-5b4b0818-qu6w9c` (not main: Session 6's work is not merged). Read CLAUDE.md, then `state.md` and the "Stopped at:" line in docs/plan.md. First ask me the decisions in state.md section 4, one at a time. Baseball1 is reference only; never change it."

## 6. Session 7 answers (Nov 21, 2026; branch `ccr-85acc383-8ehj83`, started from `ccr-5b4b0818-qu6w9c`)
- Decision 1, order: **finish the base-running work first**, then step 2.1 (owner's choice, Session 7).
- Decision 2, Speed's range: **realistic range (about 23.5 / 27 / 31 ft/s at 20 / 60 / 99), with each ft/s toned down** so Speed still fits the equal-value rule (owner's choice, Session 7).
- Step 2.1 Q2, the overall's scale: **stretched 20–99** (about 50 an average regular, 70+ all-star, 80+ MVP type) (owner's choice, Session 7).
- Step 2.1 Q3, the schedule's mix: **balanced-ish**: about 52 division games (13 vs each rival), 64 vs the other 10 league teams, 46 interleague (every other-league team at least once, plus a natural rival) (owner's choice, Session 7).
- Step 2.1 Q4, reserve squad: **about 14** (26 active + 14 = 40) (owner's choice, Session 7).
- Step 2.1 Q5, starting balance: **realistic spread** (a few teams expected at about 95–100 wins, a few at about 60–65, most in between) (owner's choice, Session 7).
- Step 2.1 Q6, names: **realistic mix with lots of variety** (mostly American, many Latin American, some Asian and others) (owner's choice, Session 7).
- New idea from the owner (Session 7, with Q6): "work out exactly how pitcher and hitter ratings affect sabermetric stats in-game, which in turn affect end performance". Being clarified.
