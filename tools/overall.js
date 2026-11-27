// The overall and the Arsenal numbers (M2 step 2.1a task 3, Session 29; DESIGN.md section 10, "The overall"): measures
// what each rating is worth, checks the formulas in js/core/overall.js against replays, and reports a generated league's
// overall spread. Node only; it checks nothing (exit 0).
// Usage: node tools/overall.js [--part=worth,stamina,arsenal,check,league] [--samples=1500] [--seed=1] [--jobs=N] [--n=40]
//                              [--orgs=30] [--tweak=file.js]
//
//   worth    each rating's run value from 20 to 99 (everyone else at 60), in the replays of tools/lib/value.js (as the
//            equal-value check): hitting ratings and Baserunning for a whole lineup (one hitter: / 9); Speed for the away
//            lineup (its running, / 9, and its fielding); Velocity, Command, Deception and the grades (every pitch at the
//            level) for a whole staff; Range, Hands and Arm for every fielder, and for one fielder at each position at 40
//            and 80 (each position's share); Framing for the catchers. Prints the WORTH table for js/core/overall.js.
//            About 190 conditions: about 14 minutes on 4 processes.
//   stamina  a starter's innings a start by Stamina (the home starter of average teams at each level; plain games, not
//            replays): the table the overall's workload reads.
//   arsenal  the Arsenal formula against replays: --n generated pitchers' arsenals, each swapped in for every pitcher of
//            the staffs, with its own grades and with every grade at 60 (its grades' worth is the difference); prints the
//            share of pitches by count kind and how well the formula's runs match, for a few put-away weights.
//   check    the overall against replays: --n generated regulars (one away lineup slot each: his running and hitting minus
//            his fielding's runs allowed) and --n generated pitchers (every pitcher of the staffs); measured runs against the
//            overall's runs (a slope of 1 and a high r mean the overall adds the ratings up as the game does).
//   league   a generated league (--orgs organizations of 40, B3.players.squad): the overall's spread by tier and role, by
//            position, the Arsenal numbers, and the shares at 70+ and 80+ against MLB's (fWAR 2024-2025, below).
// --tweak=file.js loads a module function(B3) that changes B3.tune first, in every process.
'use strict';
const os = require('os');
const path = require('path');
const { pool, diff } = require('./calibrate');
const { loadCore } = require('./lib/load');

function args() {
  const a = process.argv.slice(2);
  const opt = (k, d) => { const x = a.find((s) => s.startsWith('--' + k + '=')); return x ? x.slice(k.length + 3) : d; };
  return {
    parts: opt('part', 'league').split(','),
    samples: parseInt(opt('samples', '1500'), 10),
    seed: opt('seed', '1'),
    jobs: parseInt(opt('jobs', String(os.cpus().length)), 10),
    n: parseInt(opt('n', '40'), 10),
    orgs: parseInt(opt('orgs', '30'), 10),
    tweak: opt('tweak', null) ? path.resolve(opt('tweak')) : null
  };
}

const HIT = ['contact', 'timing', 'launch', 'rawPower', 'recognition', 'discipline'];
const PIT = ['velocity', 'command', 'deception'];
const FLD = ['range', 'hands', 'arm'];
const POSF = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'];
const LV = [20, 30, 40, 50, 70, 80, 90, 99];
const PL = [40, 80];

