# Baseball3: Session 1 proposal

**Status:** confirmed by the owner on Nov 20, 2026 (answers in section 6). The decisions now live in DESIGN.md and the roadmap in docs/plan.md, which also holds the **Stopped at** line. This file is kept as history.

**Based on:** Baseball1 (merrill3/Baseball1, "Diamond Dash") at docs version 26, `main` commit 8355bdb (Nov 20, 2026), and the owner's Session 1 message (Nov 20, 2026).

**Labels.** "Owner's choice" means you decided it. "Claude's default" means I picked it and you haven't confirmed it. "Suggested" means it came from a design discussion and is not decided. **Every Keep, Change, Drop and Later in this file is my proposal (Claude's default) until you confirm it.**

---

## 1. Checked against Baseball1

- **Docs version:** Baseball1's `docs/plan.md` is at **26**, the same as your planning copy. No mismatch.
- **`docs/longplan-draft.md` is there** (on `main`, 2,021 lines, updated Nov 20, 2026). Stage 3 is done: all ten phases (S1–S139) are written; the final hand-off isn't started. I used it for features and order only, as you asked, not as Baseball3's milestone list.
- **"Baseball2":** no Baseball1 file mentions it or a plan to copy the code, so I found nothing to set aside on that account.
- **The Nov 20 navigation** (Home, Manage Team, Improve Team, Finances, Library, Offseason) **is not in any Baseball1 file.** It is only in your message. Baseball1's own plan still describes its old structure: tabs Home, Schedule, Standings, Leaders, Team, League, and the longplan's M5 "top tabs, sub-tabs, League hub". I used your message's version.
- **Conflict with a hard rule:** the longplan records your choice (Nov 15) to move teams to real U.S. cities with invented nicknames, with a decision gate before that work. Your message's hard rule says "fictional team and player names only". I kept fictional names everywhere (question 4).
- **Moved earlier on purpose:** the longplan puts the save version and Export/Import at the release (M7), and the browser test suite, code review and first-time help after the release. Baseball3 builds these in from the start, because they're cheap in fresh code and expensive to add later (Claude's default; see the roadmap).
- **Save keys:** Baseball1 uses the IndexedDB database `diamond-dash` and the localStorage keys `diamond-dash-franchise` and `diamond-dash-v1`. Both games will share one origin (`merrill3.github.io`), so Baseball3 uses `baseball3` names only (section 5).
- **No code copied.** I read Baseball1's code only for its save key names and its pitch-test report (branch `report/pitch-test`). Nothing in Baseball1 was changed.

---

## 2. Keep, change or drop: Baseball1's decisions

The "Baseball1" column says who decided it there. Reply by number to change any row ("12: keep as in Baseball1").

### A. Core game and controls
| # | Baseball1 decision | Who, in Baseball1 | Proposal for Baseball3 |
|---|---|---|---|
| 1 | A full mini baseball game: you bat and pitch against a CPU team | owner | **Keep** |
| 2 | Pick 1, 3 or 9 innings before each game | owner | **Keep** for Quick Game. Franchise games are always 9 innings. |
| 3 | Runs in the browser with no build step; Hoop Frenzy (Basketball1) as the reference | owner | **Keep** the no-build rule. **Drop** the Hoop Frenzy reference. |
| 4 | Batting is timing only: early pulls, late goes the other way, perfect timing hits hardest; you can take pitches outside the zone | owner | **Keep** |
| 5 | Pitching: pick one of your pitcher's pitches, tap where to throw it; control isn't perfect | owner | **Keep** |
| 6 | Fielding and baserunning are automatic, except steals and tag-ups, which you choose | owner | **Keep.** The longplan's "rework stealing" is still undefined; later. |
| 7 | Camera behind the batter for every pitch | owner | **Keep** |
| 8 | A top-down field view when the ball is in play | Claude's inference | **Keep** (please confirm it, since you never chose it) |
| 9 | Clean, flat 2D art on a canvas | owner | **Keep** |
| 10 | Phone and desktop; touch, mouse and keyboard | owner | **Keep.** Phone-first or desktop-first is a question for the design interview before M3. |
| 11 | Easy, Medium and Hard, with hints on Easy | owner | **Keep.** Difficulty changes only games you play. |
| 12 | Quick Game: name your team and pick its color; pick the CPU opponent from preset teams with their own made-up players | owner (their made-up players: Claude's default) | **Change:** Quick Game picks any two of the league's 30 teams, with their real rosters and ratings. No separate exhibition rosters. **Why:** Baseball1 kept two player models (exhibition pitchers had no Stuff rating), and every balance change had to be made twice. |
| 13 | Box score after every game; win/loss records and personal bests saved in the browser | owner | **Keep**, under Baseball3's own save keys. |
| 14 | Sound effects made in code (Web Audio); umpire voice by speech synthesis | owner | **Keep**, built in the polish milestone (M8), not before. |
| 15 | Game name "Diamond Dash" | Claude's default | **Change:** Baseball3 needs its own name (question 2). Working title "Baseball3". |
| 16 | Quick Game: you pick home or away | Claude's default | **Keep** |
| 17 | Extra innings: up to 3, then the game ends in a tie | Claude's default | **Change:** Quick Game keeps this. League games always play to a winner, with a runner on second to start each extra inning in regular-season and spring games, not in the postseason (Baseball1's league code worked this way; no doc decided it). |
| 18 | Mercy rule: 10-run lead after 7, 9-inning games only | Claude's default | **Change:** Quick Game only, never in league games. |

