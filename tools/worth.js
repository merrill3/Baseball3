// "10 points are worth": what +10 rating points do to the stats, one rating at a time (M1 step 1.3).
// Usage: node tools/worth.js [games=800] [seed=1] [--from=60] [--only=contact,velocity] [--styles] [--pairs]
//
// Every condition plays the same seeded regular-season games between two average teams (every rating
// 60, tools/lib/testteams.js average()). A hitting rating is raised for all 18 hitters, a pitching
// rating for all 18 pitchers, and the batting against them is measured, so each row is the worth of
// +10 points for a whole lineup or staff (divide by 9 for one player). --from=40 starts from 40 instead
// (everyone at 40, the row at 50), and so on. Each row prints the change from the base; the stats
// marked * are the rating's own (DESIGN.md section 10). --pairs adds the synergy check: two ratings at
// +20 together against the sum of each alone (the combination bonus). --styles adds the tendencies:
// Aggressiveness at Discipline 40, 60 and 80, and Aim at Command 40, 60 and 80. It checks nothing: it is for
// reading, and tools/calibrate.js (step 1.4) reuses it for the equal-value check. From code,
// run(games, seed, { from, only, pairs, styles, tweak }) returns the numbers; tweak(B3) can change B3.tune first.
'use strict';
const { loadCore } = require('./lib/load');
const { averagePair, HIT, PIT } = require('./lib/testteams');

// Linear weights: runs each result is worth against an average plate appearance (general baseball
// values, Claude's default). Less noisy than runs scored, which also depend on sequencing.
const LW = { BB: 0.31, '1B': 0.47, '2B': 0.77, '3B': 1.04, HR: 1.40, E: 0.50, K: -0.29, GO: -0.27, FO: -0.27, LO: -0.27, PO: -0.29, SF: -0.05, FC: -0.33, DP: -0.75 };

// The conditions. set(player, kind, from) changes the average players; own lists the rating's stats.
function conditions(from) {
  const up = from + 10;
  const rows = [];
  const hitting = { contact: 'K whiff zCon', timing: 'whiff95 pull oppo', launch: 'LAsd sweet PU', rawPower: 'EV EV90 HR/FB ISO',
    recognition: 'chase offWhiff', discipline: 'BB chase zSw' };
  for (const k of HIT) rows.push({ name: k, own: hitting[k], set: (p, kind) => { if (kind === 'hitter') p.ratings[k] = up; } });
  const pitching = { velocity: 'EV hard oppo K', command: 'BB zone', deception: 'chase offWhiff' };
  for (const k of PIT) rows.push({ name: k, own: pitching[k], set: (p, kind) => { if (kind === 'pitcher') p.ratings[k] = up; } });
  rows.push({ name: 'grades', own: 'whiff K', set: (p, kind) => { if (kind === 'pitcher') for (const t in p.arsenal) p.arsenal[t].grade = up; } });
  rows.push({ name: 'putAway', own: 'whiff K', set: (p, kind, B3) => { if (kind === 'pitcher') p.arsenal[B3.ratings.putAway(p.pitches, grades(p))].grade = up; } });
  rows.push({ name: 'stamina SP', own: 'SPpit SPip', set: (p, kind) => { if (kind === 'pitcher' && p.role === 'SP') p.ratings.stamina += 10; } });
  rows.push({ name: 'shape +0.5', own: 'GB HR/FB', set: (p, kind) => { if (kind === 'pitcher') for (const t in p.arsenal) p.arsenal[t].shape = 0.5; } });
  for (const w of ['Patient', 'Aggressive']) rows.push({ name: w, own: 'zSw chase BB', set: (p, kind) => { if (kind === 'hitter') p.tendencies.aggressiveness = w; } });
  for (const w of ['Nibbler', 'Attacker']) rows.push({ name: w, own: 'zone BB', set: (p, kind) => { if (kind === 'pitcher') p.tendencies.aim = w; } });
  return rows;
}
function grades(p) { const g = {}; for (const t of p.pitches) g[t] = p.arsenal[t].grade; return g; }

