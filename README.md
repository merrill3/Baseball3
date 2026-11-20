# Diamond Dash (Baseball3)

A browser baseball game for friends to play on a phone or computer: bat and pitch against a CPU team, or run one of 30 teams through 162-game seasons, a postseason and an offseason. "Diamond Dash" is the working title. The repo is Baseball3, a fresh build that takes its plans (not its code) from the earlier Baseball1.

**Status:** the headless game engine is being built (M1). The rules and the game loop work in Node, with real pitches, swings, fielding and running (M1 step 1.2, still being tuned); there is nothing to play on screen yet, and opening the page shows a title screen only. The roadmap is in `docs/plan.md`.

## Open it
Open `index.html` in a browser. There's no build step and nothing to install, and it works straight from disk (`file://`). Later it will be published on GitHub Pages.

Saves (from M2) stay in your browser under Baseball3's own names, separate from Baseball1's.

## Tests
- `node tools/test.js`: every Node test (Node 18 or newer). Prints `all tests passed`.
- `node tools/gametest.js 1000 7`: plays 1,000 seeded games and checks every rule on each. Prints `all checks passed`. Add `--show` to see the first game's box score and play-by-play.
- `node tools/contact.js 300`: prints pitch and contact numbers (whiffs, fouls, exit speed, launch angle, spray) by pitch type, speed, timing and matchup. It checks nothing.
- `node tools/hits.js 300`: prints hit types, where hits land, steals, tag-ups and the league batting line. It checks nothing.
- `node tools/e2e/boot-check.js`: opens the page from disk in Chromium at desktop and phone sizes and checks for errors. Needs Playwright.

## Code layout
```
index.html            the page; loads every script in a fixed order
css/style.css         base styles
js/core/              game logic, no DOM (Node-testable)
  b3.js               the B3 namespace, version, save names
  rng.js              seeded random numbers
  data.js             positions, pitch types with speed and movement, the strike zone
  tune.js             every engine setting, and the placeholder values of the rating hooks
  pitch.js            pitches, the two-error swing and contact
  ball.js             balls in play: flight, fielders, throws, runners, steals, tag-ups, the play script
  manager.js          the CPU's choices
  game.js             game state, rules and decision points
  box.js              box score and play-by-play
js/view/              canvas drawing (from M4)
js/ui/                screens and startup
  boot.js             title screen
tools/test.js         runs tools/tests/*.test.js
tools/gametest.js     plays and checks many seeded games
tools/contact.js      prints pitch and contact distributions
tools/hits.js         prints hit types, where hits land, steals and tag-ups
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
