// A generated league's make-up (M2 step 2.1a task 2, Session 27): 30 organizations of 40 players from B3.players, and
// what they are made of, against MLB where there is a number to compare with. Node only; it checks nothing (exit 0).
// Usage: node tools/genleague.js [--seed=1] [--orgs=30] [--show=5]
//   ratings by tier; hands; ages; countries and name variety; positions and the infield-outfield share; arsenal sizes and
//   pitch types; tendencies; potential; rating-based stars (how many ratings of 70+, 75+ and 80+, and holes); --show
//   prints that many sample players.
'use strict';
const { loadCore } = require('./lib/load');

function args() {
  const a = process.argv.slice(2);
  const opt = (k, d) => { const x = a.find((s) => s.startsWith('--' + k + '=')); return x ? x.slice(k.length + 3) : d; };
  return { seed: opt('seed', '1'), orgs: parseInt(opt('orgs', '30'), 10), show: parseInt(opt('show', '5'), 10) };
}

const HIT = ['contact', 'timing', 'launch', 'rawPower', 'recognition', 'discipline'];
const DEF = ['range', 'hands', 'arm', 'speed', 'baserunning'];
const PIT = ['velocity', 'command', 'deception'];

function mean(xs) { return xs.reduce((a, b) => a + b, 0) / xs.length; }
function sd(xs) { const m = mean(xs); return Math.sqrt(mean(xs.map((x) => (x - m) * (x - m)))); }
function pct(n, d) { return (100 * n / d).toFixed(1) + '%'; }
function q(xs, p) { const v = xs.slice().sort((a, b) => a - b); return v[Math.min(v.length - 1, Math.floor(p * v.length))]; }
function corr(xs, ys) {
  const mx = mean(xs), my = mean(ys);
  let a = 0, b = 0, c = 0;
  xs.forEach((x, i) => { a += (x - mx) * (ys[i] - my); b += (x - mx) * (x - mx); c += (ys[i] - my) * (ys[i] - my); });
  return a / Math.sqrt(b * c);
}
function count(list, f) { const o = {}; for (const x of list) { const k = f(x); o[k] = (o[k] || 0) + 1; } return o; }
function shares(o, n) { return Object.keys(o).sort((a, b) => o[b] - o[a]).map((k) => k + ' ' + pct(o[k], n)).join(', '); }

