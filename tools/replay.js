// Real batted balls through the engine's flight and fielding (step 1.5 task 6, Session 21). It checks nothing.
// Usage: node tools/replay.js DIR [--part=flight,field,engine] [--games=600] [--reps=2] [--tweak=file.js]
//   DIR holds Statcast pitch-level days as CSV (Baseball Savant's search, one file a day; no player names are kept or printed):
//   curl -o DIR/2024-06-12.csv "https://baseballsavant.mlb.com/statcast_search/csv?all=true&hfGT=R%7C&game_date_gt=2024-06-12&game_date_lt=2024-06-12&type=details&player_type=pitcher"
//   Session 21 used 12 Wednesdays of 2024 (April 17 to September 18, every second week; 54,043 pitches, 9,374 balls in play).
// flight  every real air ball (10-70 degrees, 70+ mph, fair) through B3.ball.flight with its own exit speed, launch angle and
//         spray: the engine's distance against Statcast's (hit_distance_sc) and its home runs against the real ones, by exit
//         speed and launch angle
// field   every real ball in play through B3.ball.inPlay (average fielders, bases empty, a right-handed batter; a left-handed
//         batter's ball is mirrored): the share that are hits and the total bases against what really happened, by exit speed
//         and launch angle, so the fielding is judged on the same balls
// engine  the engine's own balls in play from games between rated test teams through the same fielding, then the same balls
//         with each one's direction swapped for a real ball's of the same type (ground ball, line drive, fly ball, pop-up):
//         what the engine's exit speeds and launch angles would give with MLB's spray
// Spray from Statcast's hit coordinates: atan((hc_x - 125.42) / (198.27 - hc_y)), minus toward left field, x 0.75 for ground
// balls (under 10 degrees): for air balls the plain angle gives Savant's own pull / center / opposite shares (2024: line drives
// 38.7 / 36.9 / 24.4, fly balls 27.0 / 37.0 / 35.9), for ground balls the plain angle gives 60.5 / 22.8 / 16.7 against Savant's
// 48.9 / 38.6 / 12.4 and x 0.75 gives 52.8 / 33.9 / 13.3 (the fielding part moves by about .005 of hits between the two).
'use strict';
const fs = require('fs');
const path = require('path');
const { loadCore } = require('./lib/load');
const { averagePair, ratedPair } = require('./lib/testteams');

const EVB = [0, 80, 90, 95, 100, 105, 200], LAB = [-90, -10, 0, 10, 20, 25, 30, 35, 40, 50, 90];
const TB = { '1B': 1, '2B': 2, '3B': 3, HR: 4, single: 1, double: 2, triple: 3, home_run: 4 };

