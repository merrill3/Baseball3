// Run value of a rating change, measured precisely (M1 step 1.4): plate appearances replayed in pairs.
// Node only (tools). Used by tools/calibrate.js for the equal-value check.
//
//   const v = require('./lib/value');
//   const s = v.sample(B3, games, seed)     plays `games` seeded games between two average teams (every
//                                           rating 60) and keeps the state at the start of every plate
//                                           appearance, plus a run-expectancy table (RE24) from them
//   v.measure(B3, s, set, opts)             replays every kept plate appearance with teams changed by
//                                           set(player, kind, pos) and returns its mean run value
//   v.runs(s, a, b)                         the difference of two measures in runs per team-game
//
// Why: whole games are noisy (a row of 1,000 games has about +-0.1 runs per team-game, and the
// equal-value check needs a few hundredths). Here every condition replays the SAME plate appearances
// (base-out state, batter, pitcher, his pitch count), each pitch from the same random numbers (the
// generator is reseeded before every pitch), so two conditions differ only where the rating changed
// something. A plate appearance is worth RE(after) + runs scored - RE(before) (RE: the runs a team
// still expects to score in the inning from that base-out state). Steals, tag-ups, double plays and
// extra bases taken during it count. Effects that span plate appearances are left out: pitch counts
// (Stamina, and when the CPU changes pitchers) and runners' later trips around the bases (counted when
// they are the runners in another kept plate appearance). The replays play in the first inning with
// the score 0-0 (no walk-offs or extra-inning runners) and the CPU never changes pitchers.
'use strict';
const { averagePair } = require('./testteams');

function key(outs, bases) { return outs * 8 + (bases[0] ? 1 : 0) + (bases[1] ? 2 : 0) + (bases[2] ? 4 : 0); }
function copyBase(b) { return b ? { id: b.id, resp: b.resp, earned: b.earned } : null; }
// A pitcher's in-game record (game.js live): fresh, or copied with its own times-faced map (seen, familiarity).
function freshLive() { return { pitches: 0, outs: 0, runs: 0, bf: 0, seen: {} }; }
function copyLive(l) { return Object.assign({}, l, { seen: Object.assign({}, l.seen) }); }

// Average teams with set(player, kind, pos) applied: kind is 'hitter' or 'pitcher', pos the
// player's lineup position (pitchers: 'P').
function teams(set) {
  const t = averagePair();
  if (!set) return t;
  for (const side of [t.away, t.home]) {
    const pos = {};
    for (const s of side.lineup) pos[s.id] = s.pos;
    for (const id in side.players) {
      const p = side.players[id];
      set(p, p.pitches ? 'pitcher' : 'hitter', pos[id] || 'P');
    }
  }
  return t;
}

// Plays base games and keeps every plate appearance's starting state.
function sample(B3, games, seed, set) {
  const snaps = [], re = {};
  let pa = 0;
  const cpu = B3.manager.cpu;
  for (let n = 0; n < games; n++) {
    const g = B3.game.create(Object.assign(teams(set), { type: 'regular', rng: B3.rng.create('value:' + seed + ':' + n) }));
    const mine = [];
    const ctl = {
      change: (d, gg) => {
        const a = cpu.change(d, gg);
        if (gg.balls === 0 && gg.strikes === 0) {
          const f = gg.teams[d.side];
          const pid = a && a.pitcher ? a.pitcher : f.pitcher;
          // Session 18: with the times-faced map (familiarity, Session 17) copied, so later batters don't change the snapshot
          const live = a && a.pitcher ? freshLive() : copyLive(f.live[pid]);
          const s = { h: gg.half, i: gg.inning, outs: gg.outs, bases: gg.bases.map(copyBase), spot: gg.teams[gg.half].spot,
            pitcher: pid, live: live, ran: gg.halfRuns, k: key(gg.outs, gg.bases) };
          mine.push(s);
        }
        return a;
      }
    };
    B3.game.play(g, [ctl, ctl]);
    for (const e of g.log) if (e.e === 'pa') pa++;
    // Runs the team still scored in the inning from each state (innings 1-8: no walk-offs, no placed runner).
    for (const s of mine) {
      if (s.i <= 8) {
        const left = g.line[s.h][s.i - 1] - s.ran;
        const c = re[s.k] || (re[s.k] = [0, 0]);
        c[0] += left; c[1]++;
      }
      snaps.push(s);
    }
  }
  const RE = [];
  for (let k = 0; k < 24; k++) RE[k] = re[k] ? re[k][0] / re[k][1] : 0;
  return { snaps: snaps, RE: RE, games: games, seed: seed, paPerTeamGame: pa / (2 * games) };
}