function main() {
  const o = args();
  const B3 = loadCore();
  const rng = B3.rng.create('league:' + o.seed), ctx = B3.players.context();
  const orgs = [];
  for (let i = 0; i < o.orgs; i++) orgs.push(B3.players.squad(rng, ctx));
  const tiers = { regulars: [], bench: [], starters: [], relievers: [], reserves: [] };
  for (const s of orgs) for (const k in tiers) tiers[k].push(...s[k]);
  const all = [].concat(...Object.values(tiers));
  const hitters = all.filter((p) => !p.pitches), pitchers = all.filter((p) => p.pitches);
  const out = [];
  out.push('Generated league: ' + o.orgs + ' organizations, ' + all.length + ' players (' + hitters.length + ' hitters, ' + pitchers.length + ' pitchers), seed ' + o.seed);

  out.push('\nRatings (mean / sd), by tier');
  for (const k of ['regulars', 'bench', 'reserves']) {
    const list = tiers[k].filter((p) => !p.pitches);
    out.push('  ' + (k + ' hitters').padEnd(18) + HIT.concat(DEF).map((r) => r + ' ' + mean(list.map((p) => p.ratings[r])).toFixed(1) + '/' + sd(list.map((p) => p.ratings[r])).toFixed(1)).join('  '));
  }
  for (const k of ['starters', 'relievers', 'reserves']) {
    const list = tiers[k].filter((p) => p.pitches);
    const grades = [].concat(...list.map((p) => p.pitches.map((t) => p.arsenal[t].grade)));
    out.push('  ' + (k + ' pitchers').padEnd(18) + PIT.concat(['stamina']).map((r) => r + ' ' + mean(list.map((p) => p.ratings[r])).toFixed(1) + '/' + sd(list.map((p) => p.ratings[r])).toFixed(1)).join('  ') +
      '  grades ' + mean(grades).toFixed(1) + '/' + sd(grades).toFixed(1));
  }
  const reg = tiers.regulars;
  out.push('  links (regulars): Raw Power-Contact ' + corr(reg.map((p) => p.ratings.rawPower), reg.map((p) => p.ratings.contact)).toFixed(2) + ' [owner -0.3]');
  const sp = tiers.starters.concat(tiers.relievers);
  const stuff = (p) => mean([p.ratings.velocity].concat(p.pitches.map((t) => p.arsenal[t].grade)));
  out.push('  links (big-league pitchers): Command-stuff ' + corr(sp.map((p) => p.ratings.command), sp.map(stuff)).toFixed(2) + ' [the lean -0.2 on the whole stuff, about -0.1 on its average]');

  out.push('\nPositions (regulars), Raw Power and Speed means');
  const byPos = {};
  for (const p of reg) (byPos[p.pos] = byPos[p.pos] || []).push(p);
  out.push('  ' + B3.data.LINEUP_POS.map((pos) => pos + ' ' + mean(byPos[pos].map((p) => p.ratings.rawPower)).toFixed(0) + '/' + mean(byPos[pos].map((p) => p.ratings.speed)).toFixed(0)).join('  '));
  const cross = hitters.filter((p) => p.cross);
  out.push('  infield and outfield both: ' + pct(cross.length, hitters.length) + ' of hitters [owner: about 1 in 20] (regulars ' + pct(reg.filter((p) => p.cross).length, reg.length) +
    ', bench ' + pct(tiers.bench.filter((p) => p.cross).length, tiers.bench.length) + ', reserves ' + pct(tiers.reserves.filter((p) => !p.pitches && p.cross).length, tiers.reserves.filter((p) => !p.pitches).length) + ')');

  out.push('\nHands');
  out.push('  batters bat: ' + shares(count(hitters, (p) => p.bats), hitters.length) + ' [MLB about R 58, L 32, S 10]; throw left ' + pct(hitters.filter((p) => p.throws === 'L').length, hitters.length));
  out.push('  pitchers throw: ' + shares(count(pitchers, (p) => p.throws), pitchers.length) + ' [MLB about R 72]');

  out.push('\nAges');
  for (const [lab, list] of [['big-leaguers', all.filter((p) => tiers.reserves.indexOf(p) < 0)], ['reserves', tiers.reserves]]) {
    const ages = list.map((p) => p.age);
    out.push('  ' + lab.padEnd(13) + 'median ' + q(ages, 0.5) + ', 5th-95th ' + q(ages, 0.05) + '-' + q(ages, 0.95) + ', range ' + Math.min(...ages) + '-' + Math.max(...ages) + ', 21-24 ' + pct(ages.filter((a) => a <= 24).length, ages.length) + ', 33+ ' + pct(ages.filter((a) => a >= 33).length, ages.length));
  }
  const pot = (lo, hi) => all.filter((p) => p.age >= lo && p.age <= hi);
  out.push('  potential (hidden, mean; shown, mean): ' + [[21, 23], [24, 26], [27, 27], [28, 31], [32, 35], [36, 40]].map(([lo, hi]) => {
    const l = pot(lo, hi); return lo + '-' + hi + ' ' + (l.length ? mean(l.map((p) => p.potential.hidden)).toFixed(1) + '/' + mean(l.map((p) => p.potential.shown)).toFixed(1) : '-');
  }).join('  '));

  out.push('\nCountries and names');
  out.push('  born: ' + shares(count(all, (p) => p.country), all.length));
  const lasts = count(all, (p) => p.last), firsts = count(all, (p) => p.first);
  const top = (o2, n) => Object.keys(o2).sort((a, b) => o2[b] - o2[a]).slice(0, n).map((k) => k + ' ' + o2[k]).join(', ');
  out.push('  ' + Object.keys(lasts).length + ' different last names and ' + Object.keys(firsts).length + ' first names among ' + all.length + ' players; most common last: ' + top(lasts, 6) + '; first: ' + top(firsts, 6));
  out.push('  two players with one name: ' + (all.length - Object.keys(count(all, (p) => p.name)).length) + '; a real MLB player\'s name: ' + all.filter((p) => B3.names.isReal(p.first, p.last)).length);

  out.push('\nArsenals');
  for (const [lab, list] of [['starters', tiers.starters], ['relievers', tiers.relievers]]) {
    out.push('  ' + lab.padEnd(10) + 'sizes ' + shares(count(list, (p) => p.pitches.length), list.length) + '; has: ' +
      ['FF', 'SI', 'FC', 'SL', 'CU', 'CH', 'FS'].map((t) => t + ' ' + pct(list.filter((p) => p.pitches.indexOf(t) >= 0).length, list.length)).join(' '));
  }
  out.push('  [owner: starters 3-6, mostly 4, 6 very rarely; relievers 2-4, mostly 2, 4 very rarely. MLB 2024 about: four-seam 85%, slider or sweeper 80%, change-up 60%, sinker 50%, curve 45%, cutter 35%, splitter 10% of pitchers]');

  out.push('\nTendencies');
  out.push('  Aggressiveness: ' + shares(count(hitters, (p) => p.tendencies.aggressiveness), hitters.length) + '; Swing path: ' + shares(count(hitters, (p) => p.tendencies.swingPath), hitters.length) + '; Aim: ' + shares(count(pitchers, (p) => p.tendencies.aim), pitchers.length));

  out.push('\nStars by ratings (regulars; starters and relievers)');
  const starLine = (list, keys) => {
    const n = list.length, vals = (p) => keys(p);
    const c = (f) => pct(list.filter((p) => f(vals(p))).length, n);
    return 'one 80+ ' + c((v) => v.some((x) => x >= 80)) + ', two 75+ ' + c((v) => v.filter((x) => x >= 75).length >= 2) + ', three 70+ ' + c((v) => v.filter((x) => x >= 70).length >= 3) +
      ', none under 55 ' + c((v) => v.every((x) => x >= 55)) + '; of those with two 75+, a hole (45 or lower): ' +
      pct(list.filter((p) => vals(p).filter((x) => x >= 75).length >= 2 && vals(p).some((x) => x <= 45)).length, Math.max(1, list.filter((p) => vals(p).filter((x) => x >= 75).length >= 2).length));
  };
  out.push('  hitters (6 hitting ratings): ' + starLine(reg, (p) => HIT.map((k) => p.ratings[k])));
  out.push('  pitchers (Velocity, Command, Deception, best grade): ' + starLine(sp, (p) => PIT.map((k) => p.ratings[k]).concat([Math.max(...p.pitches.map((t) => p.arsenal[t].grade))])));

  if (o.show) {
    out.push('\nSample players');
    for (const p of [].concat(reg.slice(0, o.show), tiers.starters.slice(0, Math.ceil(o.show / 2)), tiers.relievers.slice(0, Math.ceil(o.show / 2)))) {
      out.push('  ' + p.name.padEnd(24) + (p.pos + (p.cross ? '/' + p.cross : '')).padEnd(6) + (p.role || '').padEnd(3) + ' age ' + p.age + ' ' + p.bats + '/' + p.throws + ' ' + p.country + ' ' +
        Object.keys(p.ratings).map((k) => k.slice(0, 4) + ' ' + p.ratings[k]).join(' ') + (p.pitches ? ' | ' + p.pitches.map((t) => t + ' ' + p.arsenal[t].grade).join(' ') : '') +
        ' | pot ' + p.potential.hidden + '/' + p.potential.shown);
    }
  }
  console.log(out.join('\n'));
}

main();
