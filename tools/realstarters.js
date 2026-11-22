// MLB starters deeper in games (step 1.5 task 4, Session 16): how a starter's results and fastball speed change by time
// through the order and by pitch count, by thirds of his season workload (pitches per start), and when he is pulled.
// Usage: node tools/realstarters.js PBPDIR SAVDIR
//   PBPDIR: Statcast pitch-level days (Session 16 used every Wednesday and Saturday of 2024), one file per day, from
//     https://baseballsavant.mlb.com/statcast_search/csv?all=true&hfGT=R%7C&hfSea=2024%7C&player_type=pitcher&game_date_gt=DAY
//     &game_date_lt=DAY&min_pitches=0&min_results=0&min_pas=0&group_by=name&type=details&sort_col=pitches&sort_order=desc
//   SAVDIR: all_2024.csv (the same search grouped by pitcher, no date filter: season pitches) and lb_2024.csv (Savant's
//     custom pitcher leaderboard, min=50 innings, with p_starting_p and p_game), for each starter's season workload.
// The downloads are third-party data: keep them outside the repo; the numbers are in DESIGN.md section 10 and state.md.
// Runs no game code and needs no network. Checks nothing.
'use strict';
const fs = require('fs'), path = require('path');
const D = process.argv[2], SAV = process.argv[3];
function split(l) { const o = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { o.push(cur); cur = ''; } else cur += ch; } o.push(cur); return o; }
function csv(f) { const t = fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '').trim().split('\n'); const h = split(t[0]); return t.slice(1).map((l) => { const v = split(l), r = {}; h.forEach((k, i) => r[k] = v[i]); return r; }); }
// Season workload: pitches per game for pitchers who only started (Savant 2024 leaderboard + grouped search totals).
const tot = {}; for (const r of csv(path.join(SAV, 'all_2024.csv'))) tot[r.player_id] = +r.pitches;
const work = {}; for (const r of csv(path.join(SAV, 'lb_2024.csv'))) { const gs = +r.p_starting_p, g = +r.p_game; if (gs >= 10 && gs === g && tot[r.player_id]) work[r.player_id] = tot[r.player_id] / gs; }
const starts = [];
for (const f of fs.readdirSync(D).filter((x) => x.endsWith('.csv')).sort()) {
  const rows = csv(path.join(D, f)).filter((r) => r.game_type === 'R');
  const by = {};
  for (const r of rows) { const k = r.game_pk + ':' + r.inning_topbot; (by[k] = by[k] || []).push(r); }
  for (const k in by) {
    const ps = by[k].sort((a, b) => (+a.at_bat_number - +b.at_bat_number) || (+a.pitch_number - +b.pitch_number));
    const sp = ps[0].pitcher, mine = ps.filter((r) => r.pitcher === sp);
    const s = { id: sp, n: mine.length, pa: [], pitches: [], lastInn: +mine[mine.length - 1].inning, runs: 0 };
    let c = 0;
    for (const r of mine) {
      c++;
      s.pitches.push({ c: c, v: +r.release_speed, t: r.pitch_type, desc: r.description, zone: +r.zone });
      if (r.events && r.woba_denom !== '' && +r.woba_denom > 0) s.pa.push({ c: c, tto: +r.n_thruorder_pitcher, w: +r.woba_value, k: /strikeout/.test(r.events), bb: r.events === 'walk', inn: +r.inning, b: r.batter });
    }
    const last = mine[mine.length - 1], first = mine[0];
    s.runs = +last.post_bat_score - +first.bat_score;
    s.lastEvent = last.events; s.lastOuts = +last.outs_when_up;
    s.endsInning = last.events && (+last.outs_when_up === 2 && /out|strikeout|double_play|caught/.test(last.events) || /double_play/.test(last.events) && +last.outs_when_up >= 1);
    s.bf = s.pa.length; s.tto = s.pa.length ? s.pa[s.pa.length - 1].tto : 0;
    s.work = work[sp];
    starts.push(s);
  }
}
const ok = starts.filter((s) => s.n >= 30); // no openers
console.log('starts: ' + starts.length + ' (30+ pitches: ' + ok.length + '), with a season workload: ' + ok.filter((s) => s.work).length);
const W = (list, sel) => { let w = 0, n = 0, k = 0, bb = 0; for (const s of list) for (const p of s.pa) if (sel(p, s)) { w += p.w; n++; if (p.k) k++; if (p.bb) bb++; } return { n, woba: w / n, k: 100 * k / n, bb: 100 * bb / n }; };
const fmtW = (x) => String(x.n).padStart(6) + ' wOBA ' + x.woba.toFixed(3) + ' K ' + x.k.toFixed(1) + ' BB ' + x.bb.toFixed(1);
console.log('\nby time through the order (all starts of 30+ pitches)');
for (const t of [1, 2, 3, 4]) console.log('  ' + t + ': ' + fmtW(W(ok, (p) => p.tto === t)));
console.log('  starters who faced 25+ batters, same starts only:');
const deep = ok.filter((s) => s.bf >= 25);
for (const t of [1, 2, 3]) console.log('  ' + t + ': ' + fmtW(W(deep, (p) => p.tto === t)));
const BINS = [[1, 25], [26, 50], [51, 75], [76, 90], [91, 100], [101, 200]];
console.log('\nby pitch count at the end of the PA');
for (const [a, b] of BINS) console.log('  ' + (a + '-' + b).padEnd(8) + fmtW(W(ok, (p) => p.c >= a && p.c <= b)));
console.log('  starts reaching 95+ pitches only:');
const long = ok.filter((s) => s.n >= 95);
for (const [a, b] of BINS) console.log('  ' + (a + '-' + b).padEnd(8) + fmtW(W(long, (p) => p.c >= a && p.c <= b)));
// Velocity: four-seam and sinker speed against his own first 20 pitches of the type in that start
const velo = (list) => { const acc = {}; for (const s of list) for (const t of ['FF', 'SI']) { const v = s.pitches.filter((p) => p.t === t && p.v > 0); if (v.length < 15) continue; const base = v.filter((p) => p.c <= 25); if (base.length < 4) continue; const m = base.reduce((x, p) => x + p.v, 0) / base.length;
  for (const p of v) { const b = BINS.findIndex(([a, z]) => p.c >= a && p.c <= z); const q = acc[b] = acc[b] || [0, 0]; q[0] += p.v - m; q[1]++; } } return BINS.map((_, i) => acc[i] ? (acc[i][0] / acc[i][1]).toFixed(2) + ' (' + acc[i][1] + ')' : '-'); };
