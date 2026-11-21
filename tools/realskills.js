// Which ratings measure a separate, stable real skill? (Session 11: the owner asked whether to merge or split ratings.)
// For each rating's own stat it takes the part the other ratings' own stats don't explain (least squares) and checks
// whether that part repeats in the same players from 2024 to 2025. Near 0: noise, not a skill of its own.
// Usage (the downloads stay outside the repo, as for tools/realdata.js):
//   node tools/realdata.js --urls DIR | grep -E '(^|/)(s_(all|95|off|offout|fbout)|bat|battrack|pit|arsenal)_202[45]' |
//     while IFS=$'\t' read f u; do [ -s "$f" ] || { curl -s -A Mozilla/5.0 -o "$f" "$u"; sleep 3; }; done
//   node tools/realskills.js DIR
// It runs no game code and needs no network itself.
'use strict';
const fs = require('fs');
const path = require('path');

const dir = process.argv[2];
if (!dir) { console.log('usage: node tools/realskills.js DIR (see the top of this file)'); process.exit(1); }

function rows(f) {
  const t = fs.readFileSync(path.join(dir, f), 'utf8').replace(/^﻿/, '').trim().split('\n');
  const split = (l) => {
    const o = []; let c = ''; let q = false;
    for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { o.push(c); c = ''; } else c += ch; }
    o.push(c); return o;
  };
  const h = split(t[0]);
  return t.slice(1).map((l) => { const v = split(l); const r = {}; h.forEach((k, i) => { r[k] = v[i]; }); return r; });
}
const byId = (f, key) => { const m = {}; for (const r of rows(f)) m[r[key]] = r; return m; };
const n = (x) => (x === '' || x == null ? NaN : +x);
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
function corr(a, b) {
  const ma = mean(a); const mb = mean(b); let s = 0; let sa = 0; let sb = 0;
  for (let i = 0; i < a.length; i++) { s += (a[i] - ma) * (b[i] - mb); sa += (a[i] - ma) ** 2; sb += (b[i] - mb) ** 2; }
  return s / Math.sqrt(sa * sb);
}
// Least squares y ~ 1 + X (normal equations, Gauss-Jordan with pivoting).
function ols(y, X) {
  const p = X[0].length + 1; const A = Array.from({ length: p }, () => new Array(p).fill(0)); const v = new Array(p).fill(0);
  for (let i = 0; i < y.length; i++) {
    const r = [1, ...X[i]];
    for (let a = 0; a < p; a++) { v[a] += r[a] * y[i]; for (let b = 0; b < p; b++) A[a][b] += r[a] * r[b]; }
  }
  for (let c = 0; c < p; c++) {
    let m = c; for (let r = c + 1; r < p; r++) if (Math.abs(A[r][c]) > Math.abs(A[m][c])) m = r;
    [A[c], A[m]] = [A[m], A[c]]; [v[c], v[m]] = [v[m], v[c]];
    for (let r = 0; r < p; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c]; for (let b = c; b < p; b++) A[r][b] -= f * A[c][b]; v[r] -= f * v[c];
    }
  }
  return v.map((x, i) => x / A[i][i]);
}

function hitters(y) {
  const all = byId(`s_all_${y}.csv`, 'player_id'); const v95 = byId(`s_95_${y}.csv`, 'player_id');
  const off = byId(`s_off_${y}.csv`, 'player_id'); const oo = byId(`s_offout_${y}.csv`, 'player_id');
  const fo = byId(`s_fbout_${y}.csv`, 'player_id'); const bat = byId(`bat_${y}.csv`, 'player_id');
  const bt = byId(`battrack_${y}.csv`, 'id');
  const out = {};
  for (const id in bat) {
    const a = all[id]; const f = v95[id]; const o = off[id]; const x = oo[id]; const b = fo[id]; const p = bat[id]; const k = bt[id];
    if (!a || !f || !o || !x || !b || !k || n(p.pa) < 250 || n(k.swings_competitive) < 300 || n(f.swings) < 30) continue;
    const s = {
      zc: n(p.iz_contact_percent), chase: n(p.oz_swing_percent), zsw: n(p.z_swing_percent),
      fbw: 100 * (n(a.whiffs) - n(o.whiffs)) / (n(a.swings) - n(o.swings)), // everything but off-speed
      offw: 100 * n(o.whiffs) / n(o.swings), w95: 100 * n(f.whiffs) / n(f.swings),
      gap: 100 * n(x.swings) / n(x.pitches) - 100 * n(b.swings) / n(b.pitches), // off-speed chase minus fastball chase
      sweet: n(p.sweet_spot_percent), pu: n(p.popups_percent), la: n(p.launch_angle_avg), pull: n(p.pull_percent),
      gb: n(p.groundballs_percent), bs: n(k.avg_bat_speed), sq: 100 * n(k.squared_up_per_bat_contact),
      ev: n(p.exit_velocity_avg), maxev: n(p.avg_hyper_speed)
    };
    if (Object.values(s).some((v) => !isFinite(v))) continue;
    out[id] = s;
  }
  return out;
}
function pitchers(y) {
  const FB = { FF: 1, SI: 1, FC: 1 }; const ars = {};
  for (const r of rows(`arsenal_${y}.csv`)) (ars[r.player_id] = ars[r.player_id] || []).push(r);
  const out = {};
  for (const p of rows(`pit_${y}.csv`)) {
    if (n(p.pa) < 250) continue;
    let w = 0; let u = 0;
    for (const r of ars[p.player_id] || []) if (!FB[r.pitch_type]) { w += n(r.whiff_percent) * n(r.pitches); u += n(r.pitches); }
    const s = {
      velo: n(p.fastball_avg_speed), offw: u > 200 ? w / u : NaN, whiff: n(p.whiff_percent), chase: n(p.oz_swing_percent),
      zone: n(p.in_zone_percent), bb: n(p.bb_percent), edge: n(p.edge_percent), meat: n(p.meatball_percent),
      ev: n(p.exit_velocity_avg), gb: n(p.groundballs_percent)
    };
    if (Object.values(s).some((v) => !isFinite(v))) continue;
    out[p.player_id] = s;
  }
  return out;
}