// Teams with every rating at `from`, then the condition applied.
function teams(B3, from, set) {
  const t = averagePair();
  for (const side of [t.away, t.home]) {
    for (const id in side.players) {
      const p = side.players[id], kind = p.pitches ? 'pitcher' : 'hitter';
      for (const k in p.ratings) if (k !== 'stamina') p.ratings[k] = from;
      if (p.arsenal) for (const type in p.arsenal) p.arsenal[type].grade = from;
      if (set) set(p, kind, B3);
    }
  }
  return t;
}

function newStats() {
  return { games: 0, runs: 0, pa: 0, ab: 0, h: 0, tb: 0, bb: 0, k: 0, sf: 0, hr: 0, lw: 0, res: {}, pitches: 0, zone: 0, out: 0,
    sw: 0, swZone: 0, swOut: 0, whiff: 0, conZone: 0, sw95: 0, whiff95: 0, swOff: 0, whiffOff: 0,
    ev: [], la: [], pull: 0, oppo: 0, fb: 0, fbHr: 0, spPitches: 0, spOuts: 0, starts: 0 };
}

function play(B3, games, seed, t0) {
  const s = newStats();
  const resolve = B3.pitch.resolve;
  const off = { SL: 1, CU: 1, CH: 1, FS: 1 };
  B3.pitch.resolve = function (g, pitch, swing) {
    const out = resolve(g, pitch, swing);
    s.pitches++;
    if (pitch.zone) s.zone++; else s.out++;
    if (swing.swing) {
      s.sw++;
      if (pitch.zone) s.swZone++; else s.swOut++;
      const miss = out.r === 'S';
      if (miss) s.whiff++;
      if (pitch.zone && !miss) s.conZone++;
      if (pitch.speed >= 95) { s.sw95++; if (miss) s.whiff95++; }
      if (off[pitch.type]) { s.swOff++; if (miss) s.whiffOff++; }
      if (out.r === 'X' && out.contact) {
        const c = out.contact, bats = B3.pitch.who(g).bats;
        s.ev.push(c.ev); s.la.push(c.la);
        const toward = bats === 'R' ? -c.sp : c.sp;
        if (toward > 15) s.pull++; else if (toward < -15) s.oppo++;
      }
    }
    return out;
  };
  try {
    for (let n = 0; n < games; n++) {
      const g = B3.game.sim(Object.assign(t0(), { type: 'regular', rng: B3.rng.create(seed + ':' + n) }));
      s.games++;
      s.runs += g.score[0] + g.score[1];
      const starter = [g.teams[0].used[0], g.teams[1].used[0]];
      let lastPitch = null;
      for (const e of g.log) {
        if (e.e === 'pitch') { lastPitch = e; if (e.p === starter[1 - e.h]) s.spPitches++; continue; }
        if (e.e !== 'pa') continue;
        if (e.p === starter[1 - e.h]) s.spOuts += e.out;
        s.pa++;
        s.res[e.res] = (s.res[e.res] || 0) + 1;
        s.lw += LW[e.res] || 0;
        if (e.res === 'BB') { s.bb++; continue; }
        if (e.res === 'SF') { s.sf++; continue; }
        s.ab++;
        if (e.res === 'K') { s.k++; continue; }
        const hit = { '1B': 1, '2B': 2, '3B': 3, HR: 4 }[e.res];
        if (hit) { s.h++; s.tb += hit; }
        if (e.res === 'HR') s.hr++;
        if (lastPitch && lastPitch.la !== undefined && lastPitch.la >= 25 && lastPitch.la <= 50) { s.fb++; if (e.res === 'HR') s.fbHr++; }
      }
      s.starts += 2;
    }
  } finally {
    B3.pitch.resolve = resolve;
  }
  return s;
}

function avg(xs) { return xs.reduce((a, b) => a + b, 0) / xs.length; }
function sd(xs) { const m = avg(xs); return Math.sqrt(avg(xs.map((x) => (x - m) * (x - m)))); }
function q(xs, p) { const v = xs.slice().sort((a, b) => a - b); return v[Math.min(v.length - 1, Math.floor(p * v.length))]; }

