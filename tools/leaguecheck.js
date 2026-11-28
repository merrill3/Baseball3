// A new league's seasons (M2 step 2.1b, Session 31): builds B3.league.create(seed) and plays its schedule's 2,430 games
// (the home team's park, each team's rotation in turn, its bullpen; no rest, injuries or roster moves until step 2.3),
// --seasons times with different game seeds, and reports each team's wins against its expected wins, the spread, the
// park's runs at home against away, and the time a season takes. Node only; it checks nothing (exit 0).
// Usage: node tools/leaguecheck.js [--seed=1] [--seasons=1] [--jobs=N] [--parks=off] (every game in the standard park) [--tweak=file.js]
// The starting balance (owner's choice): a few teams expected to win about 95-100, a few about 60-65, most in between.
'use strict';
const os = require('os');
const { fork } = require('child_process');
const { loadCore } = require('./lib/load');

function args() {
  const a = process.argv.slice(2);
  const opt = (k, d) => { const x = a.find((s) => s.startsWith('--' + k + '=')); return x ? x.slice(k.length + 3) : d; };
  return { seed: opt('seed', '1'), seasons: parseInt(opt('seasons', '1'), 10), jobs: parseInt(opt('jobs', String(os.cpus().length)), 10),
    parks: opt('parks', 'on') !== 'off', tweak: opt('tweak', null) ? require('path').resolve(opt('tweak')) : null };
}

// One season: wins and runs by team, runs in each park.
function season(B3, L, n, o) {
  o = o || {};
  const t0 = Date.now();
  const W = {}, R = {}, park = {};
  const games = {};
  for (const t of L.teams) { W[t.id] = 0; R[t.id] = [0, 0]; games[t.id] = 0; park[t.id] = [0, 0]; }
  for (const gm of L.schedule.games) {
    const a = L.byId(gm.away), h = L.byId(gm.home);
    const g = B3.game.sim({ away: B3.league.gameTeam(a, games[a.id]++), home: B3.league.gameTeam(h, games[h.id]++), type: 'regular',
      park: o.parks === false ? null : h.park, rng: B3.rng.create('season:' + L.seed + ':' + n + ':' + gm.id) });
    const s = g.score;
    W[s[0] > s[1] ? a.id : h.id]++;
    R[a.id][0] += s[0]; R[a.id][1] += s[1]; R[h.id][0] += s[1]; R[h.id][1] += s[0];
    park[h.id][0] += s[0] + s[1]; park[h.id][1]++;
  }
  return { W: W, R: R, park: park, ms: Date.now() - t0 };
}

if (process.argv[2] === '--worker') {
  const B3 = loadCore();
  if (process.argv[3] && process.argv[3] !== '-') require(process.argv[3])(B3);
  process.on('message', (m) => {
    if (m.done) process.exit(0);
    const L = B3.league.create(m.seed);
    process.send({ out: season(B3, L, m.n, m.o) });
  });
  process.send({ ready: true });
} else {
  const o = args();
  const B3 = loadCore();
  if (o.tweak) require(o.tweak)(B3);
  const t0 = Date.now();
  const L = B3.league.create(o.seed);
  const build = Date.now() - t0;
  const res = [];
  let next = 0, active = 0;
  for (let w = 0; w < Math.min(o.jobs, o.seasons); w++) {
    const c = fork(__filename, ['--worker', o.tweak || '-']);
    active++;
    const give = () => { if (next < o.seasons) c.send({ seed: o.seed, n: next++, o: o }); else c.send({ done: true }); };
    c.on('message', (m) => { if (m.ready) return give(); res.push(m.out); give(); });
    c.on('exit', () => { if (--active === 0) report(B3, L, res, o, build); });
  }
}

function mean(xs) { return xs.reduce((a, b) => a + b, 0) / xs.length; }
function sd(xs) { const m = mean(xs); return Math.sqrt(mean(xs.map((x) => (x - m) * (x - m)))); }

function report(B3, L, res, o, build) {
  const n = res.length;
  const rows = L.teams.map((t) => {
    const w = mean(res.map((r) => r.W[t.id]));
    const rs = mean(res.map((r) => r.R[t.id][0])), ra = mean(res.map((r) => r.R[t.id][1]));
    const pr = mean(res.map((r) => r.park[t.id][0] / r.park[t.id][1]));
    return { t: t, w: w, rs: rs, ra: ra, parkRuns: pr };
  });
  const ex = rows.map((r) => r.t.expected), w = rows.map((r) => r.w);
  const mx = mean(ex), my = mean(w);
  let sxy = 0, sxx = 0, syy = 0;
  rows.forEach((r) => { sxy += (r.t.expected - mx) * (r.w - my); sxx += (r.t.expected - mx) ** 2; syy += (r.w - my) ** 2; });
  const all = [];
  for (const r of res) for (const id in r.W) all.push(r.W[id]);
  console.log('League ' + o.seed + ': ' + n + ' season(s) of its schedule (' + L.schedule.games.length + ' games, ' + L.schedule.days + ' days); built in ' + build + ' ms');
  console.log('  team                          exp  ovr  lvl   wins   runs  allowed   park runs/game');
  for (const r of rows.sort((a, b) => b.t.expected - a.t.expected)) {
    console.log('  ' + r.t.full.padEnd(29) + r.t.expected.toFixed(0).padStart(4) + String(r.t.overall).padStart(5) + r.t.level.toFixed(1).padStart(5) +
      r.w.toFixed(1).padStart(7) + r.rs.toFixed(0).padStart(7) + r.ra.toFixed(0).padStart(9) + r.parkRuns.toFixed(2).padStart(10));
  }
  const lg = mean(rows.map((r) => r.parkRuns));
  console.log('  wins against expected: slope ' + (sxy / sxx).toFixed(2) + ', r ' + (sxy / Math.sqrt(sxx * syy)).toFixed(2) + '; expected sd ' + sd(ex).toFixed(1) +
    ', a season\'s wins sd ' + sd(all).toFixed(1) + ' [MLB 2015-2025 about 12]; seasons with 95+ wins ' + all.filter((x) => x >= 95).length + ', 100+ ' + all.filter((x) => x >= 100).length +
    ', 65 or fewer ' + all.filter((x) => x <= 65).length + ' (of ' + all.length + ')');
  console.log('  runs a game (both teams) ' + lg.toFixed(2) + '; a season took ' + (mean(res.map((r) => r.ms)) / 1000).toFixed(1) + ' s in one process' + (o.jobs > 1 && n > 1 ? ' (with ' + Math.min(o.jobs, n) + ' at once)' : ''));
}
