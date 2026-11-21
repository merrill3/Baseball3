// Tries base-running settings side by side (Session 6, work in progress). Usage:
//   node tools/running-sweep.js '[{}, {"shuffle":[4,4,3],"shuffleV":3}, {"throwLong":0.62}]' [games=1000]
// Each object overrides values in B3.tune.BALL for one run of tools/running.js (same games and seed).
// Prints runs per team-game, second to home on a single (all, fewer than two outs, two outs), first to
// third on a single, first to home on a double (all, <2 outs, 2 outs), XBT%, double plays and sac flies.
'use strict';
const { run } = require('./running.js');
const sets = JSON.parse(process.argv[2] || '[{}]');
const games = +(process.argv[3] || 1000);
for (const set of sets) {
  const r = run(games, '1', false, (B3) => { for (const k in set) B3.tune.BALL[k] = set[k]; });
  const c = r.c, p = (x) => (100 * x.xb / x.n).toFixed(0).padStart(3);
  const all = ['s2', 's1', 'd1'].reduce((a, k) => ({ n: a.n + c[k].all.n, xb: a.xb + c[k].all.xb }), { n: 0, xb: 0 });
  console.log(JSON.stringify(set).padEnd(70), 'R', (r.runs / games / 2).toFixed(2), '2-H', p(c.s2.all), p(c.s2.lt2), p(c.s2.two),
    ' 1-3', p(c.s1.all), ' 1-H', p(c.d1.all), p(c.d1.lt2), p(c.d1.two), ' XBT', p(all),
    ' DP', (r.ev.DP / games / 2).toFixed(2), 'SF', (r.ev.SF / games / 2).toFixed(2));
}
