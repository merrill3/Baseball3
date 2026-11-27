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
//   B3.overall.arsenalRuns(player)      his arsenal's worth for the overall, runs a team-game for a whole staff of him
//                                        (his grades' runs and his pitch types' values); gradeRuns(player) the grades' part,
//                                        weights(player) each pitch's weight (tools/overall.js fits and checks them)
//   B3.overall.potential(player, which)  the overall his potential leads to: every rating moved by his potential points
//                                        (which: 'shown', the default, or 'hidden')
//   B3.overall.WORTH, BASE, SEASON, ARSENAL   the tables and numbers below
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
  // framing: one catcher. pa: plate appearances a team-game in the replays. Measured in Session 29 (1,500 games of plate
  // appearances, 116,053 replayed per condition, seed 1; standard errors about 0.005 a hitter, 0.04-0.07 a staff, 0.01-0.05
  // every fielder; the catcher's Hands and Arm shares are noisy, 0.15 +- 0.09 and 0.27 +- 0.07). Rerun it after a change to
  // the physics or B3.tune and paste the new table here.
  const WORTH = {
    pa: 38.628,
    hit: {
      contact: [[20, -0.1871], [30, -0.1464], [40, -0.1039], [50, -0.0549], [60, 0], [70, 0.0617], [80, 0.1258], [91.25, 0.2184], [108.8, 0.4035]],
      timing: [[20, -0.1326], [30, -0.0997], [40, -0.063], [50, -0.0365], [60, 0], [70, 0.0328], [80, 0.0652], [91.25, 0.1018], [108.8, 0.1596]],
      launch: [[20, -0.123], [30, -0.0929], [40, -0.0632], [50, -0.0324], [60, 0], [70, 0.0284], [80, 0.0698], [91.25, 0.1032], [108.8, 0.1675]],
      rawPower: [[20, -0.2375], [30, -0.1986], [40, -0.1196], [50, -0.0522], [60, 0], [70, 0.0499], [80, 0.1096], [91.25, 0.1552], [108.8, 0.2118]],
      recognition: [[20, -0.2338], [30, -0.154], [40, -0.1016], [50, -0.0449], [60, 0], [70, 0.0366], [80, 0.0632], [91.25, 0.0805], [108.8, 0.089]],
      discipline: [[20, -0.2065], [30, -0.1539], [40, -0.1008], [50, -0.0493], [60, 0], [70, 0.0405], [80, 0.0846], [91.25, 0.1345], [108.8, 0.1942]],
      baserunning: [[20, -0.0604], [30, -0.0353], [40, -0.0246], [50, -0.0123], [60, 0], [70, 0.0192], [80, 0.035], [91.25, 0.0551], [108.8, 0.0737]],
      speed: [[20, -0.1148], [30, -0.0745], [40, -0.0547], [50, -0.0181], [60, 0], [70, 0.0236], [80, 0.0563], [91.25, 0.0773], [108.8, 0.0939]]
    },
    pit: {
      velocity: [[20, -0.8415], [30, -0.6617], [40, -0.4056], [50, -0.1494], [60, 0], [70, 0.2027], [80, 0.5581], [91.25, 0.8503], [108.8, 1.2792]],
      command: [[20, -0.6342], [30, -0.3962], [40, -0.2294], [50, -0.1385], [60, 0], [70, 0.2019], [80, 0.3605], [91.25, 0.522], [108.8, 0.8586]],
      deception: [[20, -1.9774], [30, -1.5289], [40, -1.035], [50, -0.5028], [60, 0], [70, 0.5234], [80, 0.9564], [91.25, 1.4845], [108.8, 2.3224]],
      grade: [[20, -2.0006], [30, -1.5806], [40, -1.2628], [50, -0.6385], [60, 0], [70, 1.0146], [80, 1.7419], [90.75, 2.3138], [101.4, 2.9344]]
    },
    fld: {
      speed: [[20, -0.4712], [30, -0.28], [40, -0.1858], [50, -0.0764], [60, 0], [70, 0.0573], [80, 0.1208], [91.25, 0.1656], [108.8, 0.2002]],
      range: [[20, -0.7785], [30, -0.5656], [40, -0.3683], [50, -0.1855], [60, 0], [70, 0.1741], [80, 0.367], [91.25, 0.5795], [108.8, 0.8943]],
      hands: [[20, -0.5579], [30, -0.4329], [40, -0.2985], [50, -0.1345], [60, 0], [70, 0.1308], [80, 0.2648], [91.25, 0.4096], [108.8, 0.5899]],
      arm: [[20, -0.5568], [30, -0.439], [40, -0.3269], [50, -0.14], [60, 0], [70, 0.1247], [80, 0.2937], [91.25, 0.3901], [108.8, 0.4434]]
    },
    framing: [[20, -0.1355], [30, -0.1066], [40, -0.0707], [50, -0.0346], [60, 0], [70, 0.0318], [80, 0.0655], [91.25, 0.1137], [108.8, 0.173]],
    pos: {
      range: { C: 0.002, '1B': 0.078, '2B': 0.171, '3B': 0.107, SS: 0.146, LF: 0.158, CF: 0.196, RF: 0.15 },
      hands: { C: 0.147, '1B': 0.073, '2B': 0.172, '3B': 0.157, SS: 0.261, LF: 0.054, CF: 0.071, RF: 0.056 },
      arm: { C: 0.272, '1B': 0.013, '2B': 0.075, '3B': 0.084, SS: 0.159, LF: 0.126, CF: 0.159, RF: 0.111 },
      speed: { C: 0, '1B': 0.005, '2B': 0.165, '3B': 0.012, SS: 0.088, LF: 0.182, CF: 0.325, RF: 0.228 }
    }
  };

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
  // usual share, more for a better grade, fastballs two balls behind, the put-away pitch with two strikes), with two-strike
  // pitches counting twoStrike times as much (a grade's whiffs there are strikeouts; the replays can't tell 1 from 3, so it
  // is a light lean toward the put-away pitch). kinds: the share of pitches thrown in a normal count, two balls ahead of the
  // strikes and with two strikes (tools/overall.js --part=arsenal, average teams). For the overall (not the Arsenal number,
  // which is grades only), his grades' runs are scaled by `scale` and each pitch adds its type's value (`types`, runs a
  // team-game for a whole staff throwing only that type, against the generated arsenals' mean): both fitted on replays of
  // generated arsenals (tools/overall.js --part=arsenal), since the pitch type stays the main driver (DESIGN.md section 10).
  const ARSENAL = {
    twoStrike: 1.5,
    kinds: [0.637, 0.071, 0.292],
    // Session 29's fit (60 generated arsenals, 121 replayed conditions): whole arsenals r 0.991, rms 0.105 runs (grades alone
    // r 0.79: the types alone spread 0.34 runs, the grades 0.72).
    scale: 0.937,
    types: { FF: -1.136, SI: -0.141, FC: 0.028, SL: 0.967, CU: 1.445, CH: 0.71, FS: 1.155 },
    groups: { fastball: ['FF', 'SI', 'FC'], breaking: ['SL', 'CU'], offspeed: ['CH', 'FS'] }
  };

  // The league's average players (tools/overall.js --part=base: the mean of a large generated league, B3.players): a
  // regular's runs a team-game at each position, and a starter's runs for a whole staff of him, both against an all-60
  // player. Each is the overall's 50, so an average regular at his position and an average starter are 50. Session 29: 4,000
  // organizations (standard errors about 0.002 runs a hitter, 0.006 a staff: a fifth of an overall point or less). A
  // position's mean carries its leans (a center fielder's Speed 74 is worth +0.04 runs a game, a catcher's Speed 50 and Raw
  // Power 57 cost about as much): that is the positional adjustment. The starter's +0.57 is the average generated arsenal's
  // worth (a pitcher throws his better pitches more, and the grades' table is steeper above 60 than below).
  const BASE = { hit: { C: -0.0508, '1B': 0.0012, '2B': -0.0158, '3B': -0.0045, SS: -0.0069, LF: 0.0038, CF: 0.0405, RF: 0.0153, DH: 0.0026 }, pit: 0.5666 };

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
  // { type: weight }, adding to 1.
  function weights(p, twoStrike, e) {
    if (!isPitcher(p)) return {};
    e = e || B3.ratings.effective(p);
    const P = B3.tune.CPU.pitch, A = ARSENAL;
    const ts = twoStrike === undefined ? A.twoStrike : twoStrike;
    const mult = {};
    for (const t of p.pitches) mult[t] = B3.ratings.gradeMult(t, e.grades[t]);
    const share = (kind) => {
      const x = p.pitches.map((t) => {
        let v = (P.use[t] || 1) * Math.exp(P.gradeUse * B3.ratings.gradeUnits(t, mult[t]));
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

  // His grades' worth: runs a team-game for a whole staff of him, against every grade at 60 (o.twoStrike, o.scale: for tools).
  function gradeRuns(p, o) {
    if (!isPitcher(p)) return 0;
    const e = B3.ratings.effective(p), w = weights(p, o && o.twoStrike, e), G = W().pit.grade;
    let v = 0;
    for (const t of p.pitches) v += w[t] * at(G, e.grades[t]);
    return v * (o && o.scale !== undefined ? o.scale : ARSENAL.scale);
  }

  // His whole arsenal's worth for the overall: his grades' runs plus his pitch types' values.
  function arsenalRuns(p, o) {
    if (!isPitcher(p)) return 0;
    const e = B3.ratings.effective(p), w = weights(p, o && o.twoStrike, e);
    let v = gradeRuns(p, o);
    for (const t of p.pitches) v += w[t] * (ARSENAL.types[t] || 0);
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
    const e = B3.ratings.effective(p), w = weights(p, undefined, e), G = W().pit.grade;
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

  function base() { if (!B3.overall.BASE) fail('the BASE table is missing (node tools/overall.js --part=base)'); return B3.overall.BASE; }

  function hitter(p, opts) {
    const pos = (opts && opts.pos) || p.pos;
    if (!pos || pos === 'P' || B3.data.LINEUP_POS.indexOf(pos) < 0) fail((p.id || 'player') + ': a hitter needs a lineup position, not ' + pos);
    const S = SEASON, parts = hitterParts(p, pos), perGame = sum(parts);
    const runs = S.games * (perGame - base().hit[pos]);
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
    const staffRuns = sum(parts), perBF = (staffRuns - base().pit) / T.pa;
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
    seasonParts.league = -bf * base().pit / T.pa; // the league's average starter's runs, taken off so he is 50
    seasonParts.stamina = role === 'SP' ? repSP * (ip - ip0) : 0;
    return { overall: clip(50 + S.points * (war - S.regularWins)), war: war, runs: S.runsPerWin * (war - S.regularWins), staffRuns: staffRuns,
      perBF: perBF, innings: ip, parts: seasonParts, role: role };
  }

  function detail(p, opts) {
    if (!p || typeof p !== 'object') fail('a player is needed');
    return isPitcher(p) ? pitcher(p, opts) : hitter(p, opts);
  }

  function of(p, opts) { return detail(p, opts).overall; }

  // His runs against an all-60 player, before the league's baseline: a hitter's runs a team-game in his slot, a pitcher's
  // for a whole staff of him (what BASE averages; tools/overall.js --part=base and --part=check).
  function raw(p, opts) {
    if (isPitcher(p)) {
      let v = arsenalRuns(p);
      const e = B3.ratings.effective(p);
      for (const k of PIT) v += at(W().pit[k], e[k]);
      return v;
    }
    return sum(hitterParts(p, (opts && opts.pos) || p.pos));
  }

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

  B3.overall = { of: of, detail: detail, arsenal: arsenal, arsenalRuns: arsenalRuns, gradeRuns: gradeRuns, weights: weights, raw: raw,
    potential: potential, WORTH: WORTH, BASE: BASE, SEASON: SEASON, ARSENAL: ARSENAL };
})(typeof globalThis !== 'undefined' ? globalThis : this);
