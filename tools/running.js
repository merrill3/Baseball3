// Prints how often runners take extra bases on hits, against real big-league rates, and how fast
// runners are by Speed. Usage: node tools/running.js [games=1000] [seed=1] [--avg]
// Rated test teams (a league-like spread); --avg plays two average teams. It checks nothing.
// Real rates are rough big-league values from general baseball knowledge (Claude's notes):
//   second to home on a single about 55-60% (higher with two outs, when he runs on contact),
//   first to third on a single about 25-30%, first to home on a double about 40-45%,
//   extra bases taken (all three together, "XBT%") about 40%; runners out trying, about 2-3% of chances.
'use strict';
const { loadCore } = require('./lib/load');
const { pair, ratedPair } = require('./lib/testteams');

const OF = { LF: 1, CF: 1, RF: 1 };

function cell() { return { n: 0, xb: 0, out: 0 }; }

function run(games, seed, avgTeams, tweak) {
  const B3 = loadCore();
  if (tweak) tweak(B3);
  const c = {
    s2: { all: cell(), lt2: cell(), two: cell(), ground: cell(), line: cell(), fly: cell(), popup: cell() },
    s1: { all: cell(), lt2: cell(), two: cell() },
    d1: { all: cell(), lt2: cell(), two: cell() },
    hits: 0, ofSingles: 0
  };
  const add = (k, i, outs, bb, p, need) => {
    const r = p.runners[i];
    const cells = [c[k].all, outs === 2 ? c[k].two : c[k].lt2];
    if (c[k][bb]) cells.push(c[k][bb]);
    for (const x of cells) { x.n++; if (r >= need) x.xb++; if (r === 0) x.out++; }
  };
  const inPlay = B3.ball.inPlay;
  B3.ball.inPlay = function (g, contact, steal) {
    const bases = g.bases.slice(), outs = g.outs;
    const p = inPlay(g, contact, steal);
    if (p.code === '1B' && OF[p.fielder]) {
      c.ofSingles++;
      if (bases[1]) add('s2', 1, outs, p.bb, p, 4);
      // First to third only when third is open after the play's runner ahead moves (or was empty).
      if (bases[0] && (!bases[2] || p.runners[2] === 4) && (!bases[1] || p.runners[1] === 4 || p.runners[1] === 0)) add('s1', 0, outs, p.bb, p, 3);
    }
    if (p.code === '2B' && bases[0]) add('d1', 0, outs, p.bb, p, 4);
    return p;
  };
  let runs = 0;
  const ev = { DP: 0, SF: 0, sb: 0, cs: 0, tagOut: 0 };
  for (let n = 0; n < games; n++) {
    const teams = avgTeams ? pair() : ratedPair(B3.rng.create('teams:' + seed + ':' + n));
    const g = B3.game.sim(Object.assign(teams, { type: 'regular', rng: B3.rng.create(seed + ':' + n) }));
    runs += g.score[0] + g.score[1];
    for (const e of g.log) {
      if (e.e === 'sb' || e.e === 'cs') ev[e.e]++;
      if (e.e === 'pa' && (e.res === 'DP' || e.res === 'SF')) ev[e.res]++;
      if (e.e === 'pa' && e.tag && !e.tag.ok) ev.tagOut++;
    }
  }
  B3.ball.inPlay = inPlay;
  return { B3: B3, c: c, games: games, runs: runs, ev: ev };
}

function pct(x) { return x.n ? (100 * x.xb / x.n).toFixed(1).padStart(5) + '%' : '    -'; }
function outPct(x) { return x.n ? (100 * x.out / x.n).toFixed(1).padStart(5) + '%' : '    -'; }
function row(label, x, real) {
  console.log('  ' + label.padEnd(34) + pct(x) + '  out ' + outPct(x) + '  (' + String(x.n).padStart(5) + ' chances)' + (real ? '   real ' + real : ''));
}

function speedTable(B3) {
  console.log('\nSpeed: sprint speed (ft/s) and home to first (s, right-handed batter, no turn)');
  const B = B3.tune.BALL;
  for (const r of [20, 30, 40, 50, 60, 70, 80, 90, 99]) {
    const inp = B3.ratings.inputs({ id: 'x', ratings: { speed: r } });
    const v = inp.run.speed;
    const t = B.batterBox + B3.ball.runTime(90, v, 0);
    console.log('  ' + String(r).padStart(2) + '  ' + v.toFixed(2) + ' ft/s   ' + t.toFixed(2) + ' s');
  }
  console.log('  real: slowest regulars about 23-24 ft/s, average 27, elite 30+; home to first about 4.0-4.9 s');
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const games = +(args.find((a) => /^\d+$/.test(a)) || 1000);
  const seed = args.filter((a) => /^\d+$/.test(a))[1] || '1';
  const res = run(games, seed, args.indexOf('--avg') >= 0);
  const c = res.c;
  console.log('Extra bases taken on hits, ' + res.games + ' games (' + (res.runs / res.games / 2).toFixed(2) + ' runs per team-game)');
  console.log('Second to home on a single to the outfield');
  row('all', c.s2.all, 'about 55-60%');
  row('fewer than two outs', c.s2.lt2, 'about 50-55%');
  row('two outs', c.s2.two, 'about 70-80%');
  for (const bb of ['ground', 'line', 'fly', 'popup']) row('  on a ' + bb + ' ball', c.s2[bb]);
  console.log('First to third on a single to the outfield (third open)');
  row('all', c.s1.all, 'about 25-30%');
  row('fewer than two outs', c.s1.lt2);
  row('two outs', c.s1.two);
  console.log('First to home on a double');
  row('all', c.d1.all, 'about 40-45%');
  row('fewer than two outs', c.d1.lt2);
  row('two outs', c.d1.two);
  const all = ['s2', 's1', 'd1'].reduce((a, k) => ({ n: a.n + c[k].all.n, xb: a.xb + c[k].all.xb, out: a.out + c[k].all.out }), { n: 0, xb: 0, out: 0 });
  row('XBT% (all three together)', all, 'about 40%, out about 2-3%');
  const tg = res.games * 2, ev = res.ev;
  console.log('Per team-game: double plays ' + (ev.DP / tg).toFixed(2) + ' (real about 0.7), sac flies ' + (ev.SF / tg).toFixed(2) +
    ' (real about 0.25), tag-up outs ' + (ev.tagOut / tg).toFixed(3) + ', steal attempts ' + ((ev.sb + ev.cs) / tg).toFixed(2) + ' at ' + (100 * ev.sb / Math.max(1, ev.sb + ev.cs)).toFixed(0) + '% safe');
  speedTable(res.B3);
}

module.exports = { run };