// Replays every kept plate appearance with teams changed by `set`. Returns { value, n, counts }:
// value is the mean run value per plate appearance for the batting side.
function measure(B3, s, set, opts) {
  opts = opts || {};
  const seed = 'replay:' + (opts.seed || 1);
  const from = opts.from || 0, to = Math.min(s.snaps.length, opts.to || s.snaps.length);
  const g = B3.game.create(Object.assign(teams(set), { type: 'regular', rng: B3.rng.create(seed) }));
  const cpu = B3.manager.cpu;
  const counts = { pa: 0, K: 0, BB: 0, HR: 0, H: 0, pitches: 0, sb: 0, cs: 0, E: 0, DP: 0, sw: 0, whiff: 0, foul: 0, bip: 0, ev: 0, hard: 0 };
  let sum = 0, sumSq = 0;
  const side = [[0, 0], [0, 0]]; // [sum, n] by batting side (0 away, 1 home), for conditions on one team
  const vals = opts.keep ? new Float64Array(to - from) : null;
  for (let n = from; n < to; n++) {
    const sn = s.snaps[n];
    g.inning = 1; g.half = sn.h; g.outs = sn.outs; g.balls = 0; g.strikes = 0;
    g.bases = sn.bases.map(copyBase);
    g.score = [0, 0]; g.line = [[], []]; g.halfRuns = 0; g.halfPitches = 1; g.walkoff = false;
    g.log = []; g.over = false; g.result = null; g.steal = null; g.pitch = null; g.play = null; g.lastPlay = null;
    const bt = g.teams[sn.h], f = g.teams[1 - sn.h];
    bt.spot = sn.spot;
    f.pitcher = sn.pitcher;
    f.live = {};
    f.live[sn.pitcher] = copyLive(sn.live);
    for (const b of g.bases) if (b && !f.live[b.resp]) f.live[b.resp] = freshLive();
    g.pending = { kind: 'change', side: 1 - sn.h, pitcher: sn.pitcher, bullpen: [] };
    let k = 0, seen = 0, pa = null;
    for (;;) {
      const d = g.pending;
      let a;
      if (d.kind === 'change') { g.rng = B3.rng.create(seed + ':' + n + ':' + (k++)); a = null; counts.pitches++; }
      else a = cpu[d.kind](d, g);
      B3.game.answer(g, a);
      for (; seen < g.log.length; seen++) {
        const e = g.log[seen];
        if (e.e === 'pa') pa = e;
        else if (e.e === 'pitch') { // swings, whiffs and fouls (Session 30: Velocity's strikeouts and whiffs per mph, paired)
          if (e.r === 'S' || e.r === 'F' || e.r === 'X') counts.sw++;
          if (e.r === 'S') counts.whiff++; else if (e.r === 'F') counts.foul++;
          else if (e.r === 'X' && e.ev !== undefined) { counts.bip++; counts.ev += e.ev; if (e.ev >= 95) counts.hard++; }
        } else if (e.e === 'sb') counts.sb++;
        else if (e.e === 'cs') counts.cs++;
      }
      if (pa || g.over || g.half !== sn.h || g.inning !== 1) break;
    }
    // After the plate appearance, from the game itself: a steal on its last pitch counts too (review fix).
    let after = 0;
    if (pa) {
      counts.pa++;
      if (pa.res === 'K' || pa.res === 'BB' || pa.res === 'HR' || pa.res === 'E' || pa.res === 'DP') counts[pa.res]++;
      if (pa.res === '1B' || pa.res === '2B' || pa.res === '3B' || pa.res === 'HR') counts.H++;
    }
    if (!g.over && g.half === sn.h && g.inning === 1 && g.outs < 3) after = s.RE[key(g.outs, g.bases)];
    const v = after + g.score[sn.h] - s.RE[sn.k];
    sum += v; sumSq += v * v;
    side[sn.h][0] += v; side[sn.h][1]++;
    if (vals) vals[n - from] = v;
  }
  const n = to - from;
  return { value: sum / n, n: n, counts: counts, sum: sum, sumSq: sumSq, vals: vals,
    bySide: side.map((x) => (x[1] ? x[0] / x[1] : 0)) };
}

// Runs per team-game between two measures (b - a): the mean value per plate appearance times the
// plate appearances in a team-game.
function runs(s, a, b) { return (b.value - a.value) * s.paPerTeamGame; }

module.exports = { sample, measure, runs, teams, key };
