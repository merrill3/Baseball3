// How the engine's starter does deeper in games, and when the CPU pulls him (step 1.5 task 4, Sessions 16-17), measured the
// way tools/realstarters.js measures MLB 2024: results by time through the order (raw and against each batter's own level),
// by pitch count, his fastball speed against his own first 25 pitches, his exit pitches and how he left. Checks nothing.
// Usage: node tools/starters.js games stamina [--jobs=4] [--seed=deep] [--set=PATH=VALUE,...]
//   stamina  a rating (every start at that Stamina), or pop: each start's Stamina drawn about 60 +- 12.2 (the pitchers'
//            population's spread in tools/ratingstats.js), with thirds by Stamina as MLB's thirds by season workload
//   --set    tune overrides for fitting, e.g. --set=CPU.pull.between=0.9,PITCH.fade.points=3.5 (paths under B3.tune; values
//            are JSON)
// Average teams; only the away starter's Stamina moves (the home batters face him). MLB's numbers are in [brackets]
// (DESIGN.md section 10, "Starters deeper in games").
'use strict';
const R = './lib/';
const { fork } = require('child_process');
const { loadCore } = require(R + 'load');
const { averagePair } = require(R + 'testteams');

const SP = 'AWY-SP', POP_SD = 12.2;
const W = { BB: 0.689, HBP: 0.72, '1B': 0.882, '2B': 1.254, '3B': 1.59, HR: 2.05 }; // wOBA weights (every other result 0)
const BINS = [[1, 25], [26, 50], [51, 75], [76, 90], [91, 100], [101, 200]];
// MLB 2024 (tools/realstarters.js, Session 16): 1,534 starts of 30+ pitches.
const REAL = {
  exit: [70, 81, 90, 96, 101, 118], before3: 13.0, fourth: 4.5, complete: 0.7, mid: 41,
  fbAll: [null, -0.08, -0.31, -0.39], adj: [0, -0.003, 0.016],
  thirds: [{ pps: '<87', p50: 86, p90: 97, tto: [0.313, 0.319, 0.375], fb76: -0.48 },
    { pps: '87-92', p50: 91, p90: 101, tto: [0.305, 0.332, 0.332], fb76: -0.48 },
    { pps: '>92', p50: 96, p90: 105, tto: [0.307, 0.281, 0.320], fb76: -0.11 }],
  byRuns: [86.6, 88.5, 88.8, 87.0, 87.0, 82.5]
};

function tweak(B3, spec) {
  if (!spec) return;
  for (const kv of spec.split(/,(?=[A-Za-z][\w.]*=)/)) { // a comma before the next PATH= (JSON values may hold commas)
    const i = kv.indexOf('='), keys = kv.slice(0, i).split('.'), v = JSON.parse(kv.slice(i + 1));
    let o = B3.tune;
    for (const k of keys.slice(0, -1)) o = o[k];
    if (!(keys[keys.length - 1] in o)) throw new Error('--set: no such tune value ' + kv.slice(0, i));
    o[keys[keys.length - 1]] = v;
  }
}

function staminaOf(B3, stam, seed, n) {
  if (stam !== 'pop') return +stam;
  const z = B3.rng.create(seed + ':stamina:' + n).normal(0, 1);
  return Math.round(Math.max(20, Math.min(99, 60 + POP_SD * z)));
}

// Plays games from..to-1; returns each away start and the home batters' wOBA sums (their own level, against every pitcher).
function play(B3, from, to, stam, seed) {
  const starts = [], bat = {};
  for (let n = from; n < to; n++) {
    const t = averagePair(), st = staminaOf(B3, stam, seed, n);
    t.away.players[SP].ratings.stamina = st;
    const g = B3.game.sim(Object.assign(t, { type: 'regular', rng: B3.rng.create(seed + ':' + n) }));
    const s = { st: st, n: 0, pa: [], fb: [], runs: 0, inn: 0, mid: 0, cg: g.teams[0].used.length === 1 ? 1 : 0, at: null };
    const seen = {};
    let lastInn = 0, halfRuns = 0, onBase = 0;
    for (const e of g.log) {
      if (e.h !== 1) continue;
      if (e.e === 'half') halfRuns = 0;
      if (e.e === 'pa') {
        const b = bat[e.b] = bat[e.b] || [0, 0];
        b[0] += W[e.res] || 0; b[1]++;
      }
      if (e.e === 'pitch' && e.p === SP) {
        s.n++; lastInn = e.i;
        if (e.t === 'FF' || e.t === 'SI') s.fb.push([s.n, e.t === 'FF' ? 0 : 1, e.v]);
      }
      if (e.e === 'pa' && e.p === SP) {
        const k = seen[e.b] = (seen[e.b] || 0) + 1;
        s.pa.push([s.n, k, W[e.res] || 0, e.b, e.res === 'K' ? 1 : 0, e.res === 'BB' ? 1 : 0, e.i]);
        s.runs += e.sc.length; halfRuns += e.sc.length; s.inn = e.i;
        onBase = e.o < 3 ? e.bs.filter((x) => x).length : 0;
      }
      if (e.e === 'sub' && e.out === SP) {
        s.mid = e.i === lastInn ? 1 : 0;
        s.at = { runs: s.mid ? halfRuns : 0, on: s.mid ? onBase : 0, next: (seen[nextBatter(g, s)] || 0) + 1 };
      }
    }
    s.bf = s.pa.length; s.tto = s.bf ? s.pa[s.bf - 1][1] : 0;
    starts.push(s);
  }
  return { starts: starts, bat: bat };
}