function mean(xs) { return xs.reduce((a, b) => a + b, 0) / xs.length; }
function sd(xs) { const m = mean(xs); return Math.sqrt(mean(xs.map((x) => (x - m) * (x - m)))); }
function q(xs, p) { const v = xs.slice().sort((a, b) => a - b); return v[Math.min(v.length - 1, Math.max(0, Math.round(p * (v.length - 1))))]; }
function corr(xs, ys) {
  const mx = mean(xs), my = mean(ys);
  let a = 0, b = 0, c = 0;
  xs.forEach((x, i) => { a += (x - mx) * (ys[i] - my); b += (x - mx) * (x - mx); c += (ys[i] - my) * (ys[i] - my); });
  return a / Math.sqrt(b * c);
}
// Least squares y = a + b x.
function line(xs, ys) {
  const mx = mean(xs), my = mean(ys);
  let sxy = 0, sxx = 0;
  xs.forEach((x, i) => { sxy += (x - mx) * (ys[i] - my); sxx += (x - mx) * (x - mx); });
  const b = sxy / sxx;
  return { a: my - b * mx, b: b };
}
function r3(x) { return Math.round(x * 1000) / 1000; }
function r4(x) { return Math.round(x * 10000) / 10000; }
function fmt(x, d) { return (x >= 0 ? '+' : '') + x.toFixed(d === undefined ? 3 : d); }

// A rating's points after the curve for one player with that rating at L and everything else at 60 (what the overall
// reads its tables at).
function effAt(B3, k, L) {
  if (k === 'grade') {
    const p = { pitches: ['FF', 'SI', 'SL', 'CH', 'CU'], arsenal: {}, ratings: {} };
    for (const t of p.pitches) p.arsenal[t] = { grade: L, shape: 0 };
    const e = B3.ratings.effective(p);
    return mean(p.pitches.map((t) => e.grades[t]));
  }
  const p = { ratings: {} };
  p.ratings[k] = L;
  return B3.ratings.effective(p)[k];
}

function run(o, jobs, done) {
  const t0 = Date.now();
  pool(jobs, o.jobs, o.tweak, (res) => { done(res); console.log('(' + ((Date.now() - t0) / 1000).toFixed(0) + ' s, ' + o.jobs + ' processes)'); });
}

