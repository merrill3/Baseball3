// Plate discipline by pitch group, zone and count, against MLB 2024 (step 1.5 task 4, Session 12).
// Usage: node tools/plate.js [games=400] [rating=level,...] ... [--pitcher] [--tweak=file.js] [--seed=1]
//   Each condition moves one side's hitters (or pitchers, --pitcher) to the given ratings, everyone else at 60, Balanced;
//   "tend=aggressiveness:Aggressive" sets a tendency, "grades=80" every pitch grade. With no condition: average teams.
//   node tools/plate.js 400 recognition=40 recognition=80
// For each condition it prints swing, whiff and foul % for fastballs (FF, SI, FC) and off-speed pitches (SL, CU, CH, FS)
// in and out of the zone, the mix and zone shares, the same by count (before two strikes, two strikes), the swings on
// pitches the hitter read and didn't read (B3.pitch.throw's read), and K%, BB%, runs and pitches per plate appearance.
// It checks nothing.
//
// The real numbers: Baseball Savant's Statcast search, 2024 regular season, every pitch, grouped by team and summed
// (https://baseballsavant.mlb.com/statcast_search/csv?all=true&hfGT=R%7C&hfSea=2024%7C&player_type=pitcher&group_by=team
// plus hfPT= for the pitch group (off-speed: SL ST SV CU KC CS CH FS FO SC), hfZ=1..9 (in the zone) or 11..14 (out),
// hfC= for the count). Fouls are swings minus whiffs minus balls in play. Fetched Session 12, Nov 22, 2026.
'use strict';
const os = require('os');
const path = require('path');
const { fork } = require('child_process');

const OFF = { SL: 1, CU: 1, CH: 1, FS: 1 };
const REAL = {
  // [fastball in zone, off-speed in zone, fastball out, off-speed out]
  swing: [67.3, 68.6, 24.8, 32.3], whiff: [16.2, 19.3, 32.1, 52.8], foul: [42.9, 36.8, 42.3, 25.3],
  mixFB: 55.8, zoneFB: 55.0, zoneOff: 42.5,
  // before two strikes, with two strikes
  offShare: [40.9, 50.7], swingCount: [42.8, 59.9], whiffFB: [20.0, 19.7], whiffOff: [34.6, 29.3], foulFB: [42.3, 43.5], foulOff: [31.2, 33.8],
  pitchesPerPa: 3.88
};

function parse(argv) {
  const opt = (k, d) => { const x = argv.find((s) => s.startsWith('--' + k + '=')); return x ? x.slice(k.length + 3) : d; };
  const plain = argv.filter((s) => !s.startsWith('--'));
  const conds = plain.slice(1).map((s) => {
    const r = {};
    for (const kv of s.split(',')) {
      const [k, v] = kv.split('=');
      if (k === 'tend') { const [tk, tv] = v.split(':'); r.tend = Object.assign(r.tend || {}, { [tk]: tv }); } else r[k] = +v;
    }
    return { label: s, r: r };
  });
  return {
    games: parseInt(plain[0] || '400', 10), conds: conds.length ? conds : [{ label: 'average', r: {} }],
    kind: argv.indexOf('--pitcher') >= 0 ? 'pitcher' : 'hitter', tweak: opt('tweak', null), seed: opt('seed', '1')
  };
}

// One worker's games for one condition: counts keyed like 'fz.sw' (group f/o, zone z/o) and 'e.n' (count e/2, all a).
function run(B3, job) {
  const { averagePair } = require('./lib/testteams');
  const a = {};
  const inc = (k) => { a[k] = (a[k] || 0) + 1; };
  const side = job.kind === 'hitter' ? 0 : 1;
  // The read lives on the pitch only while it is thrown; count it as the swing resolves.
  const resolve = B3.pitch.resolve;
  B3.pitch.resolve = function (g, pitch, swing) {
    const out = resolve(g, pitch, swing);
    if (g.half === side) {
      const k = 'R' + (OFF[pitch.type] ? 'o' : 'f') + (pitch.zone ? 'z' : 'o') + (pitch.read ? 'r' : 'u') + '.';
      inc(k + 'n');
      if (swing.swing) { inc(k + 'sw'); if (out.r === 'S') inc(k + 'wh'); }
    }
    return out;
  };
  for (let i = 0; i < job.games; i++) {
    const t = averagePair();
    for (const id in t.away.players) {
      const p = t.away.players[id];
      if ((p.pitches ? 'pitcher' : 'hitter') !== job.kind) continue;
      for (const k in job.r) {
        if (k === 'tend') Object.assign(p.tendencies, job.r.tend);
        else if (k === 'grades') for (const ty in p.arsenal) p.arsenal[ty].grade = job.r[k];
        else p.ratings[k] = job.r[k];
      }
    }
    const g = B3.game.sim(Object.assign(t, { type: 'regular', rng: B3.rng.create('plate:' + job.seed + ':' + i) }));
    inc('games'); a.runs = (a.runs || 0) + g.score[side];
    for (const e of g.log) {
      if (e.h !== side) continue;
      if (e.e === 'pa') { inc('pa'); if (e.res === 'K') inc('k'); if (e.res === 'BB') inc('bb'); continue; }
      if (e.e !== 'pitch') continue;
      const grp = OFF[e.t] ? 'o' : 'f', inZ = B3.data.inZone(e.x, e.z), cnt = +e.c.split('-')[1] >= 2 ? '2' : 'e';
      const sw = e.r === 'S' || e.r === 'F' || e.r === 'X';
      for (const k of [grp + (inZ ? 'z' : 'o'), grp + cnt, 'a' + cnt, grp, 'a']) {
        inc(k + '.n'); if (inZ) inc(k + '.z');
        if (sw) { inc(k + '.sw'); if (e.r === 'S') inc(k + '.wh'); if (e.r === 'F') inc(k + '.f'); }
      }
    }
  }
  B3.pitch.resolve = resolve;
  return a;
}