// The batter due up when he left: the one after his last batter.
function nextBatter(g, s) {
  const lu = g.teams[1].lineup, last = s.pa[s.pa.length - 1];
  return last ? lu[(lu.indexOf(last[3]) + 1) % 9] : lu[0];
}

function runAll(games, stam, seed, jobs, set) {
  if (jobs <= 1) { const B3 = loadCore(); tweak(B3, set); return Promise.resolve(play(B3, 0, games, stam, seed)); }
  return new Promise((resolve, reject) => {
    const out = { starts: [], bat: {} }, parts = [];
    let left = jobs;
    for (let j = 0; j < jobs; j++) {
      const from = Math.floor(games * j / jobs), to = Math.floor(games * (j + 1) / jobs);
      const c = fork(__filename, ['--worker', String(from), String(to), String(stam), seed, set || '-']);
      c.on('message', (m) => { parts[j] = m; });
      c.on('exit', (code) => {
        if (code !== 0) return reject(new Error('worker ' + j + ' failed (exit ' + code + ')'));
        if (--left) return;
        for (const p of parts) {
          out.starts.push(...p.starts);
          for (const b in p.bat) { const o = out.bat[b] = out.bat[b] || [0, 0]; o[0] += p.bat[b][0]; o[1] += p.bat[b][1]; }
        }
        resolve(out);
      });
    }
  });
}

// ---- Summaries (the same cuts as tools/realstarters.js) ----
const q = (xs, p) => { const v = xs.slice().sort((a, b) => a - b); return v[Math.min(v.length - 1, Math.floor(p * v.length))]; };
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const share = (list, f) => 100 * list.filter(f).length / list.length;

