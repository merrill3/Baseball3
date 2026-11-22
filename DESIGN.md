# Diamond Dash (Baseball3): design decisions

Every product decision for Baseball3, with who made it. So far the rules, the game loop, pitches, swings, balls in play, every rating (hitting, pitching, defense and running) and the CPU's choices are built and calibrated (M1, headless); this file says what will be built. `docs/plan.md` says when.

**Labels**
- **Owner's choice:** the owner decided it.
- **Confirmed Nov 20, 2026:** Claude proposed it in `docs/proposal.md` (section 2, rows 1–64, and section 3) and the owner confirmed the whole list. These count as owner's choices. Numbers in brackets, like [12], are the proposal's row numbers.
- **Claude's default:** Claude picked it and the owner hasn't confirmed it. Easy to change.
- **Suggested:** came from a design discussion and is not decided.

Baseball1 (merrill3/Baseball1, also called "Diamond Dash") is the reference. Its plans were the main input; its code is not copied.

**What must differ from Baseball1** (owner's choice, Session 3, Nov 20, 2026): the **rating system** (section 10) and the **screens and menus** (section 9) are Baseball3's own designs, not Baseball1's. Baseball3's code is written fresh: a Session 3 check found only 8 generic lines (such as a stylesheet link and browser-test setup) that also appear in Baseball1, out of about 2,000. The code ground rules carried over from Baseball1 stay: plain scripts on one global name, no build step, game logic kept apart from the screens (CLAUDE.md "Hard rules"), and a top-down ball-in-play model that writes a play script for the field view.

---

## 1. Goal and name
- **Goal** (owner's choice): a public web page friends open in a browser on a phone or computer, on GitHub Pages. An app version may come later; it is not planned.
- **Working title: Diamond Dash** (owner's choice, Nov 20, 2026), the same name as Baseball1. The repo stays Baseball3, and saves use Baseball3's own keys (see ARCHITECTURE.md "Saving"), so the two games don't collide on `merrill3.github.io`.
- **The final series is the "Diamond Series"** (Claude's default: the proposal tied the final's name to the game's name, and the name stayed Diamond Dash).

## 2. Core game and controls (confirmed Nov 20, 2026)
- A full mini baseball game: you bat and pitch against a CPU team [1].
- Quick Game: pick 1, 3 or 9 innings. Franchise games are always 9 innings [2].
- Runs in the browser with no build step [3].
- **Batting is timing only.** Tap, click or press Space to swing. Early pulls the ball, late goes the other way, perfect timing hits hardest. Pitches outside the zone are harder to hit well, so you can take them [4].
- **Pitching:** pick one of your pitcher's pitches, then tap where to throw it. Control isn't perfect, so the pitch lands near the target [5].
- **Fielding and baserunning are automatic,** except two choices: send a runner to steal, and send the lead runner to tag up after a catch [6]. The longplan's "rework stealing" is still undefined (after the release).
- **Camera behind the batter** for every pitch [7], cutting to a **top-down field view** when the ball is in play [8].
- **Clean, flat 2D art on a canvas** [9].
- **Phone and desktop,** with touch, mouse and keyboard [10]. Phone-first or desktop-first is settled at the design interview before M3.
- **Easy, Medium and Hard.** Difficulty changes pitch speed, the swing timing window, CPU hitting and pitching, and hints (Easy shows the pitch type and where it will cross the plate). It changes only games you play; simulated games use neutral settings [11, 43].
- **Quick Game uses league teams:** pick any two of the 30 teams, with their real rosters and ratings. No separate exhibition rosters [12, 32]. You pick home or away [16].
- **Box score after every game.** Win/loss records and personal bests are saved in the browser [13].
- **Sound effects** made in code (Web Audio), with an umpire voice by speech synthesis where the browser supports it. Built in M8 [14].
- **Extra innings:** Quick Game plays up to 3 extra innings, then ends in a tie. League games always play to a winner. In regular-season and spring games each extra inning starts with a runner on second; postseason games don't [17].
- **Mercy rule:** Quick Game only (a 10-run lead after 7 innings, in 9-inning games). Never in league games [18].
- The designated hitter is used, so pitchers don't bat (Claude's default, as in Baseball1).
- **Rules details** (Claude's defaults, set in M1 step 1.1 where the decisions above leave a gap):
  - Quick Game extra innings start with no runner on second (only regular-season and spring games have one; Baseball1's exhibitions had none either).
  - The mercy rule is read as: the game ends when a team leads by 10 or more once the trailing team has batted 7 times, checked at the end of each half-inning, and at once if the home team reaches the lead while batting.
  - The runner placed on second in extra innings is the batter before the inning's leadoff hitter, and a run he scores is unearned.
  - Official scoring rules: on a walk-off only the runs needed to win count, except on a home run, and the batter gets only as many bases as the winning run moved; runs don't count on a play that makes the third out by a force or on the batter; runners keep their order.
  - Runners can steal second and third, not home. In a double steal the catcher throws to the lead runner.
  - On a tag-up only the lead runner can go (the owner's choice: you send the lead runner); trailing runners hold.
  - No dropped third strike. No RBI on a run that scores on an error or a ground-ball double play. A run is earned unless its runner reached on an error, scored on an error play, or was the placed runner (a simple rule, extended in step 1.2; the full rule, replaying the inning without the errors, comes with ERA in M2 step 2.2).
  - The CPU changes pitchers only between batters; you can change between any two pitches. No three-batter minimum for relievers.
  - Hit by pitch, bunts, balks, wild pitches, pickoffs, pinch hitters and defensive substitutions are out (after the release, as in docs/plan.md). Catchers' Blocking waits for wild pitches (section 10).
- **Ball-in-play details** (Claude's defaults, set in M1 step 1.2):
  - One standard park in M1: 330 ft down the lines, 375 ft in the gaps, 400 ft to center, an 8 ft wall. Park sizes come with the league in M2.
  - Foul flies and pop-ups can be caught for outs, only in foul ground near the lines and behind the plate. No foul tips and no ground-rule doubles: a ball that bounces stays in play. A leap at the wall can take back a home run.
  - Errors always put the batter on base (a fumble, a wild throw or a dropped fly), charged to the fielder. Errors that only give runners an extra base on a hit come later.
  - The batter-runner is never thrown out stretching a hit in M1: he takes an extra base only when he judges he'll make it. Runners already on base can be thrown out taking one.
  - Runners who were stealing get their jump on a ball in play, and must go back on a ball caught in the air, so they can be doubled off.

## 3. Look and motion (confirmed Nov 20, 2026)
- Starting idea: sleek near-black silhouettes with team-color trim (cap, sleeves, number), a light rim highlight, belt and sock trim, dark hands. Drawn simply. The final look is settled at the interview before M4 [19].
- **The first version uses a few simple key poses and light idle motion.** A full jointed skeleton waits until after the release, because graphics cost was Baseball1's biggest problem [20].
- Tiny top-down running figures in the field view [21].
- Later: reactions, follow cam, replays, special postseason presentation. M5 adds one simple postseason touch [22].
- Later: graphics editor tools (Baseball1's "option B") and any 3D look. Nothing in the first version depends on them, and 3D would break the hard rules [23].

## 4. Pitching and bullpen (confirmed Nov 20, 2026)
- **7 pitch types:** four-seam fastball, sinker, cutter, slider, curveball, change-up, splitter. Each has its own speed, movement, effect on contact and deception [24].
- **Arsenal size** (owner's choice, Session 2, Nov 20, 2026; replaces "3–5 for every pitcher" [25]): starters throw 3–6 pitch types (mostly 4; 6 very rarely), relievers 2–4 (mostly 2; 4 very rarely). Each pitch has its own grade and shape (section 10).
- Full league staffs in every game, Quick Game included [26].
- Bring in a reliever between pitches (BULLPEN button or `B`). A removed pitcher can't return. The CPU changes pitchers when its pitcher tires or is hit hard [27].
- Fatigue lowers Command and velocity. The HUD shows your pitcher's energy [28].
- **Each rating has one job** [29, 30]. The jobs are in section 10. The ratings redesign (owner's choice, Session 2) replaced the first list here: Stuff (makes hitters miss) is retired, Control is now Command, and Eye is split into Recognition and Discipline.
- The calibration test checks each job from M1. These come from Baseball1's lessons: Control barely moved walks, chase rates didn't change with pitch quality, and the four-seam fastball was the most hittable pitch.

## 5. League, season and franchise (confirmed Nov 20, 2026)
- You control one team. Take over any of the 30, rename it, recolor it [31].
- 30 teams in 2 leagues of 3 divisions, a 162-game season [33]. Teams are listed in section 6.
- Each game: Play it, Quick play only its key moments, or Sim it. You can also sim a day, a week, a month, to a date, or to the end [34].
- Standings, leaders, awards and an All-Star Game (M5) [35].
- Injuries and rest, and a 5-man rotation. Basic injuries in M2; deeper injuries after the release [36].
- Trades, free agency and a draft, in Improve Team (M7) [37].
- Spring training: about 15 games with separate stats, small breakouts and slumps, then you set your 26-man Opening Day roster (M6) [38].
- **Postseason: 12 teams,** 6 per league (3 division winners and 3 wild cards). The top 2 seeds per league get a bye. Wild Card Series best of 3, Division Series best of 5, League Championship Series best of 7, Diamond Series best of 7 [39].
- You can play, quick-play or sim every postseason game. While your team is alive, multi-day sims stop at your games; "Sim to my next game" skips to your next one [40].
- **Saving:** one franchise slot, autosaved, with a save version, an upgrade step for older saves, and Export and Import from the first saving step (M2) [41].
- Every game keeps full stats. Full box scores are kept for your games and recent days only, to keep the save small [42].
- **Rosters:** 26 active (13 position players, 5 starters, 8 relievers including a closer) plus a reserve squad. Minor leagues come after the release [44]. **Reserve squad: about 14** (40 in all) (owner's choice, Session 7, Nov 21, 2026).
- **Schedule mix** (owner's choice, Session 7, Nov 21, 2026; step 2.1 builds it): about 52 division games (13 against each rival), 64 against the other 10 teams in the league, and 46 interleague (every team in the other league at least once, plus a natural rival).
- **Starting balance** (owner's choice, Session 7): a new league starts with a realistic spread: a few teams expected to win about 95–100, a few about 60–65, most in between.
- **Player names** (owner's choice, Session 7): a realistic mix with lots of variety: mostly American, many Latin American, some Asian and others.
- **Positions** (owner's choice, Session 6, Nov 21, 2026; step 2.1 builds it): each player has a main position. Infield ladder: SS → 2B or 3B → 1B; a player moves only down it, never back up, at a cost of a few fielding points for each move down. 2B↔3B is a sideways move at the same small cost. LF, CF and RF swap freely at a very small cost. Infield↔outfield moves are rare (about 1 player in 20, mostly bench utility men), at a bigger cost. Only catchers catch; a catcher can move down to 1B. Anyone can DH at no cost. The exact costs are Claude's default, set and reported when built.
- **Ratings** run 20–99, and 60 is an average big-leaguer [45]. Which ratings there are is in section 10 (the ratings redesign replaced the proposal's list: Contact, Power, Eye, Speed, Fielding, Arm; Velocity, Control, Stamina, Stuff).
- **Overall rating tracks value** (WAR) by position, and teams get a team overall [46]. **Its scale** (owner's choice, Session 7, Nov 21, 2026): stretched to the 20–99 scale, so about 50 is an average regular, 70 and up an all-star, 80 and up an MVP type. With ratings of about equal value per point, the overall is close to a plain average of them, weighted by position (Claude's default, section 10).
- **Growth:** one growth function handles every rating change (aging, performance, spring breakouts, in-season lasting changes, later training), for your team and the CPU teams alike (M6) [47]. It also grows and ages pitch grades and handles learning a new pitch (section 10).
- **Contracts and money:** salary in $M, years left, and a payroll budget per team. Payroll always means the whole organization (active roster, injured list, reserves) plus released players still being paid [48]. Finances stay lightweight for now (owner's choice).
- **Releasing a player:** you keep paying him until his contract would have ended. Blocked during the draft, and blocked if it would leave the roster too thin (M7) [49].
- **Team control** (M7) [50]: 6 years of big-league service before free agency; about 3 years near the minimum salary, then 3 arbitration years with automatic raises; you tender or non-tender arbitration players; extensions at any time until free agency; minor-league free agency after 7 seasons in the organization without reaching 6 years. CPU teams follow the same rules.
- Build order: the foundation first, as in the roadmap in `docs/plan.md` [51].

## 6. Teams (owner's choice, Nov 20, 2026)

From the owner's list (`claude/baseball3-teams-2026-11-20.md` in the planning project). Two nicknames were cut to 3 syllables or fewer: Bodega Cats became **Bodegas**, Gila Monsters became **Gilas** (syllables counted in the nickname only).

**Coast League**

| Division | Team | Code | Colors |
|---|---|---|---|
| Atlantic | Boston Wicked | BOS | brick #8B2F23 / granite #6F7378 |
| Atlantic | New York Bodegas | NYC | awning green #1F6F43 / tabby orange #D9822B |
| Atlantic | Philadelphia Jawns | PHI | pretzel brown #8A5A2B / mustard #D9A520 |
| Atlantic | Baltimore Hons | BAL | Formstone gray #7D7468 / hairspray blue #6FA8DC |
| Atlantic | Washington Monuments | WAS | marble #E8E4DA / Potomac blue #2C4A6B |
| Gulf | Miami Flamingos | MIA | flamingo #F26B8A / Biscayne turquoise #1FB5B0 |
| Gulf | Tampa Cigars | TAM | tobacco #6B4226 / band gold #C9A227 |
| Gulf | Orlando Swans | ORL | lake teal #2E7F86 / beak orange #E8752C |
| Gulf | New Orleans Yats | NOL | streetcar green #2F5D3A / Mardi Gras purple #5B2C83 |
| Gulf | Houston Bayous | HOU | bayou olive #4E5B31 / sunset orange #E8612C |
| Pacific | Seattle Freeze | SEA | drizzle gray #5E6A71 / evergreen #1D4D3A |
| Pacific | Portland Roses | POR | rose #C2185B / moss #6B8E3D |
| Pacific | San Francisco Sourdoughs | SF | bridge orange #C0362C / fog #B8BEC2 |
| Pacific | Los Angeles 405s | LA | freeway green #006B3F / sunset violet #8E4F8C |
| Pacific | San Diego Sea Lions | SD | cove blue #1B7BAA / kelp #3B5323 |

**Heartland League**

| Division | Team | Code | Colors |
|---|---|---|---|
| Lakes | Chicago Els | CHI | L-car silver #9EA3A8 / lake blue #1E5C8C |
| Lakes | Detroit Mittens | DET | steel #5A6470 / mitten red #A8322D |
| Lakes | Cleveland Walleyes | CLE | Lake Erie green #3F6B5A / walleye gold #C9A13B |
| Lakes | Pittsburgh Yinzers | PIT | smoke gray #4A4A48 / incline red #B23A2E |
| Lakes | Minneapolis Skyways | MIN | lake ice #A9CCE3 / north-woods green #2F4F3A |
| Central | Atlanta Peaches | ATL | peach #F4A261 / red clay #A0442B |
| Central | Nashville Pickers | NSH | sunburst #C1661C / denim #2E4A6B |
| Central | St. Louis Arches | STL | steel #A8B0B5 / river brown #6E5A3C |
| Central | Kansas City Burnt Ends | KC | bark #2B1D16 / sauce red #8B1E1A |
| Central | Dallas Y'all | DAL | sky blue #4A90C2 / boot brown #6B4423 |
| Desert & Mountain | Denver Mile High | DEN | Red Rocks #A0452E / snowcap #F0F3F5 |
| Desert & Mountain | Phoenix Gilas | PHX | gila orange #E07B39 / gila black #231F20 |
| Desert & Mountain | Las Vegas Locals | LV | neon pink #FF3EA5 / desert night #1A1A2E |
| Desert & Mountain | Salt Lake Brine Shrimp | SLC | salt white #EEEDE8 / Wasatch blue #3E5C8A |
| Desert & Mountain | Austin Bats | AUS | dusk purple #4B3A6B / limestone #D8CBB0 |

**The names rule** (owner's choice, Nov 20, 2026; Claude's wording, confirmed by the owner in Session 2): teams use real U.S. cities with the invented nicknames above. Nicknames, logos, players and coaches stay invented, and no real MLB team or player name is ever used.

Claude's defaults (to check when M2 builds the league): codes are 2–3 letters as listed; market sizes, ballpark sizes and the schedule's division and league mix get proposed in M2.

## 7. Calibration targets (confirmed Nov 20, 2026; originally approved by the owner in Baseball1's Milestones 1b and 2b)

League games, over several simulated seasons. M1 tunes the league-wide rates; M2 re-checks them over full seasons and adds the per-player targets.

**New league baseline** (owner's choice, Session 8, Nov 21, 2026: "in between" real recent MLB and the older targets below; the exact bands are Claude's default, confirmed by the owner). Real 2024–2026 MLB averaged about 4.44 runs, .244/.315/.401 and 1.14 home runs per team-game (Baseball-Reference); 2019 had 4.83 runs, .252/.323/.435 and 1.39. Step 1.5 tunes to these bands, which replace the first seven rows of the table below and the walk row:

| Measure | Band |
|---|---|
| Runs per team-game | 4.6–4.7 |
| AVG / OBP / SLG | .250–.255 / .318–.325 / .415–.425 |
| Home runs per team-game | 1.25–1.35 |
| Strikeouts | 21.5–23% of plate appearances (real: 22–23% every season since 2019) |
| Walks | 8–9% of plate appearances |
| Doubles / triples per team-game | 1.5–1.8 / 0.1–0.2 |
| Steals | about 0.9 attempts per team-game, about 78% safe (real since the 2023 rules) |

Chase rate, whiffs, pitches per plate appearance, starters' workloads and errors stay, re-checked against real 2024–2026 numbers. The per-player targets (standouts, .300 hitters, the batting champion, regulars under .240) are re-set from real seasons near this batting average (2019, 2023) and checked in M2 (Claude's default).

**Older targets** (until Session 8):

| Measure | Target |
|---|---|
| Runs per team-game [52] | about 4.3–4.6 |
| Strikeout rate [53] | about 21% (20–22%) |
| League AVG [53] | about .260 (.255–.264); may move if the .300 and .240 counts need it |
| League SLG [53] | about .440 (.430–.450) |
| Doubles per team-game [53] | 1.4 or more on average |
| Triples per team-game [53] | 0.2 or fewer |
| Home runs per team-game [53] | about 1.5 (1.4–1.55) |
| Standout starters (28% K or more) per league [54] | 1–2, maybe 3–4 |
| Standout hitters (.600 SLG or more) per league [54] | 1–2, maybe 3–4 |
| .300 hitters per league [55] | 5–10 |
| Batting champion, each league [55] | .330–.350 |
| Regulars under .240 against .300 hitters [55] | more under .240 than at .300 |
| Contact against Power, in AVG [55] | Contact moves AVG more than Raw Power does |

**Extra engine targets** (Claude proposed them from general baseball knowledge; the owner kept them in Session 2, Nov 20, 2026). M1 tunes these too:

| Measure | Target |
|---|---|
| Walks | about 8% of plate appearances (owner's choice; Baseball1 ran about 6%). If 8% can't fit with 4.3–4.6 runs, Claude reports before cutting anything |
| Chase rate | hitters swing at about 28–32% of pitches outside the zone (Baseball1 measured 23%) |
| Whiffs | about 24–26% of swings |
| Pitches per plate appearance | about 3.8–3.9 |
| Starters | about 5.3–5.8 innings and 85–95 pitches a start |
| Errors | about 0.5 per team-game |

**Equal-value check** (Claude's default, from the ratings interview; M1 step 1.4; **from Session 8 a report, not a gate**: where it clashes with the real stats in section 10, realism wins and the gap is reported, owner's choice): for each rating in section 10 except Stamina, +10 points at 40, 60 and 80 is worth about the same in runs, within about ±20%, across several test hitters and pitchers. Defense and running ratings are checked at their key positions (the value rule in section 10). How it is measured (Claude's default, Session 5): only the tested rating moves (everyone else stays at 60), for a whole lineup or staff, by paired replays of the same plate appearances (`tools/lib/value.js`); the target is about 0.3 runs per team-game for +10 points (so one hitter's +10 is about 5 runs a season).

**Calibration results** (M1 step 1.4, Session 5, Nov 21, 2026; `node tools/calibrate.js`: 3,000 games between rated test teams, 115,000 replayed plate appearances per condition; noise about ±0.02–0.05 on each value)
- **Targets:** runs 4.53 per team-game, K 20.8%, AVG .258, SLG .438, OBP .319, doubles 1.53, triples 0.07, home runs 1.54 (the owner accepted about 1.56), walks 8.3%, chase 30.3%, whiffs 25.9% of swings, starters 5.35 innings and 89.8 pitches, errors 0.50: all inside their bands. **Miss:** 3.92 pitches per plate appearance (target 3.8–3.9). Steals: 0.77 attempts a team-game, 74% safe (Claude's aim: about 0.5–0.8 at about 75%). Platoon edge: OBP .326 and SLG .451 against opposite-handed pitchers, .312 and .426 against same-handed.
- **Equal value** (+10 at 40, 60, 80; target 0.24–0.36): inside for Contact (0.29, 0.30, 0.34), Timing (0.27, 0.31, 0.33), Raw Power (0.31, 0.32, 0.36), Recognition (0.26, 0.29, 0.34), Velocity (0.26, 0.36, 0.31) and grades (0.28, 0.28, 0.36). **Small misses:** Launch 0.30, 0.36, 0.38; Discipline 0.33, 0.31, 0.38; Command 0.44, 0.26, 0.34; Deception 0.34, 0.38, 0.37. At the start of step 1.4 the same table ran from 0.02 (Velocity) to 0.86 (Raw Power at 80). Contact moves AVG more than Raw Power (+.008 against +.006 for +10).
- **Defense and running** (one player at 70; a hitting point is 0.035 runs per team-game): Range at SS 0.037 and in CF 0.040, Hands at SS 0.041, Framing at C 0.034, Speed in CF 0.040 (running 0.014, fielding 0.026): a full point. Arm in RF 0.014 and Baserunning for a regular 0.016: half a point (owner's choice). **Miss:** Arm at C 0.048 ±0.018 (noisy; it should be about 0.018). Elsewhere less, as the rule says: Range at 1B 0.016, Hands at 2B 0.025, Arm in LF 0.021, Speed at DH 0.003.
- **Tendencies** (runs per team-game against Balanced, for a whole lineup or staff): Patient +0.07, +0.03, −0.03 and Aggressive +0.00, +0.01, +0.08 at Discipline 40, 60, 80 (neutral, and Aggressive pays off as Discipline rises). Nibbler +0.18, +0.11, −0.04 and Attacker −0.13, −0.03, +0.05 runs allowed at Command 40, 60, 80 (Nibbler pays off as Command rises; Nibbler at 60 sits just past ±0.1). Against stuff: Attacker −0.04 and −0.13 runs allowed at Velocity 40 and 80, −0.01 and −0.06 at grades 40 and 80; Nibbler +0.08 and +0.10, +0.09 and +0.15 (good stuff rewards Attacker, as the owner suggested; the Nibbler side is small).
- **Pitch shape:** +0.5, −0.5, +1 and −1 on every pitch: +0.03, +0.01, +0.01, −0.04 runs allowed (value-neutral, owner's choice).
- **Speed:** a season's 2,430 games take about 25 s in one process (budget about 10 s; the owner accepted about 13 s for now). See docs/plan.md for the plan.

- Built in from the start (M1–M2), not added later [55].
- Played and simmed games use the same model. There is no special edge in games you play. Re-add one only if playtests ask for it [56].
- 25 hidden archetypes for player generation: later, as in Baseball1 [57].
- A "regular" has 502 or more plate appearances; a "qualified" starter has 162 or more innings (Claude's default, as in Baseball1).
- Targets came from general baseball knowledge, not research (as in Baseball1). From Session 8 they come from real data: Baseball-Reference, FanGraphs and Baseball Savant, 2024–2026 (Claude's default).

## 8. Workload, WAR and form (confirmed Nov 20, 2026)
- **Bullpen rest** (M2) [58]: no reliever pitches 3 days in a row. A long outing needs extra rest: over 20 pitches means 1 day off, over 35 means 2, over 50 means 3. Roles are set each day from the rested arms: closer (9th or later, lead of 0–3), two setup men (7th and 8th of a close game), middle relief.
- **Workload targets** [59]: the busiest reliever about 60–80 innings and at most about 75 games; the top starter under about 210 innings.
- No "pace guard" or fixed hook percentages as patches. Stamina is tuned directly, and patches return only if tests need them [60].
- **WAR targets** [61]: about 1,000 a season across the league, about 57% hitters and 43% pitchers; MVP about 8–10, nobody much past 11; Rookie of the Year typically 3–6. Rookies count only up to age 27 from the second season on. Reliever of the Year needs 80% of his games in relief. No display "stretch" on hitters' WAR (Baseball1 had one; Baseball3's sim should let stars stand out on its own).
- **In-season form** (M6) [62]: players run hot (🔥) or cold (❄️) for a few weeks, with one icon each, next to their names everywhere and in the game HUD. Nothing goes to the news. Spring results set Opening Day form. A few players a season make a lasting change: small steps forward or back, big breakouts (mostly 27 and under, a rare late bloomer up to about 31), and prospect busts that also lower potential. Each leaves a note on the player's profile. Lasting changes go through the one growth function.
- **Form starting values** [63]: form is −6 to +6 rating points, half of it fades in about 12 days, and the icon shows at ±2.8 or more.

## 9. Navigation and screens (confirmed Nov 20, 2026)
- **Five tabs, always in the same place:** Home, Manage Team, Improve Team, Finances, Library. A bottom bar on phones, a top bar on desktops [64; section 3].
- **Home** is the daily hub: today's game (Play, Quick play, Sim), sim controls, a standings snapshot of your division, news, and alerts.
- **Offseason:** its own calendar-style page, connected to Improve Team (owner's choice). From the final out of the postseason to Opening Day, the first tab reads "Offseason" and opens the calendar, since the calendar is the daily hub then (confirmed Nov 20, 2026). Improve Team links to it all year; during the season it previews key dates and your expiring contracts. Each offseason step opens the matching Improve Team page.
- **Manage Team** is assessment-first (owner's choice): an overview (record, run differential, how your hitting, pitching and defense rank, strengths and needs), then Roster, Lineup, Pitching, Injuries and the Auto-manage switch. Game prep lives here (owner's choice).
- **Improve Team:** Trades, Free agency, Draft. *Suggested:* player development and long-term planning (after the release).
- **Finances:** lightweight for now (owner's choice). *Suggested:* budget, payroll, contracts.
- **Library:** organized by subject, with attractive pages plus dense sortable tables (owner's choice). It has two parts (owner's choice, Session 2, Nov 20, 2026, from the ratings interview):
  - **Reference:** ratings, stats and rules. This is the glossary: M8 writes its text, and the help links here (one home).
  - **Archive:** the subjects, history and the advanced diagnostics (section 10). A player's diagnostics are on his player page.
  - Each subject is its own page. *Suggested subjects:* players, teams, standings and schedule (with the bracket), leaders, stats and records, transaction history. The look is settled at the design interview before M3.
- **Rules** (confirmed Nov 20, 2026):
  - Every piece of information has one home. Other places link to it or reuse the same component. Home's standings card is a snapshot that links to Library, never a second standings screen.
  - *Suggested* (adopted): information can be reached from wherever it's needed. A player's contract is one block on his player page, reachable from Manage Team, Improve Team and Finances.
  - One way to show each thing: potential, contract status and form are each drawn by one shared function.
  - Each feature lives in one area. Trading happens only in Improve Team; other screens link there.
  - Back is predictable. Pages have addresses (`#/library/players/123`), so the browser's Back and a phone's back gesture work. Player and team pages are pages, not popups.
  - Popups only for short choices and confirmations. One stack: Escape or Back closes the top popup only, and every popup closes when the page changes.
  - Easy for new players: plain labels, a short first-run guide and a glossary (M8; the glossary is the Library's Reference part).

**Lessons from the owner's Baseball1 playtests** (owner's list, possibly incomplete): features shouldn't be scattered (trades were "all over the place"); no duplicate screens (standings showed twice); easy for new players; information easy to find; popups and Back behave predictably; batters must chase some pitches outside the zone; prospect potential must look the same everywhere.

## 10. Ratings (owner's choices, Nov 20, 2026, from the ratings interview)

The owner was interviewed on a full ratings redesign in a separate chat (merrill3/Baseball1, branch `ccr-a97b9715-fnzb96`, `docs/ratings-interview.md`; that branch is not merged and Baseball1 is unchanged). In Session 2 the owner chose to build it in Baseball3, answered the open points, and confirmed this summary. The interview's three rules: each rating has a unique job; a point of each rating is worth about the same (curves allowed); each rating ties to stats that track performance over the long run. M1 step 1.2 built the physical inputs each rating sets (the "rating hooks" in ARCHITECTURE.md), one per job below; step 1.3 maps the hitting and pitching ratings onto them (step 1.4 the defense and running ones; the overall comes in M2).

**Hitting.** A swing has two errors: *when* (timing, in ms) and *where* (bat height against the ball). Six hitting ratings, plus Speed (under running):

| Rating | Job | Main stats |
|---|---|---|
| Contact | The *where* error: whiff, foul or in play | contact %, zone contact %, whiff %, K % |
| Timing | The *when* error: squaring the ball up (where on the barrel he meets it), so exit speed and where a squared-up ball goes, pull or the other way (owner's choice, Session 11, Nov 21, 2026, replacing "handling velocity": handling velocity is Contact's) | squared-up % per contact, average exit speed for his bat speed, spray mix |
| Launch | A tight launch-angle band and spray control | launch-angle spread, sweet-spot %, popup % |
| Raw Power | Bat speed and top exit speed only | max and 90th-percentile exit speed, home runs per fly ball, ISO |
| Recognition | Reading the pitch early: less fooled by off-speed and break, fewer chases on strike-looking pitches | chase on strike-looking pitches, breaking-ball whiff % |
| Discipline | Swing-or-take judgment in and near the zone, by count | walk %, swing-decision run value |

- **Aggressiveness** is a tendency (Patient, Balanced, Aggressive), not a 20–99 rating and not part of the overall. It is about value-neutral alone, and pays off or hurts depending on Discipline. **Which way** (owner's choice, Session 4, Nov 20, 2026): good Discipline rewards Aggressive. A disciplined aggressive hitter attacks hittable strikes early; an undisciplined one chases. Patient is the safer style for a hitter with poor Discipline.
- **Swing path** is a tendency (Ground-ball, Level, Lift; owner's choice, Session 11, Nov 21, 2026), not a 20–99 rating and not part of the overall: the hitter's own shape. It sets his average launch angle and how much he pulls, together (in real data they go together, link 0.59). It is about value-neutral alone. **Which way** (owner's choice, Session 11): Lift pays off with Raw Power (a strong hitter's fly balls leave the park; a weak one's are easy outs), Ground-ball with Speed (a fast hitter beats out grounders); Level is the safe middle. Launch keeps its own job (a tight band, few popups).
- **Your own batting** stays timing only (section 2); your hitter's ratings roll the *where* error.

**Pitching.** Four pitcher ratings plus the arsenal:

| Rating | Job | Main stats |
|---|---|---|
| Velocity | Attacks hitters' timing: late swings, weaker and opposite-field contact, and strikeouts as real velocity gives them (owner's choice, Session 8, replacing the interview's "small strikeout bump, about +1% per 10 points") | fastball speed; whiff %, K %, exit speed and hard-hit % against per mph |
| Command | Scatter around the target: walks and hitting corners | walk %, edge % (owner's choice, Session 14: meatball % moved to Aim) |
| Deception | Hides pitch type and speed; the mirror of Recognition | chase %, off-speed whiff % for its grade |
| Stamina | Pitches per outing. Weighted by role and outside the equal-value rule: it counts for starters, barely for relievers | pitches per start, innings |

- **Aim** is a tendency (Nibbler, Balanced, Attacker), about value-neutral, paying off with good Command. **Which way** (owner's choice, Session 4, Nov 20, 2026): good Command rewards Nibbler. A nibbler with good Command paints the corners; with poor Command he misses off the plate and walks people. Attacker is the safer style for a pitcher with poor Command. **Stuff too** (the owner's idea, Session 5, Nov 21, 2026): good stuff (Velocity and pitch grades) rewards Attacker, poor stuff rewards Nibbler: a hard thrower's strikes are hard to hit anyway, and a soft-tosser's mistakes over the middle get hit.
- **Arsenal:** each pitch has a **grade** (movement and quality) and a **shape** (ground-ball or fly-ball tilt). Grades carry moderate weight; the pitch type stays the main driver. **A shape is value-neutral** (owner's choice, Session 5, Nov 20, 2026): a ground-ball or fly-ball tilt is a style, and neither is better on its own (Claude adds a counterweight to the tilt to make it so). For balance and the overall, the arsenal counts as one usage-weighted composite. It is a section of the pitcher's profile, not its own screen. Sizes are in section 4.
- **Put-away pitch:** the best-graded pitch, with the steep curve past 85. Strikeout aces come from here.
- **Growth** (M6's growth function): pitch grades grow and age. A pitcher sometimes learns a new pitch in the offseason: rare, about 3–5% of pitchers a year, mostly 27 and under or with only 2–3 pitches; it starts at grade 35–50, can grow, and makes a news item. Pitches are never lost.

**Defense and running**
- **Fielders:** Range (first step and route), Hands (clean catches, transfers, quick release: errors and double plays), Arm. **Catchers** also have Framing (borderline strikes). Throwing out base stealers uses Arm plus Hands' quick release.
- **Blocking** (wild pitches and passed balls) waits until those exist, after the release (owner's choice, Session 2), so no rating is without a job.
- **Running:** Speed (raw sprint; also helps Range and infield hits) and Baserunning (reads, jumps, extra bases, steal success, outs on the bases).
- **No baserunning tendency** (owner's choice, Session 3, Nov 20, 2026): how much safety margin a runner wants before taking an extra base is the same for every runner, not a player trait. Aggressiveness and Aim stayed the only tendencies until the owner added Swing path (Session 11).
- **The margin follows the base and outs** (owner's choice, Session 8, Nov 21, 2026, replacing Session 3's "one engine number"): a runner taking third or home wants the safety chance a run-expectancy table says breaks even for that base and out count (`BALL.breakEven`; for example, careful about third with two outs, bolder about home with two outs). `BALL.dare` stays for the other choices. The exact rates are Claude's default.
- **Value rule:** a point of each is worth about as much as a point of a hitting rating at its key spot (Range at shortstop and center field, Arm in right field and at catcher, Framing at catcher, Baserunning for a regular), and less elsewhere. The overall is weighted by position.
- **Hands and Speed in the value rule** (owner's choices, Session 5, Nov 20, 2026): Hands' key spot is shortstop (second base, third base and catcher get less). Speed is worth a full hitting point in center field, with its running and fielding together; less at other spots, and least at DH, where it only runs.
- **Arm and Baserunning are worth half a point** (owner's choice, Session 5, Nov 21, 2026): a point of Arm (in right field and at catcher) and of Baserunning (for a regular) is worth about half a point of a hitting rating. A full point would need unrealistic play: a 99 baserunner would take leads of about 20 feet and read the ball almost at once (about 25 runs a season; the best real ones gain about 8), and strong arms would throw out several times more runners than real ones.

- **Speed's range** (owner's choice, Session 7, Nov 21, 2026): realistic, about 23.5 ft/s at 20, 27 at 60 and about 31 at 99 (Savant: about 24.5 / 27.2 / 30.5). **Each ft/s now does what it does in real baseball** (owner's choice, Session 8, replacing Session 7's "toned down"); if Speed is then worth more than a hitting point, that is reported (realism wins, below).
- **Ratings measured against stats** (owner's choice, Session 7, Nov 21, 2026; built in step 1.5, before step 2.1): a tool measures how each rating from 20 to 99 moves its stats against real target ranges, and the engine is tuned to match. The physics engine stays; stats lead to wins as before. **How** (owner's choices from the Session 8 interview, Nov 21, 2026, unless marked):
  - **The ladder:** a rating's own stat follows real players' percentiles, mirrored around the 50th: 60 = MLB average; 50 and 70 = bottom and top 25%; 40 and 80 = bottom and top 5%; 20 = the worst big leaguer; 99 = the best real player in that skill.
  - **Three layers:** (1) each rating's *own stat*, the one that isolates its job, follows the ladder; (2) each unit of it (a mph of fastball or bat speed, a ft/s of sprint speed, an inch of movement, a mph of arm) moves the downstream stats as much as in real baseball (layer 2 for every rating is Claude's default, from the owner's Velocity choice); (3) combined stats (K%, BB%, AVG, OBP, SLG, ISO, BABIP, HR per fly ball, exit speed, hard-hit %, barrel %; pitchers' K%, BB%, ERA, HR/9, GB%) are checked on a test population with realistic mixed ratings: their spread (5th to 95th percentile) must match real regulars'.
  - **Realism wins** over the equal-value rule. Claude first tries to keep equal value without breaking realism, and reports each gap; the overall weights each rating by its real worth (as Arm and Baserunning count half). The report shows the equal-value tables at every step, pitching included (the owner checks them).
  - **When a rating's ladder and the league's spread clash, the league's spread wins** (owner's choice, Session 10, Nov 21, 2026): several ratings feed the same stats (Contact, Timing, Recognition, Raw Power and the pitch grades all move whiffs, zone contact and strikeouts), so each one alone reaching the ladder's ends would stack into spreads wider than MLB's. The test population's spreads (layer 3) are matched first; a single rating then stops a little short of its ladder's ends (for example 99 Contact with everything else average gives about 93–94% zone contact, not the real best 97%), and the real extremes need two good ratings together.
  - **Stat groups:** all four: hitting and pitching core; bat tracking (bat speed, fast-swing rate, squared-up %, blasts); pitch by pitch type (whiff %, chase %, exit speed and run value by grade; edge % and meatball % by Command; CSW %); running and defense (sprint speed, home to first, arm strength by position, pop time, framing, outs above average, steal and extra-base rates).
  - **Raw Power** stays a ceiling (bat speed) that multiplies with the contact losses (the owner suggested using it only as a maximum that Contact and Timing realize; the engine already works that way). Bat speed widens to the real spread, and Contact and Timing gate it harder (a smaller sweet spot), tuned until max and average exit speed, squared-up % and blasts match real data.
  - **Velocity** (the owner's concern that it gets too weak, as in Baseball1): its mph and each mph's effect on whiffs, strikeouts, contact and runs follow real data; if it still ends up weak anywhere, Claude reports why.
  - **Physics:** Claude may add or adjust small physical effects where tuning alone can't match real data, each labeled Claude's default and reported for the owner to keep or drop; no engine rewrite.
  - **The report:** the tool writes one self-contained HTML chart page (each rating's engine line from 20 to 99 against the real band, the per-unit effects, the population check, the equal-value tables); Claude publishes it as a private link; the key numbers go into this file.
  - **Claude's defaults** (confirmed by the owner in the summary): real data from 2024–2026 player-seasons pooled (hitters with 250+ plate appearances, pitchers with 250+ batters faced), 99 = the best player-season; exit speed and hard contact nudged a little above real so the league fits the new baseline (section 7); the test population's ratings spread about 12 points per standard deviation around 60 (M2's generation then matches it); **its ratings are independent, except that Raw Power and Contact lean opposite (correlation −0.3: power hitters tend to whiff more)** (owner's choice, Session 10, Nov 21, 2026, replacing Session 8's mild correlation: it reproduces MLB's correlations of bat speed with whiff %, K% and squared-up %, and narrows the league's AVG and SLG spreads toward MLB's; pitchers' ratings are independent too, Claude's reading of the choice); tendencies 1 : 2 : 1 (Claude's default, as in the rated test teams). Own stats: Contact: zone contact %; Timing: squared-up % per contact (owner's choice, Session 11); Launch: sweet-spot % and launch-angle spread; Raw Power: bat speed, max and 90th-percentile exit speed; Recognition: whiff % and chase % on breaking and off-speed pitches; Discipline: swing/take run value and zone swing % minus chase %; Velocity: fastball speed; Command: walk % and edge % (owner's choice, Session 14, Nov 22, 2026: meatball % follows zone % in real data, so it moves to Aim); Deception: chase % against; pitch grades: movement above the type's average and whiff % for the type; shape: ground-ball %; Stamina: pitches per start; Speed: sprint speed and home to first; Baserunning: extra bases taken %, steal success, baserunning runs; Arm: arm strength by position, catchers' pop time; Range: outs above average, outfield jump; Hands: errors per chance, double plays turned; Framing: strike rate on borderline takes. Tendencies: Patient and Aggressive near the bottom and top 15% of real swing %; Nibbler and Attacker likewise on zone %, with meatball % as Aim's stat too (owner's choice, Session 14); Ground-ball and Lift likewise on average launch angle (Claude's default, Session 11).
- **Merge or split, checked against real skills** (Session 11, Nov 21, 2026; the owner asked whether to merge or split ratings). For each rating's own stat, the part the other ratings' stats don't explain was tested for repeating in the same players from 2024 to 2025 (Savant; 225 hitters with 250+ PA and 300+ tracked swings, 144 pitchers with 250+ batters faced; `tools/realskills.js`). Year-to-year r of that part: zone contact 0.71, off-speed whiff 0.65, off-speed chase minus fastball chase 0.64 (it is unrelated to overall chase, r 0.08), chase 0.84, bat speed 0.80, squared-up per contact 0.55 (no rating owned it), average launch angle 0.78 and pull % 0.53 (no rating or tendency owned them; the engine's ground-ball % spread was 0.47× MLB's, pull % 0.60×), sweet-spot % 0.40 (itself only 0.42: a weak skill); whiff against 95+ mph **0.07** once fastball whiff is known (85% of it is fastball whiff). Pitchers: fastball speed 0.88, off-speed whiff 0.54, chase against 0.50, walk % 0.50, zone % 0.72 (the Aim level), meatball % 0.29 (mostly zone %), exit speed against 0.51.
  - **The owner's choices:** Timing's job becomes squaring up (above); hitters get the Swing path tendency (above); everything else stays, including the Recognition and Discipline split (both are separate real skills).
  - **Claude's defaults (confirmed in the summary):** Velocity's lateness now plays against Contact, not Timing, and Timing's part in whiffs shrinks (one fewer rating feeding strikeouts); no new pitcher rating for exit speed against (a real skill, about as big per standard deviation as walks, but Velocity, the grades and Command already spread it 0.83× as wide as MLB); defense and running were not tested (real data does not separate Range from Hands cleanly); the Swing path mix is 1 : 2 : 1, as for the other tendencies.

**The whole set**
- **Top end:** steep past about 85, the same shape for every rating. Bonuses from combining ratings are capped.
- **Stars** are mostly specialists with real holes. Ratings are drawn independently, except that Raw Power and Contact lean opposite (−0.3) (owner's choice, Session 10, replacing "mild correlation"); a rare few are elite across the board by chance.
- **Handedness** (owner's choice, Session 3, Nov 20, 2026; not from the interview): batters bat left, right or both (a switch hitter bats from the side opposite the pitcher), and pitchers throw left or right. Handedness mirrors where a hitter pulls the ball and which way a pitch breaks. There is a small platoon edge: hitters see opposite-handed pitchers a little better. Its size is set and reported at calibration (M1 step 1.4). There are no separate split ratings.
- **Retired and renamed** (Claude's reading of the interview, confirmed by the owner in Session 2): Stuff is retired (its whiff job moves to pitch grades and the put-away pitch); Control is now Command; Eye is split into Recognition and Discipline; Power is now Raw Power; Fielding is split into Range and Hands.
- **Diagnostics** (squared-up %, chase on strike-looking pitches, launch-angle spread, swing-decision run value) are an advanced view in the Library's Archive part (section 9). M2 stores the counts they need.
- **Clutch** is not part of this; it stays parked (section 11).

**Claude's defaults** (not decided; set and reported during calibration)
- The equal-value check in section 7 (±20%).
- The overall as a near-plain average of the ratings, weighted by position; M2 checks that it still tracks WAR.
- Exact numbers: where the steep curve starts and how steep it is, the cap on combination bonuses, how strongly ratings correlate in generation, and how Speed fits the value budget.

**How the ratings and the CPU's choices work** (Claude's defaults, M1 steps 1.3–1.4; the numbers are in `B3.tune`, calibrated in step 1.4 with `node tools/calibrate.js`)
- **Scale:** each rating sets its own physical inputs; 60 gives the average big-leaguer's value. A spread or noise shrinks by a share per step, a speed or share grows by an amount per step, and a share that can't pass 1 (Recognition) loses a share of what is left. **How many steps** a rating's points give comes from its own table (step 1.4), fitted by `tools/calibrate.js --part=fit` so that +10 points are worth about the same runs at every level and for every rating (the equal-value check, section 7).
- **The steep curve:** past 85 a rating plays higher: 90 like 91.25, 95 like 100, 99 like 108.8. **The cap:** in each group (the hitting ratings; the pitching ratings with every pitch grade) only the biggest such extra counts in full, the others at half, and together they add at most 12 points. Stamina is outside the cap.
- **Stamina:** one scale for every role, in pitches before fatigue: 30 is 28 pitches, 60 is 92, 80 is 110. Relievers are low-Stamina pitchers.
- **The arsenal:** a pitch's grade (20–99) scales its movement and bite; its shape (−1 fly-ball tilt to +1 ground-ball tilt) tilts the launch angle by up to 4°, without adding movement. The put-away pitch is the best grade (a tie goes to the type that misses the most bats).
- **Swing or take (CPU hitters):** the hitter judges where the pitch will cross. He reads part of its movement (Recognition against Deception) and takes the rest for a fastball's, so a slider off the plate or a curve in the dirt can look like a strike. Discipline sets the noise in that judgment and a lean toward seeing balls as strikes (poor Discipline shows mostly as chasing). He swings when it looks inside a line set by the count (he takes the corners early and protects with two strikes), and early in the count he sometimes takes all the way. Aggressiveness skips some of those takes and moves the line out in step with his lean (Patient: the reverse).
- **The pitch (CPU pitchers):** the type by its usual share and its grade, fastballs when behind, the put-away pitch with two strikes; in the zone by a chance set by the count, or just off the plate (low for pitches that sink or break). Aim moves both: a nibbler works the corners and the edges, an attacker comes in toward the middle.
- **Pitching changes (CPU):** a starter leaves when tired (past his Stamina) or hit hard; relievers by fatigue, runs and role (closers and setup men pitch one inning).
- **Steals and tag-ups (CPU, step 1.4):** the lead runner judges his chance (his jump and Speed against the delivery, the catcher's quick release and Arm), with an error from his Baserunning, and goes only when it looks good; a tag-up goes when his judged chance is good enough for his base. Runners judge a fielder's arm only partly (they see half of how far it is from his position's usual arm), so a strong arm throws out runners who test it, not only holds them.
- **Defense and running (step 1.4):** Range (first step and route) and Arm are graded against the fielder's position: at 60 he has the position's usual first step and arm. Hands lowers errors and quickens every catch-and-throw (double-play pivots, the catcher's throw on a steal). Framing (catchers) moves the borderline edge toward strikes. Speed is sprint speed, also a fielder's speed to the ball. Baserunning quickens the read and the jump, sharpens judging an extra base, and adds a little to every lead. Defense and running form a third group for the combination cap.
- **Physics added in step 1.3** so each rating's job shows: a mistimed swing has less of the bat in the ball's path and misses more; pitches faster than a hitter's comfort make him late (Velocity against Timing); a pitch away from the middle is harder to square up and comes off the bat slower, so swinging at balls costs.
- **Physics changed in step 1.4** (so each rating is worth something at every level, and the tendencies are about neutral):
  - Lateness eases in with speed (no sharp threshold), and a hitter gears up for a hard thrower's fastball, so he is early on the slower pitches; the timing spread grows with a pitch's speed. A pitch's speed adds less to exit speed than before (collision 0.12, was 0.2).
  - A pitch's grade acts through its late bite and how it looks, and only movement beyond the type's average fools a hitter; a below-average grade fools him less. Deception multiplies the share of a pitch a hitter doesn't read (the mirror of Recognition).
  - A pitch's shape has a counterweight (owner's choice: value-neutral): a ground-ball shape is a little easier to square up, a fly-ball shape a little harder.
  - Location matters from near the middle of the zone, so a pitch down the middle is the easiest to hit. The CPU's Balanced pitcher aims where an average pitcher does best, and most walks come from pitches aimed off the plate on purpose rather than from scatter.
  - With two strikes a hitter shortens up (a smaller *where* error, a little less exit speed).
  - A ball that comes down behind home plate is foul (a pop-up straight up drifts back on its backspin).
- **Physics changed in step 1.5, task 3** (Session 9; each Claude's default under the owner's Q6 choice, provisional until task 7's calibration, for the owner to keep or drop; fitted to Statcast 2024–2026 league batted balls in `tools/lib/real.js`, `real.batted`):
  - Bat speed is in real units: Raw Power's average bat speed follows the real ladder (62.4 / 67.3 / 71.7 / 76.1 / 81.2 mph at 20 / 40 / 60 / 80 / 99), exit speed uses Savant's collision (1.23 × bat speed + 0.23 × pitch speed at the plate for a squared-up ball), each swing's speed varies around his average up to a ceiling (his hardest swing), and he swings 2 mph slower with two strikes.
  - A swing harder than his usual is a little less accurate, a softer one a little more (his average swing is unchanged, so Raw Power keeps its one job).
  - The launch angle bends steeper toward the bat's edge (big mishits pop up or are chopped), and the off-center loss grows faster near the edge; a ball hit under the center loses a little less speed than one hit over it.
  - About half of all bat contact is foul (a narrower fair band), as in MLB.
  - A ball hit under the center drifts to the opposite field; a squared-up ball goes where the swing's timing points it, a mishit squirts more; a late swing loses more exit speed than an early one; a ball hit the other way slices and carries less.
  - The first flight's drag rises at lower speeds (the drag crisis); less backspin lift; ground balls lose more speed on each bounce; infielders take 0.25 s longer from catch to throw (catchers and pitchers unchanged).
- **A faster bat costs accuracy** (owner's choice, Session 10, Nov 21, 2026, from Session 9's three options; the two numbers are Claude's defaults, provisional until task 7): a hitter's *where* spread grows 4% for each mph of his average bat speed above an average hitter's 71.7 mph (and shrinks below it), and his contact loses 0.35% of its exit speed per mph (a faster bat finds the barrel's sweet spot a little less often). Tuned so each mph moves the downstream stats about as across real hitters (Savant 2024–2026): engine against real per mph, whiff +1.32 [+1.38], in-zone contact −1.20 [−0.98], K% +1.45 [+1.16], squared-up −0.94 [−0.81], average exit speed +0.64 [+0.57], hardest half +0.73 [+0.77], max +0.72 [+0.83], ISO +.014 [+.011]. Raw Power's bat speed stays on the ladder; its max exit speed is now 103.6 / 107.4 / 111.1 / 114.4 / 118.2 at 20 / 40 / 60 / 80 / 99 (ladder 98.9 / 106.3 / 110.5 / 115.8 / 122.9: the extremes need other ratings too, as in real data). An average hitter is unchanged.
- **Timing squares up** (owner's choice, Session 11, Nov 21, 2026; the numbers are Claude's defaults, provisional until task 7): Timing sets a multiplier on the exit speed a hitter loses to a mishit, off center or mistimed (×0.9 per step; 60 loses the usual amount), and still the spread of his *when* error; the speed where velocity starts to make him late now moves with Contact (+1 mph per step; it was Timing's +2). An average hitter is unchanged, so the league and Velocity's per-mph effects are too. Engine at 20 / 40 / 60 / 80 / 99 Timing (everyone else 60): squared-up % 35.4 / 38.7 / 42.0 / 46.7 / 59.3 [ladder 20.3 / 25.9 / 32.7 / 39.8 / 46.9: the league's level is a task 3 miss, about 9 points high], whiff % 26.1 / 25.4 / 24.5 / 24.4 / 24.2 (was 29.4 to 23.0), K% 23.2 / 22.3 / 20.6 / 20.5 / 19.0, exit speed 84.1 / 86.4 / 88.6 / 91.3 / 96.4. Contact now sets whiffs against 95+ mph: 34.0 / 25.6 / 22.0 / 12.4 / 4.7. Real per standard deviation of squared-up beyond whiffs and bat speed: K% −1.5, AVG +.010, SLG +.019, exit speed +1.1 mph; the engine's squared-up moves exit speed about 1.7× as much per point (its exit speeds bunch, task 3). Timing's step table was fitted for the old job and is steep at the top (99 plays far above 90); task 7 refits it.
- **Swing path, built** (owner's choice, Session 11; the sizes are Claude's defaults, provisional until task 7): per step of Swing path (Lift +1, Ground-ball −1), +3.7° of launch angle, 5° of spray toward his pull side, and a counterweight on his *where* spread (Lift +2%, Ground-ball −3.5%: an uppercut swing misses a little more, as in real data). A lineup of Ground-ball / Level / Lift hitters (everything else 60, 800 games): launch angle 10.4 / 15.2 / 19.7° [real 15th / 50th / 85th percentiles 9.0 / 13.7 / 18.0], ground-ball % 49.0 / 40.9 / 34.3, pull % 35.2 / 39.8 / 43.2, whiff % 23.3 / 24.8 / 25.2, runs 4.73 / 4.89 / 4.84 (about neutral; noise about ±0.1). **The payoffs show:** Lift against Ground-ball is −0.30 runs at Raw Power 40, +0.11 at 60 and +0.33 at 80; Ground-ball against Level is −0.24 at Speed 40 and +0.14 at 80. The test population draws it 1 : 2 : 1: its ground-ball % now spreads 0.90× as wide as MLB's (was 0.47×), pull % 0.68× (was 0.60×: real pull also has a part launch angle doesn't explain, year-to-year 0.53). Without the counterweights both styles lost about 0.3 runs to Level, because the engine's batted balls are too peaked around the league's launch angle (real: wOBA +.001 per degree of a hitter's average launch angle; grounders too weak and the Lift hitter's AVG drop too big, task 3 misses).

- **Physics changed in step 1.5, task 4: Recognition and plate discipline by pitch group** (Session 12, Nov 22, 2026; each Claude's default under the owner's Q6 choice, provisional until task 7, for the owner to keep or drop). First the check the hand-off asked for: across real hitters (Savant 2024–2025, 633 player-seasons) K% ≈ 1.13 × whiff % + 0.59 × foul % − 0.01 × chase % − 0.28 × zone swing %, and the engine's population turned whiffs, fouls and swings into strikeouts the same way (1.09 / 0.66 / +0.10 / −0.33). The extra strikeouts came from what Recognition moved: a poor recognizer took breaking strikes (zone swing +1.5 per standard deviation of Recognition; real: none) and fouled more (real: off-speed whiffs replace fouls), so each point of off-speed whiff beyond fastball whiff cost 0.73 points of K% (real 0.40). MLB 2024 by pitch group (Statcast search, every pitch; `tools/plate.js` prints both): swing % at fastballs and off-speed pitches in the zone 67.3 / 68.6, out of it 24.8 / 32.3; whiff % 16.2 / 19.3 and 32.1 / 52.8; foul % 42.9 / 36.8 and 42.3 / 25.3; fastballs 55.8% of pitches, in the zone 55.0% against 42.5% for off-speed; off-speed 40.9% of pitches before two strikes and 50.7% with two; whiffs 25.9% of swings before two strikes and 24.5% with two. Changes:
  - **One read per pitch:** Recognition (against Deception, with the platoon edge) is the chance he picks up each pitch, not a share of every pitch. The same read sets where he thinks it crosses, his timing and where his bat goes, so the breaking ball he chases because he took it for a fastball is the one he misses. An average hitter picks up 80% of pitches (Recognition's step 0.6 per step of what is left, was 0.75), and an unread off-speed pitch carries its whole surprise (0.15 of the vertical movement against a fastball's).
  - **A misread draws his eye toward the zone, never away from it** (each axis on its own): a pitch he takes for a fastball looks like a strike, so being fooled shows as chasing, not as taking strikes.
  - **Off-speed pitches off the plate are harder to hit:** the spread outside the zone is ×2.3 for them (still breaking away from the bat) and ×0.7 for fastballs; off-speed bite ×0.4, fastball bite +0.15.
  - **Faster pitches are fouled back more:** the fair core of the bat narrows as (88 mph / pitch speed)^2.5 (on a glancing hit the ball keeps much of its own speed toward the catcher), with the foul edge at 0.42 of the radius (was 0.45).
  - **Recognition tracks the break:** a second hook, ×0.95 per step on the bite of an off-speed pitch he swings at, so Recognition still counts once he reads nearly every pitch.
  - **The CPU's pitches follow MLB's mix:** usage weights so the test staffs throw MLB 2024's mix (engine FF 35.2, SI 16.1, FC 6.0, SL 21.9, CU 7.9, CH 10.6, FS 2.3% [35.6 / 16.6 / 8.0 / 21.2 / 6.3 / 9.0 / 3.2]; the test starter now has a sinker and a set-up man a splitter instead of a change-up), fastballs in the zone 8 points more often and off-speed pitches 13.5 points less, the put-away pitch ×1.6 with two strikes (was ×2.5), and the put-away tie broken by the type's real whiff rate (was its bite).
  - **Two strikes and the swing line:** the two-strike shortening keeps 0.75 of the *where* spread (was 0.64), the two-strike line is 0.09 ft tighter, early-count takes ×0.8 (not 3-0), Discipline's judgment noise 0.4 ft (was 0.45).
  - **Batted balls re-fitted for the new inputs:** attack angle 17.5° (was 19.5), a squared-up swing's spray 16° to the pull side (was 7.5), as fewer swings roll over an unread pitch.
  - **Results:** average teams against MLB, fastballs in / off-speed in / fastballs out / off-speed out: swing 70.3 / 72.1 / 25.3 / 29.8, whiff 15.8 / 22.9 / 34.9 / 53.8, foul 44.2 / 36.0 / 39.7 / 26.7; off-speed chase minus fastball chase 4.5 [7.5]; pitches per PA 3.95 [3.88]. League (rated teams, `batted.js 1000 1 --rated`): runs 4.80, .255 / .318 / .428, K 21.8%, BB 8.7% (Session 11: 4.80, .255 / .312 / .428, K 20.8%, BB 7.9%). Recognition at 20 / 40 / 60 / 80 / 99: off-speed whiff 51 / 42 / 33 / 26 / 23 [ladder 62 / 45 / 32 / 20 / 7], off-speed chase minus fastball chase 17 / 9 / 5 / 0 / 1 [31 / 17 / 7 / −3 / −13], K% 36 / 28 / 23 / 18 / 16. Population (p5–p95 width against MLB's): off-speed whiff 0.98× (median 32.0 [32.5]; it was 0.82×), whiff 1.0×, K% 1.19× (was 1.17×), the gap 0.68× (median 4.1 [6.8]; was 0.64×), BB% median 9.3 [8.2], zone swing median 71.1 [67.3]. Per point of off-speed whiff beyond fastball whiff, K% +0.52 [+0.40] (was +0.73); per standard deviation of Recognition, zone swing −0.1 (was +1.5), off-speed whiff −4.9 (real skill about 4.8). Velocity gained without being touched: per mph, whiff +0.60 [+0.93] (was +0.41), K% +1.36 [+1.69] (was +0.95).
  - **Found, for the owner:** in real data the two own stats of Recognition are separate skills: off-speed whiff beyond fastball whiff and off-speed chase beyond overall chase are unrelated (r about 0.00; each repeats year to year, 0.65 and 0.64). In the engine one rating moves both, so the gap's spread stays narrow (0.68×) unless off-speed whiff and K% widen too. **Recognition keeps both jobs, and the narrower gap is a reported miss** (owner's choice, Session 13, Nov 22, 2026: of the plate-discipline links it moves results least, about +0.16 K% per point of the gap, and it needs nothing new to generate or show; a chase-style tendency and two separate ratings were the options not taken).
- **Physics changed in step 1.5, task 4: the pitch grades' reach** (Session 13, Nov 22, 2026; each Claude's default under the owner's Q6 choice, provisional until task 7, for the owner to keep or drop). After Session 12 a grade moved whiffs mostly through the bite, which had become small next to a hitter's own spread, so from 60 to 99 slider whiff went only 32.8 to 34.7 [real 33.9 to 60.2], and the test population's whiff by type spread about half as wide as MLB's (slider 0.51×, change-up 0.51×). Real data says a pitch's movement in inches explains little of its whiffs (0.57 points per inch for sliders, r 0.13), so the grade now stands for the pitch's quality as a whole (the movement multiplier g, 1 average, still scales its movement):
  - **A better pitch is harder to pick up:** the share of pitches a hitter doesn't read is × (1 + 2.5 × (g − 1)), at least 0 (`PITCH.gradeHide`): at 99 (g 1.46) about twice as many go unread, below about 40 nearly every pitch is read. A straight line, so a staff of mixed grades averages out about as an average one does.
  - **It fools more when he misses it:** an unread pitch's surprise is × (1 + 1.5 × (g − 1)), at least 0 (`PITCH.gradeSurprise`; it was in step with the grade below average and no more than average above it). The same factor scales the timing error of an unread change-up or splitter (`TYPE.foolTime`: their grade is their speed change as much as their movement; on a curve it made the jump from 60 to 70 twice MLB's) and how much harder an off-speed pitch is to hit off the plate (`SWING.chaseGrade`: a better one keeps breaking away).
  - **The curve's balance:** its surprise is 0.085 (was 0.15: its drop against a fastball is 26 inches, so an unread curve was nearly always missed; the test starter's curve was whiffed 39% [MLB 32.8% at an average grade]).
  - **Results** (`ratingstats.js --only=grades`, 400 games per level; [real ladder]): at 20 / 40 / 60 / 80 / 99, slider whiff 19.0 / 21.6 / 32.9 / 46.7 / 55.0 [13.7 / 20.0 / 33.9 / 47.5 / 60.2], change-up 18.9 / 20.1 / 30.6 / 40.6 / 49.9 [12.2 / 18.1 / 31.4 / 46.4 / 59.8], curve 20.1 / 22.3 / 34.5 / 48.9 / 55.1 [15.4 / 20.5 / 32.8 / 44.6 / 55.6]; K% 14.8 / 16.3 / 22.6 / 29.6 / 34.9. Population (p5–p95 width against MLB's): slider whiff 0.90× (median 34.5 [33.9]), change-up 0.88× and curve 0.86× (both medians high: only pitchers who throw the pitch often reach 50 plate appearances ending on it, and better pitches are thrown more), pitchers' whiff 0.84× (was 0.56×), K% 1.07× (was 0.89×). League (rated teams, whose grades are mixed): runs 4.61 [4.6–4.7] (was 4.80), K% 23.5 [21.5–23] (was 21.8), AVG .249, OBP .312; average teams' plate discipline about unchanged (off-speed whiff in the zone 21.9 [19.3], was 22.9).
  - **Misses, reported:** below 40 a grade reads as one level (a read off-speed pitch still draws about a fastball's whiffs, about 19–20%) [real 12–16% at 20–30]; the change-up stops short at the top (49.9 at 99 [59.8]); the curve is steep from 60 to 70 (34.5 to 44.3 [32.8 to 38.1]). The grades are now worth more than other ratings: in this sweep +10 from 60 takes 0.53 runs a game off the other side (the equal-value check's target is 0.24–0.36; not re-run until task 7; realism wins, this section's rule, and the overall weighs each rating by its real worth).
- **Physics changed in step 1.5, task 4: Velocity** (Session 13, Nov 22, 2026; each Claude's default under the owner's Q6 choice, provisional until task 7, for the owner to keep or drop). Found: the step 1.4 fit had Velocity 20 at 69 mph [real worst season 82.3]; below 60 Velocity was worth nothing (a 20 staff allowed 4.50 runs against 4.82, though its K% fell to 13); a faster pitch gave weak contact more than whiffs (per mph: whiff +0.48, exit speed −0.32, hard-hit −0.97). Two causes: Session 12 sized the fair core of the bat by the pitch's own speed, so a soft thrower's glancing hits stayed fair as pop-ups and topped balls (from Velocity 50 to 20 his BABIP fell .290 to .258, pop-ups rose 9.5 to 15.2%) and a hard thrower's went foul (BABIP .340 at 99); and timing errors cost exit speed far more often than they miss (at 99 mph only about 4% of swings are late past `missMs`). Real per mph, the same pitcher year to year: whiff +1.65, K% +1.69, exit speed −0.16, hard-hit −0.17 (across pitchers: +0.93, +0.99, +0.05, +0.15). Changes:
  - **Velocity in real mph:** one mph a step, the table on the real ladder (pitchers with 250+ batters faced) around the engine's average 93.5 mph: 20 / 40 / 60 / 80 / 99 give 81.4 / 89.8 / 93.5 / 97.0 / 100.5 mph [82.3 / 90.7 / 94.4 / 97.9 / 101.4: the real ladder less 0.9 mph, the gap between the engine's average and the real median, left for task 6's league baseline]. `calibrate.js --part=fit` no longer fits the two tables set on the real ladder (Raw Power's and Velocity's).
  - **A harder thrower's pitches are harder to put the bat on:** the *where* spread × (his fastball today / 93.5)^2.5, his off-speed pitches too (`SWING.veloSd`); lateness 6 ms per mph over the hitter's `timingTop` (was 8).
  - **The fair core comes from the type's typical speed** (its share of an average fastball; `SWING.foulSpeedShare` 0): MLB's fastball/off-speed foul split stays, and a pitcher's velocity no longer moves his BABIP.
  - **Results** (`ratingstats.js --only=velocity`): Velocity 20 / 40 / 60 / 80 / 99, runs 5.5 / 5.3 / 5.0 / 4.3 / 3.2, K% 10.4 / 16.7 / 21.0 / 26.9 / 35.4, four-seam whiff 8.4 / 15.2 / 20.1 / 24.5 / 32.5, BABIP .298 / .303 / .308 / .306 / .299, pop-ups 7.4 / 8.0 / 8.5 / 8.9 / 9.0%; per mph (50 to 70) K% +1.35, whiff +1.30, exit speed −0.13, hard-hit −0.40. Pitchers' population (p5–p95 width against MLB's): whiff 0.89× (was 0.84×), four-seam whiff 0.61× (was 0.50×), K% 0.88×. League (rated teams): runs 4.83 [4.6–4.7], .252 / .315 / .428, HR 1.36, K% 22.8, BB% 8.6 (Session 12's end: 4.80); average teams' whiff by group 14.9 / 21.3 / 33.9 / 52.1 [16.2 / 19.3 / 32.1 / 52.8].
  - **Misses, reported:** hard-hit % still falls with velocity (−0.40 per mph [−0.17 year to year, +0.15 across]); BB% rises with it (8.5 at 60, 10.8 at 99 [−0.27 per mph year to year]); the hitters' population slugs high against average pitchers (median .436 [.403]; task 6); the pitchers' exit speed and hard-hit % against spread narrow (0.55× and 0.61×; the pitchers' population item).
- **Physics changed in step 1.5, task 4: Command** (Session 14, Nov 22, 2026; each Claude's default under the owner's Q6 choice, provisional until task 7, for the owner to keep or drop). Found: the test pitchers' walks spread 1.4× as wide as MLB's (BB% p5–p95 4.4–15.6 [4.8–12.3]) and edge % 1.5× (40.3–49.9 [39.4–45.7], median 44.2 [42.8]); from 20 to 99 Command moved walks 22.8 to 3.6%, edge % 38.4 to 60.9 [ladder 35.5 to 50.1] and chase % against 21.1 to 37.1 (more than Deception, the rating whose own stat it is: 23.9 to 33.7), and meatball % fell at both ends (2.5 at 99 [best 4.2]). With Command held at 60 for every test pitcher, walks still spread 5.3–11.6 (sample noise and the other ratings), so Command's own part of MLB's walk spread is modest. Real data (Savant 2024–2026, 843 pitcher-seasons with 250+ PA): meatball % mostly follows zone % (r 0.71) and, once zone % is known, hardly moves with walks (+0.05 per point of BB%; its own part repeats only 0.18–0.23 year to year), so "fewer meatballs with better Command" is not a real target; edge % and walks r −0.35, zone % and walks −0.52, chase against and walks −0.28. On 19,700 Statcast pitches (June 4–8, 2024), Claude's reading of the attack zones gives Savant's league numbers once the ball's radius pads the zone's top and bottom too (zone 49.7 [Gameday zones 1–9: 49.6], edge 42.2, meatball 7.7, heart 27.4, chase 22.2, waste 8.3%); the engine's zone already plays that role. Changes:
  - **Command's step is smaller:** the scatter ×0.92 a step (was ×0.88), and the step table's rows below 60 ×0.75 (a 40 now scatters 0.53 ft, was 0.60; a 99 0.34 ft, was 0.28).
  - **A wild pitcher no longer aims farther off the plate** than an average one (`CPU.pitch.commandOff`; a sharp one still aims nearer the edges, in the zone and off it, and a wild one deeper in the zone, as in step 1.4).
  - **The average pitcher's targets move a little off the edges:** in-zone targets 0.04 ft deeper (`inset`), off-plate targets 0.06–0.55 ft off (was 0.03–0.5), so the engine's attack zones match MLB's.
  - **Tried and dropped:** Aim moving how often he is in the zone (Nibbler and Attacker ±4 points of targets): a nibbler just walked more, so walks and zone % stayed locked (r −0.88 [−0.52]); in the engine a point of zone % costs about 0.95 points of walks (MLB's slope across pitchers, with chase known, is 0.40). A pitcher whose stuff gets chased working off the plate more (real zone % beyond walks falls with chase against, r −0.44, and doesn't move ERA): in the engine his walks rose instead (Deception 99 walked 11.8%). Targets following Command less at the top (power 0.25): edge % flat in the sweep and edge–walks r −0.15.
  - **Results** (`ratingstats.js --only=command`): Command 20 / 40 / 60 / 80 / 99, BB% 13.2 / 10.8 / 8.5 / 6.7 / 4.6, edge % 41.0 / 41.7 / 42.6 / 44.8 / 50.4, meatball % 6.8 / 7.6 / 7.6 / 7.8 / 5.6, chase % against 24.6 / 25.5 / 27.3 / 29.5 / 33.2, zone % 46.6 / 48.8 / 49.6 / 51.5 / 52.7, heart 27.0% at 60, runs 5.71 / 5.38 / 5.00 / 4.70 / 4.03 (was 7.70 / 5.65 / 5.02 / 4.42 / 3.46). Pitchers' population, p5–p95 [real]: BB% 4.6–12.6 [4.8–12.3], median 7.6 [8.0]; edge % 40.0–46.4 [39.4–45.7], median 42.6 [42.8]; meatball % 6.1–9.3 [6.0–9.3], median 7.6 [7.5]; chase against 23.4–34.8 [24.2–35.0]; zone % 46.4–53.2 [44.2–54.9]; correlations edge–walks −0.30 [−0.35], meatball–walks −0.35 [−0.29], meatball–zone 0.59 [0.71]. Deception's sweep about unchanged (chase against 23.1–33.0, walks 10.2 to 7.4%). Average teams (`plate.js 400`): runs 5.08 (was 5.22), pitches per PA 3.91 [3.88], BB% 9.2. League (rated teams): runs 4.94 [4.6–4.7] (was 4.83: its good-Command pitchers are worth less now), .258 / .317 / .437, BABIP .305, K% 22.6, BB% 8.2.
  - **Owner's choices** (Session 14, Nov 22, 2026, Claude's recommendations confirmed): **Command's own stats are walk % and edge %; meatball % moves to Aim with zone %** (in real data meatball % follows zone %, r 0.71, and hardly moves with walks once zone % is known). **Task 7's refit leaves the tables set for the test population's spreads** (Contact's, Session 10; Command's, Session 14), as it leaves the real-ladder tables (Raw Power's, Velocity's), and reports their value.
  - **Misses, reported:** Command is now worth about 0.2 runs per +10 (from 40 to 80: 0.17; equal-value target 0.24–0.36; realism wins, the owner's rule, and its table stays out of task 7's refit, owner's choice above); zone % spreads 0.64× MLB's and stays tied to walks (r −0.68 [−0.52]), and chase against too (−0.70 [−0.28]): Command still moves chase against more than in MLB, and MLB's zone % has a part walks don't explain (the Aim level; Nibbler and Attacker are meant to sit near the 15th and 85th percentiles of zone %, the tendencies item); the edge ladder's low end (41.0 at 20 [35.5]); the league's runs and BABIP rose (task 6).

## 11. Later and parked
- **Clutch:** parked for later (owner's choice, Nov 20, 2026).
- **Blocking** for catchers arrives with wild pitches and passed balls (owner's choice, Session 2).
- **After the release** (from Baseball1's longplan; re-planned after friends' feedback): deeper stats and stat pages; deeper pitching (new pitches, spin, a fastball rework); graphics tools and wiring; one development system with training and coaches; deeper injuries; playing by hand (stealing rework; a decision on balk, hit by pitch and bunt); team maps, logos and history; revenue budgets and luxury tax; hidden information ("fog"); deeper trades and free agency; minor leagues; a deeper draft and scouting; franchise difficulty; rewards; realism (archetypes, a baseball study).
- **Parked** (owner's choices in Baseball1's longplan): owner-manager system, multiplayer, Korea and Japan, more postseason effects, fun modes. App version: not planned.
