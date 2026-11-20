# Diamond Dash (Baseball3)

A browser baseball game for friends to play on a phone or computer: bat and pitch against a CPU team, or run one of 30 teams through 162-game seasons, a postseason and an offseason. "Diamond Dash" is the working title. The repo is Baseball3, a fresh build that takes its plans (not its code) from the earlier Baseball1.

**Status:** planning and setup are done; the game isn't built yet. Opening the page shows a title screen only. The roadmap is in `docs/plan.md`.

## Open it
Open `index.html` in a browser. There's no build step and nothing to install, and it works straight from disk (`file://`). Later it will be published on GitHub Pages.

Saves (from M2) stay in your browser under Baseball3's own names, separate from Baseball1's.

## Tests
- `node tools/test.js`: every Node test (Node 18 or newer). Prints `all tests passed`.
- `node tools/e2e/boot-check.js`: opens the page from disk in Chromium at desktop and phone sizes and checks for errors. Needs Playwright.

## Code layout
```
index.html            the page; loads every script in a fixed order
css/style.css         base styles
js/core/              game logic, no DOM (Node-testable)
  b3.js               the B3 namespace, version, save names
js/view/              canvas drawing (from M4)
js/ui/                screens and startup
  boot.js             title screen
tools/test.js         runs tools/tests/*.test.js
tools/lib/load.js     loads js/core/ into Node in index.html order
tools/tests/          Node tests
tools/e2e/            browser checks (Playwright)
```

## Docs
- `DESIGN.md`: what the game does, and who decided each part
- `ARCHITECTURE.md`: how the code is organized
- `docs/plan.md`: the roadmap, the current milestone and where work stopped
- `docs/proposal.md`: the Session 1 proposal
- `CLAUDE.md`: working notes for Claude