console.log('\nfastball speed against his own first 25 pitches, by pitch count: ' + BINS.map((b, i) => b.join('-') + ' ' + velo(ok)[i]).join('  '));
console.log('  starts reaching 95+: ' + BINS.map((b, i) => b.join('-') + ' ' + velo(long)[i]).join('  '));
// Exit
const q = (xs, p) => { const v = xs.slice().sort((a, b) => a - b); return v[Math.floor(p * v.length)]; };
const ns = ok.map((s) => s.n);
console.log('\nexit pitches p10 / p25 / p50 / p75 / p90 / max: ' + [0.1, 0.25, 0.5, 0.75, 0.9].map((p) => q(ns, p)).join(' / ') + ' / ' + Math.max(...ns) + '; mean ' + (ns.reduce((a, b) => a + b) / ns.length).toFixed(1));
const share = (f) => (100 * ok.filter(f).length / ok.length).toFixed(1);
console.log('  batters faced p50 ' + q(ok.map((s) => s.bf), 0.5) + '; out before the 3rd time (18 or fewer) ' + share((s) => s.bf <= 18) + '%, faced a 4th time ' + share((s) => s.tto >= 4) + '%; complete games ' + share((s) => s.lastInn >= 9 && s.n > 0 && s.endsInning) + '%');
console.log('  pulled between innings ' + share((s) => s.endsInning) + '%, mid-inning ' + share((s) => !s.endsInning) + '%');
console.log('  runs allowed (incl. any runners he left who scored before his last pitch): by exit pitches');
for (const [a, b] of [[30, 69], [70, 84], [85, 94], [95, 104], [105, 200]]) { const l = ok.filter((s) => s.n >= a && s.n <= b); console.log('    ' + (a + '-' + b).padEnd(8) + String(l.length).padStart(5) + ' starts, runs ' + (l.reduce((x, s) => x + s.runs, 0) / l.length).toFixed(2) + ', exit inning ' + (l.reduce((x, s) => x + s.lastInn, 0) / l.length).toFixed(2)); }
console.log('  exit pitches by runs allowed: ' + [0, 1, 2, 3, 4, 5].map((r) => { const l = ok.filter((s) => (r < 5 ? s.runs === r : s.runs >= 5)); return (r < 5 ? r : '5+') + ': ' + (l.reduce((x, s) => x + s.n, 0) / l.length).toFixed(1) + ' (' + l.length + ')'; }).join('  '));
// By season workload thirds
const wl = ok.filter((s) => s.work); const ws = wl.map((s) => s.work).sort((a, b) => a - b), c1 = ws[Math.floor(ws.length / 3)], c2 = ws[Math.floor(2 * ws.length / 3)];
console.log('\nby the starter\'s season pitches per start (thirds: <' + c1.toFixed(0) + ', ' + c1.toFixed(0) + '-' + c2.toFixed(0) + ', >' + c2.toFixed(0) + ')');
for (const [lab, f] of [['low', (s) => s.work < c1], ['mid', (s) => s.work >= c1 && s.work < c2], ['high', (s) => s.work >= c2]]) {
  const l = wl.filter(f);
  console.log('  ' + lab + ': ' + l.length + ' starts, exit pitches p50 ' + q(l.map((s) => s.n), 0.5) + ', p90 ' + q(l.map((s) => s.n), 0.9) + '; by time through: ' + [1, 2, 3].map((t) => t + ' ' + W(l, (p) => p.tto === t).woba.toFixed(3)).join(' ') + '; by pitch count: ' + BINS.map(([a, b]) => { const x = W(l, (p) => p.c >= a && p.c <= b); return a + '-' + b + ' ' + (x.n > 150 ? x.woba.toFixed(3) : '-'); }).join(' '));
  console.log('      fastball speed change: ' + velo(l).map((x, i) => BINS[i].join('-') + ' ' + x).join('  '));
}

