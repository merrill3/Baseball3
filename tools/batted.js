// The league's batted balls against real 2024-2026 Statcast (M1 step 1.5 task 3). It checks nothing.
// Usage: node tools/batted.js [games=1000] [seed=1] [--rated] [--tweak=file.js]
// Average test teams (every rating 60) by default; --rated plays rated test teams with a league-like spread.
// --tweak=file.js loads a module `(B3) => { ... }` that changes B3.tune first (for trying settings).
// Prints the batting line, the exit-speed spread, launch angles and the batted-ball mix, spray by type,
// bat speed and squared-up contact (Savant's formulas), and what each launch-angle and exit-speed group
// becomes. "real" is the median 2024-2026 player-season from tools/lib/real.js.
'use strict';
const path = require('path');
const { loadCore } = require('./lib/load');
const { averagePair, ratedPair } = require('./lib/testteams');
const { barrel } = require('./ratingstats');
const real = require('./lib/real');

function pctl(xs, p) { return xs.length ? xs[Math.min(xs.length - 1, Math.floor(p * xs.length))] : NaN; }
function f(x, d) { return Number.isFinite(x) ? x.toFixed(d === undefined ? 1 : d) : '-'; }

const HITS = { '1B': 1, '2B': 2, '3B': 3, HR: 4 };
const LA = [['ground ball (<10)', -99, 10], ['line drive (10-25)', 10, 25], ['fly ball (25-50)', 25, 50.01], ['pop-up (>50)', 50.01, 99]];

function run(games, seed, rated, tweak) {
  const B3 = loadCore();
  if (tweak) require(path.resolve(tweak))(B3);
  const S = B3.tune.SWING;
  const c = { games: 0, runs: 0, pa: 0, ab: 0, h: 0, tb: 0, bb: 0, k: 0, sf: 0, hr: 0, d2: 0, d3: 0, bbe: [], swings: 0, contact: 0, sq: 0, blast: 0, bat: 0, fast: 0 };
  for (let n = 0; n < games; n++) {
    const teams = rated ? ratedPair(B3.rng.create('bt:' + seed + ':' + n)) : averagePair();
    const g = B3.game.sim(Object.assign(teams, { type: 'regular', rng: B3.rng.create('bb:' + seed + ':' + n) }));
    c.games++;
    c.runs += g.score[0] + g.score[1];
    let last = null;
    for (const e of g.log) {
      if (e.e === 'pitch') {
        last = e;
        if (e.r === 'S' || e.r === 'F' || e.r === 'X') {
          const side = e.h, bt = g.teams[side], pt = g.teams[1 - side];
          const bi = bt.inp[e.b], pi = pt.inp[e.p];
          const bs = e.bat !== undefined ? e.bat : bi.bat.batSpeed; // this swing's bat speed (logged from step 1.5)
          c.swings++; c.bat += bs; if (bs >= 75) c.fast++;
          if (e.r !== 'S') c.contact++;
          if (e.ev !== undefined) { // contact with a measured exit speed (fouls too)
            const sqr = e.ev / (1.23 * bs + 0.23 * e.v * S.plateShare); // Savant's max possible exit speed
            if (sqr >= 0.8) c.sq++;
            if (100 * sqr + bs >= 164) c.blast++;
          }
          if (e.r === 'X' && e.ev !== undefined) {
            const bats = bi.bats === 'S' ? (pi.throws === 'L' ? 'R' : 'L') : bi.bats;
            c.bbe.push({ ev: e.ev, la: e.la, pull: bats === 'R' ? -e.sp : e.sp, res: null });
          }
        }
        continue;
      }
      if (e.e !== 'pa') continue;
      c.pa++;
      const r = e.res;
      if (r === 'K') c.k++; else if (r === 'BB') c.bb++; else if (r === 'SF') c.sf++;
      if (r !== 'BB' && r !== 'SF') c.ab++;
      if (HITS[r]) { c.h++; c.tb += HITS[r]; }
      if (r === 'HR') c.hr++; else if (r === '2B') c.d2++; else if (r === '3B') c.d3++;
      if (last && last.r === 'X' && c.bbe.length && c.bbe[c.bbe.length - 1].res === null) c.bbe[c.bbe.length - 1].res = r;
      last = null;
    }
  }
  return c;
}

