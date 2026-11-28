// Park effects (M2 step 2.1b, Session 31; DESIGN.md sections 5 and 6): each team's park (B3.teams) against the standard park,
// in runs and home runs, with the paired replays of the equal-value check (tools/lib/value.js): the same plate appearances
// between average teams, replayed in every park with the same random numbers, so a park's effect is measured to about 0.5%.
// Usage: node tools/parks.js [--samples=1500] [--seed=1] [--jobs=N] [--only=NM,SLC] [--tweak=file.js]
// Target (owner's choices): most parks within +-5% of runs, the thin-air park (New Mexico) about +10%; the league's
// parks average about 0 (the standard park is the average one). It checks nothing (exit 0).
'use strict';
const os = require('os');
const path = require('path');
const { fork } = require('child_process');

function args() {
  const a = process.argv.slice(2);
  const opt = (k, d) => { const x = a.find((s) => s.startsWith('--' + k + '=')); return x ? x.slice(k.length + 3) : d; };
  return {
    samples: parseInt(opt('samples', '1500'), 10), seed: opt('seed', '1'), jobs: parseInt(opt('jobs', String(os.cpus().length)), 10),
    only: opt('only', null), tweak: opt('tweak', null) ? path.resolve(opt('tweak')) : null
  };
}

function worker() {
  const { loadCore } = require('./lib/load');
  const V = require('./lib/value');
  const B3 = loadCore();
  const tweak = process.argv[3];
  if (tweak && tweak !== '-') require(tweak)(B3);
  // Every game the replays create gets the park being measured (none while sampling: the states are the standard park's).
  let park = null;
  const create = B3.game.create;
  B3.game.create = (o) => create(Object.assign({}, o, { park: park }));
  let s = null;
  process.on('message', (m) => {
    if (m.done) process.exit(0);
    if (!s) s = V.sample(B3, m.samples, m.seed);
    park = m.id === 'STD' ? null : B3.teams.park(m.id);
    const r = V.measure(B3, s, null, {});
    park = null;
    process.send({ id: m.id, out: { value: r.value, pa: s.paPerTeamGame, c: r.counts } });
  });
  process.send({ ready: true });
}

function main() {
  const o = args();
  const { loadCore } = require('./lib/load');
  const B3 = loadCore();
  const ids = ['STD'].concat(B3.teams.list.map((t) => t.id).filter((id) => !o.only || o.only.split(',').indexOf(id) >= 0));
  const res = {};
  const t0 = Date.now();
  let next = 0, active = 0;
  for (let w = 0; w < Math.min(o.jobs, ids.length); w++) {
    const c = fork(__filename, ['--worker', o.tweak || '-']);
    active++;
    const give = () => { if (next < ids.length) c.send({ id: ids[next++], samples: o.samples, seed: o.seed }); else c.send({ done: true }); };
    c.on('message', (m) => { if (m.ready) return give(); res[m.id] = m.out; give(); });
    c.on('exit', () => { if (--active === 0) report(B3, ids, res, o, t0); });
  }
}

function report(B3, ids, res, o, t0) {
  const std = res.STD, runsStd = std.value * std.pa;
  // A park's runs a team-game: the standard park's league level (B3's ~4.66) plus the replays' difference.
  const level = 4.66;
  const rows = ids.filter((id) => id !== 'STD').map((id) => {
    const r = res[id], t = B3.teams.byId(id);
    const d = (r.value - std.value) * r.pa;
    const hr = r.c.HR / r.c.pa, hr0 = std.c.HR / std.c.pa;
    const h = r.c.H / r.c.pa, h0 = std.c.H / std.c.pa;
    return { id: id, name: t.park.name, team: t.full, elev: t.park.elevation, odd: !!t.park.odd, runs: 100 * d / level, hr: 100 * (hr / hr0 - 1), hits: 100 * (h / h0 - 1) };
  });
  console.log('Park effects: ' + o.samples + ' games of plate appearances (seed ' + o.seed + '), each replayed in every park; % against the standard park');
  console.log('  park                         team                          elev   runs    HR   hits');
  for (const r of rows.sort((a, b) => b.runs - a.runs)) {
    console.log('  ' + (r.name + (r.odd ? ' *' : '')).padEnd(29) + r.team.padEnd(30) + String(r.elev).padStart(5) + (r.runs >= 0 ? '  +' : '  ') + r.runs.toFixed(1).padStart(4) +
      (r.hr >= 0 ? '  +' : '  ') + r.hr.toFixed(0).padStart(3) + (r.hits >= 0 ? '  +' : '  ') + r.hits.toFixed(1));
  }
  const m = rows.reduce((a, r) => a + r.runs, 0) / rows.length;
  const within = rows.filter((r) => Math.abs(r.runs - m) <= 5).length;
  console.log('  * an odd park. Mean of the parks ' + (m >= 0 ? '+' : '') + m.toFixed(1) + '% (the standard park ' + runsStd.toFixed(3) + ' replay runs a team-game); ' + within + ' of ' + rows.length + ' within 5% of the mean');
  console.log('(' + Math.round((Date.now() - t0) / 1000) + ' s, ' + o.jobs + ' processes)');
}

if (process.argv[2] === '--worker') worker(); else main();