// ---- Familiarity against fatigue, with each batter's own level (his wOBA over every PA in these days, all pitchers) ----
const bat = {};
for (const f of fs.readdirSync(D).filter((x) => x.endsWith('.csv'))) for (const r of csv(path.join(D, f))) if (r.game_type === 'R' && r.events && +r.woba_denom > 0) { const b = bat[r.batter] = bat[r.batter] || [0, 0]; b[0] += +r.woba_value; b[1]++; }
const lg = Object.values(bat).reduce((t, b) => [t[0] + b[0], t[1] + b[1]], [0, 0]); const lgw = lg[0] / lg[1];
const lvl = (id) => { const b = bat[id]; return b && b[1] >= 50 ? (b[0] + 60 * lgw) / (b[1] + 60) : lgw; }; // shrunk toward the league
const adj = (list, sel) => { let d = 0, n = 0; for (const s of list) for (const p of s.pa) if (sel(p, s)) { d += p.w - lvl(p.b); n++; } return { n, d: d / n }; };
console.log('\nbatter-adjusted wOBA (result minus the batter\'s own level; league ' + lgw.toFixed(3) + ')');
console.log('  by time through: ' + [1, 2, 3, 4].map((t) => { const x = adj(ok, (p) => p.tto === t); return t + ' ' + (x.d >= 0 ? '+' : '') + x.d.toFixed(3) + ' (' + x.n + ')'; }).join('  '));
console.log('  by pitch count: ' + BINS.map(([a, b]) => { const x = adj(ok, (p) => p.c >= a && p.c <= b); return a + '-' + b + ' ' + (x.d >= 0 ? '+' : '') + x.d.toFixed(3) + ' (' + x.n + ')'; }).join('  '));
console.log('  by inning: ' + [1, 2, 3, 4, 5, 6, 7].map((i) => { const x = adj(ok, (p) => p.inn === i); return i + ' ' + (x.d >= 0 ? '+' : '') + x.d.toFixed(3); }).join('  '));
console.log('  3rd time through, by pitch count: ' + [[1, 69], [70, 84], [85, 200]].map(([a, b]) => { const x = adj(ok, (p) => p.tto === 3 && p.c >= a && p.c <= b); return a + '-' + b + ' ' + (x.d >= 0 ? '+' : '') + x.d.toFixed(3) + ' (' + x.n + ')'; }).join('  '));
console.log('  2nd time through, by pitch count: ' + [[1, 39], [40, 54], [55, 200]].map(([a, b]) => { const x = adj(ok, (p) => p.tto === 2 && p.c >= a && p.c <= b); return a + '-' + b + ' ' + (x.d >= 0 ? '+' : '') + x.d.toFixed(3) + ' (' + x.n + ')'; }).join('  '));
// Least squares: adjusted wOBA on time-through dummies, pitch count (per 10), first-inning dummy
const ys = [], X = [];
for (const s of ok) for (const p of s.pa) { ys.push(p.w - lvl(p.b)); X.push([p.tto === 2 ? 1 : 0, p.tto === 3 ? 1 : 0, p.tto >= 4 ? 1 : 0, p.c / 10, p.inn === 1 ? 1 : 0]); }
const P2 = X[0].length + 1, A = Array.from({ length: P2 }, () => new Array(P2).fill(0)), v = new Array(P2).fill(0);
ys.forEach((y, i) => { const r = [1, ...X[i]]; for (let a = 0; a < P2; a++) { v[a] += r[a] * y; for (let b = 0; b < P2; b++) A[a][b] += r[a] * r[b]; } });
for (let c = 0; c < P2; c++) { for (let r = 0; r < P2; r++) { if (r === c) continue; const f = A[r][c] / A[c][c]; for (let k = c; k < P2; k++) A[r][k] -= f * A[c][k]; v[r] -= f * v[c]; } }
const beta = v.map((x, i) => x / A[i][i]);
console.log('  fit: 2nd time ' + beta[1].toFixed(3) + ', 3rd ' + beta[2].toFixed(3) + ', 4th ' + beta[3].toFixed(3) + ', per 10 pitches ' + beta[4].toFixed(4) + ', first inning ' + beta[5].toFixed(3) + ' (' + ys.length + ' PA)');