function summarize(data) {
  const ok = data.starts.filter((s) => s.n >= 30); // as MLB's: no openers or very early exits
  const lvl = {};
  for (const b in data.bat) lvl[b] = data.bat[b][0] / data.bat[b][1];
  const W1 = (list, sel) => { let w = 0, a = 0, n = 0, k = 0, bb = 0; for (const s of list) for (const p of s.pa) if (sel(p, s)) { w += p[2]; a += p[2] - lvl[p[3]]; n++; k += p[4]; bb += p[5]; } return { n: n, woba: w / n, adj: a / n, k: 100 * k / n, bb: 100 * bb / n }; };
  const velo = (list) => {
    const acc = BINS.map(() => [0, 0]);
    for (const s of list) for (const t of [0, 1]) {
      const v = s.fb.filter((p) => p[1] === t);
      if (v.length < 15) continue;
      const base = v.filter((p) => p[0] <= 25);
      if (base.length < 4) continue;
      const m = mean(base.map((p) => p[2]));
      for (const p of v) { const b = BINS.findIndex(([a, z]) => p[0] >= a && p[0] <= z); acc[b][0] += p[2] - m; acc[b][1]++; }
    }
    return acc.map((a) => (a[1] ? { d: a[0] / a[1], n: a[1] } : null));
  };
  const out = { starts: data.starts.length, ok: ok.length };
  out.exit = [0.1, 0.25, 0.5, 0.75, 0.9].map((p) => q(ok.map((s) => s.n), p)).concat([Math.max(...ok.map((s) => s.n))]);
  out.pps = mean(data.starts.map((s) => s.n)); // every start (the Stamina ladder's pitches per start)
  out.meanExit = mean(ok.map((s) => s.n));
  out.bf50 = q(ok.map((s) => s.bf), 0.5);
  out.before3 = share(ok, (s) => s.bf <= 18);
  out.fourth = share(ok, (s) => s.tto >= 4);
  out.complete = share(ok, (s) => s.cg);
  out.mid = share(ok.filter((s) => !s.cg), (s) => s.mid);
  out.inn = mean(ok.map((s) => s.inn));
  out.tto = [1, 2, 3, 4].map((t) => W1(ok, (p) => (t < 4 ? p[1] === t : p[1] >= 4)));
  out.bins = BINS.map(([a, b]) => W1(ok, (p) => p[0] >= a && p[0] <= b));
  out.velo = velo(ok);
  out.byRuns = [0, 1, 2, 3, 4, 5].map((r) => { const l = ok.filter((s) => (r < 5 ? s.runs === r : s.runs >= 5)); return l.length ? { n: l.length, p: mean(l.map((s) => s.n)) } : null; });
  // Mid-inning exits: runs this inning and runners on when he left; exits before a fourth time through.
  const mids = ok.filter((s) => s.mid && s.at);
  out.midRuns = mids.length ? mean(mids.map((s) => s.at.runs)) : 0;
  out.midOn = mids.length ? mean(mids.map((s) => s.at.on)) : 0;
  out.before4 = share(ok.filter((s) => s.at), (s) => s.at.next === 4);
  // Least squares, as MLB's: batter-adjusted wOBA on 2nd / 3rd / 4th+ time dummies, pitch count per 10 and the first inning.
  const ys = [], X = [];
  for (const s of ok) for (const p of s.pa) { ys.push(p[2] - lvl[p[3]]); X.push([1, p[1] === 2 ? 1 : 0, p[1] === 3 ? 1 : 0, p[1] >= 4 ? 1 : 0, p[0] / 10, p[6] === 1 ? 1 : 0]); }
  out.fit = ols(X, ys);
  if (data.starts.some((s) => s.st !== data.starts[0].st)) {
    const sts = ok.map((s) => s.st).sort((a, b) => a - b), c1 = sts[Math.floor(sts.length / 3)], c2 = sts[Math.floor(2 * sts.length / 3)];
    out.cuts = [c1, c2];
    out.thirds = [(s) => s.st < c1, (s) => s.st >= c1 && s.st < c2, (s) => s.st >= c2].map((f) => {
      const l = ok.filter(f), all = data.starts.filter(f);
      return { n: l.length, pps: mean(all.map((s) => s.n)), p50: q(l.map((s) => s.n), 0.5), p90: q(l.map((s) => s.n), 0.9),
        tto: [1, 2, 3].map((t) => W1(l, (p) => p[1] === t)), velo: velo(l) };
    });
  }
  return out;
}

function ols(X, y) {
  const P = X[0].length, A = Array.from({ length: P }, () => new Array(P).fill(0)), v = new Array(P).fill(0);
  y.forEach((yy, i) => { const r = X[i]; for (let a = 0; a < P; a++) { v[a] += r[a] * yy; for (let b = 0; b < P; b++) A[a][b] += r[a] * r[b]; } });
  for (let c = 0; c < P; c++) {
    if (Math.abs(A[c][c]) < 1e-9) continue;
    for (let r = 0; r < P; r++) { if (r === c) continue; const f = A[r][c] / A[c][c]; for (let k = c; k < P; k++) A[r][k] -= f * A[c][k]; v[r] -= f * v[c]; }
  }
  return v.map((x, i) => (Math.abs(A[i][i]) < 1e-9 ? 0 : x / A[i][i]));
}

