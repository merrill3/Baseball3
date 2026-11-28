// Velocity per mph, by paired replays (Session 36, M2 step 2.1g item 2, V1: Velocity rushes the hitter's decision).
// Usage: node tools/velo.js [--samples=1500] [--seed=1] [--jobs=N] [--tweak=file.js] [--levels=40,50,60,70,80] [--rating=velocity]
//
// Both staffs at each level of the rating (everyone else 60), replaying the same plate appearances (tools/lib/value.js),
// and reads per plate appearance: K%, BB%, whiffs per swing, chase (swings at pitches out of the zone), zone swing, exit
// speed on balls in play, and runs per team-game. Each stat's slope per mph of fastball (least squares over the levels)
// is printed against MLB's same pitcher year to year (tools/lib/real.js dvelo.*: 335 pairs of seasons, 2024-2026).
// --rating=command reads the same stats per +10 of Command instead (no mph). It checks nothing (exit 0).
'use strict';
const os = require('os');
const path = require('path');
const { pool, diff } = require('./calibrate');
const REAL = require('./lib/real').slope;

function args() {
  const a = process.argv.slice(2);
  const opt = (k, d) => { const x = a.find((s) => s.startsWith('--' + k + '=')); return x ? x.slice(k.length + 3) : d; };
  return {
    samples: parseInt(opt('samples', '1500'), 10),
    seed: opt('seed', '1'),
    jobs: parseInt(opt('jobs', String(os.cpus().length)), 10),
    tweak: opt('tweak', null) ? path.resolve(opt('tweak')) : null,
    levels: opt('levels', '40,50,60,70,80').split(',').map(Number),
    rating: opt('rating', 'velocity')
  };
}

// Chase and zone swings need the pitch's zone: value.js counts swings only, so these come from the counts it keeps
// (calibrate.js's worker returns counts) plus ozs / oz / zs / z, which value.js adds from Session 36.
function rates(c) {
  return {
    K: 100 * c.K / c.pa, BB: 100 * c.BB / c.pa, whiff: 100 * c.whiff / c.sw, chase: 100 * c.ozsw / c.oz, zsw: 100 * c.zsw / c.z,
    zone: 100 * c.z / (c.z + c.oz), ev: c.ev / c.bip, ppa: c.pitches / c.pa, zcon: 100 * (1 - c.zwh / c.zsw), swing: 100 * (c.zsw + c.ozsw) / (c.z + c.oz), foul: 100 * c.foul / c.sw
  };
}

function slope(xs, ys) {
  const n = xs.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) * (xs[i] - mx); }
  return sxy / sxx;
}

function main() {
  const o = args();
  const { loadCore } = require('./lib/load');
  const B3 = loadCore();
  if (o.tweak) require(o.tweak)(B3);
  // The fastball speed each level gives (the rating's hook, as tools/ratingstats.js reads it).
  const mph = (L) => { const r = {}; for (const k of B3.ratings.ALL) r[k] = 60; r[o.rating] = L; r.stamina = 60; return B3.ratings.hooks({ id: 'x', ratings: r }).pit.velo; };
  const jobs = [];
  const ids = o.levels.map((L, i) => { jobs.push({ id: i, cond: L === 60 ? null : { kind: 'pitcher', k: o.rating, L: L }, samples: o.samples, seed: o.seed }); return i; });
  const t0 = Date.now();
  pool(jobs, o.jobs, o.tweak, (res) => {
    const xs = o.rating === 'velocity' ? o.levels.map(mph) : o.levels.map((L) => L / 10);
    const unit = o.rating === 'velocity' ? 'mph' : '+10';
    const base = res[ids[o.levels.indexOf(60)]];
    const rs = ids.map((i) => rates(res[i].counts));
    const runs = ids.map((i) => diff(base, res[i]).v); // runs allowed against the level 60, a team-game
    const out = [o.rating + ' (both staffs), ' + base.vals.length + ' plate appearances replayed per level (' + ((Date.now() - t0) / 1000).toFixed(0) + ' s' + (o.tweak ? ', tweak ' + o.tweak : '') + ')'];
    out.push('  level      ' + o.levels.map((L) => String(L).padStart(8)).join(''));
    if (o.rating === 'velocity') out.push('  fastball   ' + xs.map((x) => x.toFixed(1).padStart(8)).join(''));
    const keys = [['K', 'K %', 'dvelo.k_percent'], ['BB', 'BB %', 'dvelo.bb_percent'], ['whiff', 'whiff %', 'dvelo.whiff_percent'], ['chase', 'chase %', 'dvelo.oz_swing_percent'],
      ['zsw', 'zone swing %', 'dvelo.z_swing_percent'], ['swing', 'swing %', 'dvelo.swing_percent'], ['zone', 'zone %', 'dvelo.in_zone_percent'], ['ev', 'exit speed', 'dvelo.exit_velocity_avg'], ['zcon', 'zone contact %', 'dvelo.iz_contact_percent'],
      ['foul', 'fouls / swing', null], ['ppa', 'pitches / PA', 'dvelo.pitches_per_pa']];
    for (const [k, label, real] of keys) {
      const ys = rs.map((r) => r[k]);
      const s = slope(xs, ys), R = real && REAL[real];
      out.push('  ' + label.padEnd(13) + ys.map((y) => y.toFixed(2).padStart(8)).join('') + '   per ' + unit + ' ' + (s >= 0 ? '+' : '') + s.toFixed(3) +
        (R && o.rating === 'velocity' ? '  [MLB same pitcher ' + (R.per >= 0 ? '+' : '') + R.per.toFixed(3) + ' ± ' + R.se.toFixed(3) + ']' : ''));
    }
    out.push('  runs saved  ' + runs.map((v) => (-v).toFixed(3).padStart(8)).join('') + '   per ' + unit + ' ' + (-slope(xs, runs)).toFixed(3) + ' a team-game' +
      (o.rating === 'velocity' ? ' (per +10: ' + (-slope(o.levels, runs) * 10).toFixed(3) + ')' : ''));
    // +10 steps (the equal-value check's numbers for this rating, from these replays)
    out.push('  +10 steps   ' + o.levels.slice(1).map((L, i) => (o.levels[i] + '->' + L + ' ' + (runs[i] - runs[i + 1]).toFixed(3))).join('   '));
    console.log(out.join('\n'));
  });
}

if (require.main === module) main();