function parseLine(s) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) { if (ch === '"') { if (s[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out;
}

// Real balls in play: { ev, la, sp, stand, dist, res } (bunts left out).
function readReal(dir) {
  const balls = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.csv'))) {
    const lines = fs.readFileSync(path.join(dir, f), 'utf8').replace(/^﻿/, '').split('\n');
    const ix = {};
    parseLine(lines[0]).forEach((h, i) => { ix[h] = i; });
    for (let li = 1; li < lines.length; li++) {
      if (!lines[li]) continue;
      const r = parseLine(lines[li]);
      if (r[ix.description] !== 'hit_into_play' || /bunt/i.test(r[ix.des])) continue;
      if (r[ix.launch_speed] === '' || r[ix.launch_angle] === '' || r[ix.hc_x] === '') continue;
      balls.push({
        ev: +r[ix.launch_speed], la: +r[ix.launch_angle], stand: r[ix.stand], res: r[ix.events],
        sp: Math.atan2(+r[ix.hc_x] - 125.42, 198.27 - +r[ix.hc_y]) * 180 / Math.PI * (+r[ix.launch_angle] < 10 ? 0.75 : 1),
        dist: r[ix.hit_distance_sc] === '' ? null : +r[ix.hit_distance_sc]
      });
    }
  }
  return balls;
}

function cellOf(ev, la) {
  let i = 0; while (ev >= EVB[i + 1]) i++;
  let j = 0; while (la >= LAB[j + 1]) j++;
  return [i, j];
}
const f3 = (x) => (Number.isFinite(x) ? x.toFixed(3).replace(/^0/, '') : '  - ');

function flightPart(B3, real) {
  const EV = [70, 85, 95, 100, 105, 125], LA = [10, 20, 25, 30, 35, 40, 50, 70];
  const cells = EV.slice(1).map(() => LA.slice(1).map(() => ({ n: 0, dr: 0, de: 0, dn: 0, hr: 0, ehr: 0 })));
  let sq = 0, n = 0, hr = 0, ehr = 0;
  for (const b of real) {
    if (b.la < 10 || b.la >= 70 || b.ev < 70 || Math.abs(b.sp) > 45) continue;
    const f = B3.ball.flight({ ev: b.ev, la: b.la, sp: b.sp, slice: Math.max(0, b.stand === 'R' ? b.sp : -b.sp) });
    let i = 0; while (b.ev >= EV[i + 1]) i++;
    let j = 0; while (b.la >= LA[j + 1]) j++;
    const c = cells[i][j];
    c.n++;
    if (b.res === 'home_run') { c.hr++; hr++; }
    if (f.hr) { c.ehr++; ehr++; }
    if (b.dist !== null && f.land) { c.dr += b.dist; c.de += f.land.r; c.dn++; sq += (b.dist - f.land.r) ** 2; n++; }
  }
  console.log('Flight: real air balls (10-70 degrees, 70+ mph, fair) through B3.ball.flight. Home runs: engine ' + ehr + ', real ' + hr +
    '; distance gap ' + Math.sqrt(sq / n).toFixed(1) + ' ft rms');
  console.log('  cells: balls, distance real/engine (ft), home runs % real/engine; rows exit speed from ' + EV.slice(0, -1).join(', ') +
    ' mph, columns launch angle from ' + LA.slice(0, -1).join(', '));
  cells.forEach((row, i) => console.log(String(EV[i]).padStart(5) + ' ' + row.map((c) => (c.n + '').padStart(4) + ' ' +
    (c.dr / c.dn).toFixed(0) + '/' + (c.de / c.dn).toFixed(0) + ' ' + (100 * c.hr / c.n).toFixed(0).padStart(2) + '/' +
    (100 * c.ehr / c.n).toFixed(0).padStart(2)).join(' |')));
}

// Each ball through B3.ball.inPlay `reps` times; real outcomes (res) are counted when present.
function field(B3, balls, reps) {
  const g = B3.game.create(Object.assign(averagePair(), { type: 'regular', rng: B3.rng.create('replay') }));
  let d = g.pending;
  while (!(d.kind === 'swing' && B3.pitch.who(g).bats === 'R')) d = B3.game.answer(g, d.kind === 'swing' ? { swing: false } : B3.manager.cpu[d.kind](d, g));
  const cells = EVB.slice(1).map(() => LAB.slice(1).map(() => ({ n: 0, rh: 0, eh: 0, rtb: 0, etb: 0 })));
  const t = { n: 0, rh: 0, eh: 0, rtb: 0, etb: 0, r2: 0, e2: 0, rhr: 0, ehr: 0 };
  for (const b of balls) {
    const sp = b.stand === 'L' ? -b.sp : b.sp;
    const [i, j] = cellOf(b.ev, b.la);
    const c = cells[i][j];
    for (let k = 0; k < reps; k++) {
      g.bases = [null, null, null]; g.outs = 0;
      const play = B3.ball.inPlay(g, { ev: b.ev, la: b.la, sp: sp, slice: Math.max(0, sp) }, null);
      if (play.foul) continue;
      const e = TB[play.code] || 0, r = TB[b.res] || 0;
      for (const x of [c, t]) { x.n++; x.rh += r ? 1 : 0; x.eh += e ? 1 : 0; x.rtb += r; x.etb += e; }
      if (b.res === 'double') t.r2++; if (play.code === '2B') t.e2++;
      if (b.res === 'home_run') t.rhr++; if (play.code === 'HR') t.ehr++;
    }
  }
  return { cells, t };
}

function fieldReport(title, F, real) {
  const t = F.t;
  console.log(title + ': hits per ball ' + (real ? f3(t.rh / t.n) + ' real, ' : '') + f3(t.eh / t.n) + (real ? ' engine' : '') +
    '; total bases ' + (real ? f3(t.rtb / t.n) + ' / ' : '') + f3(t.etb / t.n) + '; doubles ' + (real ? (100 * t.r2 / t.n).toFixed(1) + ' / ' : '') +
    (100 * t.e2 / t.n).toFixed(1) + '%; home runs ' + (real ? (100 * t.rhr / t.n).toFixed(1) + ' / ' : '') + (100 * t.ehr / t.n).toFixed(1) + '%');
  if (!real) return;
  let err = 0;
  for (const row of F.cells) for (const c of row) if (c.n) err += c.n * ((c.eh - c.rh) / c.n) ** 2;
  console.log('  hits per ball, real/engine; rows exit speed from ' + EVB.slice(0, -1).join(', ') + ' mph, columns launch angle from ' +
    LAB.slice(0, -1).join(', ') + ' (weighted rms gap ' + f3(Math.sqrt(err / t.n)) + ')');
  F.cells.forEach((row, i) => console.log(String(EVB[i]).padStart(5) + ' ' + row.map((c) => f3(c.rh / c.n) + '/' + f3(c.eh / c.n)).join(' ')));
}

function engineBalls(B3, games) {
  const out = [];
  for (let n = 0; n < games; n++) {
    const g = B3.game.sim(Object.assign(ratedPair(B3.rng.create('bt:1:' + n)), { type: 'regular', rng: B3.rng.create('rp:' + n) }));
    for (const e of g.log) {
      if (e.e !== 'pitch' || e.r !== 'X' || e.ev === undefined || Math.abs(e.sp) > 45) continue;
      const bi = g.teams[e.h].inp[e.b], pi = g.teams[1 - e.h].inp[e.p];
      out.push({ ev: e.ev, la: e.la, sp: e.sp, stand: bi.bats === 'S' ? (pi.throws === 'L' ? 'R' : 'L') : bi.bats });
    }
  }
  return out;
}

function main() {
  const argv = process.argv.slice(2);
  const opt = (k, d) => { const x = argv.find((s) => s.startsWith('--' + k + '=')); return x ? x.slice(k.length + 3) : d; };
  const dir = argv.find((s) => !s.startsWith('--'));
  if (!dir) { console.log('usage: node tools/replay.js DIR [--part=flight,field,engine] [--games=600] [--reps=2] [--tweak=file.js]'); process.exit(1); }
  const parts = opt('part', 'flight,field,engine').split(',');
  const B3 = loadCore();
  B3.tune.BALL.live = 1; // real 2024 balls with 2024's ball (the league's livelier ball, BALL.live, is the owner's choice of Session 22)
  const tweak = opt('tweak', null);
  if (tweak) require(path.resolve(tweak))(B3);
  const real = readReal(dir);
  console.log('Real balls in play: ' + real.length + ' (' + dir + ')\n');
  if (parts.includes('flight')) { flightPart(B3, real); console.log(''); }
  if (parts.includes('field')) { fieldReport('Field: real balls through B3.ball.inPlay', field(B3, real, +opt('reps', '2')), true); console.log(''); }
  if (parts.includes('engine')) {
    const own = engineBalls(B3, +opt('games', '600'));
    fieldReport('Engine: its own ' + own.length + ' balls in play (rated test teams)', field(B3, own, 1), false);
    const type = (la) => (la < 10 ? 0 : la < 25 ? 1 : la < 50 ? 2 : 3);
    const pools = [[], [], [], []];
    for (const b of real) if (Math.abs(b.sp) <= 45) pools[type(b.la)].push(b.stand === 'L' ? b.sp : -b.sp); // pull side positive
    const rng = B3.rng.create('replay-spray');
    const swapped = own.map((b) => {
      const pool = pools[type(b.la)], pull = pool[rng.int(pool.length)];
      return Object.assign({}, b, { sp: b.stand === 'L' ? pull : -pull });
    });
    fieldReport('  the same balls with real directions', field(B3, swapped, 1), false);
    const sprayStats = (balls, sign) => [0, 1, 2].map((ty) => {
      const xs = balls.filter((b) => type(b.la) === ty).map((b) => (b.stand === 'L' ? b.sp : -b.sp) * sign);
      const m = xs.reduce((s, x) => s + x, 0) / xs.length;
      return ['ground balls', 'line drives', 'fly balls'][ty] + ' ' + m.toFixed(1) + ' / ' + Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length).toFixed(1);
    }).join(', ');
    console.log('  spray toward the pull side, mean / sd in degrees: engine ' + sprayStats(own, 1) + '; real ' + sprayStats(real.filter((b) => Math.abs(b.sp) <= 45), 1));
  }
}

if (require.main === module) main();
module.exports = { readReal, field, cellOf };
