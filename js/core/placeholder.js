// A stand-in for ball-in-play physics, so step 1.1 could test the rules and the game loop.
// TEMPORARY: step 1.2 task 6 replaced its pitches with B3.pitch; task 7 replaces the rest with B3.ball
// and deletes this file.
// Rates are rough guesses that make baseball-like games; nothing here is calibrated. Logic file: no DOM.
(function (root) {
  'use strict';
  const B3 = root.B3 = root.B3 || {};

  function weighted(r, table) {
    const i = r.weighted(table.map((x) => x[1]));
    return table[i][0];
  }

  // Where each runner ends on a hit or an out, as a play for B3.game (see game.js "Balls in play").
  function ballInPlay(g, r) {
    const b = g.bases, outs = g.outs;
    const on = [!!b[0], !!b[1], !!b[2]];
    const runners = on.map((x, i) => (x ? i + 1 : null)); // everyone holds unless moved below
    const code = weighted(r, [['1B', 205], ['2B', 62], ['3B', 6], ['HR', 46], ['E', 14], ['OUT', 667]]);
    const of = () => r.pick(['LF', 'CF', 'RF']);
    const inf = () => weighted(r, [['P', 1], ['1B', 2], ['2B', 3], ['3B', 3], ['SS', 4]]);

    if (code === 'HR') return { code: code, bb: 'fly', fielder: of(), caught: false, batter: 4, runners: runners.map((x) => (x ? 4 : null)) };
    if (code === '3B') return { code: code, bb: 'line', fielder: of(), caught: false, batter: 3, runners: runners.map((x) => (x ? 4 : null)) };
    if (code === '2B') {
      if (on[2]) runners[2] = 4;
      if (on[1]) runners[1] = 4;
      if (on[0]) runners[0] = r.chance(0.45) ? 4 : 3;
      return { code: code, bb: r.chance(0.6) ? 'line' : 'fly', fielder: of(), caught: false, batter: 2, runners: runners };
    }
    if (code === '1B') {
      if (on[2]) runners[2] = 4;
      if (on[1]) runners[1] = r.chance(0.6) ? 4 : 3;
      if (on[0]) runners[0] = runners[1] === 3 || !r.chance(0.3) ? 2 : 3;
      return { code: code, bb: weighted(r, [['ground', 5], ['line', 4], ['fly', 1]]), fielder: of(), caught: false, batter: 1, runners: runners };
    }
    if (code === 'E') { // everyone moves up one base
      for (let i = 2; i >= 0; i--) if (on[i]) runners[i] = i + 2;
      return { code: code, bb: 'ground', fielder: inf(), caught: false, batter: 1, runners: runners };
    }
    // An out.
    const bb = weighted(r, [['ground', 45], ['fly', 30], ['line', 12], ['popup', 13]]);
    if (bb === 'ground') {
      if (on[0] && outs < 2 && r.chance(0.7)) {
        // Force at second: a double play or a fielder's choice. Forced runners move up.
        const dp = r.chance(0.6);
        runners[0] = 0;
        if (on[1]) runners[1] = 3;
        if (on[2]) runners[2] = on[1] ? 4 : (r.chance(0.5) ? 4 : 3);
        return { code: dp ? 'DP' : 'FC', bb: bb, fielder: inf(), caught: false, batter: dp ? 0 : 1, runners: runners };
      }
      // The batter is out; runners may move up a base.
      if (outs < 2) {
        if (on[2] && r.chance(0.5)) runners[2] = 4;
        if (on[1] && runners[2] !== 3 && r.chance(0.5)) runners[1] = 3;
        if (on[0] && runners[1] !== 2) runners[0] = 2;
      }
      return { code: 'GO', bb: bb, fielder: inf(), caught: false, batter: 0, runners: runners };
    }
    const fielder = bb === 'fly' ? of() : bb === 'popup' ? weighted(r, [['C', 1], ['1B', 1], ['2B', 1], ['3B', 1], ['SS', 1]]) : r.pick(['1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF']);
    return { code: bb === 'fly' ? 'FO' : bb === 'line' ? 'LO' : 'PO', bb: bb, fielder: fielder, caught: true, batter: 0, runners: runners };
  }

  B3.placeholder = {
    // A ball in play (the contact is ignored: the outcome is a weighted draw).
    inPlay: function (g) { return ballInPlay(g, g.rng); },
    // Is the runner stealing from this base safe?
    steal: function (g, from) { return g.rng.chance(from === 1 ? 0.74 : 0.7); },
    // Is the runner tagging up from this base safe?
    tagup: function (g, play, from) {
      const p = { FO: [0.6, 0.75, 0.92], LO: [0.4, 0.55, 0.7], PO: [0.1, 0.1, 0.15] }[play.code];
      return g.rng.chance(p[from - 1]);
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
