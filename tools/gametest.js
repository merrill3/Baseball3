// Plays many seeded games with the CPU on both sides and checks every rule invariant on each.
// Usage: node tools/gametest.js [games=1000] [seed=1] [--show]
//   --show also prints the first game's box score and play-by-play.
// The same games and seed always print the same output, ending with a checksum of every game log.
'use strict';
const { loadCore } = require('./lib/load');
const { ratedPair } = require('./lib/testteams');
const { check } = require('./lib/gamecheck');

// The game types in turn: league games and Quick Games of each length.
const MIX = [
  { type: 'regular' }, { type: 'spring' }, { type: 'postseason' },
  { type: 'quick', innings: 9 }, { type: 'quick', innings: 3 }, { type: 'quick', innings: 1 }
];

function label(m) { return m.type + (m.type === 'quick' ? ' ' + m.innings : ''); }

// FNV-1a over a string, as 8 hex digits.
function fnv(str, h) {
  h = h === undefined ? 0x811c9dc5 : h;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

function run(games, seed, B3) {
  B3 = B3 || loadCore();
  const out = { games: 0, problems: [], seen: {}, byType: {}, hash: 0x811c9dc5, first: null };
  let runs = 0, pitches = 0, pas = 0;
  for (let n = 0; n < games; n++) {
    const m = MIX[n % MIX.length];
    // Rated test teams (a league-like spread), drawn from their own seed so the game's draws don't move.
    const opts = Object.assign(ratedPair(B3.rng.create('teams:' + seed + ':' + n)), m, { rng: B3.rng.create(seed + ':' + n) });
    const g = B3.game.sim(opts);
    if (!out.first) out.first = g;
    const c = check(g);
    for (const p of c.problems) out.problems.push('game ' + n + ' (' + label(m) + ', seed ' + seed + ':' + n + '): ' + p);
    for (const k in c.seen) out.seen[k] = (out.seen[k] || 0) + c.seen[k];
    const t = out.byType[label(m)] = out.byType[label(m)] || { games: 0, runs: 0, innings: 0, final: 0, walkoff: 0, mercy: 0, tie: 0, extras: 0 };
    t.games++; t.runs += g.score[0] + g.score[1]; t.innings += g.inning; t[g.result.reason]++;
    if (g.inning > g.rules.innings) t.extras++;
    runs += g.score[0] + g.score[1];
    for (const e of g.log) { if (e.e === 'pitch') pitches++; else if (e.e === 'pa') pas++; }
    out.hash = fnv(JSON.stringify(g.log), out.hash);
    out.games++;
  }
  out.runsPerTeamGame = runs / games / 2;
  out.pitchesPerPA = pitches / pas;
  return out;
}

function report(r, seed) {
  const lines = [];
  lines.push(r.games + ' games, seed ' + seed);
  lines.push('runs per team-game ' + r.runsPerTeamGame.toFixed(2) + ' (rated test teams, not calibrated), pitches per PA ' + r.pitchesPerPA.toFixed(2));
  lines.push('');
  lines.push('type          games  runs/g  innings/g  final walk-off mercy  tie  extras');
  for (const k in r.byType) {
    const t = r.byType[k];
    lines.push(k.padEnd(13) + String(t.games).padStart(6) + (t.runs / t.games).toFixed(2).padStart(8) + (t.innings / t.games).toFixed(2).padStart(11) +
      String(t.final).padStart(7) + String(t.walkoff).padStart(9) + String(t.mercy).padStart(6) + String(t.tie).padStart(5) + String(t.extras).padStart(8));
  }
  lines.push('');
  lines.push('scenarios seen: ' + Object.keys(r.seen).sort().map((k) => k + ' ' + r.seen[k]).join(', '));
  lines.push('checksum ' + r.hash.toString(16).padStart(8, '0'));
  return lines.join('\n');
}

module.exports = { run, report, MIX };

if (require.main === module) {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const games = parseInt(args[0] || '1000', 10);
  const seed = args[1] || '1';
  const B3 = loadCore();
  const r = run(games, seed, B3);
  console.log(report(r, seed));
  if (process.argv.includes('--show') && B3.box) {
    console.log('\n' + B3.box.text(r.first) + '\n\n' + B3.box.plays(r.first).join('\n'));
  }
  if (r.problems.length) {
    console.log('\nFAIL: ' + r.problems.length + ' problems\n' + r.problems.slice(0, 30).join('\n'));
    process.exit(1);
  }
  console.log('all checks passed');
}
