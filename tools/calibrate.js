// Calibration (M1 step 1.4): the target table (DESIGN.md section 7, with the extra engine targets), the
// equal-value check, defense and running at their key spots, the tendencies and the pitch shape.
// Usage: node tools/calibrate.js [--part=targets,value,defense,styles,shape] [--games=3000] [--samples=1500]
//                                [--seed=1] [--jobs=N] [--only=contact,arm,...] [--tweak=file.js]
//
//   targets  plays --games seeded regular-season games between rated test teams (a league-like spread,
//            tools/lib/testteams.js) and prints each league-wide target with its band
//   value    the equal-value check: +10 points at 40, 60 and 80 for each rating (everyone else at 60),
//            for a whole lineup or staff, in runs per team-game. Target: about TARGET runs, within +-20%.
//   defense  defense and running at their key spots (DESIGN.md section 10, the value rule), for one player:
//            about a hitting rating's lineup value / 9, and less at other spots
//   styles   the tendencies against Balanced: Aggressiveness at Discipline 40, 60, 80; Aim at Command
//            40, 60, 80. Target: within about +-0.1 runs at 60, and paying off the owner's way
//   shape    a ground-ball and a fly-ball shape on every pitch: about 0 (owner's choice: value-neutral)
//
// value, defense, styles and shape use tools/lib/value.js: --samples games of plate appearances between
// average teams, each replayed under every condition with the same random numbers. Work is spread over
// --jobs processes (default: the number of CPUs). --tweak=file.js loads a module function(B3) that changes
// B3.tune first, in every process (for experiments). It prints the report; it checks nothing (exit 0).
'use strict';
const os = require('os');
const path = require('path');
const { fork } = require('child_process');

const TARGET = 0.3; // runs per team-game for +10 points for a whole lineup or staff (Claude's default)
const BAND = 0.2;   // +-20%
const HIT = ['contact', 'timing', 'launch', 'rawPower', 'recognition', 'discipline'];
const PIT = ['velocity', 'command', 'deception', 'grades'];
const LEVELS = [40, 50, 60, 70, 80, 90];

function args() {
  const a = process.argv.slice(2);
  const opt = (k, d) => { const x = a.find((s) => s.startsWith('--' + k + '=')); return x ? x.slice(k.length + 3) : d; };
  return {
    parts: opt('part', 'targets,value,defense,styles,shape').split(','),
    games: parseInt(opt('games', '3000'), 10),
    samples: parseInt(opt('samples', '1500'), 10),
    seed: opt('seed', '1'),
    jobs: parseInt(opt('jobs', String(os.cpus().length)), 10),
    only: opt('only', null),
    tweak: opt('tweak', null) ? path.resolve(opt('tweak')) : null
  };
}

// ---- Conditions (plain data, sent to the workers) ----
// { k: rating, L: level, kind: 'hitter' | 'pitcher', pos: lineup position or null (every player),
//   away: true to change only the away team, tend: [name, word], shape: number, grades: true }
function setFrom(c) {
  if (!c) return null;
  return (p, kind, pos) => {
    if (c.kind && kind !== c.kind) return;
    if (c.pos && pos !== c.pos) return;
    if (c.away && !p.id.startsWith('AWY')) return;
    if (c.grades) for (const t in p.arsenal) p.arsenal[t].grade = c.L;
    else if (c.k) p.ratings[c.k] = c.L;
    if (c.at) for (const k in c.at) p.ratings[k] = c.at[k];
    if (c.tend) p.tendencies[c.tend[0]] = c.tend[1];
    if (c.shape !== undefined) for (const t in p.arsenal) p.arsenal[t].shape = c.shape;
  };
}

// ---- Workers ----
function worker() {
  const { loadCore } = require('./lib/load');
  const V = require('./lib/value');
  const B3 = loadCore();
  const tweak = process.argv[3];
  if (tweak && tweak !== '-') require(tweak)(B3);
  let s = null;
  process.on('message', (m) => {
    if (m.done) process.exit(0);
    if (m.targets) { process.send({ id: m.id, out: targets(B3, m.from, m.to, m.seed) }); return; }
    if (!s) s = V.sample(B3, m.samples, m.seed);
    const r = V.measure(B3, s, setFrom(m.cond), { keep: true });
    process.send({ id: m.id, out: { vals: Array.from(r.vals), hs: s.snaps.map((x) => x.h), pa: s.paPerTeamGame, counts: r.counts } });
  });
  process.send({ ready: true });
}