// The columns: [name, digits, value(stats)].
const COLS = [
  ['runs', 2, (s) => s.runs / s.games / 2],
  ['LW', 2, (s) => s.lw / s.games / 2],
  ['K', 1, (s) => 100 * s.k / s.pa],
  ['BB', 1, (s) => 100 * s.bb / s.pa],
  ['AVG', 3, (s) => s.h / s.ab],
  ['OBP', 3, (s) => (s.h + s.bb) / (s.ab + s.bb + s.sf)],
  ['ISO', 3, (s) => (s.tb - s.h) / s.ab],
  ['HR', 2, (s) => s.hr / s.games / 2],
  ['P/PA', 2, (s) => s.pitches / s.pa],
  ['zone', 1, (s) => 100 * s.zone / s.pitches],
  ['zSw', 1, (s) => 100 * s.swZone / s.zone],
  ['chase', 1, (s) => 100 * s.swOut / s.out],
  ['whiff', 1, (s) => 100 * s.whiff / s.sw],
  ['zCon', 1, (s) => 100 * s.conZone / s.swZone],
  ['whiff95', 1, (s) => 100 * s.whiff95 / s.sw95],
  ['offWhiff', 1, (s) => 100 * s.whiffOff / s.swOff],
  ['EV', 1, (s) => avg(s.ev)],
  ['EV90', 1, (s) => q(s.ev, 0.9)],
  ['hard', 1, (s) => 100 * s.ev.filter((x) => x >= 95).length / s.ev.length],
  ['LAsd', 1, (s) => sd(s.la)],
  ['sweet', 1, (s) => 100 * s.la.filter((x) => x >= 8 && x <= 32).length / s.la.length],
  ['GB', 1, (s) => 100 * s.la.filter((x) => x < 10).length / s.la.length],
  ['PU', 1, (s) => 100 * s.la.filter((x) => x > 50).length / s.la.length],
  ['HR/FB', 1, (s) => 100 * s.fbHr / s.fb],
  ['pull', 1, (s) => 100 * s.pull / s.ev.length],
  ['oppo', 1, (s) => 100 * s.oppo / s.ev.length],
  ['SPpit', 1, (s) => s.spPitches / s.starts],
  ['SPip', 2, (s) => s.spOuts / 3 / s.starts]
];

function values(s) { const o = {}; for (const [n, , f] of COLS) o[n] = f(s); return o; }

function run(games, seed, opts) {
  opts = opts || {};
  const from = opts.from === undefined ? 60 : opts.from;
  const B3 = loadCore();
  if (opts.tweak) opts.tweak(B3); // for experiments: change B3.tune before the games
  const out = { games: games, seed: seed, from: from, base: values(play(B3, games, seed, () => teams(B3, from))), rows: [], pairs: [] };
  for (const c of conditions(from)) {
    if (opts.only && opts.only.indexOf(c.name) < 0) continue;
    out.rows.push({ name: c.name, own: c.own, v: values(play(B3, games, seed, () => teams(B3, from, c.set))) });
  }
  if (opts.styles) {
    // The tendencies against the rating they pay off with (owner's choices, Session 4): Aggressiveness
    // with Discipline, Aim with Command. Each cell is runs per team-game against the Balanced cell at the
    // same rating (for Aim, runs allowed: below 0 is better).
    const cells = [['discipline', 'aggressiveness', ['Patient', 'Aggressive'], 'hitter'], ['command', 'aim', ['Nibbler', 'Attacker'], 'pitcher']];
    for (const [rating, tend, words, kind] of cells) {
      if (typeof opts.styles === 'string' && opts.styles !== kind) continue;
      for (const at of [from - 20, from, from + 20]) {
        const at0 = (p, k) => { if (k === kind) p.ratings[rating] = at; };
        const lw = (word) => values(play(B3, games, seed, () => teams(B3, from, (p, k) => { at0(p, k); if (word && k === kind) p.tendencies[tend] = word; })));
        const bal = lw(null);
        out.styles = out.styles || [];
        out.styles.push({ rating: rating, at: at, words: words, cells: words.map((w) => { const v = lw(w); return { word: w, runs: v.runs - bal.runs, lw: v.LW - bal.LW, bb: v.BB - bal.BB, k: v.K - bal.K }; }) });
      }
    }
  }
  if (opts.pairs) {
    const PAIRS = [['contact', 'rawPower'], ['contact', 'launch'], ['rawPower', 'launch'], ['timing', 'recognition'], ['velocity', 'command'], ['command', 'deception']];
    const at = from + 20, cache = {};
    const one = (k) => (cache[k] || (cache[k] = values(play(B3, games, seed, () => teams(B3, from, (p) => { if (k in p.ratings) p.ratings[k] = at; }))))).runs;
    for (const [a, b] of PAIRS) {
      const both = values(play(B3, games, seed, () => teams(B3, from, (p) => { if (a in p.ratings) p.ratings[a] = at; if (b in p.ratings) p.ratings[b] = at; }))).runs;
      out.pairs.push({ a: a, b: b, at: at, da: one(a) - out.base.runs, db: one(b) - out.base.runs, both: both - out.base.runs });
    }
  }
  return out;
}

