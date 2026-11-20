**Docs version: 8** (2026-11-20): Session 2: the ratings redesign (owner's interview, brought into Baseball3) is in DESIGN.md section 10 and the plan; M1 grows to 4 steps (about 26 sessions in all). Next is step 1.2.
<!-- Coding sessions: add 1 to this number, and update the date and note, in any commit that changes README.md, ARCHITECTURE.md, DESIGN.md, CLAUDE.md or docs/plan.md. The planning chat uses it to detect stale copies. -->

# Diamond Dash (Baseball3): plan

**Stopped at:** Session 2 done: M1 step 1.1 (tasks 1–5) is built, tested and pushed on the branch `ccr-6e229fc2-je0w02` (it also holds all of Session 1's `ccr-facbd381-x31dk5`). Nothing is merged to `main` yet (that needs the owner's OK). After step 1.1, the owner's ratings redesign was brought in (DESIGN.md section 10) and M1 now has 4 steps. Next: step 1.2 (Session 3), tasks 6–8 as revised below, starting with a plan check. Prompt for it: "Start Session 3 of Baseball3 (merrill3/Baseball3), working from the branch ccr-6e229fc2-je0w02. Read CLAUDE.md, then the "Stopped at:" line in docs/plan.md. Do M1 step 1.2 only (tasks 6–8), starting with the plan check. Baseball1 is reference only; never change it."

This file is the hand-off between the owner's planning chats and the coding sessions. It holds the roadmap and detailed plans for only the next 1–2 milestones (owner's choice).