const f2 = (x) => (x >= 0 ? ' ' : '') + x.toFixed(2);
function table(title, s1, s2, list, keys) {
  const ids = Object.keys(s1).filter((id) => s2[id]);
  const col = (s, k) => ids.map((id) => s[id][k]);
  function part(s, k, others) {
    const y = col(s, k); const X = ids.map((id) => others.map((o) => s[id][o])); const b = ols(y, X);
    const res = y.map((v, i) => v - b[0] - X[i].reduce((t, x, j) => t + b[j + 1] * x, 0));
    const r2 = 1 - res.reduce((t, x) => t + x * x, 0) / y.reduce((t, x) => t + (x - mean(y)) ** 2, 0);
    return { res, r2 };
  }
  console.log(`\n${title}: ${ids.length} players in both 2024 and 2025`);
  console.log('own stat (rating)'.padEnd(46) + 'itself  explained  the rest   (explained by)');
  for (const [label, k, others] of list) {
    const a = part(s1, k, others); const b = part(s2, k, others);
    console.log(label.padEnd(46) + f2(corr(col(s1, k), col(s2, k))) + '    ' + f2(a.r2) + '     ' + f2(corr(a.res, b.res)) +
      '     (' + others.join(', ') + ')');
  }
  console.log('correlations, 2024:\n       ' + keys.map((k) => k.padStart(6)).join(''));
  for (const a of keys) console.log(a.padEnd(7) + keys.map((b) => f2(corr(col(s1, a), col(s1, b))).padStart(6)).join(''));
  return { ids, col };
}

console.log('itself: year-to-year r of the stat; explained: share the other own stats explain (2024);');
console.log('the rest: year-to-year r of the part they do not explain (a separate skill if well above 0).');
const h1 = hitters(2024); const h2 = hitters(2025);
table('Hitters (250+ PA, 300+ tracked swings)', h1, h2, [
  ['zone contact (Contact)', 'zc', ['bs', 'chase', 'sweet']],
  ['fastball whiff (Contact)', 'fbw', ['bs', 'chase']],
  ['whiff vs 95+ mph (Timing until Session 11)', 'w95', ['fbw', 'bs']],
  ['off-speed whiff (Recognition)', 'offw', ['fbw', 'bs', 'chase']],
  ['off-speed chase minus fastball (Recognition)', 'gap', ['chase', 'fbw']],
  ['chase (Discipline)', 'chase', ['zc', 'bs', 'gap']],
  ['zone swing (Aggressiveness)', 'zsw', ['chase', 'zc']],
  ['bat speed (Raw Power)', 'bs', ['zc', 'sweet']],
  ['max exit speed (Raw Power)', 'maxev', ['bs', 'sq']],
  ['squared-up per contact (Timing from S11)', 'sq', ['fbw', 'offw', 'bs']],
  ['sweet-spot % (Launch)', 'sweet', ['zc', 'bs', 'sq']],
  ['popup % (Launch)', 'pu', ['zc', 'bs', 'sweet', 'la']],
  ['average launch angle (Swing path)', 'la', ['zc', 'bs']],
  ['pull % (Swing path)', 'pull', ['zc', 'bs', 'la']]
], ['zc', 'fbw', 'offw', 'w95', 'gap', 'chase', 'bs', 'sq', 'sweet', 'pull', 'la', 'gb']);

const p1 = pitchers(2024); const p2 = pitchers(2025);
table('Pitchers (250+ batters faced)', p1, p2, [
  ['fastball speed (Velocity)', 'velo', ['offw', 'bb']],
  ['off-speed whiff (grades)', 'offw', ['velo', 'chase']],
  ['chase against (Deception)', 'chase', ['velo', 'whiff', 'zone']],
  ['walk % (Command)', 'bb', ['zone', 'chase']],
  ['zone % (Aim)', 'zone', ['velo', 'offw']],
  ['edge % (Command)', 'edge', ['zone']],
  ['meatball % (Command)', 'meat', ['bb', 'zone']],
  ['exit speed against (no rating)', 'ev', ['velo', 'offw', 'gb']],
  ['ground-ball % (shape)', 'gb', ['velo']]
], ['velo', 'offw', 'whiff', 'chase', 'zone', 'bb', 'edge', 'meat', 'ev', 'gb']);
const ps = Object.values(p1);
console.log(`\npitchers 2024: sd of exit speed against ${sd(ps.map((p) => p.ev)).toFixed(2)} mph`);