### B. Look and motion
| # | Baseball1 decision | Who, in Baseball1 | Proposal for Baseball3 |
|---|---|---|---|
| 19 | Sleek near-black silhouettes with team-color trim (cap, sleeves, number); rim highlight, belt and sock trim, dark hands | owner (the last three: Claude's defaults) | **Keep** as the starting idea, drawn simply. The final look is settled at the interview before M4. |
| 20 | Smooth, realistic motion, built on a jointed skeleton with inverse kinematics and blended keyframes; idle poses first | owner (the docs don't say who chose the skeleton method) | **Change:** the first version uses a few simple key poses and light idle motion. The full skeleton waits until after the release. **Why:** Baseball1's rig, views and effects grew to about 3,200 lines, and the longplan names graphics cost as a ★ problem. |
| 21 | Tiny top-down running figures in the field view | owner | **Keep** |
| 22 | Reactions, follow cam, replays, special postseason presentation | owner (wish list) | **Later**, except one simple postseason touch in M5. |
| 23 | 3D characters (blueprint W3); graphics editor tools, "option B" (longplan) | owner | **Later.** Nothing in the first version depends on them. 3D would break the hard rules (the blueprint says so too). |

### C. Pitching and bullpen
| # | Baseball1 decision | Who, in Baseball1 | Proposal for Baseball3 |
|---|---|---|---|
| 24 | 7 pitch types (four-seam, sinker, cutter, slider, curve, change-up, splitter), each with its own speed, movement, contact effect and deception | owner asked; Claude chose the details | **Keep** |
| 25 | Each pitcher throws 3–5 of them, with his own velocity, control and stamina | Claude's default | **Keep** |
| 26 | Quick Game bullpen: a starter and 4 relievers | Claude's default | **Change:** full league staffs (follows from 12). |
| 27 | Bring in a reliever between pitches (BULLPEN button or `B`); a removed pitcher can't return; the CPU changes pitchers when its pitcher tires or is hit hard | owner asked; Claude chose the details | **Keep** |
| 28 | Fatigue lowers control and velocity; the HUD shows your pitcher's energy | owner asked; Claude chose the details | **Keep** |
| 29 | Stuff makes hitters miss; Velocity makes contact weaker | owner (Milestone 2b) | **Keep**, built into the engine from the start. |
| 30 | *(Lesson from Baseball1's pitch test: Control barely moved walks, chase rates didn't change with pitch quality, and the four-seam fastball was the most hittable pitch)* | measured | **New (Claude's default):** Control's job is walks and Eye's is chases; pitch quality changes chase rates; the calibration test checks each one from M1. |

### D. League, season and franchise
| # | Baseball1 decision | Who, in Baseball1 | Proposal for Baseball3 |
|---|---|---|---|
| 31 | You control one team: take over any of the 30, rename it, recolor it | Claude's default, accepted | **Keep** |
| 32 | Quick Game stays as a separate mode on the main menu | Claude's default, accepted | **Keep** (with 12) |
| 33 | 30 teams, 2 leagues of 3 divisions, 162 games | owner | **Keep**, fictional names |
| 34 | Play a game, quick-play only its key moments, sim it, or sim a day, week, month, to a date, or to the end | owner | **Keep** |
| 35 | Standings, leaders, awards, an All-Star Game | owner | **Keep.** The All-Star Game is in M5. |
| 36 | Injuries and rest; a 5-man rotation | owner | **Keep.** Basic injuries in M2; deeper injuries later. |
| 37 | Trades, free agency, a draft | owner | **Keep**, in Improve Team (M7) |
| 38 | Spring training: about 15 games, separate stats, small breakouts and slumps; you set your 26-man Opening Day roster | owner asked; details Claude's | **Keep**, in M6 |
| 39 | Postseason: 12 teams; top 2 seeds per league get a bye; series of 3, 5, 7 and 7; the final is the "Diamond Series" | Claude's default, accepted | **Keep.** The final's name changes with the game's name (question 2). |
| 40 | You can play, quick-play or sim every postseason game; multi-day sims stop at your games; "Sim to my next game" | owner, plus Claude's defaults | **Keep** |
| 41 | One franchise save slot, autosaved in IndexedDB | Claude's default, accepted | **Change:** one slot, plus a save version, an upgrade step and Export/Import from the first saving step (M2). Baseball1 planned these only for its release. |
| 42 | Simulated games keep full box scores and stats | Claude's default, accepted | **Change:** every game keeps full stats; full box scores are kept for your games and recent days only. **Why:** Baseball1's save reached 4–5 MB. |
| 43 | Difficulty affects only games you play; simulated games use neutral settings | Claude's default, accepted | **Keep** |
| 44 | Rosters: 26 active (13 position players, 5 starters, 8 relievers with a closer) plus a reserve squad | Claude's default | **Keep.** Minor leagues later. |
| 45 | Ratings 20–99, 60 = an average big-leaguer. Hitters: Contact, Power, Eye, Speed, Fielding, Arm. Pitchers: Velocity, Control, Stamina, Stuff and a pitch set. | Claude's default | **Keep.** Clutch (added in the longplan) **later** (question 6). |
| 46 | Overall rating: a weighted mix of ratings by position. Longplan: "overall lines up with WAR" and a team overall | code; longplan owner's choice | **Change:** design the overall to track value (WAR) by position from the start, plus a team overall. |
| 47 | Growth from age and performance. Longplan: one development system that you and the CPU teams both use | owner | **Keep**, as one growth function for every rating change from the start (M6). Training and coaches later. |
| 48 | Contracts: salary in $M, years left, a payroll budget per team. Payroll is the whole organization plus released players still being paid. | Claude's default (the one payroll total: owner) | **Keep.** Finances stay lightweight for now (owner's choice for Baseball3). |
| 49 | Release any player; you keep paying him until his contract ends. Blocked during the draft or if the roster gets too thin. | owner (the paying rule; the docs don't label the rest) | **Keep**, in M7 |
| 50 | Team control (Baseball1 Milestone 3, planned, not built): 6 years of service, about 3 years near the minimum then 3 automatic arbitration years, tender or non-tender, extensions at any time, minor-league free agency after 7 seasons | owner | **Keep**, in M7 |
| 51 | Build order: the season foundation first | owner | **Replaced** by the roadmap below (same idea: foundation first). |

### E. Calibration targets (approved by you in Baseball1's Milestones 1b and 2b)
| # | Baseball1 decision | Who, in Baseball1 | Proposal for Baseball3 |
|---|---|---|---|
| 52 | Runs per team-game about 4.3–4.6 | owner | **Keep** |
| 53 | Strikeouts about 21%; league AVG about .260; SLG about .440; doubles 1.4 or more, triples 0.2 or fewer and home runs about 1.5 per team-game | owner (Claude proposed, you approved) | **Keep** as the M1 and M2 target table |
| 54 | 1–2 (maybe 3–4) standout pitchers (28% K or more) and hitters (.600 SLG or more) per league | owner | **Keep** |
| 55 | Batting-average spread: 5–10 .300 hitters per league, batting champion .330–.350, more regulars under .240 than at .300, Contact ahead of Power (planned in 2b, not built) | owner | **Change (timing):** built in from the start (M1–M2), since a fresh engine can be designed for it. |
| 56 | In games you play, CPU hitters strike out a little more against your pitching, and the best CPU pitchers are a little harder to hit hard | owner approved | **Drop:** played and simmed games use the same model (Baseball1's Later list asked for "matching manual and simmed games"). Re-add only if playtests ask for it. |
| 57 | 25 hidden archetypes for player generation (draft list never approved) | owner's idea | **Later**, as in Baseball1 |

### F. Workload, WAR and form
| # | Baseball1 decision | Who, in Baseball1 | Proposal for Baseball3 |
|---|---|---|---|
| 58 | Bullpen rest: no reliever 3 days in a row, extra rest after long outings; closer, setup and middle roles set each day | Claude's default | **Keep**, in M2 |
| 59 | Workload targets: busiest reliever about 60–80 IP and at most about 75 games; top starter under about 210 IP | Claude's default | **Keep** |
| 60 | Starter "pace guard" and late-inning hook percentages (patches added to hold the targets) | Claude's default | **Drop** as patches. Tune stamina directly; re-add only if tests need them. |
| 61 | WAR targets: about 1,000 a season, about 57% hitters; MVP about 8–10; Rookie of the Year about 3–6; rookies only up to age 27; Reliever of the Year needs 80% of games in relief; a "stretch" on hitters' WAR | Claude's defaults (you kept the age limit and the stretch, Nov 14) | **Keep** the targets and rules. **Drop** the stretch, though you kept it in Baseball1: it was a display fix for stars who didn't stand out, and Baseball3's sim can make them stand out on its own. |
| 62 | In-season form: hot and cold streaks with one 🔥 and one ❄️ icon, no news items, spring sets Opening Day form, lasting breakouts (mostly 27 and under) and prospect busts, a profile note for each | owner | **Keep**, in M6 with spring training. Lasting changes go through the one growth function (47). |
| 63 | Form details: ±6 points, half gone in about 12 days, icon at ±2.8 | Claude's default | **Keep** as starting values |

### G. Navigation (from your message)
| # | Decision | Who | Proposal for Baseball3 |
|---|---|---|---|
| 64 | Areas: Home (daily hub), Manage Team (assessment first; game prep lives here), Improve Team (trades, free agency, draft), Finances (lightweight), Library (by subject, attractive pages plus dense sortable tables), Offseason (its own calendar-style page, connected to Improve Team) | owner's choices for Baseball1's redesign; using them in Baseball3: Claude's default | **Keep.** Details in section 3. |

---

## 3. Navigation proposal

**Five tabs, always in the same place** (Claude's default): Home, Manage Team, Improve Team, Finances, Library. On a phone, a bottom bar of five; on a desktop, a top bar.

**Where Offseason sits** (Claude's default; you said it's open):
- From the final out of the postseason to Opening Day, the first tab reads **Offseason** and opens the calendar page. In those weeks the calendar *is* the daily hub, so it takes Home's place.
- Improve Team links to it all year. During the season it previews the coming offseason: key dates and your expiring contracts.
- Each offseason step (re-signing, draft, free agency) opens the matching Improve Team page.
- Alternative: a permanent sixth tab. I don't recommend it: six tabs crowd a phone, and the tab would be nearly empty for most of the year.

**What each area holds.** Items marked *suggested* came from the design discussion; I'm adopting them as my defaults, not as decisions.
- **Home:** today's game (Play, Quick play, Sim), sim controls (day, week, month, to a date), a standings snapshot of your division, news, and alerts (an injury, a roster problem, your closer resting).
- **Manage Team:** an overview first (record, run differential, how your hitting, pitching and defense rank, strengths and needs), then Roster, Lineup, Pitching (rotation, bullpen, closer), Injuries, and the Auto-manage switch.
- **Improve Team:** Trades, Free agency, Draft. *Suggested:* player development and long-term planning (after the release).
- **Finances:** *suggested:* budget, payroll, contracts.
- **Library:** *suggested subjects:* Players, Teams, Standings and schedule (with the postseason bracket), Leaders, Stats and records, Transaction history.

**Rules that answer your playtest lessons** (Claude's defaults)
- **Every piece of information has one home.** Other places link to it or reuse the same component. Home's standings card is a small snapshot linking to the full standings in Library, never a second standings screen.
- *Suggested:* information can be reached from wherever it's needed. A player's contract is one block on his player page, reachable from Manage Team, Improve Team and Finances alike.
- **One way to show each thing.** Potential, contract status and form are each drawn by one shared function, so they can't differ from screen to screen.
- **Each feature lives in one area.** Trading happens only in Improve Team; other screens offer a "Trade for him" link that goes there.
- **Back is predictable.** Pages use addresses in the URL (`#/library/players/123`), which work from disk, so the browser's Back button and a phone's back gesture go where you expect. Player and team pages are pages, not popups.
- **Popups only for short choices and confirmations.** One stack: Escape or Back closes only the top popup, and every popup closes when the page changes.
- **Easy for new players:** plain labels, a short first-run guide, and a glossary (M8).

---

## 4. Roadmap

Each step below is one session (one Claude Code session in a usage window). Sizes are estimates with a confidence level; Baseball1's milestones often took longer than planned. Gates (interviews, playtests, your OK) aren't sessions. Every milestone opens by checking its plan against the code, and every milestone longer than one session ends with one independent review agent. The order is your rough default, refined (Claude's default).

| Milestone | Steps (one session each) | Goal | Gates |
|---|---|---|---|
| **M0: Setup** (S1, plus S2 if tasks 4–6 continue in a new session) | 0.1 proposal (this file); 0.2 docs and skeleton | Plans agreed; an empty game that loads from disk and a Node test that passes | your OK on this proposal |
| **M1: Game engine, headless** (3 steps; range 3–4; medium confidence) | 1.1 rules and game loop: seeded random numbers, count, outs, innings, bases, DH, extra innings, walk-offs, substitutions, box score. 1.2 ball in play: contact (exit speed, launch angle, direction), flight, fielders with range and arms, hits and outs, double plays, sac flies, tag-ups, steals, runner advances, and a timed "play script" the field view will animate. 1.3 ratings and calibration: each rating's job, 7 pitch types, fatigue, the CPU's pitch, swing and bullpen choices; a calibration test with the target table (rows 52–55) and a "10 rating points are worth" table | One engine for every game type, played or simmed, hitting the targets | you look at the numbers |
| **M2: League and season** (4 steps; range 4–5; medium) | 2.1 30 teams, player generation, the value-based overall, rosters, simple contracts, the 162-game schedule. 2.2 the season: day loop, auto-managed lineups and rotation, standings with tiebreaks, stats and rate stats, leaders, box scores. 2.3 depth: bullpen rest and roles, basic injuries and the injured list, CPU roster moves, WAR, season checks (workload, WAR, standouts, batting spread). 2.4 saving: save version and upgrade step, Export/Import, size measured | A full season sims in seconds, numbers in their windows, saved and loaded safely | none |
| **M3: UI shell and navigation** (3 steps; range 3–4; low–medium) | 3.1 the look, the five tabs, addresses and Back, the popup stack, title screen, new franchise (pick, rename, recolor), Home with Sim, Export/Import buttons. 3.2 Library: player pages, team pages, standings and schedule, leaders, sortable stat tables, box scores, transactions. 3.3 Manage Team (overview, roster, lineup, pitching, injuries) and placeholder pages for Improve Team and Finances. Permanent browser checks in `tools/e2e/` from 3.1 | You can run a franchise by simming, and find everything | **design interview before M3** (look, colors, phone-first or desktop-first); you click around after 3.3 |
| **M4: Playable game view** (3 steps; range 3–4; low) | 4.1 behind-the-batter view: pitch flight, batting, pitching, HUD with player links (opponent profiles reachable in a game), difficulty, Quick Game setup. 4.2 field view animating the play script; steals, tag-ups, bullpen, pause and mute; Play and Quick play of league games from Home. 4.3 feel: simple figures and idle motion, sound, timing checked at both sizes, an autopilot browser check | You play full games by hand, in Quick Game and the franchise | **short interview before M4** (game-view look); **you play a full game by hand** |
| **M5: Postseason and season events** (2 steps; range 2–3; medium) | 5.1 seeding, exact clinch and elimination marks, the bracket, byes, series, play, quick-play or sim each game, sims stop at your games. 5.2 All-Star Game, awards, a simple postseason touch | A season ends with a champion and awards | **you play a postseason game** |
| **M6: Offseason page** (2 steps; range 2–3; medium) | 6.1 the calendar page and logic: awards recap, retirements, growth and aging (one growth function), contracts ending, re-signing, draft, free agency, spring training, Opening Day; until M7 these run automatically by simple rules for every team; season rollover, careers and history; a multi-season test. 6.2 spring training (games, Opening Day roster) and in-season form (icons, lasting changes, profile notes) | Seasons roll over for years | short interview before M6 (offseason flow); you sim 2 seasons |
| **M7: Improve Team and Finances** (5 steps; range 5–7; low) | 7.1 contracts, budgets, payroll, releases, the Finances page. 7.2 team control: service time, arbitration, tender or non-tender, extensions, minor-league free agency. 7.3 free agency: asking prices shown as ranges, CPU teams bid in rounds, players pick the best offer. 7.4 trades: value from projected WAR, age, contract and control, plain reasons for a refusal, CPU-to-CPU trades, the deadline, exploit tests. 7.5 the draft: order, rounds, prospects shown one way with scouted ranges, CPU picks | You can improve your team, and the CPU teams compete | short interview before each area; you play through a full offseason |
| **M8: Polish and publish** (2 steps; range 2–3; medium) | 8.1 how to play, a first-run guide, a glossary, fixes from your playtests, the full browser suite in one command. 8.2 GitHub Pages (you may need to switch it on in the repo settings), a version label, tests on the live page at both sizes and on your phone, a check that Baseball1's saves are untouched, a release tag | Friends can open the link and play | **release playtest**, then you share the link |

**Total: about 25 sessions** (range 23–32) to the public release.

**Lessons from Baseball1 built in from the start** (Claude's defaults)
1. **Seeded randomness everywhere.** Baseball1's `franchisetest` gave different results on identical runs. One random-number source is passed in, so every test repeats exactly.
2. **A calibration test from the first engine step,** with "10 rating points are worth" for every rating, so no rating counts too much or too little. Baseball1 found raw effects far too strong (134-win teams), Power moving batting average more than Contact, and Control barely moving walks.
3. **One engine and one physics** for every game type, played or simmed. Baseball1's exhibition and league settings drifted apart.
4. **One player model** (Quick Game uses league teams).
5. **Save version, upgrade step and Export/Import from the first save,** under keys only Baseball3 uses. Save size is measured every milestone.
6. **Permanent browser checks** in `tools/e2e/` from the first UI step. Baseball1's early browser scripts were lost.
7. **One shared component for each piece of information,** one popup stack, and addresses for Back.
8. **One growth function** for every rating change (aging, breakouts, spring, later training).
9. **Overall and trade value track WAR.** The longplan flagged relievers as overvalued and prospects as undervalued.
10. **Free agency you can't solve at a glance:** no exact asking price, and CPU teams compete. In Baseball1 an offer was accepted the moment it reached the price, and a refusal told you the price.
11. **Exact clinch and elimination math** (Baseball1's marks came a few days late).
12. **Graphics stay simple until after the release.**
13. **No parallel building agents.** I write and read every line; one review agent ends each multi-session milestone (owner's choice).

**After the release** (from Baseball1's longplan; not planned in detail, re-planned after friends' feedback): first-update fixes; deeper stats and stat pages (batted-ball and swing data); clutch; deeper pitching (new pitches, spin, a fastball rework); graphics editor tools and then wiring them in; one development system with training and coaches; deeper injuries; playing by hand (stealing rework, a decision on balk, hit by pitch and bunt); teams (map, logos, history; real cities only after a rule decision); revenue budgets and luxury tax; hidden information ("fog"); deeper trades and free agency (CPU offers, strategies, picks and cash, bidding wars, an auto front office); minor leagues; a deeper draft and scouting; franchise difficulty; rewards; realism (archetypes, a baseball study). **Parked** (your choices in the longplan): owner-manager system, multiplayer, Korea and Japan, more postseason effects, fun modes. App version: not planned.

---

## 5. Hard rules and setup (Claude's defaults carried from Baseball1)

- **No build step, no dependencies.** Plain scripts loaded by `index.html` in a fixed order. Works opened straight from disk (`file://`): no ES modules, no web workers, no fetching local files.
- **Namespace: `B3`** (Claude's default; Baseball1 used `BB`).
- **Logic files never touch the DOM,** so Node can test them. Proposed split: logic in `js/core/`, screens in `js/ui/`, drawing in `js/view/`.
- **Fictional team and player names only.**
- **Save keys:** the IndexedDB database `baseball3`, and localStorage keys starting with `baseball3.`. Baseball1 uses `diamond-dash…`, so nothing collides on `merrill3.github.io`.
- **Tests:** `node tools/test.js` runs every Node test and must pass after every change. The calibration and season tests join it in M1 and M2.

---

## 6. Questions for you

1. **Section 2:** confirm the list, or change rows by number.
2. **Name:** keep the working title "Baseball3" for now, or name the game? The name also names the final series.
3. **Offseason:** OK for the first tab to become "Offseason" from the end of the postseason to Opening Day (section 3), or a permanent sixth tab?
4. **Names:** keep fictional names everywhere (my default), even though the longplan chose real U.S. cities for Baseball1?
5. **Roadmap:** are the order and sizes OK? About 25 sessions to the release, with M7 the largest at 5.
6. **Clutch:** add it after the release (my default), or put it in the player model from the start?

**The owner's answers (Nov 20, 2026):** 1, 3 and 5 confirmed. 2: the working title is **Diamond Dash**. 4: use the owner's team list (`claude/baseball3-teams-2026-11-20.md` in the planning project): real U.S. cities with invented nicknames, now in DESIGN.md section 6. 6: clutch is parked for later. Also: lightly reference Baseball1's `docs/longplan-draft.md` for the plans.

---

## 7. After the owner's OK: the rest of Session 1 (from the owner's message, Nov 20, 2026)

Recorded here so a new session can resume from this file. These are the owner's instructions.

**Tasks**
4. Write CLAUDE.md (with the hard rules and working rules below), README.md, DESIGN.md, ARCHITECTURE.md and docs/plan.md, using the owner's answers to section 6. docs/plan.md starts with a "Docs version: 1" line, holds the roadmap, and has detailed plans only for the next 1–2 milestones (status, goal, why now, in and out of scope, based on, decisions, ordered tasks each with "Done when", testing, open questions, risks). From then on, "Stopped at:" lives in docs/plan.md.
5. Minimal skeleton: an index.html that loads cleanly from disk, and a Node test command that runs and passes.
6. Commit, push, report, and stop.

**Hard rules** (Claude's defaults carried from Baseball1; the owner can change them)
- No build step, no dependencies. Plain scripts on one global namespace, loaded by index.html in a fixed order. Works opened straight from disk (file://): no ES modules, no web workers, no fetching local files.
- Logic files never touch the DOM, so Node can test them.
- Fictional team and player names only.
- A save key unique to Baseball3, so saves don't collide with Baseball1 on merrill3.github.io.

**Working rules** (every session; owner's choices)
- Work on a branch. Commit and push after every task. Keep the "Stopped at:" line current, because the owner rests for hours between sessions.
- One coding session at a time. Merge to main only with the owner's OK. Milestones that span more than one session end with one independent review agent; no parallel building agents.
- Label every decision "owner's choice" or "Claude's default". Never present Claude's defaults as the owner's choices.
- Once docs/plan.md exists: in any commit that changes CLAUDE.md, README.md, DESIGN.md, ARCHITECTURE.md or docs/plan.md, add 1 to the Docs version and update its date and note.
- Don't build past the current milestone or step.
- End every session with: what's done, how the owner can test it, what's next, the branch name, and the exact prompt for the next session.

**Reference rules for Baseball1** (owner's choices): use its plans as the main input; use its code only as a very light reference (learn what worked or failed; never copy code or files); never change anything in Baseball1. The owner's earlier "Baseball2" plan (copying Baseball1's code) is dropped.