function worker() {
  const B3 = require('./lib/load').loadCore();
  if (process.argv[3] !== '-') require(process.argv[3])(B3);
  process.on('message', (m) => { if (m.done) process.exit(0); process.send({ id: m.id, out: run(B3, m) }); });
  process.send({ ready: true });
}

function report(o, res) {
  const f = (x, y) => (y ? (100 * x / y).toFixed(1) : '-').padStart(7);
  const cells = ['fz', 'oz', 'fo', 'oo'];
  for (let ci = 0; ci < o.conds.length; ci++) {
    const a = {};
    for (const id in res) if (id.startsWith(ci + ':')) for (const k in res[id]) a[k] = (a[k] || 0) + res[id][k];
    const g = (k) => a[k] || 0;
    console.log('\n' + o.conds[ci].label + ' (' + o.kind + 's; ' + g('games') + ' games)   [MLB 2024 in brackets]');
    console.log('  K% ' + f(g('k'), g('pa')).trim() + '   BB% ' + f(g('bb'), g('pa')).trim() + '   runs ' + (g('runs') / g('games')).toFixed(2) +
      '   pitches/PA ' + (g('a.n') / g('pa')).toFixed(2) + ' [' + REAL.pitchesPerPa + ']   mix fastballs ' + f(g('f.n'), g('a.n')).trim() + '% [' + REAL.mixFB +
      ']   zone% fastballs ' + f(g('f.z'), g('f.n')).trim() + ' [' + REAL.zoneFB + '], off-speed ' + f(g('o.z'), g('o.n')).trim() + ' [' + REAL.zoneOff + ']');
    console.log('                FB in  off in  FB out off out');
    for (const [lab, k, base] of [['swing %', 'sw', 'n'], ['whiff %', 'wh', 'sw'], ['foul %', 'f', 'sw']]) {
      const key = { sw: 'swing', wh: 'whiff', f: 'foul' }[k];
      console.log('  ' + lab.padEnd(10) + cells.map((c) => f(g(c + '.' + k), g(c + '.' + base))).join('') + '   [' + REAL[key].join(' / ') + ']');
    }
    console.log('  off-speed chase minus fastball chase ' + (g('oo.sw') / g('oo.n') * 100 - g('fo.sw') / g('fo.n') * 100).toFixed(1) +
      ' [' + (REAL.swing[3] - REAL.swing[2]).toFixed(1) + ']');
    console.log('  by count            before 2 strikes | 2 strikes');
    const pair = (lab, x, y, r) => console.log('  ' + lab.padEnd(18) + f(x[0], x[1]) + '        ' + ' |' + f(y[0], y[1]) + '   [' + r.join(' / ') + ']');
    pair('off-speed share', [g('oe.n'), g('ae.n')], [g('o2.n'), g('a2.n')], REAL.offShare);
    pair('swing %', [g('ae.sw'), g('ae.n')], [g('a2.sw'), g('a2.n')], REAL.swingCount);
    pair('whiff % fastballs', [g('fe.wh'), g('fe.sw')], [g('f2.wh'), g('f2.sw')], REAL.whiffFB);
    pair('whiff % off-speed', [g('oe.wh'), g('oe.sw')], [g('o2.wh'), g('o2.sw')], REAL.whiffOff);
    pair('foul % fastballs', [g('fe.f'), g('fe.sw')], [g('f2.f'), g('f2.sw')], REAL.foulFB);
    pair('foul % off-speed', [g('oe.f'), g('oe.sw')], [g('o2.f'), g('o2.sw')], REAL.foulOff);
    console.log('  read / unread      share of pitches, swing %, whiff % (engine only)');
    for (const [lab, c] of [['FB in', 'fz'], ['off in', 'oz'], ['FB out', 'fo'], ['off out', 'oo']]) {
      const k = (r) => 'R' + c + r + '.';
      const n = g(k('r') + 'n') + g(k('u') + 'n');
      console.log('  ' + lab.padEnd(10) + ' read  ' + f(g(k('r') + 'n'), n) + f(g(k('r') + 'sw'), g(k('r') + 'n')) + f(g(k('r') + 'wh'), g(k('r') + 'sw')) +
        '    unread' + f(g(k('u') + 'n'), n) + f(g(k('u') + 'sw'), g(k('u') + 'n')) + f(g(k('u') + 'wh'), g(k('u') + 'sw')));
    }
  }
}

function main() {
  const o = parse(process.argv.slice(2));
  const jobs = o.cond = [];
  const procs = Math.min(4, os.cpus().length);
  o.conds.forEach((c, ci) => {
    for (let j = 0; j < procs; j++) jobs.push({ id: ci + ':' + j, r: c.r, kind: o.kind, games: Math.ceil(o.games / procs), seed: o.seed + ':' + j });
  });
  const res = {};
  let next = 0, active = 0;
  for (let w = 0; w < procs; w++) {
    const c = fork(__filename, ['--worker', o.tweak ? path.resolve(o.tweak) : '-']);
    active++;
    const give = () => c.send(next < jobs.length ? jobs[next++] : { done: true });
    c.on('message', (m) => { if (!m.ready) res[m.id] = m.out; give(); });
    c.on('exit', (code) => { if (code) console.error('a worker stopped with code ' + code); if (--active === 0) report(o, res); });
  }
}

if (process.argv[2] === '--worker') worker();
else main();
