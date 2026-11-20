# Session state (for resuming)

Updated Nov 20, 2026, in Session 3, after task 7. Read this after CLAUDE.md and the **Stopped at:** line in `docs/plan.md`. Delete this file when step 1.2 is done.

## Where things are
- **Branch:** `claude/baseball3-session-3-m1-u6m8f7` (holds all of Sessions 1–2). Nothing is merged to `main`.
- **Done and pushed:** the step 1.2 plan check, task 6 (pitches and swings) and task 7 (ball in play; result in `docs/plan.md`, docs version 13).
- **Checks at the task 7 commit:** `node tools/test.js` prints `all tests passed (57)`; `node tools/gametest.js 1000 7` prints `all checks passed` (checksum `54051f95`, about 6 s). The owner said about 13 s a season is fine for now: don't spend effort on speed (task 13 still measures it).

## Task 8 (the play script), next
`B3.ball` builds a script for every ball in play (`play.script`, kept on `g.lastPlay`; the format is in the comment at the top of `ball.js`). Task 8 adds `tools/tests/script.test.js`, checking over many seeded plays:
- every track's times only go forward;
- speeds stay within each runner's and fielder's top speed and the ball's exit speed or the thrower's arm;
- every runner ends where the result says (`end` matches `play.runners` and `play.batter`, 4 scored, 0 out), including after a tag-up (`B3.ball.tagup` adds to the script);
- at each out the ball is at that base; at each catch the fielder is at the ball (within the 4 ft glove reach, `BALL.glove`).
Fix what it finds, tick task 8 in `docs/plan.md`, update ARCHITECTURE.md if the format changes, bump the Docs version, delete this file, commit, push, and end the session with the summary CLAUDE.md asks for (step 1.2 done; step 1.3 next).

## Prompt to resume
"Continue Session 3 of Baseball3 (merrill3/Baseball3) on the branch claude/baseball3-session-3-m1-u6m8f7. Read CLAUDE.md, then the "Stopped at:" line in docs/plan.md, then state.md. Finish M1 step 1.2 only (task 8). Baseball1 is reference only; never change it."
