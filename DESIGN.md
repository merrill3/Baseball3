# Diamond Dash (Baseball3): design decisions

Every product decision for Baseball3, with who made it. So far the rules, the game loop, pitches, swings, balls in play, the hitting and pitching ratings and the CPU's choices are built (M1 steps 1.1–1.3, headless); this file says what will be built. `docs/plan.md` says when.

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
- **Rosters:** 26 active (13 position players, 5 starters, 8 relievers including a closer) plus a reserve squad. Minor leagues come after the release [44].
- **Ratings** run 20–99, and 60 is an average big-leaguer [45]. Which ratings there are is in section 10 (the ratings redesign replaced the proposal's list: Contact, Power, Eye, Speed, Fielding, Arm; Velocity, Control, Stamina, Stuff).
- **Overall rating tracks value** (WAR) by position, and teams get a team overall [46]. With ratings of about equal value per point, the overall is close to a plain average of them, weighted by position (Claude's default, section 10).
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

**Equal-value check** (Claude's default, from the ratings interview; M1 step 1.4): for each rating in section 10 except Stamina, +10 points at 40, 60 and 80 is worth about the same in runs, within about ±20%, across several test hitters and pitchers. Defense and running ratings are checked at their key positions (the value rule in section 10).

- Built in from the start (M1–M2), not added later [55].
- Played and simmed games use the same model. There is no special edge in games you play. Re-add one only if playtests ask for it [56].
- 25 hidden archetypes for player generation: later, as in Baseball1 [57].
- A "regular" has 502 or more plate appearances; a "qualified" starter has 162 or more innings (Claude's default, as in Baseball1).
- Targets come from general baseball knowledge, not research (as in Baseball1).

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
| Timing | The *when* error: handling velocity; pulling or going the other way | whiff % and results against 95+ mph, spray mix |
| Launch | A tight launch-angle band and spray control | launch-angle spread, sweet-spot %, popup % |
| Raw Power | Bat speed and top exit speed only | max and 90th-percentile exit speed, home runs per fly ball, ISO |
| Recognition | Reading the pitch early: less fooled by off-speed and break, fewer chases on strike-looking pitches | chase on strike-looking pitches, breaking-ball whiff % |
| Discipline | Swing-or-take judgment in and near the zone, by count | walk %, swing-decision run value |

- **Aggressiveness** is a tendency (Patient, Balanced, Aggressive), not a 20–99 rating and not part of the overall. It is about value-neutral alone, and pays off or hurts depending on Discipline. **Which way** (owner's choice, Session 4, Nov 20, 2026): good Discipline rewards Aggressive. A disciplined aggressive hitter attacks hittable strikes early; an undisciplined one chases. Patient is the safer style for a hitter with poor Discipline.
- **Your own batting** stays timing only (section 2); your hitter's ratings roll the *where* error.

**Pitching.** Four pitcher ratings plus the arsenal:

| Rating | Job | Main stats |
|---|---|---|
| Velocity | Attacks hitters' timing: late swings, weaker and opposite-field contact; a small strikeout bump (about +1% per 10 points) | exit speed against, hard-hit %, opposite-field % |
| Command | Scatter around the target: walks and hitting corners | walk %, edge %, meatball % |
| Deception | Hides pitch type and speed; the mirror of Recognition | chase %, off-speed whiff % for its grade |
| Stamina | Pitches per outing. Weighted by role and outside the equal-value rule: it counts for starters, barely for relievers | pitches per start, innings |

- **Aim** is a tendency (Nibbler, Balanced, Attacker), about value-neutral, paying off with good Command. **Which way** (owner's choice, Session 4, Nov 20, 2026): good Command rewards Nibbler. A nibbler with good Command paints the corners; with poor Command he misses off the plate and walks people. Attacker is the safer style for a pitcher with poor Command.
- **Arsenal:** each pitch has a **grade** (movement and quality) and a **shape** (ground-ball or fly-ball tilt). Grades carry moderate weight; the pitch type stays the main driver. **A shape is value-neutral** (owner's choice, Session 5, Nov 20, 2026): a ground-ball or fly-ball tilt is a style, and neither is better on its own (Claude adds a counterweight to the tilt to make it so). For balance and the overall, the arsenal counts as one usage-weighted composite. It is a section of the pitcher's profile, not its own screen. Sizes are in section 4.
- **Put-away pitch:** the best-graded pitch, with the steep curve past 85. Strikeout aces come from here.
- **Growth** (M6's growth function): pitch grades grow and age. A pitcher sometimes learns a new pitch in the offseason: rare, about 3–5% of pitchers a year, mostly 27 and under or with only 2–3 pitches; it starts at grade 35–50, can grow, and makes a news item. Pitches are never lost.

**Defense and running**
- **Fielders:** Range (first step and route), Hands (clean catches, transfers, quick release: errors and double plays), Arm. **Catchers** also have Framing (borderline strikes). Throwing out base stealers uses Arm plus Hands' quick release.
- **Blocking** (wild pitches and passed balls) waits until those exist, after the release (owner's choice, Session 2), so no rating is without a job.
- **Running:** Speed (raw sprint; also helps Range and infield hits) and Baserunning (reads, jumps, extra bases, steal success, outs on the bases).
- **No baserunning tendency** (owner's choice, Session 3, Nov 20, 2026): how much safety margin a runner wants before taking an extra base is one engine number for every runner (`BALL.dare`), not a player trait. Aggressiveness and Aim stay the only tendencies.
- **Value rule:** a point of each is worth about as much as a point of a hitting rating at its key spot (Range at shortstop and center field, Arm in right field and at catcher, Framing at catcher, Baserunning for a regular), and less elsewhere. The overall is weighted by position.
- **Hands and Speed in the value rule** (owner's choices, Session 5, Nov 20, 2026): Hands' key spot is shortstop (second base, third base and catcher get less). Speed is worth a full hitting point in center field, with its running and fielding together; less at other spots, and least at DH, where it only runs.

**The whole set**
- **Top end:** steep past about 85, the same shape for every rating. Bonuses from combining ratings are capped.
- **Stars** are mostly specialists with real holes. Ratings are drawn with mild correlation; a rare few are elite across the board.
- **Handedness** (owner's choice, Session 3, Nov 20, 2026; not from the interview): batters bat left, right or both (a switch hitter bats from the side opposite the pitcher), and pitchers throw left or right. Handedness mirrors where a hitter pulls the ball and which way a pitch breaks. There is a small platoon edge: hitters see opposite-handed pitchers a little better. Its size is set and reported at calibration (M1 step 1.4). There are no separate split ratings.
- **Retired and renamed** (Claude's reading of the interview, confirmed by the owner in Session 2): Stuff is retired (its whiff job moves to pitch grades and the put-away pitch); Control is now Command; Eye is split into Recognition and Discipline; Power is now Raw Power; Fielding is split into Range and Hands.
- **Diagnostics** (squared-up %, chase on strike-looking pitches, launch-angle spread, swing-decision run value) are an advanced view in the Library's Archive part (section 9). M2 stores the counts they need.
- **Clutch** is not part of this; it stays parked (section 11).

**Claude's defaults** (not decided; set and reported during calibration)
- The equal-value check in section 7 (±20%).
- The overall as a near-plain average of the ratings, weighted by position; M2 checks that it still tracks WAR.
- Exact numbers: where the steep curve starts and how steep it is, the cap on combination bonuses, how strongly ratings correlate in generation, and how Speed fits the value budget.

**How the ratings and the CPU's choices work** (Claude's defaults, M1 step 1.3; the numbers are in `B3.tune` and get calibrated in step 1.4)
- **Scale:** each rating sets its own physical inputs; 60 gives the average big-leaguer's value. +10 points is one step: a spread or noise shrinks by a fixed share, a speed or share grows by a fixed amount.
- **The steep curve:** past 85 a rating plays higher: 90 like 91.25, 95 like 100, 99 like 108.8. **The cap:** in each group (the hitting ratings; the pitching ratings with every pitch grade) only the biggest such extra counts in full, the others at half, and together they add at most 12 points. Stamina is outside the cap.
- **Stamina:** one scale for every role, in pitches before fatigue: 30 is 28 pitches, 60 is 92, 80 is 110. Relievers are low-Stamina pitchers.
- **The arsenal:** a pitch's grade (20–99) scales its movement and bite; its shape (−1 fly-ball tilt to +1 ground-ball tilt) tilts the launch angle by up to 4°, without adding movement. The put-away pitch is the best grade (a tie goes to the type that misses the most bats).
- **Swing or take (CPU hitters):** the hitter judges where the pitch will cross. He reads part of its movement (Recognition against Deception) and takes the rest for a fastball's, so a slider off the plate or a curve in the dirt can look like a strike. Discipline sets the noise in that judgment and a lean toward seeing balls as strikes (poor Discipline shows mostly as chasing). He swings when it looks inside a line set by the count (he takes the corners early and protects with two strikes), and early in the count he sometimes takes all the way. Aggressiveness skips some of those takes and moves the line out in step with his lean (Patient: the reverse).
- **The pitch (CPU pitchers):** the type by its usual share and its grade, fastballs when behind, the put-away pitch with two strikes; in the zone by a chance set by the count, or just off the plate (low for pitches that sink or break). Aim moves both: a nibbler works the corners and the edges, an attacker comes in toward the middle.
- **Pitching changes (CPU):** a starter leaves when tired (past his Stamina) or hit hard; relievers by fatigue, runs and role (closers and setup men pitch one inning). Steals and tag-ups keep step 1.1's simple choices until step 1.4.
- **Physics added in step 1.3** so each rating's job shows: a mistimed swing has less of the bat in the ball's path and misses more; pitches faster than a hitter's comfort make him late (Velocity against Timing); a pitch away from the middle is harder to square up and comes off the bat slower, so swinging at balls costs.

## 11. Later and parked
- **Clutch:** parked for later (owner's choice, Nov 20, 2026).
- **Blocking** for catchers arrives with wild pitches and passed balls (owner's choice, Session 2).
- **After the release** (from Baseball1's longplan; re-planned after friends' feedback): deeper stats and stat pages; deeper pitching (new pitches, spin, a fastball rework); graphics tools and wiring; one development system with training and coaches; deeper injuries; playing by hand (stealing rework; a decision on balk, hit by pitch and bunt); team maps, logos and history; revenue budgets and luxury tax; hidden information ("fog"); deeper trades and free agency; minor leagues; a deeper draft and scouting; franchise difficulty; rewards; realism (archetypes, a baseball study).
- **Parked** (owner's choices in Baseball1's longplan): owner-manager system, multiplayer, Korea and Japan, more postseason effects, fun modes. App version: not planned.
