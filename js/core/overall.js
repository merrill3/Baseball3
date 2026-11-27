// The overall and the Arsenal numbers (M2 step 2.1a task 3, Session 29). Logic file: no DOM. The owner's choices it
// follows (DESIGN.md sections 5 and 10): the overall tracks value (WAR) by position, on the 20-99 scale (about 50 an
// average regular, 70 and up an all-star, 80 and up an MVP type), weighting each rating by its measured worth, so a
// player's strengths drive it; one Arsenal number on the 20-99 scale (his grades combined by worth, weighted toward his
// best, the put-away pitch counting most) plus numbers for his fastballs, breaking balls and off-speed pitches. Every
// number below and the way they combine are Claude's defaults (DESIGN.md section 10, "The overall").
//
//   B3.overall.of(player, opts)          his overall, 20-99 (a whole number). opts (optional): pos (a hitter's position;
//                                        default player.pos), role ('SP' or 'RP' for a pitcher; default from player.role)
//   B3.overall.detail(player, opts)      { overall, war, runs, parts, perGame | staffRuns, ... }: runs above an average
//                                        player at his position over a full season, wins above replacement, and each
//                                        rating's share of the runs (see below)
//   B3.overall.arsenal(player)           { arsenal, fastball, breaking, offspeed }: 20-99, null for a group he doesn't throw
//   B3.overall.arsenalRuns(player, o)    his grades' worth in runs a team-game for a whole staff of him (o.twoStrike: the
//                                        two-strike weight, for tools/overall.js)
//   B3.overall.potential(player, which)  the overall his potential leads to: every rating moved by his potential points
//                                        (which: 'shown', the default, or 'hidden')
//   B3.overall.WORTH, SEASON, ARSENAL    the tables and numbers below
//
// How: each rating's worth is measured in the game's own replays (tools/overall.js --part=worth, as the equal-value check:
// one rating moved from 20 to 99, everyone else at 60) and read here at his rating after the top-end curve, the pair
// synergies and the combination cap (B3.ratings.effective), so those count too. A hitter's runs a team-game are his
// hitting, running and (by position) fielding; a pitcher's are a whole staff of him, per batter faced, times a season's
// batters (a starter's from his Stamina). Runs above his position's average over a season, plus an average regular's
// 2 wins above replacement, become the overall at 6 points a win: 2 wins is 50, about 5.3 is 70, 7 is 80.
(function (root) {
  'use strict';
  const B3 = root.B3 = root.B3 || {};

  // Each rating's run value against 60, measured by tools/overall.js --part=worth: [points after the curve, runs a
  // team-game]. hit: one hitter (a lineup's / 9; speed is his running); pit: a whole staff of him (runs saved; grade is
  // every pitch at that grade); fld: every fielder of a team (runs saved; pos gives each position's share of it);
  // framing: one catcher. pa: plate appearances a team-game in the replays.
  const WORTH = null;

  const SEASON = {
    games: 155,             // a regular's games (about 650 plate appearances)
    starts: 32,             // a starter's starts
    reliefInnings: 65,      // a reliever's innings (MLB's regular relievers about 60-70)
    bfPerInning: 4.3,       // batters faced an inning (the league's 38.5 plate appearances a team-game over 8.9 innings)
    // A starter's innings a start by Stamina (after the curve), measured by tools/overall.js --part=stamina (Session 29:
    // 500 games a level; 63 / 75 / 87 / 95 / 100 pitches at 30 / 40 / 60 / 80 / 99, Session 16's ladder).
    inningsPerStart: [[20, 1.371], [25, 2.555], [30, 3.727], [40, 4.432], [50, 4.927], [60, 5.185], [70, 5.369], [80, 5.618], [91.25, 5.833], [108.8, 5.917]],
    runsPerWin: 10,         // FanGraphs' rule at the league's 4.7 runs a game
    points: 6,              // overall points a win
    regularWins: 2,         // an average regular's (or starter's) wins above replacement: the overall's 50
    reliefShare: 0.25       // a reliever's replacement level a inning, as a share of a starter's (FanGraphs: .470 against .380)
  };

  // The Arsenal: each pitch weighted by how often he throws it, as the CPU picks pitches (B3.tune.CPU.pitch: its type's
  // usual share, more for a better grade, fastballs when behind, the put-away pitch with two strikes), with two-strike
  // pitches counting twoStrike times as much (a grade's whiffs there are strikeouts). kinds: the share of pitches thrown
  // in a normal count, two balls ahead of the strikes and with two strikes (tools/overall.js --part=arsenal).
  const ARSENAL = {
    twoStrike: 1.5,
    kinds: [0.6, 0.07, 0.33],
    groups: { fastball: ['FF', 'SI', 'FC'], breaking: ['SL', 'CU'], offspeed: ['CH', 'FS'] }
  };

  const HIT = ['contact', 'timing', 'launch', 'rawPower', 'recognition', 'discipline'];
  const PIT = ['velocity', 'command', 'deception'];
  const FLD = ['range', 'hands', 'arm'];
  const FAST = { FF: true, SI: true, FC: true };

  function fail(msg) { throw new Error('B3.overall: ' + msg); }
  function W() { if (!B3.overall.WORTH) fail('the WORTH table is missing (node tools/overall.js --part=worth)'); return B3.overall.WORTH; }

  // A table's value at x: straight lines between its rows, and past its ends the end rows' slope.
  function at(table, x) {
    let i = 1;
    while (i < table.length - 1 && x > table[i][0]) i++;
    const a = table[i - 1], b = table[i];
    return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]);
  }
  // The x where a rising table reaches y (the inverse of at).
  function inv(table, y) {
    let i = 1;
    while (i < table.length - 1 && y > table[i][1]) i++;
    const a = table[i - 1], b = table[i];
    return a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]);
  }
  function clip(x) { return Math.max(20, Math.min(99, Math.round(x))); }
  function isPitcher(p) { return Array.isArray(p.pitches) && p.pitches.length > 0; }

  // ---- The Arsenal ----
  // Each pitch's weight: his chance to throw it in each kind of count, the kinds by their share of pitches and weight.
  function weights(p, e, twoStrike) {
    const P = B3.tune.CPU.pitch, G = B3.tune.RATE.grade, A = ARSENAL;
    const ts = twoStrike === undefined ? A.twoStrike : twoStrike;
    const mult = {};
    for (const t of p.pitches) mult[t] = Math.max(G.min, 1 + G.step * B3.ratings.steps('grade', e.grades[t]));
    const share = (kind) => {
      const x = p.pitches.map((t) => {
        let v = (P.use[t] || 1) * Math.exp(P.gradeUse * (mult[t] - 1) / G.step);
        if (kind === 1 && FAST[t]) v *= P.behind;
        if (kind === 2 && t === e.putAway) v *= P.putAway;
        return v;
      });
      const s = x.reduce((a, b) => a + b, 0);
      return x.map((v) => v / s);
    };
    const kw = [A.kinds[0], A.kinds[1], A.kinds[2] * ts];
    const tot = kw[0] + kw[1] + kw[2];
    const sh = [share(0), share(1), share(2)];
    const w = {};
    p.pitches.forEach((t, i) => { w[t] = (kw[0] * sh[0][i] + kw[1] * sh[1][i] + kw[2] * sh[2][i]) / tot; });
    return w;
  }

  function arsenalRuns(p, o) {
    if (!isPitcher(p)) return 0;
    const e = B3.ratings.effective(p), w = weights(p, e, o && o.twoStrike), G = W().pit.grade;
    let v = 0;
    for (const t of p.pitches) v += w[t] * at(G, e.grades[t]);
    return v;
  }

  // The rated grade whose whole arsenal at it (a 5-pitch arsenal, through the curve and the cap) reads x points: so an
  // Arsenal number is a grade, the one that on every pitch would be worth the same.
  let gradeOfEff = null;
  function ratedGrade(x) {
    if (!gradeOfEff) {
      gradeOfEff = [];
      for (let L = 20; L <= 99; L++) {
        const q = { pitches: ['FF', 'SI', 'SL', 'CH', 'CU'], arsenal: {}, ratings: {} };
        for (const t of q.pitches) q.arsenal[t] = { grade: L, shape: 0 };
        const e = B3.ratings.effective(q);
        gradeOfEff.push([q.pitches.reduce((s, t) => s + e.grades[t], 0) / q.pitches.length, L]);
      }
    }
    return at(gradeOfEff, x);
  }

  function arsenal(p) {
    if (!isPitcher(p)) return { arsenal: null, fastball: null, breaking: null, offspeed: null };
    const e = B3.ratings.effective(p), w = weights(p, e), G = W().pit.grade;
    const num = (types) => {
      const list = p.pitches.filter((t) => !types || types.indexOf(t) >= 0);
      if (!list.length) return null;
      let v = 0, s = 0;
      for (const t of list) { v += w[t] * at(G, e.grades[t]); s += w[t]; }
      return clip(ratedGrade(inv(G, v / s)));
    };
    const A = ARSENAL.groups;
    return { arsenal: num(null), fastball: num(A.fastball), breaking: num(A.breaking), offspeed: num(A.offspeed) };
  }

  // ---- Hitters ----
  // Runs a team-game against an all-60 player in his slot, by part.
  function hitterParts(p, pos) {
    const T = W(), e = B3.ratings.effective(p), out = {};
    for (const k of HIT) out[k] = at(T.hit[k], e[k]);
    out.baserunning = at(T.hit.baserunning, e.baserunning);
    out.speed = at(T.hit.speed, e.speed);
    if (pos !== 'DH') {
      for (const k of FLD) out[k] = T.pos[k][pos] * at(T.fld[k], e[k]);
      out.speed += T.pos.speed[pos] * at(T.fld.speed, e.speed);
      if (pos === 'C') out.framing = at(T.framing, e.framing);
    }
    return out;
  }
  function sum(o) { let s = 0; for (const k in o) s += o[k]; return s; }

  // His position's average player (the generator's leans: B3.players.GEN), so each position's average regular is 50.
  let baseCache = { worth: null, pos: {} };
  function baseline(pos) {
    if (baseCache.worth !== W()) baseCache = { worth: W(), pos: {} };
    if (baseCache.pos[pos] === undefined) {
      const G = B3.players && B3.players.GEN;
      const r = { rawPower: 60 + ((G && G.posPower[pos]) || 0), speed: 60 + ((G && G.posSpeed[pos]) || 0) };
      baseCache.pos[pos] = sum(hitterParts({ ratings: r }, pos));
    }
    return baseCache.pos[pos];
  }

  function hitter(p, opts) {
    const pos = (opts && opts.pos) || p.pos;
    if (!pos || pos === 'P' || B3.data.LINEUP_POS.indexOf(pos) < 0) fail((p.id || 'player') + ': a hitter needs a lineup position, not ' + pos);
    const S = SEASON, parts = hitterParts(p, pos), perGame = sum(parts);
    const runs = S.games * (perGame - baseline(pos));
    const war = S.regularWins + runs / S.runsPerWin;
    const seasonParts = {};
    for (const k in parts) seasonParts[k] = S.games * parts[k];
    return { overall: clip(50 + S.points * (war - S.regularWins)), war: war, runs: runs, perGame: perGame, parts: seasonParts, pos: pos };
  }

  // ---- Pitchers ----
  function roleOf(p, opts) {
    const r = (opts && opts.role) || p.role;
    if (r) return r === 'SP' ? 'SP' : 'RP';
    return p.ratings && p.ratings.stamina >= 40 ? 'SP' : 'RP';
  }

  function pitcher(p, opts) {
    const T = W(), S = SEASON, e = B3.ratings.effective(p), role = roleOf(p, opts);
    const parts = {};
    for (const k of PIT) parts[k] = at(T.pit[k], e[k]);
    parts.arsenal = arsenalRuns(p);
    const staffRuns = sum(parts), perBF = staffRuns / T.pa;
    // Wins above replacement: his batters times his runs saved a batter, plus his innings at replacement's gap
    // (an average starter's season is regularWins).
    const ip0 = S.starts * at(S.inningsPerStart, 60);
    const repSP = S.regularWins * S.runsPerWin / ip0;
    const ip = role === 'SP' ? S.starts * at(S.inningsPerStart, e.stamina) : S.reliefInnings;
    const bf = ip * S.bfPerInning;
    const rep = role === 'SP' ? repSP * ip : repSP * S.reliefShare * ip;
    const war = (bf * perBF + rep) / S.runsPerWin;
    const seasonParts = {};
    for (const k in parts) seasonParts[k] = bf * parts[k] / T.pa;
    seasonParts.stamina = role === 'SP' ? repSP * (ip - ip0) : 0;
    return { overall: clip(50 + S.points * (war - S.regularWins)), war: war, runs: S.runsPerWin * (war - S.regularWins), staffRuns: staffRuns,
      perBF: perBF, innings: ip, parts: seasonParts, role: role };
  }

  function detail(p, opts) {
    if (!p || typeof p !== 'object') fail('a player is needed');
    return isPitcher(p) ? pitcher(p, opts) : hitter(p, opts);
  }

  function of(p, opts) { return detail(p, opts).overall; }

  function potential(p, which) {
    const pot = p.potential || {};
    const d = which === 'hidden' ? pot.hidden : pot.shown;
    if (typeof d !== 'number' || d === 0) return of(p);
    const q = Object.assign({}, p, { ratings: {} });
    for (const k in p.ratings || {}) q.ratings[k] = clip(p.ratings[k] + d);
    if (isPitcher(p)) {
      q.arsenal = {};
      for (const t of p.pitches) q.arsenal[t] = Object.assign({}, p.arsenal[t], { grade: clip(((p.arsenal[t] || {}).grade || 60) + d) });
    }
    return of(q);
  }

  B3.overall = { of: of, detail: detail, arsenal: arsenal, arsenalRuns: arsenalRuns, potential: potential,
    WORTH: WORTH, SEASON: SEASON, ARSENAL: ARSENAL };
})(typeof globalThis !== 'undefined' ? globalThis : this);