**How to use it** (owner's choices unless marked)
- Each roadmap step is one coding session (one Claude Code session in a usage window). Gates (interviews, playtests, the owner's OK) are not sessions.
- The coding session builds the current milestone in order, ticks off tasks, keeps **Stopped at** current, and moves finished milestones to "Done".
- Every milestone opens with a plan check against the code (Claude's default, carried from Baseball1).
- Milestones that span more than one session end with one independent review agent. No parallel building agents.
- Label every decision **owner's choice** or **Claude's default**.
- When a milestone finishes, update DESIGN.md (decisions) and ARCHITECTURE.md (files and APIs) too.

---

## Roadmap

Confirmed by the owner on Nov 20, 2026 (order and sizes from `docs/proposal.md` section 4). Sizes are estimates: Baseball1's milestones often took longer than planned. "Longplan" points to the Baseball1 plan (`docs/longplan-draft.md` in merrill3/Baseball1) that each step draws on, as a light reference.

| Milestone | Sessions | Steps (one session each) | Gates | Longplan |
|---|---|---|---|---|
| **M0: Setup** | S1 | proposal; docs and skeleton | owner's OK on the proposal (given Nov 20) | — |
| **M1: Game engine, headless** | S2–S5 (4; range 4–5; medium–low confidence) | 1.1 rules and game loop · 1.2 pitches, the two-error swing, ball in play and the play script · 1.3 hitting and pitching ratings, CPU choices · 1.4 defense and running ratings, calibration with the equal-value check, speed, review | the owner looks at the calibration numbers | M4 (seeded randomness), M10 (what each rating is worth; batted-ball and swing data), M11 (Control and walks; Contact ahead of Power), M16 (the pitch baseline) |
| **M2: League and season** | S6–S9 (4; range 4–5; medium) | 2.1 teams, players (generation for the new ratings: specialist stars, mild correlation, tendencies, arsenal sizes), the value-based overall, rosters, schedule · 2.2 the season, standings, stats (with the counts the diagnostics need), leaders · 2.3 bullpen rest, injuries, CPU roster moves, WAR, season checks · 2.4 saving: version, upgrade step, Export/Import | none | M4 (daily roster invariants), M7 (save version and backups), M12 (overall lines up with WAR) |
| **M3: UI shell and navigation** | S10–S12 (3; range 3–4; low–medium) | 3.1 the look, five tabs, addresses and Back, popup stack, new franchise, Home with Sim · 3.2 Library (Reference and Archive parts) · 3.3 Manage Team, placeholder Improve Team and Finances | design interview before M3; the owner clicks around after 3.3 | M5 (restructure and look), M6 (popups and Back), M14 (browser checks) |
| **M4: Playable game view** | S13–S15 (3; range 3–4; low) | 4.1 batter's view, batting, pitching, HUD, Quick Game setup · 4.2 field view, steals, tag-ups, bullpen, Play and Quick play from Home · 4.3 feel, simple figures, sound, autopilot check | short interview before M4; the owner plays a full game by hand | M9 (graphics cost), M20 (profiles during a game) |
| **Re-plan checkpoint** | — | a planning chat after M4 (Claude's default) | — | the longplan's rule: a checkpoint every 15–20 sessions |
| **M5: Postseason and season events** | S16–S17 (2; range 2–3; medium) | 5.1 seeding, exact clinch marks, bracket, byes, series, sims stop at your games · 5.2 All-Star Game, awards, a postseason touch | the owner plays a postseason game | Baseball1 Milestone 1 (the bye that hid Play) |
| **M6: Offseason page** | S18–S19 (2; range 2–3; medium) | 6.1 the calendar page and logic, one growth function (with pitch grades and learning new pitches), rollover, multi-season test · 6.2 spring training and in-season form | short interview before M6; the owner sims 2 seasons | M18 (one development system), Baseball1 Milestone 2 (form) |
| **M7: Improve Team and Finances** | S20–S24 (5; range 5–7; low) | 7.1 contracts, budgets, payroll, releases, Finances page · 7.2 team control · 7.3 free agency · 7.4 trades · 7.5 draft | short interview before each area; the owner plays a full offseason | Baseball1 Milestone 3 (team control), M25 (trades), M26 (free agency), M28 (draft) |
| **M8: Polish and publish** | S25–S26 (2; range 2–3; medium) | 8.1 how to play, first-run guide, glossary text (the Library's Reference part), playtest fixes, full browser suite · 8.2 GitHub Pages, version label, live tests, release tag | release playtest, then the public release; a re-plan checkpoint after it | M8 (first-time help), M7 (publish) |

**Total: about 26 sessions** (range 24–33) to the public release; the ratings redesign added one M1 session (owner's choice, Session 2). What comes after the release is listed in DESIGN.md section 11 and gets planned at the checkpoint after it.

---

## Current milestones

### M1: Game engine, headless
**Status:** in progress: step 1.1 done (Session 2); next is step 1.2 (Session 3).
**Goal:** A headless engine that plays full games pitch by pitch, for simulated games and games you play alike, and hits the calibration targets with rated test teams.
**Why now:** It is first in the owner's order. The season, the game view and every later number run on it. Baseball1's lesson: calibrate before building on top, because every later tuning change ripples through WAR, workload and contracts.

**In scope**
- Seeded random numbers with saveable state
- Game rules: count, outs, innings, bases, the designated hitter, walk-offs, extra innings by game type (league games play to a winner, with a runner on second in regular-season and spring extras; Quick Game ties after 3 extras, and its mercy rule)
- Decision points that the CPU or a player can answer: pitch (type and target), swing (take, or swing with a timing offset), steal, tag-up, pitching change
- Pitches: the 7 types, speed, movement, each pitch's grade and shape, Command's scatter around the target, fatigue
- Swings and contact: the two errors, *when* (timing) and *where* (bat height), into whiffs, fouls, exit speed, launch angle and direction; chasing
- Ball in play: flight, home runs, fielders with positions, hits, outs, errors, force plays, double plays, sac flies, tag-ups, steals, runner advances, and the play script for the field view
- Every rating in DESIGN.md section 10 with its job: Contact, Timing, Launch, Raw Power, Recognition, Discipline; Velocity, Command, Deception, Stamina, pitch grades and the put-away pitch; Range, Hands, Arm, Framing; Speed, Baserunning. The tendencies Aggressiveness and Aim. The steep curve past 85 and the capped combination bonus
- CPU pitch choice, swing decisions and in-game pitching changes
- Box score and a play-by-play log
- `tools/calibrate.js` with the target table, "10 rating points are worth" and the equal-value check (DESIGN.md section 7)

**Out of scope** (on purpose, for later)
- The league, named players, the season, rest between games, injuries and saving (M2)
- Drawing anything (M4)
- Hit by pitch, bunts, balks, wild pitches, pickoffs, pinch hitters and defensive substitutions (after the release; the longplan left balk, HBP and bunt undecided). Catchers' Blocking waits for wild pitches (owner's choice, Session 2)
- Player generation, the overall and stored diagnostics (M2); growth of ratings and pitch grades (M6)
- In-season form (M6) and clutch (parked, owner's choice)

**Based on:** docs version 1; revised in Session 2 (docs version 8) for the ratings redesign in DESIGN.md section 10. Light references in Baseball1's longplan: M4 S6 (route one seeded random source everywhere), M10 S22–S23 ("10 points are worth" for every rating; exit speed, launch angle, hard-hit, swing, whiff and chase data), M11 S25–S26 (Control sets walks; Contact ahead of Power; hitters' strikeout spread), M16 S45 (the four-seam fastball was the most hittable pitch).

**Decisions**
- Owner's choices (confirmed Nov 20, 2026): one engine and one physics for every game type; no special edge in games you play; each rating's job; the target table in DESIGN.md section 7; 7 pitch types, 3–5 per pitcher (the arsenal sizes were replaced in Session 2, below).
- Owner's choices (Session 2, Nov 20, 2026): walks about 8% of plate appearances; keep the other extra engine targets below (now in DESIGN.md section 7).
- Owner's choices (Session 2, Nov 20, 2026, the ratings redesign): build the redesign from the ratings interview into Baseball3 (DESIGN.md section 10), as part of this plan; M1 gets a fourth step; arsenals of 3–6 pitches for starters (mostly 4) and 2–4 for relievers (mostly 2); Blocking waits for wild pitches; Stuff retired, Control renamed Command, Eye split into Recognition and Discipline.
- Claude's defaults:
  - Pitch-by-pitch simulation with a spatial ball-in-play model (Baseball1 used one; it is what makes gap doubles possible).
  - Errors are in, rare, and come from Hands (Range decides what a fielder reaches).
  - Test teams for calibration come from a simple generator in `tools/lib/testteams.js` (started in step 1.1 without ratings; step 1.3 adds them), with the rating spread a league will have. M2's player generator replaces it, and M2 re-checks every target over full seasons.
  - The equal-value check (DESIGN.md section 7): +10 points at 40, 60 and 80 worth about the same, within about ±20%.
  - Speed budget: a full season's 2,430 games in about 10 seconds or less in Node (Baseball1's season took about 5 seconds).
  - Extra engine targets, proposed by Claude from general baseball knowledge (not research) and kept by the owner in Session 2: walks about 8% of plate appearances (Baseball1 ran about 6%); hitters chase about 28–32% of pitches outside the zone (Baseball1 measured 23%); whiffs about 24–26% of swings; about 3.8–3.9 pitches per plate appearance; starters about 5.3–5.8 innings and 85–95 pitches a start; errors about 0.5 per team-game. If 8% walks can't fit with 4.3–4.6 runs, Claude reports before cutting anything.

**Tasks** (commit and push after each)

Step 1.1 (S2): rules and game loop
1. [x] Plan check: the Docs version, and this plan against the skeleton. Done when: reported to the owner. **Result (Session 2):**
   - Docs version: this plan says "Based on: docs version 1"; the current version was 2. The only change from 1 to 2 was in this file (M0 moved to Done, the Stopped at line), so nothing in M1 was stale.
   - Task 2's Math.random rule already exists from M0 (a text check in `tools/tests/rules.test.js`). Task 2 adds a runtime check instead: in the Node tests `Math.random` throws, so any call that the text check misses fails while games run.
   - Files: step 1.1 builds `rng.js`, `data.js` (positions and pitch-type names only), `game.js`, `manager.js` (placeholder CPU choices) and `box.js` from ARCHITECTURE.md's list, plus a temporary `js/core/placeholder.js` (the stand-in pitch outcome, removed in step 1.2). `tools/lib/testteams.js` starts now with plain teams (no ratings until step 1.3), and `tools/gametest.js` runs the 1,000-game check (Claude's defaults).
   - Branch: this session's branch is `ccr-6e229fc2-je0w02`, set by the session environment. It was fast-forwarded to Session 1's last commit, so it holds all of M0.
   - Rules DESIGN.md leaves open, which step 1.1 sets as Claude's defaults (listed in DESIGN.md section 2 when the step ends): Quick Game extras without a runner on second; how the mercy rule is checked; steals of second and third only; trailing runners hold on a tag-up; no dropped third strike; a simple earned-run rule until errors are real in step 1.2.
   - The owner's answers (Nov 20, 2026): the names rule wording is OK; walks about 8%; keep the extra engine targets.
2. [x] `B3.rng`: seeded random numbers whose state can be saved and restored, plus a test rule that `js/core/` never calls `Math.random`. Done when: the same seed gives the same sequence after a save and restore. **Result:** `js/core/rng.js` (sfc32, seeded from a hash of the seed's text; `save()` gives four numbers). `tools/tests/rng.test.js` checks repeats, save and restore through JSON, bad input and the spread of draws. The Node loader now makes `Math.random` throw, so every test and tool fails on a stray call.
3. [x] Game state and rules, with a placeholder outcome for each pitch. Done when: 1,000 seeded games end correctly with every invariant holding (3 outs per half-inning except walk-offs, runs in the log equal the score, extra-inning rules by game type), and two runs with the same seed print identical output. **Result:** `js/core/game.js` (state, rules, the decision loop), `js/core/placeholder.js` (temporary stand-in outcomes), `js/core/data.js`, simple CPU answers in `js/core/manager.js`, test teams in `tools/lib/testteams.js`. `tools/lib/gamecheck.js` checks each game from its log alone; `node tools/gametest.js 1000 7` plays 1,000 games of all six types (regular, spring, postseason, Quick Game 9/3/1) and prints `all checks passed`; two runs print identical output (checksum `dc84cd87`). `tools/tests/game.test.js` also scripts the rule cases (walk-off scoring, runs on a third-out double play, sac fly, caught stealing ending an inning, the runner on second, Quick Game ties, the mercy rule) and confirms the checker catches planted mistakes. The game loop was built around the decision points from the start, so task 4 adds the scripted-player test rather than new plumbing.
4. [x] Decision points, answered by placeholder CPU logic. Done when: a test plays a game where a scripted "player" answers every choice for one side. **Result:** `tools/tests/decisions.test.js`: a scripted player runs the home side (pitch types and targets, swings and takes with timings, steals including double steals, tag-ups, pitching changes), both through `B3.game.play` and one answer at a time through `B3.game.answer` as the UI will; the test checks each answer took effect, every decision went to the right side, the same seed and answers repeat exactly, and bad answers are refused without changing the game. Planting two engine bugs (ignoring the chosen pitch type; dropping pitching changes) made it fail, as it should.
5. [x] Box score and play log. Done when: box totals match the game (runs, hits, outs as innings pitched, and plate appearances as the sum of their outcomes). **Result:** `js/core/box.js` builds the box score from the log alone, prints it (`B3.box.text`) and prints the play-by-play (`B3.box.plays`). `tools/tests/box.test.js` checks 600 games of every type: runs, hits and errors against the score and the log, pitchers' outs against the outs made, each batter's PA as the sum of its outcomes and as AB + BB + SF, and pitchers' pitches, batters faced and runs against the game's own counters; planted mistakes are caught. A game run in Chromium from `file://` gives the same result as in Node. See one with `node tools/gametest.js 1 7 --show`.

**Step 1.1 notes for step 1.2's plan check** (Claude's notes, Session 2)
- `placeholder.js` is the seam: `game.js` calls `B3.placeholder.throwPitch`, `resolve`, `steal` and `tagup`. Step 1.2 replaces those calls with `pitch.js` and `ball.js` and deletes the file. The play shape `ball.js` must return is in ARCHITECTURE.md "The engine".
- Runners who were stealing get nothing extra on a ball in play yet, and trailing runners hold on tag-ups; step 1.2's ball-in-play model decides those.
- Earned runs use a simple rule until errors are real (DESIGN.md section 2); step 1.2 should decide whether the full reconstruction is in M1 or later.
- Speed so far: 1,000 placeholder games take about 1 s in Node. The real physics will be slower; task 11 measures it.
- The rule choices Claude made in this step are listed in DESIGN.md section 2 ("Rules details") for the owner to check.

Step 1.2 (S3): pitches, the two-error swing and ball in play
6. [ ] Pitches, swings and contact: types, speed, movement, each pitch's grade and shape, Command's scatter around the target; take or swing, chase, whiff, foul; the swing's two errors, *when* (ms from perfect timing, in the same terms the game view will use) and *where* (bat height against the ball), into exit speed, launch angle and direction. Each rating gets a hook (an input with a placeholder value), so step 1.3 only maps ratings to those inputs. Done when: unit tests pass and printed distributions look sane.
7. [ ] Ball in play: flight, home runs, fielding (with hooks for Range, Hands and Arm, and catchers' Framing on borderline calls), throws, runners (Speed and Baserunning), force and double plays, sac flies, tag-ups, steals (catcher Arm plus Hands' quick release), errors. Done when: 300 games print sane hit types (singles, doubles in the gaps, triples, home runs).
8. [ ] The play script. Done when: every ball in play returns timed ball, fielder and runner positions, and a test checks they are continuous and agree with the result.

Step 1.3 (S4): hitting and pitching ratings, CPU choices
9. [ ] Hitting and pitching ratings into sim numbers, each with its job (DESIGN.md section 10): Contact, Timing, Launch, Raw Power, Recognition, Discipline; Velocity, Command, Deception, Stamina; pitch grades, shapes and the put-away pitch; the steep curve past 85 and the capped combination bonus; the tendencies Aggressiveness and Aim; fatigue. Test teams gain these ratings. Done when: the "10 points are worth" table shows each rating moving its own stats the right way, and not moving the others much.
10. [ ] CPU pitch choice (using the put-away pitch), swing decisions (Discipline, Recognition, Aggressiveness) and pitching changes, replacing step 1.1's placeholder logic. Done when: tests show each choice responds to its inputs, and simulated games stay sane.

Step 1.4 (S5): defense and running ratings, calibration, close
11. [ ] Defense and running ratings into sim numbers: Range, Hands, Arm, Framing; Speed, Baserunning. Done when: each moves its own stats (plays made, errors, double plays, steals and caught stealing, extra bases) and the value rule holds at its key position.
12. [ ] `tools/calibrate.js`. Done when: over 3,000 or more seeded games the target table (DESIGN.md section 7, with the extra engine targets) and the equal-value check are inside their bands, or each miss is reported to the owner.
13. [ ] Speed. Done when: the measured time for 2,430 games is reported, inside the budget or with a plan.
14. [ ] Docs (DESIGN.md calibration results, ARCHITECTURE.md engine API, Docs version bump) and one independent review agent on the M1 code. Done when: committed, and each finding is fixed or reported.

**Testing**
- [ ] `node tools/test.js` prints `all tests passed`
- [ ] `node tools/calibrate.js`: runs per team-game about 4.3–4.6, the rest of DESIGN.md section 7, and the equal-value check
- [ ] `node tools/e2e/boot-check.js` still passes (no screen changes expected)
- [ ] Owner: read the calibration report

**Open questions** (for the owner)
- None open. Walk rate (8%) and the extra engine targets (keep) were answered in Session 2.

**Risks**
- Calibration may need a fifth session (range 4–5). The redesign about doubles the ratings to tune, and the equal-value check across them is new; if it can't close, Claude reports the misses rather than stretching the step.
- Exact numbers for the curve, the combination cap and correlation are not decided; they are set during calibration and reported (Claude's defaults).
- M2's player generation gets heavier (specialist stars, correlation, tendencies, arsenal sizes); step 2.1 may need to split.
- The spatial model may be too slow for a season in about 10 seconds; the fix would be a lighter path for simulated games, which must not change results.
- Batting timing in M4 must feel right with the same contact model, so M4 may retune some values.
- Test teams may not match M2's league exactly, so M2 re-checks the targets.

---

## Template

```markdown
### M<N>: <short name>
**Status:** planned | in progress | done
**Goal:** <one or two sentences: what the player can do or notice afterward>
**Why now:** <playtest feedback, a bug, or the next roadmap step>

**In scope**
- ...

**Out of scope** (on purpose, for later)
- ...

**Based on:** docs version <N>. The coding session checks this against the code before building.

**Decisions**
- <decision>: owner's choice
- <decision>: Claude's default

**Tasks**, in build order, each with how we'll know it's done:
1. [ ] <task>. Done when: <observable result or test>

**Testing**
- [ ] `node tools/test.js`
- [ ] <milestone tests>
- [ ] Browser check at 1280×800 and 390×844, no console errors: <which flows>
- [ ] Owner playtest: <what to try>

**Open questions** (for the owner)
- ...

**Risks**
- ...
```

---

## Backlog
- Delete the working branch on GitHub after its work is merged, with the owner's OK. Session 1's branch `ccr-facbd381-x31dk5` is fully contained in `ccr-6e229fc2-je0w02`.
- The ratings interview lives on Baseball1's branch `ccr-a97b9715-fnzb96` (`docs/ratings-interview.md`), not merged; Baseball1 is unchanged. Its decisions are now in DESIGN.md section 10. Whether that branch stays is the owner's call.
- **Input for the design interview before M3** (the owner's summary of an earlier Baseball2 design chat for Baseball1's M5, shared in Session 2; ideas, not decisions):
  - Three parts: workspaces ("what am I trying to do?"), the Library ("what am I looking for?") and contextual access (one canonical version of each tool, opened from any workspace). "Consistent design language, flexible information architecture." A modern sports-game look, team colors, dark and light modes; which is the default was open.
  - Manage Team: Strengths, Concerns and Opportunities with explanations; quality, condition and performance kept apart; a Management Agenda without duplicate alerts; detail in levels (summary, explanation, evidence, action); suggestions easy to dismiss. Roster and personnel work count equally, with specialized tools for lineups, rotations and transactions.
  - Improve Team: the overview and direct workflows weigh the same; moderate proactivity; development matters as much as acquisition, hands-on or delegated (designed early, built later).
  - Library subjects proposed there: Players, Teams, Leagues, Stats, Transactions, Tools.
  - Offseason: a seasonal hub (not a permanent workspace); a real calendar drives the world and stages organize the screens; a week per step by default; no deadline is ever skipped silently. Open: how busy it should feel (that chat leaned to busy key periods and quiet stretches, scaled to each team's situation).
  - Already answered in Baseball3 (DESIGN.md section 9): game prep lives in Manage Team and Home is the daily hub, so "Prepare for Games" and "Manage Season" are not tabs.
  - Questions it raises (Claude's notes): where alerts live (Home or the Agenda, not both); what "Tools" in the Library would hold without breaking "each feature lives in one area"; and player development's priority (that chat calls it major; Baseball3 has training and coaches after the release), for the re-plan checkpoint after M4.

## Done

*(Finished milestones move here, with the date and a one-line summary.)*

- **M0: Setup** (done Nov 20, 2026, Session 1): the repo was empty, so `main` got one first commit (a short README) and work moved to the branch `ccr-facbd381-x31dk5`. The Baseball1 plans were read (docs version 26 matches the planning copy; `docs/longplan-draft.md` is there; no file mentions "Baseball2"; the Nov 20 navigation isn't in any Baseball1 file). The owner confirmed `docs/proposal.md` on Nov 20, 2026 (working title Diamond Dash, the owner's 30-team list, clutch parked, the longplan as a light reference). The five docs were written (Docs version 1), then the skeleton: `index.html` with a title screen, `js/core/b3.js` (namespace `B3`, save names `baseball3`), `node tools/test.js` (8 tests, including the hard-rule checks, which were confirmed to fail on planted violations) and `node tools/e2e/boot-check.js` (from `file://` at 1280×800 and 390×844: no console errors, no sideways scroll). Claude's defaults: namespace `B3`, folders `js/core/`, `js/view/`, `js/ui/`, save names starting with `baseball3`. Not merged to `main` yet.
