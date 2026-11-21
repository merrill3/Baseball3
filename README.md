# Diamond Dash (Baseball3)

A browser baseball game for friends to play on a phone or computer: bat and pitch against a CPU team, or run one of 30 teams through 162-game seasons, a postseason and an offseason. "Diamond Dash" is the working title. The repo is Baseball3, a fresh build that takes its plans (not its code) from the earlier Baseball1.

**Status:** the headless game engine (M1) is built and calibrated: the rules and the game loop work in Node, with real pitches, swings, fielding and running, every rating (hitting, pitching, defense and running), and CPU choices built on them. There is nothing to play on screen yet, and opening the page shows a title screen only. The roadmap is in `docs/plan.md`.

## Open it
Open `index.html` in a browser. There's no build step and nothing to install, and it works straight from disk (`file://`). Later it will be published on GitHub Pages.

Saves (from M2) stay in your browser under Baseball3's own names, separate from Baseball1's.

## Tests
- `node tools/test.js`: every Node test (Node 18 or newer). Prints `all tests passed`.
- `node tools/gametest.js 1000 7`: plays 1,000 seeded games and checks every rule on each. Prints `all checks passed`. Add `--show` to see the first game's box score and play-by-play.
- `node tools/contact.js 300`: prints pitch and contact numbers (whiffs, fouls, exit speed, launch angle, spray) by pitch type, speed, timing and matchup. It checks nothing.
- `node tools/hits.js 300`: prints hit types, where hits land, steals, tag-ups and the league batting line. It checks nothing.
- `node tools/worth.js 1000`: "10 points are worth": what +10 points of each rating does to runs and to its own stats (add `--styles` for the tendencies, `--pairs` for pairs of ratings). It checks nothing and takes a few minutes.
- `node tools/batted.js 1000`: the league's batted balls against Statcast (exit speed, launch angle, the batted-ball mix, spray, squared-up contact, and what each type and exit-speed band becomes). It checks nothing.
- `node tools/ratingstats.js`: each rating from 20 to 99 against real 2024–2026 players (its own stat, each unit's effect, and a test population against real regulars); `--html=page.html` writes a chart page. About 2 minutes; it checks nothing.
- `node tools/calibrate.js`: the calibration report: the target table (DESIGN.md section 7), the equal-value check for every rating, defense and running at their key spots, the tendencies and the pitch shape. About 10 minutes; `--part=targets` (about a minute) or `--part=speed` run one part.
- `node tools/e2e/boot-check.js`: opens the page from disk in Chromium at desktop and phone sizes and checks for errors. Needs Playwright.

## Code layout
```
index.html            the page; loads every script in a fixed order
css/style.css         base styles
js/core/              game logic, no DOM (Node-testable)
  b3.js               the B3 namespace, version, save names
  rng.js              seeded random numbers
  data.js             positions, pitch types with speed and movement, the strike zone
  tune.js             every engine setting, the placeholder values of the rating hooks, the rating scales, the CPU's numbers
  ratings.js          ratings into the physics' inputs (the steep curve, the cap, Stamina, the arsenal, tendencies)
  pitch.js            pitches, the two-error swing and contact
  ball.js             balls in play: flight, fielders, throws, runners, steals, tag-ups, the play script
  manager.js          the CPU's choices: swing or take, the pitch, pitching changes
  game.js             game state, rules and decision points
  box.js              box score and play-by-play
js/view/              canvas drawing (from M4)
js/ui/                screens and startup
  boot.js             title screen
tools/test.js         runs tools/tests/*.test.js
tools/gametest.js     plays and checks many seeded games
tools/contact.js      prints pitch and contact distributions
tools/hits.js         prints hit types, where hits land, steals and tag-ups
tools/worth.js        prints what 10 rating points are worth (and the stats each moves)
tools/batted.js       prints the league's batted balls against Statcast
tools/calibrate.js    the calibration report; fits the rating step tables
tools/lib/value.js    paired plate-appearance replays (the precise value measure)
tools/lib/load.js     loads js/core/ into Node in index.html order
tools/lib/            test teams and the game checker
tools/tests/          Node tests
tools/e2e/            browser checks (Playwright)
```

## Docs
- `DESIGN.md`: what the game does, and who decided each part
- `ARCHITECTURE.md`: how the code is organized
- `docs/plan.md`: the roadmap, the current milestone and where work stopped
- `docs/proposal.md`: the Session 1 proposal
- `CLAUDE.md`: working notes for Claude
