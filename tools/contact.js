// Prints pitch and contact distributions from seeded games: by pitch type, by timing and by matchup.
// Usage: node tools/contact.js [games=300] [seed=1] [--avg]
// Rated test teams with a league-like spread; --avg plays two average teams (every hook at its placeholder).
// It records every pitch through B3.pitch.resolve (nothing extra goes in the game log). It checks
// nothing: it is for reading the numbers (M1 step 1.2) and, later, for calibration.
'use strict';
const { loadCore } = require('./lib/load');
const { pair, ratedPair } = require('./lib/testteams');

function pct(a, b) { return b ? (100 * a / b).toFixed(1) : '-'; }
function avg(xs) { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN; }
function sd(xs) { const m = avg(xs); return Math.sqrt(avg(xs.map((x) => (x - m) * (x - m)))); }
function q(xs, p) { const s = xs.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; }

function newRow() {
  return { n: 0, zone: 0, sw: 0, swZone: 0, swOut: 0, out: 0, S: 0, F: 0, X: 0, takeZ: 0, cZ: 0, takeO: 0, cO: 0, ev: [], la: [], tm: [], pull: 0, cent: 0, oppo: 0 };
}

function add(row, rec) {
  const p = rec.pitch, out = rec.out;
  row.n++;
  if (p.zone) row.zone++; else row.out++;
  if (rec.swing) {
    row.sw++;
    if (p.zone) row.swZone++; else row.swOut++;
    row.tm.push(rec.timing);
    if (out.r === 'S') row.S++;
    else if (out.r === 'F') row.F++;
    else row.X++;
    if (out.contact && out.r === 'X') {
      const c = out.contact;
      row.ev.push(c.ev); row.la.push(c.la);
      const toward = rec.bats === 'R' ? -c.sp : c.sp; // plus is the pull side
      if (toward > 15) row.pull++; else if (toward < -15) row.oppo++; else row.cent++;
    }
  } else if (p.zone) { row.takeZ++; if (out.r === 'C') row.cZ++; } else { row.takeO++; if (out.r === 'C') row.cO++; }
}

function run(games, seed, avgTeams) {
  const B3 = loadCore();
  const recs = [];
  const resolve = B3.pitch.resolve;
  B3.pitch.resolve = function (g, pitch, swing) {
    const w = B3.pitch.who(g);
    const out = resolve(g, pitch, swing);
    recs.push({ pitch: pitch, swing: swing.swing, timing: swing.timing, out: out, bats: w.bats, throws: w.throws });
    return out;
  };
  let pa = 0, k = 0, bb = 0, pitches = 0;
  for (let n = 0; n < games; n++) {
    const teams = avgTeams ? pair() : ratedPair(B3.rng.create('teams:' + seed + ':' + n));
    const g = B3.game.sim(Object.assign(teams, { type: 'regular', rng: B3.rng.create(seed + ':' + n) }));
    for (const e of g.log) {
      if (e.e === 'pitch') pitches++;
      if (e.e === 'pa') { pa++; if (e.res === 'K') k++; if (e.res === 'BB') bb++; }
    }
  }
  return { recs, pa, k, bb, pitches, games };
}

function table(title, groups) {
  const lines = [title];
  lines.push('group        pitches zone%  swing% chase% whiff% foul%  inplay%  EV    EV90  hard%  LA    LAsd  GB%   LD%   FB%   PU%   sweet% pull% oppo%  tm   tmSd');
  for (const [name, row] of groups) {
    const ev = row.ev, la = row.la;
    const bip = la.length;
    const gb = la.filter((x) => x < 10).length, ld = la.filter((x) => x >= 10 && x < 25).length;
    const fb = la.filter((x) => x >= 25 && x <= 50).length, pu = la.filter((x) => x > 50).length;
    const sweet = la.filter((x) => x >= 8 && x <= 32).length;
    const cells = [
      String(row.n).padStart(7), pct(row.zone, row.n).padStart(6), pct(row.sw, row.n).padStart(7), pct(row.swOut, row.out).padStart(7),
      pct(row.S, row.sw).padStart(6), pct(row.F, row.sw).padStart(6), pct(row.X, row.sw).padStart(7),
      avg(ev).toFixed(1).padStart(6), (bip ? q(ev, 0.9) : NaN).toFixed(1).padStart(6), pct(ev.filter((x) => x >= 95).length, bip).padStart(6),
      avg(la).toFixed(1).padStart(6), sd(la).toFixed(1).padStart(6),
      pct(gb, bip).padStart(5), pct(ld, bip).padStart(6), pct(fb, bip).padStart(6), pct(pu, bip).padStart(6), pct(sweet, bip).padStart(7),
      pct(row.pull, bip).padStart(6), pct(row.oppo, bip).padStart(6), avg(row.tm).toFixed(1).padStart(6), sd(row.tm).toFixed(1).padStart(6)
    ];
    lines.push(name.padEnd(12) + cells.join(''));
  }
  return lines.join('\n');
}

function report(r) {
  const all = newRow(), byType = {}, byMatch = {}, byTm = {}, bySpeed = {};
  for (const rec of r.recs) {
    add(all, rec);
    add(byType[rec.pitch.type] = byType[rec.pitch.type] || newRow(), rec);
    const m = (rec.bats === rec.throws ? 'same' : 'opposite') + ' hand';
    add(byMatch[m] = byMatch[m] || newRow(), rec);
    if (rec.swing) {
      const t = rec.timing, b = t < -30 ? '< -30 ms' : t < -10 ? '-30..-10' : t <= 10 ? '-10..10' : t <= 30 ? '10..30' : '> 30 ms';
      add(byTm[b] = byTm[b] || newRow(), rec);
    }
    const v = rec.pitch.speed, s = v >= 95 ? '95+ mph' : v >= 90 ? '90-95 mph' : v >= 85 ? '85-90 mph' : '< 85 mph';
    add(bySpeed[s] = bySpeed[s] || newRow(), rec);
  }
  const order = (obj, keys) => keys.filter((k) => obj[k]).map((k) => [k, obj[k]]);
  const out = [];
  out.push(r.games + ' regular-season games, ' + (r.avgTeams ? 'two average test teams' : 'rated test teams') + ' (not calibrated)');
  out.push('PA ' + r.pa + ', K% ' + pct(r.k, r.pa) + ', BB% ' + pct(r.bb, r.pa) + ', pitches per PA ' + (r.pitches / r.pa).toFixed(2) +
    ', called strikes on takes in the zone ' + pct(all.cZ, all.takeZ) + '%, outside ' + pct(all.cO, all.takeO) + '%');
  out.push('');
  out.push(table('By pitch type', [['all', all]].concat(order(byType, B3PITCHES))));
  out.push('');
  out.push(table('By pitch speed', order(bySpeed, ['95+ mph', '90-95 mph', '85-90 mph', '< 85 mph'])));
  out.push('');
  out.push(table('By timing (swings only)', order(byTm, ['< -30 ms', '-30..-10', '-10..10', '10..30', '> 30 ms'])));
  out.push('');
  out.push(table('By matchup', order(byMatch, ['opposite hand', 'same hand'])));
  return out.join('\n');
}
const B3PITCHES = ['FF', 'SI', 'FC', 'SL', 'CU', 'CH', 'FS'];

module.exports = { run, report };

if (require.main === module) {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const r = run(parseInt(args[0] || '300', 10), args[1] || '1', process.argv.includes('--avg'));
  r.avgTeams = process.argv.includes('--avg');
  console.log(report(r));
}
