// Running and defense against real stats (M1 step 1.5 task 5, Session 20). It checks nothing (exit 0).
// Usage: node tools/runningdefense.js [--part=speed,steals,range,framing] [--games=2000] [--samples=1500] [--tweak=file.js]
//   speed    the away lineup's Speed at 40 / 60 / 80 (everyone else 60): BABIP, infield hits and double plays per ball in play,
//            steal attempts and success, runs; against MLB's by sprint speed (FanGraphs and Savant 2024-2025, below)
//   steals   the same for Baserunning (the jump, the lead and the judgment)
//   range    outs above average a season for one fielder's Range (shortstop, center field), from plate appearances replayed
//            with the same random numbers (tools/lib/value.js); against Savant's OAA percentiles around the median
//   framing  the home catcher's Framing: the share of taken pitches in the shadow zone called strikes (Savant's strike rate)
// Direct numbers (sprint speed, home to first, arm strength) are in `node tools/ratingstats.js --only=speed,arm --part=sweep`
// and `node tools/running.js` (extra bases taken against 2024's rates).
'use strict';
const os = require('os');
const path = require('path');
const { fork } = require('child_process');

// Real (Session 20 downloads, not kept: FanGraphs 2024-2025 players with 250+ PA joined with Savant's sprint speed by player
// id, 633 seasons). Infield hits leave out bunts; steal attempts are per time on first by a single, walk or hit by pitch.
const REAL = {
  speed: { at: [24.86, 25.97, 26.96, 27.96, 28.85, 29.84], ifhBip: [2.10, 2.28, 2.51, 3.07, 3.58], ifhPer: 0.34, babipPer: 0.0056,
    attempts: [2.0, 4.1, 7.0, 12.8, 18.6, 26.3], safe: [75.2, 79.0, 75.3, 78.8, 79.1, 81.9] },
  // Savant 2024-2026 (tools/lib/real.js): qualified fielders' OAA, catchers' strike rate, regulars' steal success
  oaa: { SS: { min: -18, p5: -11.9, p25: -2, p50: 1, p75: 6, p95: 17, max: 24 }, CF: { min: -12, p5: -6, p25: 0, p50: 4, p75: 10, p95: 16, max: 26 } },
  strike: { min: 37.2, p5: 39.8, p25: 42.6, p50: 45.0, p75: 47.4, p95: 49.7, max: 52.6 },
  sbPct: { p5: 59.6, p25: 72, p50: 80, p75: 85, p95: 94 }
};
const LADDER = { 20: 'min', 40: 'p5', 50: 'p25', 60: 'p50', 70: 'p75', 80: 'p95', 99: 'max' };

function args() {
  const a = process.argv.slice(2);
  const opt = (k, d) => { const x = a.find((s) => s.startsWith('--' + k + '=')); return x ? x.slice(k.length + 3) : d; };
  return { parts: opt('part', 'speed,steals,range,framing').split(','), games: +opt('games', '2000'), samples: +opt('samples', '1500'),
    tweak: opt('tweak', null) ? path.resolve(opt('tweak')) : null, jobs: +opt('jobs', String(os.cpus().length)) };
}

function load(tweak) {
  const B3 = require('./lib/load').loadCore();
  if (tweak) require(tweak)(B3);
  return B3;
}

