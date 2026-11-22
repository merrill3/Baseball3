// How the engine's starter does deeper in games, and when the CPU pulls him (step 1.5 task 4, Session 16): the away
// starter's results by time through the order and by pitch count, his fastball speed, his exit pitches and why he left.
// Usage: node tools/starters.js games stamina   (average teams; only the away starter's Stamina moves). Checks nothing.
// Compare with node tools/realstarters.js (MLB 2024, measured the same way).
const R = './lib/';
const { loadCore } = require(R + 'load');
const { averagePair } = require(R + 'testteams');
const B3 = loadCore();
const games = +process.argv[2], stam = +process.argv[3];
const W = { BB: 0.689, HBP: 0.72, '1B': 0.882, '2B': 1.254, '3B': 1.59, HR: 2.05 };
const acc = () => ({ pa: 0, k: 0, bb: 0, w: 0, fb: 0, fbv: 0 });
const tto = [acc(), acc(), acc(), acc()], pcb = {}, BINS = [25, 50, 75, 90, 100, 999];
const exitP = [], why = { tired: 0, late7: 0, runs: 0, complete: 0, other: 0 }; let exitInn = 0, fbFirst = 0, nFirst = 0;
const add = (a, e, fbs) => { a.pa++; if (e.res === 'K') a.k++; if (e.res === 'BB') a.bb++; a.w += W[e.res] || 0; a.fb += fbs.n; a.fbv += fbs.v; };
for (let n = 0; n < games; n++) {
  const t = averagePair();
  t.away.players['AWY-SP'].ratings.stamina = stam;
  const g = B3.game.sim(Object.assign(t, { type: 'regular', rng: B3.rng.create('deep:' + n) }));
  const sp = 'AWY-SP', seen = {}; let pitches = 0, fbs = { n: 0, v: 0 }, lastInn = 1, pcStart = 0;
  for (const e of g.log) {
    if (e.h !== 1) continue;
    if (e.e === 'pitch' && e.p === sp) { if (!fbs.started) { pcStart = pitches; fbs.started = true; } pitches++; if (e.t === 'FF' || e.t === 'SI') { fbs.n++; fbs.v += e.v; } }
    if (e.e === 'pa' && e.p === sp) {
      const k = seen[e.b] = (seen[e.b] || 0) + 1;
      add(tto[Math.min(k, 4) - 1], e, fbs);
      const b = BINS.find((x) => pcStart < x); add(pcb[b] = pcb[b] || acc(), e, fbs);
      fbs = { n: 0, v: 0 }; lastInn = e.i;
    }
  }
  const live = g.teams[0].live[sp], stamIn = g.teams[0].inp[sp].pit.stamina, f = (live.pitches - stamIn) / 20;
  exitP.push(live.pitches); exitInn += lastInn;
  if (g.teams[0].used.length === 1) why.complete++;
  else if (f >= 0.55) why.tired++; else if (lastInn >= 7 && f >= 0) why.late7++;
  else if (live.runs >= 5 || (live.runs >= 4 && f >= -1.25)) why.runs++; else why.other++;
}
const pc = (x, y) => (100 * x / y).toFixed(1);
const row = (lab, a) => console.log('  ' + lab.padEnd(8) + String(a.pa).padStart(6) + '  K ' + pc(a.k, a.pa) + '  BB ' + pc(a.bb, a.pa) + '  wOBA ' + (a.w / a.pa).toFixed(3) + '  FB ' + (a.fbv / a.fb).toFixed(1));
const stIn = B3.ratings.stamina(B3.ratings.curve(stam));
console.log('Stamina ' + stam + ' (' + stIn + ' pitches before fatigue), ' + games + ' starts');
console.log(' by time through the order'); tto.forEach((a, i) => row(['1st', '2nd', '3rd', '4th+'][i], a));
console.log(' by pitch count at the start of the PA'); let lo = 0; for (const b of BINS) { if (pcb[b]) row(lo + '-' + (b === 999 ? '' : b), pcb[b]); lo = b + 1; }
exitP.sort((a, b) => a - b); const q = (p) => exitP[Math.floor(p * exitP.length)];
console.log(' exit pitches p10 / p25 / p50 / p75 / p90 / max: ' + [q(0.1), q(0.25), q(0.5), q(0.75), q(0.9), exitP[exitP.length - 1]].join(' / ') + '; mean exit inning ' + (exitInn / games).toFixed(2));
console.log(' why out: ' + Object.keys(why).map((k) => k + ' ' + pc(why[k], games)).join(', '));
