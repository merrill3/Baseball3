**Docs version: 1** (2026-11-20): first docs, from the Session 1 proposal the owner confirmed.
<!-- Coding sessions: add 1 to this number, and update the date and note, in any commit that changes README.md, ARCHITECTURE.md, DESIGN.md, CLAUDE.md or docs/plan.md. The planning chat uses it to detect stale copies. -->

# Diamond Dash (Baseball3): plan

**Stopped at:** Session 1 (M0), task 4: the five docs are written; next is task 5, the skeleton.

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
| **M1: Game engine, headless** | S2–S4 (3; range 3–4; medium confidence) | 1.1 rules and game loop · 1.2 ball in play and the play script · 1.3 ratings, CPU choices and calibration | the owner looks at the calibration numbers | M4 (seeded randomness), M10 (what each rating is worth; batted-ball and swing data), M11 (Control and walks; Contact ahead of Power), M16 (the pitch baseline) |
| **M2: League and season** | S5–S8 (4; range 4–5; medium) | 2.1 teams, players, the value-based overall, rosters, schedule · 2.2 the season, standings, stats, leaders · 2.3 bullpen rest, injuries, CPU roster moves, WAR, season checks · 2.4 saving: version, upgrade step, Export/Import | none | M4 (daily roster invariants), M7 (save version and backups), M12 (overall lines up with WAR) |
| **M3: UI shell and navigation** | S9–S11 (3; range 3–4; low–medium) | 3.1 the look, five tabs, addresses and Back, popup stack, new franchise, Home with Sim · 3.2 Library · 3.3 Manage Team, placeholder Improve Team and Finances | design interview before M3; the owner clicks around after 3.3 | M5 (restructure and look), M6 (popups and Back), M14 (browser checks) |
| **M4: Playable game view** | S12–S14 (3; range 3–4; low) | 4.1 batter's view, batting, pitching, HUD, Quick Game setup · 4.2 field view, steals, tag-ups, bullpen, Play and Quick play from Home · 4.3 feel, simple figures, sound, autopilot check | short interview before M4; the owner plays a full game by hand | M9 (graphics cost), M20 (profiles during a game) |
| **Re-plan checkpoint** | — | a planning chat after M4 (Claude's default) | — | the longplan's rule: a checkpoint every 15–20 sessions |
| **M5: Postseason and season events** | S15–S16 (2; range 2–3; medium) | 5.1 seeding, exact clinch marks, bracket, byes, series, sims stop at your games · 5.2 All-Star Game, awards, a postseason touch | the owner plays a postseason game | Baseball1 Milestone 1 (the bye that hid Play) |
| **M6: Offseason page** | S17–S18 (2; range 2–3; medium) | 6.1 the calendar page and logic, one growth function, rollover, multi-season test · 6.2 spring training and in-season form | short interview before M6; the owner sims 2 seasons | M18 (one development system), Baseball1 Milestone 2 (form) |
| **M7: Improve Team and Finances** | S19–S23 (5; range 5–7; low) | 7.1 contracts, budgets, payroll, releases, Finances page · 7.2 team control · 7.3 free agency · 7.4 trades · 7.5 draft | short interview before each area; the owner plays a full offseason | Baseball1 Milestone 3 (team control), M25 (trades), M26 (free agency), M28 (draft) |
| **M8: Polish and publish** | S24–S25 (2; range 2–3; medium) | 8.1 how to play, first-run guide, glossary, playtest fixes, full browser suite · 8.2 GitHub Pages, version label, live tests, release tag | release playtest, then the public release; a re-plan checkpoint after it | M8 (first-time help), M7 (publish) |

**Total: about 25 sessions** (range 23–32) to the public release. What comes after the release is listed in DESIGN.md section 10 and gets planned at the checkpoint after it.

---

## Current milestones

### M0: Setup
**Status:** in progress (Session 1).
**Goal:** Plans agreed; an empty game page that loads from disk and a Node test command that passes.
**Based on:** Baseball1 docs version 26 (owner's Session 1 message, Nov 20, 2026).

**Decisions**
- Owner's choices (Nov 20, 2026): the proposal's keep/change/drop list, Offseason placement and roadmap are confirmed; the working title is Diamond Dash; teams come from the owner's list (DESIGN.md section 6); clutch is parked; Baseball1's longplan is a light reference for plans.
- Claude's defaults: namespace `B3`; the folder split `js/core/`, `js/view/`, `js/ui/`; save names starting with `baseball3`; `node tools/test.js` as the one Node test command.

**Tasks**
1. [x] Report what's in the Baseball3 repo; first commit on `main`; a working branch. **Result:** the repo was empty. One commit on `main` (a short README), then the branch `ccr-facbd381-x31dk5`.
2. [x] Read the Baseball1 plans. **Result:** docs version 26 matches the planning copy; `docs/longplan-draft.md` is there; no Baseball1 file mentions "Baseball2"; the Nov 20 navigation isn't in any Baseball1 file. Details in `docs/proposal.md` section 1.
3. [x] Write `docs/proposal.md`. **Result:** pushed; the owner confirmed it on Nov 20, 2026 with the answers above.
4. [x] Write CLAUDE.md, README.md, DESIGN.md, ARCHITECTURE.md and this file.
5. [ ] Minimal skeleton. Done when: `index.html` loads from `file://` with no console errors at 1280×800 and 390×844, and `node tools/test.js` prints `all tests passed`.
6. [ ] Commit, push, report, stop.

### M1: Game engine, headless
**Status:** planned; next (S2–S4).
**Goal:** A headless engine that plays full games pitch by pitch, for simulated games and games you play alike, and hits the calibration targets with rated test teams.
**Why now:** It is first in the owner's order. The season, the game view and every later number run on it. Baseball1's lesson: calibrate before building on top, because every later tuning change ripples through WAR, workload and contracts.

**In scope**
- Seeded random numbers with saveable state
- Game rules: count, outs, innings, bases, the designated hitter, walk-offs, extra innings by game type (league games play to a winner, with a runner on second in regular-season and spring extras; Quick Game ties after 3 extras, and its mercy rule)
- Decision points that the CPU or a player can answer: pitch (type and target), swing (take, or swing with a timing offset), steal, tag-up, pitching change
- Pitches: the 7 types, speed, movement, location error from Control, fatigue
- Swings and contact: chasing, whiffs, foul balls, timing into exit speed, launch angle and direction
- Ball in play: flight, home runs, fielders with positions, range and arms, hits, outs, errors, force plays, double plays, sac flies, tag-ups, steals, runner advances, and the play script for the field view
- Each rating's job (DESIGN.md section 4); CPU pitch choice, swing decisions and in-game pitching changes
- Box score and a play-by-play log
- `tools/calibrate.js` with the target table and "10 rating points are worth"

**Out of scope** (on purpose, for later)
- The league, named players, the season, rest between games, injuries and saving (M2)
- Drawing anything (M4)
- Hit by pitch, bunts, balks, wild pitches, pickoffs, pinch hitters and defensive substitutions (after the release; the longplan left balk, HBP and bunt undecided)
- In-season form (M6) and clutch (parked, owner's choice)

**Based on:** docs version 1. Light references in Baseball1's longplan: M4 S6 (route one seeded random source everywhere), M10 S22–S23 ("10 points are worth" for every rating; exit speed, launch angle, hard-hit, swing, whiff and chase data), M11 S25–S26 (Control sets walks; Contact ahead of Power; hitters' strikeout spread), M16 S45 (the four-seam fastball was the most hittable pitch).

**Decisions**
- Owner's choices (confirmed Nov 20, 2026): one engine and one physics for every game type; no special edge in games you play; each rating's job; the target table in DESIGN.md section 7; 7 pitch types, 3–5 per pitcher.
- Claude's defaults:
  - Pitch-by-pitch simulation with a spatial ball-in-play model (Baseball1 used one; it is what makes gap doubles possible).
  - Errors are in, rare, and come from Fielding.
  - Test teams for calibration come from a simple generator in `tools/lib/testteams.js`, with the rating spread a league will have. M2's player generator replaces it, and M2 re-checks every target over full seasons.
  - Speed budget: a full season's 2,430 games in about 10 seconds or less in Node (Baseball1's season took about 5 seconds).
  - Extra engine targets from general baseball knowledge (not research), reported but not yet approved: walks about 8% of plate appearances (Baseball1 ran about 6%); hitters chase about 28–32% of pitches outside the zone (Baseball1 measured 23%); whiffs about 24–26% of swings; about 3.8–3.9 pitches per plate appearance; starters about 5.3–5.8 innings and 85–95 pitches a start; errors about 0.5 per team-game.

**Tasks** (commit and push after each)

Step 1.1 (S2): rules and game loop
1. [ ] Plan check: the Docs version, and this plan against the skeleton. Done when: reported to the owner.
2. [ ] `B3.rng`: seeded random numbers whose state can be saved and restored, plus a test rule that `js/core/` never calls `Math.random`. Done when: the same seed gives the same sequence after a save and restore.
3. [ ] Game state and rules, with a placeholder outcome for each pitch. Done when: 1,000 seeded games end correctly with every invariant holding (3 outs per half-inning except walk-offs, runs in the log equal the score, extra-inning rules by game type), and two runs with the same seed print identical output.
4. [ ] Decision points, answered by placeholder CPU logic. Done when: a test plays a game where a scripted "player" answers every choice for one side.
5. [ ] Box score and play log. Done when: box totals match the game (runs, hits, outs as innings pitched, and plate appearances as the sum of their outcomes).

Step 1.2 (S3): ball in play
6. [ ] Pitches, swings and contact: types, speed, movement, location error, take or swing, chase, whiff, foul, and timing into exit speed, launch angle and direction, in the same timing terms the game view will use. Done when: unit tests pass and printed distributions look sane.
7. [ ] Ball in play: flight, home runs, fielding, throws, runners, force and double plays, sac flies, tag-ups, steals, errors. Done when: 300 games print sane hit types (singles, doubles in the gaps, triples, home runs).
8. [ ] The play script. Done when: every ball in play returns timed ball, fielder and runner positions, and a test checks they are continuous and agree with the result.

Step 1.3 (S4): ratings and calibration
9. [ ] Ratings into sim numbers, each with its job; fatigue; CPU pitch choice, swing decisions and pitching changes. Done when: the "10 points are worth" table shows each rating moving its own stat the right way, and not moving the others much.
10. [ ] `tools/calibrate.js`. Done when: over 3,000 or more seeded games the target table is inside its bands, or each miss is reported to the owner.
11. [ ] Speed. Done when: the measured time for 2,430 games is reported, inside the budget or with a plan.
12. [ ] Docs (DESIGN.md calibration results, ARCHITECTURE.md engine API, Docs version bump) and one independent review agent on the M1 code. Done when: committed, and each finding is fixed or reported.

**Testing**
- [ ] `node tools/test.js` prints `all tests passed`
- [ ] `node tools/calibrate.js`: runs per team-game about 4.3–4.6, and the rest of DESIGN.md section 7
- [ ] `node tools/e2e/boot-check.js` still passes (no screen changes expected)
- [ ] Owner: read the calibration report

**Open questions** (for the owner)
- Walk rate: about 8% (real baseball) or about 6% (Baseball1)? Claude's default is 8%, as long as runs stay in 4.3–4.6; if they can't, I'll report before cutting anything.
- The other extra engine targets under "Decisions" (chase, whiff, pitches per plate appearance, starter length, errors): keep or change?

**Risks**
- Calibration may need a fourth session (range 3–4).
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
- Open from Session 1: the names rule's wording (DESIGN.md section 6: invented nicknames, logos, players and coaches; no real MLB names) is Claude's, not yet confirmed by the owner.
- Delete the working branch on GitHub after its work is merged, with the owner's OK.

## Done

*(Finished milestones move here, with the date and a one-line summary.)*