function pool(jobs, n, tweak, onDone) {
  const res = {};
  let next = 0, active = 0;
  for (let w = 0; w < Math.min(n, jobs.length); w++) {
    const c = fork(__filename, ['--worker', tweak || '-']);
    active++;
    const give = () => { if (next < jobs.length) c.send(jobs[next++]); else c.send({ done: true }); };
    c.on('message', (m) => { if (m.ready) return give(); res[m.id] = m.out; give(); });
    c.on('exit', () => { if (--active === 0) onDone(res); });
  }
}

// ---- Targets: league-wide rates from rated teams ----
function targets(B3, from, to, seed) {
  const { ratedPair } = require('./lib/testteams');
  const c = { games: 0, runs: 0, pa: 0, ab: 0, h: 0, tb: 0, bb: 0, k: 0, sf: 0, d2: 0, d3: 0, hr: 0, e: 0, pitches: 0,
    out: 0, swOut: 0, sw: 0, whiff: 0, sb: 0, cs: 0, spOuts: 0, spPitches: 0, starts: 0, ms: 0,
    plat: { opp: [0, 0, 0, 0], same: [0, 0, 0, 0] } }; // [pa, ab, h + bb, tb] by matchup
  const t0 = Date.now();
  for (let n = from; n < to; n++) {
    const teams = ratedPair(B3.rng.create('teams:' + seed + ':' + n));
    const g = B3.game.sim(Object.assign(teams, { type: 'regular', rng: B3.rng.create(seed + ':' + n) }));
    c.games++;
    c.runs += g.score[0] + g.score[1];
    const starter = [g.teams[0].used[0], g.teams[1].used[0]];
    for (const e of g.log) {
      if (e.e === 'pitch') {
        c.pitches++;
        if (e.p === starter[1 - e.h]) c.spPitches++;
        const zone = B3.data.inZone(e.x, e.z);
        const swung = e.r === 'S' || e.r === 'F' || e.r === 'X';
        if (!zone) { c.out++; if (swung) c.swOut++; }
        if (swung) { c.sw++; if (e.r === 'S') c.whiff++; }
        continue;
      }
      if (e.e === 'sb') { c.sb++; continue; }
      if (e.e === 'cs') { c.cs++; continue; }
      if (e.e !== 'pa') continue;
      if (e.p === starter[1 - e.h]) c.spOuts += e.out;
      c.pa++;
      const bt = g.teams[e.h], pt = g.teams[1 - e.h];
      const bats = bt.inp[e.b].bats, throws = pt.inp[e.p].throws;
      const side = bats === 'S' || bats !== throws ? 'opp' : 'same';
      const pl = c.plat[side];
      pl[0]++;
      if (e.res === 'E') c.e++;
      if (e.res === 'BB') { c.bb++; pl[2]++; continue; }
      if (e.res === 'SF') { c.sf++; continue; }
      c.ab++; pl[1]++;
      if (e.res === 'K') { c.k++; continue; }
      const hit = { '1B': 1, '2B': 2, '3B': 3, HR: 4 }[e.res];
      if (hit) { c.h++; c.tb += hit; pl[2]++; pl[3] += hit; }
      if (e.res === '2B') c.d2++;
      if (e.res === '3B') c.d3++;
      if (e.res === 'HR') c.hr++;
    }
    c.starts += 2;
  }
  c.ms = Date.now() - t0;
  return c;
}

function merge(list) {
  const out = JSON.parse(JSON.stringify(list[0]));
  for (const c of list.slice(1)) {
    for (const k in c) {
      if (k === 'plat') { for (const s of ['opp', 'same']) for (let i = 0; i < 4; i++) out.plat[s][i] += c.plat[s][i]; }
      else out[k] += c[k];
    }
  }
  return out;
}