// ---- worth ----
function worth(o, next) {
  const B3 = loadCore();
  if (o.tweak) require(o.tweak)(B3);
  const jobs = [];
  let id = 0;
  const add = (cond) => { jobs.push({ id: id, cond: cond, samples: o.samples, seed: o.seed }); return id++; };
  const base = add(null);
  const plan = { hit: {}, speed: {}, pit: {}, fld: {}, framing: {}, pos: {} };
  for (const k of HIT.concat(['baserunning'])) plan.hit[k] = LV.map((L) => add({ kind: 'hitter', k: k, L: L }));
  plan.speed = LV.map((L) => add({ kind: 'hitter', k: 'speed', L: L, away: true }));
  for (const k of PIT) plan.pit[k] = LV.map((L) => add({ kind: 'pitcher', k: k, L: L }));
  plan.pit.grade = LV.map((L) => add({ kind: 'pitcher', grades: true, L: L }));
  for (const k of FLD) plan.fld[k] = LV.map((L) => add({ kind: 'hitter', k: k, L: L }));
  plan.framing = LV.map((L) => add({ kind: 'hitter', pos: 'C', k: 'framing', L: L }));
  for (const k of FLD.concat(['speed'])) {
    plan.pos[k] = {};
    for (const pos of POSF) plan.pos[k][pos] = PL.map((L) => add(Object.assign({ kind: 'hitter', pos: pos, k: k, L: L }, k === 'speed' ? { away: true } : {})));
  }
  console.log('worth: ' + jobs.length + ' conditions, ' + o.samples + ' games of plate appearances each');
  run(o, jobs, (res) => {
    const B = res[base];
    const all = (i) => diff(B, res[i]);         // every plate appearance
    const side = (i, h) => diff(B, res[i], h);  // h 0: the away team batting, 1: the home team batting (the away team fielding)
    const out = [], T = { pa: r3(B.pa), hit: {}, pit: {}, fld: {}, framing: null, pos: {} };
    const table = (k, vals) => LV.map((L, i) => [r3(effAt(B3, k === 'grade' ? 'grade' : k, L)), r4(vals[i])]).concat([[60, 0]]).sort((a, b) => a[0] - b[0]);
    out.push('Worth: runs per team-game against everyone at 60 (' + B.vals.length + ' plate appearances per condition; ' + T.pa + ' per team-game).');
    out.push('Each row: the level, then the value and its standard error. One hitter = a lineup / 9.');
    const show = (label, vals, ses) => out.push('  ' + label.padEnd(22) + LV.map((L, i) => L + ':' + fmt(vals[i]) + '±' + ses[i].toFixed(3)).join(' '));
    for (const k in plan.hit) {
      const d = plan.hit[k].map(all);
      show(k + ' (one hitter)', d.map((x) => x.v / 9), d.map((x) => x.se / 9));
      T.hit[k] = table(k, d.map((x) => x.v / 9));
    }
    const run0 = plan.speed.map((i) => side(i, 0)), fld1 = plan.speed.map((i) => side(i, 1));
    show('speed running (one)', run0.map((x) => x.v / 9), run0.map((x) => x.se / 9));
    show('speed fielding (team)', fld1.map((x) => -x.v), fld1.map((x) => x.se));
    T.hit.speed = table('speed', run0.map((x) => x.v / 9));
    T.fld.speed = table('speed', fld1.map((x) => -x.v));
    for (const k in plan.pit) {
      const d = plan.pit[k].map(all);
      show(k + ' (staff)', d.map((x) => -x.v), d.map((x) => x.se));
      T.pit[k] = table(k, d.map((x) => -x.v));
    }
    for (const k of FLD) {
      const d = plan.fld[k].map(all);
      show(k + ' (every fielder)', d.map((x) => -x.v), d.map((x) => x.se));
      T.fld[k] = table(k, d.map((x) => -x.v));
    }
    const fr = plan.framing.map(all);
    show('framing (catcher)', fr.map((x) => -x.v), fr.map((x) => x.se));
    T.framing = table('framing', fr.map((x) => -x.v));
    out.push('');
    out.push('Each position\'s share of a fielding rating: one fielder 40 -> 80 over every fielder 40 -> 80 (Speed: fielding only).');
    const i40 = LV.indexOf(40), i80 = LV.indexOf(80);
    for (const k of FLD.concat(['speed'])) {
      const team = k === 'speed' ? -(fld1[i80].v - fld1[i40].v) : -(all(plan.fld[k][i80]).v - all(plan.fld[k][i40]).v);
      T.pos[k] = {};
      const cells = [];
      let sum = 0;
      for (const pos of POSF) {
        const [a, b] = plan.pos[k][pos].map((i) => (k === 'speed' ? side(i, 1) : all(i)));
        const m = -(b.v - a.v) / team;
        sum += m;
        T.pos[k][pos] = r3(m);
        cells.push(pos + ' ' + m.toFixed(3) + '±' + (Math.sqrt(a.se * a.se + b.se * b.se) / Math.abs(team)).toFixed(3));
      }
      out.push('  ' + k.padEnd(8) + 'team 40->80 ' + team.toFixed(3) + '   ' + cells.join('  ') + '   sum ' + sum.toFixed(2));
    }
    out.push('');
    out.push('  // From node tools/overall.js --part=worth (' + new Date().toISOString().slice(0, 10) + ', ' + o.samples + ' games of plate appearances, seed ' + o.seed + ')');
    out.push('  const WORTH = ' + JSON.stringify(T, null, 0).replace(/\],\[/g, '], [').replace(/,"/g, ', "') + ';');
    console.log(out.join('\n'));
    next();
  });
}

// ---- stamina ----
// A starter's innings and pitches a start by Stamina: the home starter of average teams at each level (everything else 60).
function stamina(o, next) {
  const B3 = loadCore();
  if (o.tweak) require(o.tweak)(B3);
  const { averagePair } = require('./lib/testteams');
  const games = Math.max(200, Math.round(o.samples / 3));
  const out = ['Stamina: the home starter at each level, ' + games + ' games each (average teams): innings and pitches a start'];
  const rows = [];
  for (const L of [20, 25, 30, 40, 50, 60, 70, 80, 90, 99]) {
    let outs = 0, pitches = 0;
    for (let n = 0; n < games; n++) {
      const t = averagePair();
      t.home.players['HOM-SP'].ratings.stamina = L;
      const g = B3.game.sim(Object.assign(t, { type: 'regular', rng: B3.rng.create('stamina:' + o.seed + ':' + n) }));
      const sp = g.teams[1].used[0];
      for (const e of g.log) {
        if (e.p !== sp) continue;
        if (e.e === 'pitch') pitches++;
        else if (e.e === 'pa') outs += e.out;
        else if (e.e === 'cs') outs++;
      }
    }
    const eff = B3.ratings.effective({ ratings: { stamina: L } }).stamina;
    rows.push([r3(eff), r3(outs / 3 / games)]);
    out.push('  ' + String(L).padStart(2) + ' (' + eff.toFixed(1) + ' after the curve): ' + (outs / 3 / games).toFixed(2) + ' innings, ' + (pitches / games).toFixed(1) + ' pitches');
  }
  out.push('  inningsPerStart: ' + JSON.stringify(rows).replace(/\],\[/g, '], [') + ',');
  console.log(out.join('\n'));
  next();
}

// ---- arsenal ----
// Pitches by count kind in average teams' games: [normal, behind (two balls ahead of the strikes), two strikes].
function countKinds(B3, games) {
  const { averagePair } = require('./lib/testteams');
  const c = [0, 0, 0];
  for (let n = 0; n < games; n++) {
    const g = B3.game.sim(Object.assign(averagePair(), { type: 'regular', rng: B3.rng.create('kinds:' + n) }));
    for (const e of g.log) {
      if (e.e !== 'pitch') continue;
      const [b, s] = e.c.split('-').map(Number);
      c[s === 2 ? 2 : b - s >= 2 ? 1 : 0]++;
    }
  }
  const t = c[0] + c[1] + c[2];
  return c.map((x) => x / t);
}

function samplePitchers(B3, n, seed) {
  const rng = B3.rng.create('overall check:' + seed), ctx = B3.players.context();
  const out = [];
  while (out.length < n) {
    const sq = B3.players.squad(rng, ctx);
    out.push(sq.starters[0], sq.relievers[out.length % 8]);
  }
  return out.slice(0, n);
}

function arsenal(o, next) {
  const B3 = loadCore();
  if (o.tweak) require(o.tweak)(B3);
  const kinds = countKinds(B3, 300);
  const ps = samplePitchers(B3, o.n, o.seed);
  const jobs = [];
  let id = 0;
  const add = (cond) => { jobs.push({ id: id, cond: cond, samples: o.samples, seed: o.seed }); return id++; };
  const base = add(null);
  const flat = (p, g) => { const a = {}; for (const t of p.pitches) a[t] = { grade: g === undefined ? p.arsenal[t].grade : g, shape: 0 }; return { pitches: p.pitches, arsenal: a }; };
  const plan = ps.map((p) => ({ p: p, own: add({ kind: 'pitcher', arsenal: flat(p) }), avg: add({ kind: 'pitcher', arsenal: flat(p, 60) }) }));
  console.log('arsenal: ' + ps.length + ' arsenals, ' + jobs.length + ' conditions; pitches by count kind (normal, two balls ahead, two strikes): ' + kinds.map((x) => (100 * x).toFixed(1) + '%').join(', '));
  run(o, jobs, (res) => {
    const B = res[base];
    const meas = plan.map((x) => -(diff(B, res[x.own]).v - diff(B, res[x.avg]).v));
    const types = plan.map((x) => -diff(B, res[x.avg]).v);
    const out = [];
    out.push('Arsenal: each arsenal\'s grades, worth in runs per team-game for a whole staff (its own grades against every grade at 60, same pitch types).');
    out.push('  measured: mean ' + fmt(mean(meas)) + ', sd ' + sd(meas).toFixed(3) + '; the pitch types alone (every grade 60, against the test staffs\' types): sd ' + sd(types).toFixed(3));
    const O = B3.overall;
    for (const w2 of [1, 1.5, 2, 3]) {
      const pred = plan.map((x) => O.arsenalRuns(Object.assign({}, x.p, { ratings: Object.assign({}, x.p.ratings, { velocity: 60 }) }), { twoStrike: w2 }));
      const ln = line(pred, meas);
      out.push('  two-strike weight ' + w2.toFixed(1) + ':  r ' + corr(pred, meas).toFixed(3) + ', measured = ' + ln.a.toFixed(3) + ' + ' + ln.b.toFixed(2) + ' x formula, rms ' +
        Math.sqrt(mean(pred.map((y, i) => (meas[i] - y) * (meas[i] - y)))).toFixed(3));
    }
    const pred = plan.map((x) => O.arsenalRuns(Object.assign({}, x.p, { ratings: Object.assign({}, x.p.ratings, { velocity: 60 }) })));
    out.push('  (current weights: r ' + corr(pred, meas).toFixed(3) + ')');
    out.push('  a few: ' + plan.slice(0, 8).map((x, i) => x.p.pitches.map((t) => t + ' ' + x.p.arsenal[t].grade).join('/') + ' measured ' + fmt(meas[i], 2) + ' formula ' + fmt(pred[i], 2)).join('; '));
    console.log(out.join('\n'));
    next();
  });
}

// ---- check ----
function sampleHitters(B3, n, seed) {
  const rng = B3.rng.create('overall hitters:' + seed), ctx = B3.players.context();
  const out = [];
  while (out.length < n) out.push(...B3.players.squad(rng, ctx).regulars);
  return out.slice(0, n);
}

function check(o, next) {
  const B3 = loadCore();
  if (o.tweak) require(o.tweak)(B3);
  const hs = sampleHitters(B3, o.n, o.seed), ps = samplePitchers(B3, o.n, o.seed + 'p');
  const jobs = [];
  let id = 0;
  const add = (cond) => { jobs.push({ id: id, cond: cond, samples: o.samples, seed: o.seed }); return id++; };
  const base = add(null);
  const hp = hs.map((p) => ({ p: p, id: add({ kind: 'hitter', pos: p.pos, away: true, player: p }) }));
  const pp = ps.map((p) => ({ p: p, id: add({ kind: 'pitcher', player: p }) }));
  console.log('check: ' + hs.length + ' hitters, ' + ps.length + ' pitchers, ' + jobs.length + ' conditions');
  run(o, jobs, (res) => {
    const B = res[base], O = B3.overall, out = [];
    const hm = hp.map((x) => diff(B, res[x.id], 0).v - diff(B, res[x.id], 1).v);
    const hf = hp.map((x) => O.detail(x.p).perGame);
    const pm = pp.map((x) => -diff(B, res[x.id]).v);
    const pf = pp.map((x) => O.detail(x.p).staffRuns);
    const rep = (label, f, m, unit) => {
      const ln = line(f, m);
      out.push('  ' + label.padEnd(10) + 'r ' + corr(f, m).toFixed(3) + '   measured = ' + ln.a.toFixed(3) + ' + ' + ln.b.toFixed(2) + ' x overall\'s   rms ' +
        Math.sqrt(mean(f.map((y, i) => (m[i] - y) * (m[i] - y)))).toFixed(3) + '   spread (sd) measured ' + sd(m).toFixed(3) + ', overall\'s ' + sd(f).toFixed(3) + ' ' + unit);
    };
    out.push('Check: the overall\'s runs against replays (runs per team-game against an all-60 player in his slot).');
    rep('hitters', hf, hm, '(one hitter)');
    rep('pitchers', pf, pm, '(a whole staff of him; Stamina not in it)');
    // In overall points: a hitter's runs a game x the season's games x points a run.
    const S = O.SEASON;
    const ptsH = S.games * S.points / S.runsPerWin;
    out.push('  hitters\' rms in overall points: ' + (ptsH * Math.sqrt(mean(hf.map((y, i) => (hm[i] - y) * (hm[i] - y))))).toFixed(1) +
      '; noise in the measure alone about ' + (ptsH * mean(hp.map((x) => Math.hypot(diff(B, res[x.id], 0).se, diff(B, res[x.id], 1).se)))).toFixed(1));
    const worst = hp.map((x, i) => ({ x: x, d: hm[i] - hf[i] })).sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 4);
    out.push('  hitters furthest off: ' + worst.map((w) => w.x.p.pos + ' ' + HIT.map((k) => w.x.p.ratings[k]).join('/') + ' off ' + fmt(w.d)).join('; '));
    console.log(out.join('\n'));
    next();
  });
}

// ---- league ----
// MLB's shares to compare with (Claude's reading of FanGraphs 2024-2025): position players with 450+ PA and starters with
// 120+ innings; 5.3+ fWAR (70 on the overall's scale, 6 points a win from 2 = 50) and 7+ (80).
const MLB_SHARE = { hitters: { at70: 0.09, at80: 0.02 }, starters: { at70: 0.04, at80: 0.005 } };

function league(o, next) {
  const B3 = loadCore();
  if (o.tweak) require(o.tweak)(B3);
  const O = B3.overall;
  const rng = B3.rng.create('league:' + o.seed), ctx = B3.players.context();
  const orgs = [];
  for (let i = 0; i < o.orgs; i++) orgs.push(B3.players.squad(rng, ctx));
  const tiers = { regulars: [], bench: [], starters: [], relievers: [], reserves: [] };
  for (const s of orgs) for (const k in tiers) tiers[k].push(...s[k]);
  const out = ['League: ' + o.orgs + ' organizations (seed ' + o.seed + '), the overall by tier (p5 / p25 / median / p75 / p95, mean, sd; 70+ and 80+)'];
  const row = (label, list) => {
    const v = list.map((p) => O.of(p));
    const at = (x) => (100 * v.filter((y) => y >= x).length / v.length).toFixed(1) + '%';
    out.push('  ' + label.padEnd(18) + [0.05, 0.25, 0.5, 0.75, 0.95].map((p) => String(q(v, p)).padStart(3)).join(' / ') + '   mean ' + mean(v).toFixed(1) + ', sd ' + sd(v).toFixed(1) +
      '   70+ ' + at(70) + ', 80+ ' + at(80) + '   min ' + Math.min(...v) + ', max ' + Math.max(...v));
  };
  row('regulars', tiers.regulars);
  row('bench', tiers.bench);
  row('starters', tiers.starters);
  row('relievers', tiers.relievers);
  row('reserve hitters', tiers.reserves.filter((p) => !p.pitches));
  row('reserve pitchers', tiers.reserves.filter((p) => p.pitches));
  out.push('  MLB [fWAR 2024-2025, Claude\'s reading]: regulars 70+ about ' + (100 * MLB_SHARE.hitters.at70) + '%, 80+ about ' + (100 * MLB_SHARE.hitters.at80) + '%; starters 70+ about ' +
    (100 * MLB_SHARE.starters.at70) + '%, 80+ about ' + (100 * MLB_SHARE.starters.at80) + '%');
  out.push('');
  out.push('Regulars by position (median, sd):');
  out.push('  ' + B3.data.LINEUP_POS.map((pos) => { const v = tiers.regulars.filter((p) => p.pos === pos).map((p) => O.of(p)); return pos + ' ' + q(v, 0.5) + ' / ' + sd(v).toFixed(1); }).join('   '));
  out.push('');
  const ars = tiers.starters.concat(tiers.relievers).map((p) => O.arsenal(p));
  const grp = (k) => ars.map((a) => a[k]).filter((x) => x !== null);
  out.push('Arsenal numbers (starters and relievers; p5 / median / p95, sd):');
  for (const k of ['arsenal', 'fastball', 'breaking', 'offspeed']) {
    const v = grp(k);
    out.push('  ' + k.padEnd(10) + [0.05, 0.5, 0.95].map((p) => q(v, p)).join(' / ') + ', sd ' + sd(v).toFixed(1) + (v.length < ars.length ? '   (' + (100 * v.length / ars.length).toFixed(0) + '% have one)' : ''));
  }
  const sp = tiers.starters;
  const best = (p) => Math.max(...p.pitches.map((t) => p.arsenal[t].grade));
  const avgG = (p) => mean(p.pitches.map((t) => p.arsenal[t].grade));
  out.push('  starters: Arsenal against his best grade r ' + corr(sp.map((p) => O.arsenal(p).arsenal), sp.map(best)).toFixed(2) + ', against his mean grade r ' + corr(sp.map((p) => O.arsenal(p).arsenal), sp.map(avgG)).toFixed(2) +
    '; Arsenal minus mean grade: mean ' + fmt(mean(sp.map((p) => O.arsenal(p).arsenal - avgG(p))), 1));
  out.push('');
  out.push('What drives a regular\'s overall (r with each rating):');
  out.push('  ' + HIT.concat(['speed', 'range', 'hands', 'arm', 'baserunning']).map((k) => k + ' ' + corr(tiers.regulars.map((p) => O.of(p)), tiers.regulars.map((p) => p.ratings[k])).toFixed(2)).join('  '));
  out.push('  starters: ' + PIT.concat(['stamina']).map((k) => k + ' ' + corr(sp.map((p) => O.of(p)), sp.map((p) => p.ratings[k])).toFixed(2)).join('  ') +
    '  arsenal ' + corr(sp.map((p) => O.of(p)), sp.map((p) => O.arsenal(p).arsenal)).toFixed(2));
  out.push('');
  out.push('Potential on the overall\'s scale (shown), by age:');
  const allp = [].concat(...Object.values(tiers));
  for (const [lo, hi] of [[21, 23], [24, 26], [27, 31], [32, 34], [35, 40]]) {
    const list = allp.filter((p) => p.age >= lo && p.age <= hi);
    out.push('  ' + (lo + '-' + hi).padEnd(6) + 'overall ' + mean(list.map((p) => O.of(p))).toFixed(1) + ', potential ' + mean(list.map((p) => O.potential(p))).toFixed(1) + ' (' + list.length + ' players)');
  }
  out.push('');
  out.push('The best ten:');
  const top = allp.map((p) => ({ p: p, o: O.of(p) })).sort((a, b) => b.o - a.o).slice(0, 10);
  for (const t of top) {
    const p = t.p;
    out.push('  ' + String(t.o).padStart(2) + '  ' + (p.pitches ? p.role : p.pos).padEnd(3) + ' ' + p.name.padEnd(22) + (p.pitches
      ? PIT.map((k) => k.slice(0, 3) + ' ' + p.ratings[k]).join(' ') + ' sta ' + p.ratings.stamina + '  ' + p.pitches.map((ty) => ty + ' ' + p.arsenal[ty].grade).join(' ') + '  Arsenal ' + O.arsenal(p).arsenal
      : HIT.map((k) => k.slice(0, 3) + ' ' + p.ratings[k]).join(' ') + '  spd ' + p.ratings.speed + ' rng ' + p.ratings.range + ' hnd ' + p.ratings.hands + ' arm ' + p.ratings.arm));
  }
  console.log(out.join('\n'));
  next();
}

function main() {
  const o = args();
  const parts = { worth: worth, stamina: stamina, arsenal: arsenal, check: check, league: league };
  const todo = o.parts.filter((p) => parts[p]);
  const step = () => { const p = todo.shift(); if (p) parts[p](o, () => { console.log(''); step(); }); };
  step();
}

if (require.main === module) main();