// One worker's share of a job. kind 'lineup': the away hitters' rating k at L, the away side's batting read; 'framing': the home
// catcher's Framing at L, the away batters' takes read; 'replay': value.js replays with the fielder at pos at L.
function work(job) {
  const B3 = load(job.tweak);
  const { averagePair } = require('./lib/testteams');
  if (job.kind === 'replay') {
    const V = require('./lib/value');
    const s = V.sample(B3, job.samples, 'rd' + job.chunk);
    return job.levels.map((L) => {
      const r = V.measure(B3, s, (p, kind, pos) => { if (kind === 'hitter' && pos === job.pos) p.ratings[job.k] = L; });
      return { L: L, counts: r.counts, value: r.value, n: r.n, pptg: s.paPerTeamGame };
    });
  }
  const Z = B3.data.ZONE, mid = (Z.top + Z.bottom) / 2, hh = (Z.top - Z.bottom) / 2;
  const c = { g: 0, runs: 0, ab: 0, h: 0, hr: 0, k: 0, sf: 0, bip: 0, ifh: 0, dp: 0, sb: 0, cs: 0, sh: 0, shC: 0 };
  for (let n = job.from; n < job.from + job.games; n++) {
    const t = averagePair();
    if (job.kind === 'framing') t.home.players['HOM-C'].ratings.framing = job.L;
    else for (const id in t.away.players) { const p = t.away.players[id]; if (!p.pitches) p.ratings[job.k] = job.L; }
    const g = B3.game.sim(Object.assign(t, { type: 'regular', rng: B3.rng.create('rd:' + n) }));
    c.g++; c.runs += g.score[0];
    for (const e of g.log) {
      if (e.h !== 0) continue;
      if (e.e === 'sb') c.sb++; else if (e.e === 'cs') c.cs++;
      else if (e.e === 'pitch' && (e.r === 'B' || e.r === 'C')) {
        const u = Math.max(Math.abs(e.x) / Z.halfWidth, Math.abs(e.z - mid) / hh);
        if (u > 0.67 && u <= 1.33) { c.sh++; if (e.r === 'C') c.shC++; } // Savant's shadow zone
      } else if (e.e === 'pa' && e.res !== 'BB') {
        if (e.res === 'SF') c.sf++; else c.ab++;
        if (e.res === 'K') { c.k++; continue; }
        if (e.res === 'HR') { c.hr++; c.h++; continue; }
        c.bip++;
        if (e.res === '1B' || e.res === '2B' || e.res === '3B') c.h++;
        if (e.res === '1B' && ['P', 'C', '1B', '2B', '3B', 'SS'].indexOf(e.fl) >= 0) c.ifh++;
        if (e.res === 'DP') c.dp++;
      }
    }
  }
  return c;
}

function run(jobs, jobsN) {
  // Spread each job over jobsN workers (game ranges or replay chunks), then add the parts up.
  const tasks = [];
  for (const j of jobs) for (let w = 0; w < jobsN; w++) {
    if (j.kind === 'replay') tasks.push(Object.assign({}, j, { chunk: w, samples: Math.ceil(j.samples / jobsN), part: w }));
    else { const per = Math.ceil(j.games / jobsN); tasks.push(Object.assign({}, j, { from: w * per, games: per, part: w })); }
  }
  return new Promise((resolve) => {
    const out = new Array(tasks.length);
    let next = 0, done = 0;
    const start = () => {
      if (next >= tasks.length) return;
      const i = next++;
      const ch = fork(__filename, ['--child']);
      ch.send(tasks[i]);
      ch.on('message', (r) => { out[i] = r; ch.kill(); if (++done === tasks.length) resolve({ tasks, out }); else start(); });
    };
    for (let w = 0; w < Math.min(jobsN, tasks.length); w++) start();
  });
}

function sum(list) {
  const a = Object.assign({}, list[0]);
  for (const b of list.slice(1)) for (const k in a) a[k] += b[k];
  return a;
}