function targetReport(c) {
  const tg = c.games * 2;
  const rows = [
    ['Runs per team-game', c.runs / tg, 4.3, 4.6, 2],
    ['Strikeout rate %', 100 * c.k / c.pa, 20, 22, 1],
    ['League AVG', c.h / c.ab, 0.255, 0.264, 3],
    ['League SLG', c.tb / c.ab, 0.43, 0.45, 3],
    ['Doubles per team-game', c.d2 / tg, 1.4, null, 2],
    ['Triples per team-game', c.d3 / tg, null, 0.2, 2],
    ['Home runs per team-game', c.hr / tg, 1.4, 1.55, 2],
    ['Walks % of PA', 100 * c.bb / c.pa, 7.5, 8.5, 1],
    ['Chase rate %', 100 * c.swOut / c.out, 28, 32, 1],
    ['Whiffs % of swings', 100 * c.whiff / c.sw, 24, 26, 1],
    ['Pitches per PA', c.pitches / c.pa, 3.8, 3.9, 2],
    ['Starter innings', c.spOuts / 3 / c.starts, 5.3, 5.8, 2],
    ['Starter pitches', c.spPitches / c.starts, 85, 95, 1],
    ['Errors per team-game', c.e / tg, 0.4, 0.6, 2]
  ];
  const lines = ['Targets: ' + c.games + ' regular-season games between rated test teams (DESIGN.md section 7)', ''];
  for (const [name, v, lo, hi, d] of rows) {
    const ok = (lo === null || v >= lo) && (hi === null || v <= hi);
    const band = lo === null ? hi + ' or fewer' : hi === null ? lo + ' or more' : lo + '-' + hi;
    lines.push('  ' + name.padEnd(26) + v.toFixed(d).padStart(7) + '   ' + band.padEnd(14) + (ok ? 'ok' : 'MISS'));
  }
  const obp = (a) => a[2] / a[0], slg = (a) => a[3] / a[1];
  const att = c.sb + c.cs;
  lines.push('');
  lines.push('  Also: OBP ' + ((c.h + c.bb) / (c.ab + c.bb + c.sf)).toFixed(3) + '; steal attempts ' + (att / tg).toFixed(2) + ' a team-game, ' + (100 * c.sb / Math.max(1, att)).toFixed(0) + '% safe');
  lines.push('  Platoon edge: OBP ' + obp(c.plat.opp).toFixed(3) + ' / SLG ' + slg(c.plat.opp).toFixed(3) + ' against opposite-handed pitchers, ' +
    obp(c.plat.same).toFixed(3) + ' / ' + slg(c.plat.same).toFixed(3) + ' against same-handed');
  lines.push('  Speed: ' + (c.ms / c.games).toFixed(2) + ' ms a game in one process, so 2,430 games take about ' + (2430 * c.ms / c.games / 1000).toFixed(1) + ' s');
  lines.push('  (Per-player targets, such as standouts, .300 hitters and the batting champion, need a league and full seasons: M2.)');
  return lines.join('\n');
}

// ---- Value conditions ----
function ratingCond(k, L) {
  if (k === 'grades') return { kind: 'pitcher', grades: true, L: L };
  return { kind: HIT.indexOf(k) >= 0 ? 'hitter' : 'pitcher', k: k, L: L };
}

const DEFENSE = [
  // [label, condition, key spot?, how to read: 'def' runs saved | 'off' runs scored | 'both' (away only)]
  ['Range at SS', { kind: 'hitter', pos: 'SS', k: 'range', L: 70 }, true, 'def'],
  ['Range at CF', { kind: 'hitter', pos: 'CF', k: 'range', L: 70 }, true, 'def'],
  ['Range at 1B', { kind: 'hitter', pos: '1B', k: 'range', L: 70 }, false, 'def'],
  ['Hands at SS', { kind: 'hitter', pos: 'SS', k: 'hands', L: 70 }, true, 'def'],
  ['Hands at 2B', { kind: 'hitter', pos: '2B', k: 'hands', L: 70 }, false, 'def'],
  ['Arm in RF', { kind: 'hitter', pos: 'RF', k: 'arm', L: 70 }, true, 'def'],
  ['Arm at C', { kind: 'hitter', pos: 'C', k: 'arm', L: 70 }, true, 'def'],
  ['Arm in LF', { kind: 'hitter', pos: 'LF', k: 'arm', L: 70 }, false, 'def'],
  ['Framing at C', { kind: 'hitter', pos: 'C', k: 'framing', L: 70 }, true, 'def'],
  ['Speed in CF', { kind: 'hitter', pos: 'CF', k: 'speed', L: 70, away: true }, true, 'both'],
  ['Speed at DH', { kind: 'hitter', pos: 'DH', k: 'speed', L: 70, away: true }, false, 'both'],
  ['Baserunning (lineup / 9)', { kind: 'hitter', k: 'baserunning', L: 70 }, true, 'lineup']
];