function report(o, B3, stam) {
  const f3 = (x) => x.toFixed(3), sg = (x) => (x >= 0 ? '+' : '') + x.toFixed(3), f1 = (x) => x.toFixed(1);
  const head = stam === 'pop' ? 'Stamina about 60 +- ' + POP_SD + ' (the pitchers\' population)' : 'Stamina ' + stam + ' (' + B3.ratings.stamina(B3.ratings.curve(+stam)).toFixed(1) + ' pitches on the Stamina scale)';
  console.log(head + ', ' + o.starts + ' starts (' + o.ok + ' of 30+ pitches); pitches per start ' + f1(o.pps));
  console.log(' by time through the order (raw wOBA; against each batter\'s own level [MLB, all starters])');
  o.tto.forEach((a, i) => console.log('  ' + ['1st', '2nd', '3rd', '4th+'][i].padEnd(5) + String(a.n).padStart(7) + '  K ' + f1(a.k) + '  BB ' + f1(a.bb) + '  wOBA ' + f3(a.woba) + '  adjusted ' + sg(a.adj - o.tto[0].adj) + (i < 3 ? ' [' + sg(REAL.adj[i]) + ']' : '')));
  console.log('  fit: 2nd ' + sg(o.fit[1]) + ', 3rd ' + sg(o.fit[2]) + ', 4th+ ' + sg(o.fit[3]) + ', per 10 pitches ' + o.fit[4].toFixed(4) + ', first inning ' + sg(o.fit[5]));
  console.log(' by pitch count at the end of the PA (adjusted against 1-25), and fastball speed against his own first 25 pitches [MLB]');
  BINS.forEach(([a, b], i) => { const x = o.bins[i], v = o.velo[i]; if (!x.n) return; console.log('  ' + (a + '-' + b).padEnd(8) + String(x.n).padStart(7) + '  wOBA ' + f3(x.woba) + '  adjusted ' + sg(x.adj - o.bins[0].adj) + '  FB ' + (v ? (v.d >= 0 ? '+' : '') + v.d.toFixed(2) + ' (' + v.n + ')' : '-') + (REAL.fbAll[i] !== undefined && REAL.fbAll[i] !== null ? ' [' + REAL.fbAll[i] + ']' : '')); });
  console.log(' exit pitches p10 / p25 / p50 / p75 / p90 / max: ' + o.exit.join(' / ') + ' [' + REAL.exit.join(' / ') + ']; mean ' + f1(o.meanExit) + ', exit inning ' + o.inn.toFixed(2));
  console.log('  batters faced p50 ' + o.bf50 + '; out before the 3rd time ' + f1(o.before3) + '% [' + REAL.before3 + '], faced a 4th time ' + f1(o.fourth) + '% [' + REAL.fourth + '], complete games ' + f1(o.complete) + '% [' + REAL.complete + ']');
  console.log('  pulled mid-inning ' + f1(o.mid) + '% [' + REAL.mid + '] (runs this inning ' + o.midRuns.toFixed(2) + ', runners on ' + o.midOn.toFixed(2) + '); pulled with a 4th time through due ' + f1(o.before4) + '%');
  console.log('  exit pitches by runs allowed: ' + o.byRuns.map((x, r) => (r < 5 ? r : '5+') + ' ' + (x ? f1(x.p) + ' (' + x.n + ')' : '-') + ' [' + REAL.byRuns[r] + ']').join('  '));
  if (o.thirds) {
    console.log(' thirds by Stamina (cuts ' + o.cuts.join(', ') + '; MLB\'s by season pitches per start)');
    o.thirds.forEach((t, i) => {
      const r = REAL.thirds[i], v = t.velo[3];
      console.log('  ' + ['low', 'mid', 'high'][i].padEnd(5) + String(t.n).padStart(5) + ' starts, pitches per start ' + f1(t.pps) + ' [' + r.pps + '], exit p50 ' + t.p50 + ' [' + r.p50 + '], p90 ' + t.p90 + ' [' + r.p90 + ']; wOBA by time through ' + t.tto.map((x) => f3(x.woba)).join(' / ') + ' [' + r.tto.map(f3).join(' / ') + '], adjusted 3rd-1st ' + sg(t.tto[2].adj - t.tto[0].adj) + '; FB at 76-90 ' + (v ? v.d.toFixed(2) : '-') + ' [' + r.fb76 + ']');
      console.log('        fastball by pitch count: ' + t.velo.map((x, j) => BINS[j].join('-') + ' ' + (x ? x.d.toFixed(2) : '-')).join('  '));
    });
  }
}

if (process.argv[2] === '--worker') {
  const [from, to, stam, seed, set] = process.argv.slice(3);
  const B3 = loadCore();
  tweak(B3, set === '-' ? '' : set);
  process.send(play(B3, +from, +to, stam === 'pop' ? 'pop' : +stam, seed), () => process.exit(0));
} else if (require.main === module) {
  const args = process.argv.slice(2), opt = (k, d) => { const a = args.find((x) => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
  const pos = args.filter((x) => !x.startsWith('--'));
  const games = +(pos[0] || 1500), stam = pos[1] === 'pop' ? 'pop' : +(pos[1] || 60);
  const jobs = +opt('jobs', 4), seed = opt('seed', 'deep'), set = opt('set', '');
  runAll(games, stam, seed, jobs, set).then((d) => {
    const B3 = loadCore(); tweak(B3, set);
    const o = summarize(d);
    if (args.indexOf('--json') >= 0) console.log(JSON.stringify(o)); else report(o, B3, stam);
  }).catch((e) => { console.error(e.message); process.exit(1); });
}

module.exports = { play, summarize, runAll, REAL };