function report(c) {
  const tg = 2 * c.games, med = (k) => (real.pct[k] ? real.pct[k].p50 : NaN);
  const avg = c.h / c.ab, obp = (c.h + c.bb) / c.pa, slg = c.tb / c.ab;
  const babip = (c.h - c.hr) / (c.ab - c.k - c.hr + c.sf);
  console.log('Batting line (' + c.games + ' games; per team-game). New baseline bands (DESIGN.md section 7) in brackets.');
  console.log('  runs ' + f(c.runs / tg, 2) + ' [4.6-4.7]   AVG/OBP/SLG ' + f(avg, 3) + '/' + f(obp, 3) + '/' + f(slg, 3) + ' [.250-.255/.318-.325/.415-.425]   BABIP ' + f(babip, 3));
  console.log('  HR ' + f(c.hr / tg, 2) + ' [1.25-1.35]   2B ' + f(c.d2 / tg, 2) + ' [1.5-1.8]   3B ' + f(c.d3 / tg, 2) + ' [0.1-0.2]   K% ' + f(100 * c.k / c.pa) + ' [21.5-23]   BB% ' + f(100 * c.bb / c.pa) + ' [8-9]');
  const b = c.bbe, n = b.length;
  const evs = b.map((x) => x.ev).sort((x, y) => x - y);
  const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const evm = mean(evs), evsd = Math.sqrt(mean(evs.map((x) => (x - evm) * (x - evm))));
  const half = evs.slice(Math.floor(n / 2));
  const las = b.map((x) => x.la).sort((x, y) => x - y), lam = mean(las), lasd = Math.sqrt(mean(las.map((x) => (x - lam) * (x - lam))));
  const share = (fn) => 100 * b.filter(fn).length / n;
  console.log('\nExit speed (' + n + ' batted balls)                engine   real (median player-season)');
  console.log('  average                                   ' + f(evm).padStart(6) + '   ' + f(med('bat.exit_velocity_avg')));
  console.log('  hardest half (ev50)                       ' + f(mean(half)).padStart(6) + '   ' + f(med('evbat.ev50')));
  console.log('  spread (sd), p10 / p50 / p90              ' + f(evsd).padStart(6) + '   ' + f(pctl(evs, 0.1)) + ' / ' + f(pctl(evs, 0.5)) + ' / ' + f(pctl(evs, 0.9)) + ' (engine)');
  let mx = 0, ch = 0;
  for (let i = 0; i + 400 <= n; i += 400) { mx += Math.max.apply(null, b.slice(i, i + 400).map((x) => x.ev)); ch++; }
  console.log('  max per 400 batted balls                  ' + f(mx / ch).padStart(6) + '   ' + f(med('evbat.max_hit_speed')));
  console.log('  hard-hit % (95+)                          ' + f(share((x) => x.ev >= 95)).padStart(6) + '   ' + f(med('bat.hard_hit_percent')));
  console.log('  barrel %                                  ' + f(share((x) => barrel(x.ev, x.la))).padStart(6) + '   ' + f(med('bat.barrel_batted_rate')));
  console.log('  sweet-spot % (8-32 degrees)               ' + f(share((x) => x.la >= 8 && x.la <= 32)).padStart(6) + '   ' + f(med('bat.sweet_spot_percent')));
  const gbEv = mean(b.filter((x) => x.la < 10).map((x) => x.ev)), airEv = mean(b.filter((x) => x.la >= 10 && x.la <= 50).map((x) => x.ev));
  console.log('  ground balls / line drives and flies      ' + (f(gbEv) + ' / ' + f(airEv)).padStart(6) + '   ' + f(med('evbat.gb')) + ' / ' + f(med('evbat.fbld')));
  console.log('Launch angle: average ' + f(lam) + ' (real ' + f(med('bat.launch_angle_avg')) + '), sd ' + f(lasd) + ', median ' + f(pctl(las, 0.5)));
  console.log('  ground ball / line drive / fly ball / pop-up %: ' + LA.map((L) => f(share((x) => x.la >= L[1] && x.la < L[2]))).join(' / ') +
    '   real ' + ['groundballs', 'linedrives', 'flyballs', 'popups'].map((k) => f(med('bat.' + k + '_percent'))).join(' / '));
  const spray = (xs) => { const m = xs.length; return [xs.filter((x) => x.pull > 15).length, xs.filter((x) => Math.abs(x.pull) <= 15).length, xs.filter((x) => x.pull < -15).length].map((k) => f(100 * k / m)).join(' / '); };
  console.log('Spray, pull / center / oppo %: all ' + spray(b) + '   real ' + ['pull', 'straightaway', 'opposite'].map((k) => f(med('bat.' + k + '_percent'))).join(' / '));
  console.log('  ground balls ' + spray(b.filter((x) => x.la < 10)) + '   line drives ' + spray(b.filter((x) => x.la >= 10 && x.la < 25)) + '   flies and pop-ups ' + spray(b.filter((x) => x.la >= 25)));
  console.log('Bat contact (Savant: max possible exit speed 1.23 x bat speed + 0.23 x pitch speed at the plate):');
  console.log('  bat speed ' + f(c.bat / c.swings) + ' (real ' + f(med('track.avg_bat_speed')) + ')   fast swings (75+) % ' + f(100 * c.fast / c.swings) + ' (real ' + f(med('track.hard_swing_rate')) + ')');
  console.log('  squared-up % of contact ' + f(100 * c.sq / c.contact) + ' (real ' + f(med('track.squared_up_per_bat_contact')) + ')   blasts % of contact ' + f(100 * c.blast / c.contact) +
    ' (real ' + f(med('track.blast_per_bat_contact')) + ')   contact % of swings ' + f(100 * c.contact / c.swings) + ' (real league ' + f(real.league[2024].contactPct) + ')');
  // What each batted-ball type and exit-speed band becomes, against Statcast's league rows (2024 for the grid).
  const RB = real.batted, TYPES = ['ground_ball', 'line_drive', 'fly_ball', 'popup'];
  const typeOf = (la) => (la < 10 ? 0 : la < 25 ? 1 : la <= 50 ? 2 : 3);
  const cell = (xs) => {
    const ab = xs.filter((x) => x.res !== 'SF').length, hits = xs.filter((x) => HITS[x.res]).length;
    return { share: xs.length / n, avg: hits / ab, slg: xs.reduce((s2, x) => s2 + (HITS[x.res] || 0), 0) / ab, hr: xs.filter((x) => x.res === 'HR').length / xs.length };
  };
  const done = b.filter((x) => x.res);
  console.log('\nBy type (engine | real 2024)   share     AVG     SLG    HR%    EV    LA |  share     AVG     SLG    HR%    EV    LA');
  TYPES.forEach((t, i) => {
    const xs = done.filter((x) => typeOf(x.la) === i), e = cell(xs), r = RB.types[2024][t];
    console.log('  ' + t.padEnd(28) + f(100 * e.share).padStart(6) + f(e.avg, 3).padStart(8) + f(e.slg, 3).padStart(8) + f(100 * e.hr).padStart(7) +
      f(mean(xs.map((x) => x.ev))).padStart(6) + f(mean(xs.map((x) => x.la))).padStart(6) + ' |' + f(100 * r.share).padStart(6) + f(r.avg, 3).padStart(8) +
      f(r.slg, 3).padStart(8) + f(100 * r.hr).padStart(7) + f(r.ev).padStart(6) + f(r.la).padStart(6));
  });
  console.log('\nSpray by type, pull / center / oppo % (exit speed) | real 2024');
  TYPES.forEach((t, i) => {
    const xs = done.filter((x) => typeOf(x.la) === i), dirs = [xs.filter((x) => x.pull > 15), xs.filter((x) => Math.abs(x.pull) <= 15), xs.filter((x) => x.pull < -15)];
    const rs = ['pull', 'straightaway', 'opposite'].map((d) => RB.spray[t][d]);
    console.log('  ' + t.padEnd(12) + dirs.map((d) => f(100 * d.length / xs.length) + ' (' + f(mean(d.map((x) => x.ev))) + ')').join(' / ') + '  | ' +
      rs.map((r) => f(100 * r.share) + ' (' + f(r.ev) + ')').join(' / ') + '   HR% ' + dirs.map((d) => f(100 * d.filter((x) => x.res === 'HR').length / d.length)).join('/') + ' | ' + rs.map((r) => f(100 * r.hr)).join('/'));
  });
  console.log('\nGrid: share of batted balls %, AVG/SLG, HR% (engine above, real 2024 below)');
  console.log('  EV band   ' + TYPES.map((t) => t.padEnd(25)).join('') + 'band');
  for (const band of Object.keys(RB.grid.ground_ball)) {
    const [lo, hi] = band.split('-').map(Number);
    let le = '  ' + band.padEnd(9), lr = '  ' + ''.padEnd(9), se = 0, sr = 0;
    TYPES.forEach((t, i) => {
      const e = cell(done.filter((x) => typeOf(x.la) === i && x.ev >= lo && x.ev < hi)), r = RB.grid[t][band];
      se += e.share; sr += r.share;
      le += (f(100 * e.share) + ' ' + f(e.avg, 3) + '/' + f(e.slg, 3) + ' ' + f(100 * e.hr)).padEnd(25);
      lr += (f(100 * r.share) + ' ' + f(r.avg, 3) + '/' + f(r.slg, 3) + ' ' + f(100 * r.hr)).padEnd(25);
    });
    console.log(le + f(100 * se));
    console.log(lr + f(100 * sr));
  }
}

if (require.main === module) {
  const a = process.argv.slice(2);
  const tweak = (a.find((s) => s.startsWith('--tweak=')) || '').slice(8) || null;
  const pos = a.filter((s) => !s.startsWith('--'));
  const c = run(parseInt(pos[0] || '1000', 10), pos[1] || '1', a.indexOf('--rated') >= 0, tweak);
  report(c);
  const dump = (a.find((s2) => s2.startsWith('--dump=')) || '').slice(7);
  if (dump) require('fs').writeFileSync(dump, JSON.stringify(c.bbe));
}
module.exports = { run, report };
// (--dump=file writes the batted balls { ev, la, pull, res } for offline fits.)
