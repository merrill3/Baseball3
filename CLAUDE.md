# Diamond Dash (Baseball3): notes for Claude

Diamond Dash (working title, owner's choice) is a browser baseball game built from scratch in merrill3/Baseball3. It will have a playable game (behind-the-batter view plus a top-down field view), a Quick Game mode and a franchise mode (30 teams, 162-game seasons, postseason, offseason). The goal is a public web page friends open on a phone or computer (GitHub Pages). The owner directs and makes design decisions; Claude designs, codes, tests and ships.

## Read first
1. `docs/plan.md`: the **Stopped at:** line, the roadmap and the current milestone. Do only the current milestone or step.
2. `DESIGN.md`: every product decision, labeled by who made it.
3. `ARCHITECTURE.md`: folders, load order, the engine and saving designs, testing.
4. `README.md`: how to open the game and run the tests.
5. `docs/proposal.md`: the Session 1 proposal the owner confirmed (history; the reasons behind DESIGN.md).

## Hard rules (carried from Baseball1 as Claude's defaults; the owner chose to keep them, Session 3)
- No build step and no dependencies. Plain scripts on one global namespace, **`B3`**, loaded by `index.html` in a fixed order. It must work opened straight from disk (`file://`): no ES modules, no web workers, no fetching local files.
- Logic files (`js/core/`) never touch the DOM, so Node can test them.
- Names: teams use real U.S. cities with invented nicknames (owner's choice, Nov 20, 2026; the list is in DESIGN.md section 6). Players, coaches and logos are invented. No real MLB team or player names.
- Saves use keys unique to Baseball3 (`baseball3`), so they don't collide with Baseball1 on `merrill3.github.io`.

## Working rules (owner's choices, every session)
- Work on a branch. Commit and push after every task. Keep the **Stopped at:** line in `docs/plan.md` current, because the owner rests for hours between sessions.
- One coding session at a time. Merge to `main` after each finished, tested step, each time with the owner's OK (owner's choice, Session 3); the next session starts from `main`. Milestones that span more than one session end with one independent review agent. No parallel building agents.
- Label every decision "owner's choice" or "Claude's default". Never present your defaults as the owner's choices. Text marked "suggested" is not decided.
- In any commit that changes `CLAUDE.md`, `README.md`, `DESIGN.md`, `ARCHITECTURE.md` or `docs/plan.md`, add 1 to the **Docs version** at the top of `docs/plan.md`, and update its date and note.
- Don't build past the current milestone or step.
- End every session with: what's done, how the owner can test it, what's next, the branch name, and the exact prompt for the next session.

## Carried from Baseball1 (the owner's way of working there; Claude's default to keep)
- Before building a new area, interview the owner: one multiple-choice question at a time, then a summary to confirm.
- Give plain, honest updates: what changed, what was tested, what isn't verified, and what needs the owner's decision.
- The owner watches usage limits. Work efficiently, and make every stop safe (committed and pushed).
- Every milestone opens with a plan check against the code. When a hand-off from a planning chat says "Based on: docs version N", compare it with the current Docs version and report any mismatch or stale assumption before building.
- The owner plans in a claude.ai project. After changing any of the five docs above, remind the owner to sync the project's copies (click **Sync now**, or re-upload).

## Baseball1 (merrill3/Baseball1) is a reference only
- Its plans (DESIGN.md, docs/plan.md, docs/blueprint.md, docs/longplan-draft.md, the briefing at the end of docs/transcript.md) are inputs for features, order and lessons. `docs/longplan-draft.md` is a light reference for plans (owner's choice); it was written for Baseball1's code, so it is not Baseball3's milestone list.
- Its code is a very light reference: look to learn what worked or failed; never copy code or files.
- Never change anything in Baseball1.
- The rating system (DESIGN.md section 10) and the screens and menus (section 9) must be Baseball3's own designs, not Baseball1's (owner's choice, Session 3).
- The owner's earlier "Baseball2" plan (copying Baseball1's code) is dropped.

## Test after changes
- `node tools/test.js` must print `all tests passed`.
- `node tools/gametest.js 1000 7` must print `all checks passed` (1,000 seeded games, every rule checked from the log).
- `node tools/e2e/boot-check.js`: the page loads from `file://` at 1280×800 and 390×844 with no console errors.
- From M1: `node tools/calibrate.js` (about 10 minutes on 4 processes), aiming for about 4.3–4.6 runs per team per game, the rest of the target table in DESIGN.md section 7 and the equal-value check. After a physics change, re-fit the rating step tables with `node tools/calibrate.js --part=fit` (about 10 minutes). From M2: `node tools/seasontest.js`.

## Git
- The working branch is named by the session environment. `main` gets work only with the owner's OK.
- End commit messages with the Co-Authored-By and Claude-Session lines your environment provides.