function report(r) {
  const lines = [];
  lines.push('10 points are worth: ' + r.games + ' games per row, seed ' + r.seed + ', everyone at ' + r.from + ', each row one rating at ' + (r.from + 10) +
    ' for every hitter or pitcher (both teams). Per team-game for a whole lineup or staff; divide by 9 for one player.');
  lines.push('runs: runs scored; LW: linear-weight runs (less noisy); a pitching row is the batting against it. * marks the rating\'s own stats.');
  lines.push('');
  const head = 'row         ' + COLS.map(([n]) => n.padStart(Math.max(6, n.length + 1))).join('');
  lines.push(head);
  lines.push('base        ' + COLS.map(([n, d]) => r.base[n].toFixed(d).padStart(Math.max(6, n.length + 1))).join(''));
  for (const row of r.rows) {
    const own = row.own.split(' ');
    lines.push(row.name.padEnd(12) + COLS.map(([n, d]) => {
      const x = row.v[n] - r.base[n];
      const txt = (x >= 0 ? '+' : '') + x.toFixed(d) + (own.indexOf(n) >= 0 ? '*' : ' ');
      return txt.padStart(Math.max(6, n.length + 1) + 1).slice(0, Math.max(7, n.length + 2));
    }).join(''));
  }
  if (r.styles) {
    lines.push('');
    lines.push('Tendencies against the rating they pay off with: change from Balanced at the same rating (runs and LW per team-game, BB and K in points)');
    for (const st of r.styles) {
      lines.push(('  ' + st.rating + ' ' + st.at).padEnd(18) + st.cells.map((c) => c.word.padEnd(11) + 'runs ' + (c.runs >= 0 ? '+' : '') + c.runs.toFixed(2) +
        ' LW ' + (c.lw >= 0 ? '+' : '') + c.lw.toFixed(2) + ' BB ' + (c.bb >= 0 ? '+' : '') + c.bb.toFixed(1) + ' K ' + (c.k >= 0 ? '+' : '') + c.k.toFixed(1)).join('   '));
    }
  }
  if (r.pairs.length) {
    lines.push('');
    lines.push('Synergy (runs per team-game, each rating ' + r.from + ' -> ' + r.pairs[0].at + '): together against the sum of each alone');
    for (const p of r.pairs) {
      const sum = p.da + p.db;
      lines.push(('  ' + p.a + ' + ' + p.b).padEnd(28) + 'alone ' + p.da.toFixed(2) + ' + ' + p.db.toFixed(2) + ' = ' + sum.toFixed(2) +
        ', together ' + p.both.toFixed(2) + ', bonus ' + (p.both - sum >= 0 ? '+' : '') + (p.both - sum).toFixed(2));
    }
  }
  return lines.join('\n');
}

module.exports = { run, report, conditions, teams, play, values, COLS, LW };

if (require.main === module) {
  const args = process.argv.slice(2);
  const pos = args.filter((a) => !a.startsWith('--'));
  const opt = (k) => { const a = args.find((x) => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : undefined; };
  const only = opt('only');
  console.log(report(run(parseInt(pos[0] || '800', 10), pos[1] || '1', {
    from: opt('from') === undefined ? 60 : parseInt(opt('from'), 10),
    only: only ? only.split(',') : null,
    pairs: args.includes('--pairs'),
    styles: args.includes('--styles') || opt('styles')
  })));
}
