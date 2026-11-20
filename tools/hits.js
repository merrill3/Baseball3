// Prints what happens on balls in play over seeded regular-season games: hit types, where hits land,
// outs, errors, steals and tag-ups, and the league batting line. Usage: node tools/hits.js [games=300] [seed=1] [--avg]
// Rated test teams with a league-like spread; --avg plays two average teams (every hook at its placeholder).
// It checks nothing: it is for reading the numbers (M1 step 1.2 task 7) and, later, calibration.
'use strict';
const { loadCore } = require('./lib/load');
const { pair, ratedPair } = require('./lib/testteams');

// Spray zones, degrees from center (plus toward right field).
const ZONES = [['LF line', -45, -30], ['LF-CF gap', -30, -10], ['CF', -10, 10], ['CF-RF gap', 10, 30], ['RF line', 30, 45.01]];
function zone(sp) { const z = ZONES.find((x) => sp >= x[1] && sp < x[2]); return z ? z[0] : 'foul'; }

function run(games, seed, avgTeams) {
  const B3 = loadCore();
  const c = { games: 0, pa: 0, ab: 0, h: 0, tb: 0, bb: 0, k: 0, sf: 0, runs: 0, res: {}, zones: {}, bb2: {}, e: 0, sb: 0, cs: 0, tagOk: 0, tagOut: 0, ifh: 0, pitches: 0, bip: 0, foulOuts: 0, lob: 0 };
  for (const [n] of ZONES) c.zones[n] = { '1B': 0, '2B': 0, '3B': 0, HR: 0, outs: 0 };
  for (let n = 0; n < games; n++) {
    const teams = avgTeams ? pair() : ratedPair(B3.rng.create('teams:' + seed + ':' + n));
    const g = B3.game.sim(Object.assign(teams, { type: 'regular', rng: B3.rng.create(seed + ':' + n) }));
    c.games++;
    c.runs += g.score[0] + g.score[1];
    let last = null;
    for (const e of g.log) {
      if (e.e === 'pitch') { c.pitches++; last = e; continue; }
      if (e.e === 'sb') c.sb++;
      if (e.e === 'cs') c.cs++;
      if (e.e === 'half') c.lob += e.lob;
      if (e.e !== 'pa') continue;
      c.pa++;
      c.res[e.res] = (c.res[e.res] || 0) + 1;
      if (e.res === 'BB') { c.bb++; continue; }
      if (e.res === 'K') { c.k++; c.ab++; continue; }
      if (e.res === 'SF') c.sf++; else c.ab++;
      if (e.res === 'E') c.e++;
      if (e.tag) { if (e.tag.ok) c.tagOk++; else c.tagOut++; }
      const hit = { '1B': 1, '2B': 2, '3B': 3, HR: 4 }[e.res];
      if (hit) { c.h++; c.tb += hit; }
      c.bip++;
      c.bb2[e.bb] = (c.bb2[e.bb] || 0) + 1;
      if (e.res === '1B' && ['P', 'C', '1B', '2B', '3B', 'SS'].indexOf(e.fl) >= 0) c.ifh++;
      if (last && last.sp !== undefined) {
        const z = zone(last.sp);
        if (z === 'foul') { c.foulOuts++; continue; }
        if (hit) c.zones[z][e.res]++; else c.zones[z].outs++;
      }
    }
  }
  return c;
}

function report(c) {
  const tg = c.games * 2;
  const per = (x) => (x / tg).toFixed(2);
  const pct = (a, b) => (b ? (100 * a / b).toFixed(1) : '-') + '%';
  const avg = c.h / c.ab, obp = (c.h + c.bb) / (c.ab + c.bb + c.sf), slg = c.tb / c.ab;
  const hr = c.res.HR || 0;
  const babip = (c.h - hr) / (c.ab - c.k - hr + c.sf);
  const out = [];
  out.push(c.games + ' regular-season games, ' + (c.avgTeams ? 'two average test teams' : 'rated test teams') + ' (not calibrated)');
  out.push('');
  out.push('Per team-game: runs ' + per(c.runs) + ', hits ' + per(c.h) + ', singles ' + per(c.res['1B'] || 0) + ', doubles ' + per(c.res['2B'] || 0) +
    ', triples ' + per(c.res['3B'] || 0) + ', home runs ' + per(hr) + ', walks ' + per(c.bb) + ', strikeouts ' + per(c.k) +
    ', errors ' + per(c.e) + ', double plays ' + per(c.res.DP || 0) + ', left on base ' + per(c.lob));
  out.push('Batting: AVG ' + avg.toFixed(3) + ', OBP ' + obp.toFixed(3) + ', SLG ' + slg.toFixed(3) + ', BABIP ' + babip.toFixed(3) +
    ', K ' + pct(c.k, c.pa) + ', BB ' + pct(c.bb, c.pa) + ', pitches per PA ' + (c.pitches / c.pa).toFixed(2));
  out.push('Balls in play: ' + Object.keys(c.bb2).sort().map((k) => k + ' ' + pct(c.bb2[k], c.bip)).join(', ') +
    '; infield hits ' + pct(c.ifh, c.res['1B'] || 0) + ' of singles; foul outs ' + c.foulOuts);
  out.push('Steals: ' + c.sb + ' safe, ' + c.cs + ' caught (' + pct(c.sb, c.sb + c.cs) + '). Tag-ups: ' + c.tagOk + ' safe, ' + c.tagOut + ' out; sac flies ' + c.sf + '.');
  out.push('Results: ' + Object.keys(c.res).sort().map((k) => k + ' ' + c.res[k]).join(', '));
  out.push('');
  out.push('Where hits land (fair balls in play, by spray)');
  out.push('zone         singles  doubles  triples  home runs   outs   AVG on balls in play');
  for (const [n] of ZONES) {
    const z = c.zones[n], h = z['1B'] + z['2B'] + z['3B'] + z.HR;
    out.push(n.padEnd(12) + [z['1B'], z['2B'], z['3B'], z.HR, z.outs].map((x, i) => String(x).padStart(i === 3 ? 10 : 8)).join(' ') + '   ' + (h / (h + z.outs)).toFixed(3));
  }
  return out.join('\n');
}

module.exports = { run, report };

if (require.main === module) {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const c = run(parseInt(args[0] || '300', 10), args[1] || '1', process.argv.includes('--avg'));
  c.avgTeams = process.argv.includes('--avg');
  console.log(report(c));
}