async function main() {
  const o = args();
  const t0 = Date.now();
  const B3 = load(o.tweak);
  const lineup = [];
  for (const k of ['speed', 'baserunning']) if (o.parts.includes(k === 'speed' ? 'speed' : 'steals')) for (const L of [40, 60, 80]) lineup.push({ kind: 'lineup', k: k, L: L, games: o.games, tweak: o.tweak });
  if (o.parts.includes('framing')) for (const L of [20, 40, 50, 60, 70, 80, 99]) lineup.push({ kind: 'framing', L: L, games: o.games, tweak: o.tweak });
  const levels = [20, 40, 50, 60, 70, 80, 99];
  if (o.parts.includes('range')) for (const pos of ['SS', 'CF']) lineup.push({ kind: 'replay', k: 'range', pos: pos, levels: levels, samples: o.samples, tweak: o.tweak });
  const { tasks, out } = await run(lineup, o.jobs);
  const by = (pred) => sum(out.filter((x, i) => pred(tasks[i])));
  for (const k of ['speed', 'baserunning']) {
    if (!o.parts.includes(k === 'speed' ? 'speed' : 'steals')) continue;
    console.log('\n' + (k === 'speed' ? 'Speed' : 'Baserunning') + ': the away lineup at 40 / 60 / 80 (everyone else 60), ' + o.games + ' games each');
    for (const L of [40, 60, 80]) {
      const c = by((t) => t.kind === 'lineup' && t.k === k && t.L === L);
      const v = B3.ratings.inputs({ id: 'x', ratings: { [k]: L } }).run.speed;
      console.log('  ' + L + (k === 'speed' ? ' (' + v.toFixed(2) + ' ft/s)' : '') + ': runs ' + (c.runs / c.g).toFixed(2) + '  BABIP ' + ((c.h - c.hr) / (c.ab - c.k - c.hr + c.sf)).toFixed(3) +
        '  infield hits ' + (100 * c.ifh / c.bip).toFixed(2) + '% of balls in play  double plays ' + (100 * c.dp / c.bip).toFixed(2) + '%  steals ' +
        ((c.sb + c.cs) / c.g).toFixed(2) + ' tries a game at ' + (100 * c.sb / (c.sb + c.cs)).toFixed(0) + '%');
    }
    if (k === 'speed') {
      const R = REAL.speed;
      console.log('  real by sprint speed (' + R.at.map((x) => x.toFixed(1)).join(' / ') + ' ft/s): infield hits ' + R.ifhBip.join(' / ') + '% of balls in play (+' +
        R.ifhPer + ' a ft/s), BABIP +' + R.babipPer + ' a ft/s; steal tries ' + R.attempts.join(' / ') + '% of times on first, safe ' + R.safe.join(' / ') + '%');
    } else console.log('  real regulars\' steal success (Speed and Baserunning together): ' + Object.keys(REAL.sbPct).map((q) => q + ' ' + REAL.sbPct[q]).join(', '));
  }
  if (o.parts.includes('range')) {
    for (const pos of ['SS', 'CF']) {
      const rows = out.filter((x, i) => tasks[i].kind === 'replay' && tasks[i].pos === pos);
      const agg = {};
      let pptg = 0;
      for (const part of rows) for (const r of part) {
        const a = agg[r.L] || (agg[r.L] = { pa: 0, K: 0, BB: 0, H: 0, E: 0, v: 0, n: 0 });
        for (const c of ['pa', 'K', 'BB', 'H', 'E']) a[c] += r.counts[c];
        a.v += r.value * r.n; a.n += r.n; pptg = r.pptg;
      }
      const season = pptg * 162 * 0.87; // a regular's season in the field: about 141 full games (Claude's default)
      const rate = (a) => (a.pa - a.K - a.BB - a.H - a.E) / a.pa; // balls in play turned into outs
      const R = REAL.oaa[pos];
      console.log('\nRange at ' + pos + ': outs above average a season (' + season.toFixed(0) + ' plate appearances), replayed; real = Savant OAA minus its median');
      for (const L of levels) {
        const q = LADDER[L];
        console.log('  ' + String(L).padStart(2) + '  OAA ' + ((rate(agg[L]) - rate(agg[60])) * season).toFixed(1).padStart(6) + '   real ' + (R[q] - R.p50).toFixed(1).padStart(6) +
          '   runs a team-game against 60 ' + ((agg[L].v / agg[L].n - agg[60].v / agg[60].n) * pptg).toFixed(3));
      }
    }
  }
  if (o.parts.includes('framing')) {
    console.log('\nFraming (the home catcher; ' + o.games + ' games each): shadow-zone takes called strikes, against Savant\'s strike rate');
    for (const L of [20, 40, 50, 60, 70, 80, 99]) {
      const c = by((t) => t.kind === 'framing' && t.L === L);
      console.log('  ' + String(L).padStart(2) + '  ' + (100 * c.shC / c.sh).toFixed(1) + '%   real ' + REAL.strike[LADDER[L]].toFixed(1) + '%   runs allowed ' + (c.runs / c.g).toFixed(2));
    }
  }
  console.log('\n(' + Math.round((Date.now() - t0) / 1000) + ' s, ' + o.jobs + ' processes)');
}

if (process.argv.includes('--child')) process.on('message', (j) => process.send(work(j)));
else if (require.main === module) main();
