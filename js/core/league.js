// A new league (M2 step 2.1b, Session 31; DESIGN.md sections 5 and 6): the 30 teams of B3.teams, each with an organization
// of 40 generated players (B3.players, one name context for the league), the starting balance, roles by profile, the team
// overall and the season's schedule (B3.schedule). Logic file: no DOM.
//
//   B3.league.create(seed, opts)   { seed, teams: [team], byId, schedule }: each team is B3.teams' row plus
//                                  org: { regulars, bench, starters (the rotation, ace first), relievers, reserves },
//                                  level (the points its ratings were shifted), target (its planned wins), expected
//                                  (its wins from its players), overall (the team overall). opts.schedule false skips it.
//   B3.league.war(org)             an organization's active players' wins above replacement, by playing time (below)
//   B3.league.teamOverall(wins)    the team overall for those expected wins
//   B3.league.gameTeam(team, n)    the team as B3.game.create takes it for its n-th game (n-th starter of the rotation)
//   B3.league.BALANCE              the numbers below
//
// The owner's choices it follows: a new league starts with a realistic spread, a few teams expected to win about 95-100
// and a few about 60-65 (Session 7); the team overall (DESIGN.md section 5). How is Claude's default (Session 31):
// - Expected wins: an average team's 81 plus its players' wins above replacement against the league's mean team, each
//   player's (B3.overall.detail(p).war, a reliever's real wins too) counted by his share of playing time: regulars and the
//   rotation in full, the bullpen in full (its 65 innings each), the bench at a quarter (about 160 plate appearances).
// - The balance: each team gets a target from a bell curve of the league's 30 places (81 + spread x the normal's quantile
//   at (rank + 0.5) / 30: about 100, 96, 93 at the top and 62, 66, 69 at the bottom), the places in the order the teams
//   were drawn (so the best-drawn team gets the top target), and its ratings are shifted (as B3.players' level: hitting,
//   pitching and grades by the shift, fielding and running by half) until its expected wins are the target.
// - Roles by profile: the rotation is the five best starters in the organization by the overall as a starter (its own five
//   and its three reserve starters), ace first; a wild flamethrower (Velocity 70 and up, Command 40 or lower) goes to the
//   bullpen as its long man when another starter is within BALANCE.swapGap points of him, and the long man to the
//   reserves. The short relievers keep B3.players' roles by overall (the best the closer).
// - The team overall: 50 for an 81-win team, plus BALANCE.pointsPerWin a win (so about 75 for 100 wins, 25 for 62).
(function (root) {
  'use strict';
  const B3 = root.B3 = root.B3 || {};

  const BALANCE = {
    spread: 9,         // the sd of the teams' planned wins (MLB's true-talent spread is about 9-10 wins; seasons add luck)
    benchShare: 0.25,  // a bench player's playing time against a regular's
    swapGap: 5,        // overall points: how close another starter must be to take a wild flamethrower's rotation spot
    pointsPerWin: 1.3, // the team overall's points a win
    rounds: 4          // shift passes (the curve and the cap aren't straight lines, so the expected wins are re-read after each)
  };

  const HIT = ['contact', 'timing', 'launch', 'rawPower', 'recognition', 'discipline'];
  const HALF = ['range', 'hands', 'arm', 'framing', 'speed', 'baserunning'];
  const PIT = ['velocity', 'command', 'deception'];

  function fail(msg) { throw new Error('B3.league: ' + msg); }
  function clip(x) { return Math.round(Math.max(20, Math.min(99, x))); }

  // The normal's quantile (Acklam's rational approximation, good to about 1e-9).
  function qnorm(p) {
    const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
    const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
    const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
    const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
    const lo = 0.02425;
    if (p < lo) { const q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    if (p > 1 - lo) return -qnorm(1 - p);
    const q = p - 0.5, r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }

  // Wins above replacement of an organization's active players, by playing time.
  function war(org) {
    const w = (p) => B3.overall.detail(p).war;
    let s = 0;
    for (const p of org.regulars) s += w(p);
    for (const p of org.bench) s += BALANCE.benchShare * w(p);
    for (const p of org.starters) s += w(p);
    for (const p of org.relievers) s += w(p);
    return s;
  }

  // Every rating of an organization moved by d points (as B3.players' level: hitting, pitching and grades by d, fielding and
  // running by d / 2), kept within 20-99; Stamina doesn't move. Ratings are whole numbers, so a fractional shift is spread
  // over the ratings (each rounds down or up in turn, golden-ratio steps), and the organization moves by d on average.
  function shiftOrg(org, d) {
    let j = 0;
    const move = (x, by) => { j++; return Math.max(20, Math.min(99, x + Math.floor(by + ((j * 0.6180339887) % 1)))); };
    for (const k of ['regulars', 'bench', 'starters', 'relievers', 'reserves']) {
      for (const p of org[k]) {
        const r = p.ratings;
        if (p.pitches) {
          for (const x of PIT) r[x] = move(r[x], d);
          for (const t of p.pitches) p.arsenal[t].grade = move(p.arsenal[t].grade, d);
        } else {
          for (const x of HIT) r[x] = move(r[x], d);
          for (const x of HALF) if (r[x] !== undefined) r[x] = move(r[x], d / 2);
        }
      }
    }
  }

  // The rotation and the long man by profile (see the header).
  function roles(org) {
    const starterOf = (p) => B3.overall.of(p, { role: 'SP' });
    const sps = org.starters.concat(org.reserves.filter((p) => p.pitches && p.role === 'SP'));
    sps.sort((a, b) => starterOf(b) - starterOf(a));
    let rot = sps.slice(0, 5), rest = sps.slice(5);
    const wild = (p) => p.ratings.velocity >= 70 && p.ratings.command <= 40;
    for (const p of rot.slice()) {
      if (!wild(p) || !rest.length || starterOf(rest[0]) < starterOf(p) - BALANCE.swapGap) continue;
      const up = rest.shift();
      rot = rot.filter((x) => x !== p).concat([up]).sort((a, b) => starterOf(b) - starterOf(a));
      const lr = org.relievers.find((x) => x.role === 'LR');
      p.role = 'LR';
      if (lr) { org.relievers[org.relievers.indexOf(lr)] = p; rest.push(lr); }
      break; // one swap at most: the bullpen has one long man
    }
    for (const p of rot) p.role = 'SP';
    const others = org.reserves.filter((p) => !(p.pitches && sps.indexOf(p) >= 0));
    org.starters = rot;
    org.reserves = others.concat(rest.filter((p) => org.relievers.indexOf(p) < 0));
  }

  function teamOverall(wins) { return clip(50 + BALANCE.pointsPerWin * (wins - 81)); }

  function create(seed, opts) {
    opts = opts || {};
    if (!B3.overall || !B3.overall.WORTH) fail('B3.overall is needed');
    const rng = B3.rng.create('league:' + seed), ctx = B3.players.context();
    const list = B3.teams.list;
    const teams = list.map((t) => Object.assign({}, t, { org: B3.players.squad(rng, ctx) }));
    for (const t of teams) roles(t.org);
    // The balance: targets by drawn rank, then shift each organization to its target.
    const w0 = teams.map((t) => war(t.org)), mean0 = w0.reduce((a, b) => a + b, 0) / w0.length;
    const order = teams.map((t, i) => i).sort((a, b) => w0[b] - w0[a] || a - b);
    const n = teams.length;
    order.forEach((i, rank) => { teams[i].target = 81 + BALANCE.spread * qnorm(1 - (rank + 0.5) / n); teams[i].level = 0; });
    // Points of rating a win (measured on the league itself: shift everyone by one point and read the change).
    for (let pass = 0; pass < BALANCE.rounds; pass++) {
      for (const t of teams) {
        const now = 81 + war(t.org) - mean0;
        const probe = JSON.parse(JSON.stringify(t.org));
        shiftOrg(probe, 2);
        const per = (war(probe) - war(t.org)) / 2; // wins a point for this organization
        const d = Math.max(-15, Math.min(15, (t.target - now) / Math.max(0.5, per)));
        if (Math.abs(d) < 0.05) continue;
        shiftOrg(t.org, d);
        t.level += d;
      }
    }
    const wars = teams.map((t) => war(t.org)), mean = wars.reduce((a, b) => a + b, 0) / n;
    teams.forEach((t, i) => {
      t.level = Math.round(t.level * 10) / 10;
      t.target = Math.round(t.target * 10) / 10;
      t.expected = Math.round((81 + wars[i] - mean) * 10) / 10;
      t.overall = teamOverall(t.expected);
    });
    const by = {};
    for (const t of teams) by[t.id] = t;
    const out = { seed: seed, teams: teams, byId: (id) => by[id] || null };
    if (opts.schedule !== false) out.schedule = B3.schedule.make(seed, list);
    return out;
  }

  // The team for a game: its regulars in a batting order (by hitting value, best first; Claude's default until the
  // managers of step 2.2), its n-th starter (the rotation in turn) and its bullpen.
  function gameTeam(t, n) {
    const org = t.org, players = {}, lineup = [];
    const hitRuns = (p) => { const d = B3.overall.detail(p); let s = 0; for (const k of HIT) s += d.parts[k] || 0; return s; };
    const regs = org.regulars.slice().sort((a, b) => hitRuns(b) - hitRuns(a));
    for (const p of regs) { players[p.id] = p; lineup.push({ id: p.id, pos: p.pos }); }
    const sp = org.starters[((n || 0) % org.starters.length + org.starters.length) % org.starters.length];
    players[sp.id] = sp;
    for (const p of org.relievers) players[p.id] = p;
    return { id: t.id, code: t.id, name: t.full, players: players, lineup: lineup, pitcher: sp.id, bullpen: org.relievers.map((p) => p.id) };
  }

  B3.league = { create: create, war: war, teamOverall: teamOverall, gameTeam: gameTeam, BALANCE: BALANCE };
})(typeof globalThis !== 'undefined' ? globalThis : this);