const STYLES = [
  ['discipline', 'aggressiveness', ['Patient', 'Aggressive'], 'hitter'],
  ['command', 'aim', ['Nibbler', 'Attacker'], 'pitcher']
];

// Paired difference (b - a) in runs per team-game, with its standard error. side: null for every plate
// appearance, 0 or 1 for those with that side batting.
function diff(a, b, side) {
  let d = 0, d2 = 0, n = 0;
  for (let i = 0; i < a.vals.length; i++) {
    if (side !== null && side !== undefined && a.hs[i] !== side) continue;
    const x = b.vals[i] - a.vals[i];
    d += x; d2 += x * x; n++;
  }
  const m = d / n, sd = Math.sqrt(Math.max(0, d2 / n - m * m));
  return { v: m * a.pa, se: sd / Math.sqrt(n) * a.pa };
}

function fmt(x, d) { return (x >= 0 ? '+' : '') + x.toFixed(d === undefined ? 2 : d); }

function main() {
  const o = args();
  const jobs = [];
  let id = 0;
  const want = (k) => !o.only || o.only.split(',').indexOf(k) >= 0;
  const plan = { value: [], defense: [], styles: [], shape: [], targets: [] };
  const add = (cond) => { const j = { id: id++, cond: cond, samples: o.samples, seed: o.seed }; jobs.push(j); return j.id; };
  const needReplays = o.parts.some((p) => p !== 'targets');
  const base = needReplays ? add(null) : null;
  if (o.parts.indexOf('value') >= 0) {
    for (const k of HIT.concat(PIT)) {
      if (!want(k)) continue;
      plan.value.push({ k: k, ids: LEVELS.map((L) => (L === 60 ? base : add(ratingCond(k, L)))) });
    }
  }
  if (o.parts.indexOf('defense') >= 0) {
    for (const [label, cond, key, read] of DEFENSE) if (want(cond.k)) plan.defense.push({ label, key, read, id: add(cond) });
    if (o.parts.indexOf('value') < 0) plan.defense.hit = HIT.map((k) => add(ratingCond(k, 70)));
  }
  if (o.parts.indexOf('styles') >= 0) {
    for (const [rating, tend, words, kind] of STYLES) {
      for (const at of [40, 60, 80]) {
        const a = {}; a[rating] = at;
        const bal = at === 60 ? base : add({ kind: kind, at: a });
        plan.styles.push({ rating, at, cells: words.map((w) => ({ w, bal, id: add({ kind: kind, at: a, tend: [tend, w] }) })) });
      }
    }
  }
  if (o.parts.indexOf('shape') >= 0) for (const sh of [0.5, -0.5, 1, -1]) plan.shape.push({ sh, id: add({ kind: 'pitcher', shape: sh }) });
  if (o.parts.indexOf('targets') >= 0) {
    const per = Math.ceil(o.games / o.jobs);
    for (let f = 0; f < o.games; f += per) { const j = { id: id++, targets: true, from: f, to: Math.min(o.games, f + per), seed: o.seed }; jobs.push(j); plan.targets.push(j.id); }
  }
  // Long jobs first (the target games), so the pool ends together.
  jobs.sort((a, b) => (b.targets ? 1 : 0) - (a.targets ? 1 : 0));
  const t0 = Date.now();
  pool(jobs, o.jobs, o.tweak, (res) => {
    const out = [];
    if (plan.targets.length) out.push(targetReport(merge(plan.targets.map((i) => res[i]))), '');
    const B = base !== null ? res[base] : null;
    let lineupValue = null;
    if (plan.value.length) {
      out.push('Equal-value check (Claude\'s default): +10 points at 40, 60 and 80, everyone else at 60, for a whole lineup or staff.');
      out.push('Runs per team-game (pitching rows: runs allowed, shown as runs saved). Target about ' + TARGET + ', within +-' + (100 * BAND) + '% (' +
        (TARGET * (1 - BAND)).toFixed(2) + '-' + (TARGET * (1 + BAND)).toFixed(2) + '). ' + B.vals.length + ' plate appearances replayed per condition.');
      out.push('');
      out.push('  rating        40->50         50->60         60->70         70->80         80->90       check (40, 60, 80)');
      const all = [];
      for (const row of plan.value) {
        const sign = HIT.indexOf(row.k) >= 0 ? 1 : -1;
        const steps = [];
        for (let i = 0; i + 1 < LEVELS.length; i++) {
          const d = diff(res[row.ids[i]], res[row.ids[i + 1]]);
          steps.push({ v: sign * d.v, se: d.se });
        }
        const check = [steps[0], steps[2], steps[4]];
        const ok = check.every((s) => Math.abs(s.v - TARGET) <= BAND * TARGET);
        if (sign > 0) all.push(steps[2].v);
        out.push('  ' + row.k.padEnd(12) + steps.map((s) => (s.v.toFixed(3) + '±' + s.se.toFixed(3)).padStart(15)).join('') + '   ' + (ok ? 'ok' : 'MISS'));
      }
      if (all.length) lineupValue = all.reduce((a, b) => a + b, 0) / all.length;
      out.push('');
    }
    if (plan.defense.length) {
      if (lineupValue === null && plan.defense.hit) lineupValue = plan.defense.hit.map((i) => diff(B, res[i]).v).reduce((a, b) => a + b, 0) / plan.defense.hit.length;
      const per = lineupValue / 9;
      out.push('Defense and running, one player at 70 (everyone else 60), runs per team-game. The value rule: at its key spot about a hitting');
      out.push('rating\'s lineup value / 9 = ' + per.toFixed(3) + ' (+-20%: ' + (per * 0.8).toFixed(3) + '-' + (per * 1.2).toFixed(3) + '), less elsewhere.');
      out.push('');
      for (const d of plan.defense) {
        let txt;
        let v;
        if (d.read === 'def') { const x = diff(B, res[d.id]); v = -x.v; txt = 'saves ' + v.toFixed(3) + '±' + x.se.toFixed(3); }
        else if (d.read === 'lineup') { const x = diff(B, res[d.id]); v = x.v / 9; txt = 'adds ' + v.toFixed(3) + '±' + (x.se / 9).toFixed(3) + ' (lineup ' + x.v.toFixed(3) + ')'; }
        else {
          // Only the away team changed: its offense in the top halves, its defense in the bottom halves.
          const off = diff(B, res[d.id], 0), def = diff(B, res[d.id], 1);
          v = off.v - def.v;
          txt = 'total ' + v.toFixed(3) + ' (running ' + off.v.toFixed(3) + '±' + off.se.toFixed(3) + ', fielding ' + (-def.v).toFixed(3) + '±' + def.se.toFixed(3) + ')';
        }
        const ok = d.key ? Math.abs(v - per) <= 0.2 * per : v < per * 1.2;
        out.push('  ' + d.label.padEnd(26) + txt.padEnd(58) + (d.key ? 'key spot  ' : 'elsewhere ') + (ok ? 'ok' : 'MISS'));
      }
      out.push('');
    }
    if (plan.styles.length) {
      out.push('Tendencies against Balanced at the same rating (runs per team-game for a whole lineup or staff; Aim rows are runs allowed,');
      out.push('below 0 is better for the pitcher). Target: within about +-0.1 at 60; Aggressive better as Discipline rises, Nibbler as Command rises.');
      for (const st of plan.styles) {
        out.push('  ' + (st.rating + ' ' + st.at).padEnd(16) + st.cells.map((c) => { const x = diff(res[c.bal], res[c.id]); return c.w.padEnd(11) + fmt(x.v, 3) + '±' + x.se.toFixed(3); }).join('    '));
      }
      out.push('');
    }
    if (plan.shape.length) {
      out.push('Pitch shape on every pitch (owner\'s choice: value-neutral), runs allowed per team-game against shape 0:');
      out.push('  ' + plan.shape.map((p) => 'shape ' + fmt(p.sh, 1) + ' ' + fmt(diff(B, res[p.id]).v, 3) + '±' + diff(B, res[p.id]).se.toFixed(3)).join('    '));
      out.push('');
    }
    out.push('(' + ((Date.now() - t0) / 1000).toFixed(0) + ' s, ' + o.jobs + ' processes' + (o.tweak ? ', tweak ' + o.tweak : '') + ')');
    console.log(out.join('\n'));
  });
}

if (process.argv[2] === '--worker') worker();
else if (require.main === module) main();

module.exports = { TARGET, BAND, setFrom, targets, targetReport, merge, diff };
