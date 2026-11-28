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
//   B3.overall.arsenal(player)           { arsenal, fastball, breaking, offspeed }: 20-99, null for a group he doesn't throw;
//                                        the league's average pitcher reads 60 (Session 31)
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
  // framing: one catcher. pa: plate appearances a team-game in the replays. Measured in Session 29, and again in Session 30
  // after the pitching balance, and in Session 31 after Velocity's change (1,500 games of plate appearances, 116,278 replayed per condition, seed 1; standard errors
  // about 0.005 a hitter, 0.04-0.07 a staff, 0.01-0.05 every fielder; the catcher's Hands and Arm shares are noisy, 0.21 +- 0.09
  // and 0.28 +- 0.07). Rerun it after a change to the physics or B3.tune and paste the new table here.
  const WORTH = {
    pa: 38.7,
    hit: {
      contact: [[20, -0.1839], [30, -0.1448], [40, -0.0996], [50, -0.047], [60, 0], [70, 0.0599], [80, 0.1294], [91.25, 0.2238], [108.8, 0.407]],
      timing: [[20, -0.1356], [30, -0.1018], [40, -0.0712], [50, -0.0374], [60, 0], [70, 0.0323], [80, 0.0617], [91.25, 0.0925], [108.8, 0.1541]],
      launch: [[20, -0.1371], [30, -0.1021], [40, -0.0659], [50, -0.0389], [60, 0], [70, 0.0393], [80, 0.0742], [91.25, 0.115], [108.8, 0.1711]],
      rawPower: [[20, -0.2396], [30, -0.1994], [40, -0.1287], [50, -0.0551], [60, 0], [70, 0.0535], [80, 0.1076], [91.25, 0.1538], [108.8, 0.2016]],
      recognition: [[20, -0.2322], [30, -0.1566], [40, -0.0998], [50, -0.0444], [60, 0], [70, 0.0379], [80, 0.067], [91.25, 0.0865], [108.8, 0.0922]],
      discipline: [[20, -0.2006], [30, -0.1479], [40, -0.0982], [50, -0.0462], [60, 0], [70, 0.0431], [80, 0.0868], [91.25, 0.1373], [108.8, 0.1961]],
      baserunning: [[20, -0.0734], [30, -0.0521], [40, -0.0401], [50, -0.0219], [60, 0], [70, 0.0146], [80, 0.0372], [91.25, 0.0529], [108.8, 0.0721]],
      speed: [[20, -0.1379], [30, -0.0971], [40, -0.0663], [50, -0.0286], [60, 0], [70, 0.0226], [80, 0.0586], [91.25, 0.0854], [108.8, 0.1046]]
    },
    pit: {
      velocity: [[20, -1.8357], [30, -1.2207], [40, -0.7933], [50, -0.2906], [60, 0], [70, 0.2936], [80, 0.898], [91.25, 1.2791], [108.8, 2.0103]],
      command: [[20, -0.5315], [30, -0.4096], [40, -0.2702], [50, -0.098], [60, 0], [70, 0.1627], [80, 0.3822], [91.25, 0.5757], [108.8, 0.8504]],
      deception: [[20, -2.0082], [30, -1.5868], [40, -1.0718], [50, -0.5311], [60, 0], [70, 0.4851], [80, 0.9735], [91.25, 1.4943], [108.8, 2.3313]],
      grade: [[20, -1.6413], [30, -1.4756], [40, -1.0306], [50, -0.5551], [60, 0], [70, 0.7854], [80, 1.5454], [90.75, 2.2836], [101.4, 3.2804]]
    },
    fld: {
      speed: [[20, -0.5036], [30, -0.3125], [40, -0.2048], [50, -0.0745], [60, 0], [70, 0.0636], [80, 0.1483], [91.25, 0.1963], [108.8, 0.2197]],
      range: [[20, -0.7992], [30, -0.6009], [40, -0.408], [50, -0.2042], [60, 0], [70, 0.1975], [80, 0.3769], [91.25, 0.575], [108.8, 0.9104]],
      hands: [[20, -0.532], [30, -0.4061], [40, -0.3168], [50, -0.1862], [60, 0], [70, 0.1736], [80, 0.345], [91.25, 0.5333], [108.8, 0.7236]],
      arm: [[20, -0.5477], [30, -0.431], [40, -0.3472], [50, -0.1541], [60, 0], [70, 0.156], [80, 0.3722], [91.25, 0.491], [108.8, 0.5694]]
    },
    pos: {
      range: { C: 0.001, '1B': 0.074, '2B': 0.173, '3B': 0.105, SS: 0.153, LF: 0.161, CF: 0.182, RF: 0.161 },
      hands: { C: 0.291, '1B': 0.064, '2B': 0.148, '3B': 0.128, SS: 0.211, LF: 0.049, CF: 0.052, RF: 0.049 },
      arm: { C: 0.347, '1B': 0.016, '2B': 0.059, '3B': 0.071, SS: 0.134, LF: 0.109, CF: 0.134, RF: 0.097 },
      speed: { C: 0.001, '1B': 0.006, '2B': 0.113, '3B': 0.012, SS: 0.076, LF: 0.233, CF: 0.323, RF: 0.235 }
    },
    framing: [[20, -0.1373], [30, -0.109], [40, -0.0676], [50, -0.0312], [60, 0], [70, 0.0428], [80, 0.0784], [91.25, 0.1252], [108.8, 0.1705]]
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
    kinds: [0.631, 0.071, 0.297],
    // Session 29's fit (60 generated arsenals, 121 replayed conditions): whole arsenals r 0.991, rms 0.105 runs (grades alone
    // r 0.79: the types alone spread 0.34 runs, the grades 0.72); was scale 0.937, types FF -1.136, SI -0.141, FC 0.028,
    // SL 0.967, CU 1.445, CH 0.71, FS 1.155. Session 30's, after the pitching balance (the same 60 arsenals): r 0.981, rms
    // 0.145 (grades alone r 0.80; the grades spread 0.63 runs, the types 0.35).
    scale: 0.882,
    types: { FF: -1.164, SI: -0.293, FC: 0.177, SL: 0.907, CU: 1.411, CH: 0.802, FS: 1.06 },
    groups: { fastball: ['FF', 'SI', 'FC'], breaking: ['SL', 'CU'], offspeed: ['CH', 'FS'] }
  };

  // The league's average players (tools/overall.js --part=base: the mean of a large generated league, B3.players): a
  // regular's runs a team-game at each position, and a starter's runs for a whole staff of him, both against an all-60
  // player. Each is the overall's 50, so an average regular at his position and an average starter are 50. Session 29: 4,000
  // organizations (standard errors about 0.002 runs a hitter, 0.006 a staff: a fifth of an overall point or less). A
  // position's mean carries its leans (a center fielder's Speed 74 is worth +0.04 runs a game, a catcher's Speed 50 and Raw
  // Power 57 cost about as much): that is the positional adjustment. The starter's +0.57 is the average generated arsenal's
  // worth (a pitcher throws his better pitches more, and the grades' table is steeper above 60 than below). Session 30, after the
  // pitching balance (the same 4,000 organizations): the starter's +0.42 (was +0.57: the grades' table is less steep above 60
  // and the fit's scale smaller); the regulars' within about 0.01 runs of Session 29's.
  // Session 31 (owner's choices: relievers on a scale of their own, the Arsenal re-centered to 60): rel, the league's average
  // reliever (the squads' eight bullpen arms) for a whole staff of him; arsenal, the league's mean raw Arsenal numbers (every
  // starter and reliever; a group among those who throw it) minus 60, taken off so the average pitcher reads 60.
  const BASE = { hit: { C: -0.0513, '1B': 0.004, '2B': -0.0136, '3B': -0.003, SS: -0.0074, LF: 0.0082, CF: 0.0517, RF: 0.0188, DH: 0.0076 }, pit: 0.4167,
    rel: 0.4167, arsenal: { arsenal: 0, fastball: 0, breaking: 0, offspeed: 0 } };

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

  // raw: the numbers before the league's shift and unrounded (tools/overall.js --part=base measures the shift from them).
  function arsenal(p, raw) {
    if (!isPitcher(p)) return { arsenal: null, fastball: null, breaking: null, offspeed: null };
    const e = B3.ratings.effective(p), w = weights(p, undefined, e), G = W().pit.grade, shift = (base().arsenal || {});
    const num = (types, k) => {
      const list = p.pitches.filter((t) => !types || types.indexOf(t) >= 0);
      if (!list.length) return null;
      let v = 0, s = 0;
      for (const t of list) { v += w[t] * at(G, e.grades[t]); s += w[t]; }
      const x = ratedGrade(inv(G, v / s));
      return raw ? x : clip(x - (shift[k] || 0));
    };
    const A = ARSENAL.groups;
    return { arsenal: num(null, 'arsenal'), fastball: num(A.fastball, 'fastball'), breaking: num(A.breaking, 'breaking'), offspeed: num(A.offspeed, 'offspeed') };
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
    // A reliever's overall is on a scale of his own (owner's choice, Session 31): his runs saved a batter against the league's
    // average reliever, over an average starter's batters, at the starters' points a win. So a reliever's 70 pitches like a
    // starter's 70 a batter, and the league's average reliever is 50; his real wins (war) stay for team strength.
    const overall = role === 'SP' ? 50 + S.points * (war - S.regularWins)
      : 50 + S.points * ip0 * S.bfPerInning * (staffRuns - base().rel) / T.pa / S.runsPerWin;
    return { overall: clip(overall), war: war, runs: S.runsPerWin * (war - S.regularWins), staffRuns: staffRuns,
      perBF: perBF, innings: ip, parts: seasonParts, role: role, scale: role === 'SP' ? 'wins' : 'relief' };
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
