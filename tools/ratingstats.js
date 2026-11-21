// Ratings against real stats (M1 step 1.5; DESIGN.md section 10, "Ratings measured against stats").
// Usage: node tools/ratingstats.js [--games=400] [--only=contact,velocity,...] [--seed=1] [--jobs=N]
//                                  [--tweak=file.js] [--json=out.json]
// For each rating it moves one side's players to 20, 30, ... 99 (everyone else at 60, Balanced) and reads:
//   layer 1  the rating's own stat (the one that isolates its job) against the real ladder: the real
//            players' percentiles mirrored around the 50th (owner's choice, Session 8): 20 = the worst
//            player-season, 30 = 1st percentile, 40 = 5th, 50 = 25th, 60 = 50th, 70 = 75th, 80 = 95th,
//            90 = 99th, 99 = the best (tools/lib/real.js, 2024-2026)
//   layer 2  each unit's effect (per mph of fastball, ...) between 50 and 70, against the real slope
//   and the downstream stats (K%, BB%, AVG, OBP, SLG, exit speed ...) for reading.
// Direct physical inputs (bat speed, fastball speed, sprint speed, arm, Stamina) are read from the
// rating hooks without games. --json writes every number for the chart page. It checks nothing (exit 0).
// The population check (layer 3) and the chart page come next (step 1.5 task 2).
'use strict';
const os = require('os');
const path = require('path');
const fs = require('fs');
const { fork } = require('child_process');

const LEVELS = [20, 30, 40, 50, 60, 70, 80, 90, 99];
const ANCHOR = { 20: 'min', 30: 'p1', 40: 'p5', 50: 'p25', 60: 'p50', 70: 'p75', 80: 'p95', 90: 'p99', 99: 'max' };
const FB = { FF: 1, SI: 1, FC: 1 };
const OFF = { SL: 1, CU: 1, CH: 1, FS: 1 };

// Each rating: the side it changes (kind), its own stats (engine key, real key, sign: + when a higher
// rating means a higher real stat), and its per-unit check (engine x, engine y, real slope key).
const RATINGS = {
  contact: { kind: 'hitter', own: [['zContact', 'bat.iz_contact_percent', 1], ['whiff', 'bat.whiff_percent', -1]] },
  timing: { kind: 'hitter', own: [['whiff95', 'vs95.whiff_per_swing', -1]] },
  launch: { kind: 'hitter', own: [['sweet', 'bat.sweet_spot_percent', 1], ['pu', 'bat.popups_percent', -1]] },
  rawPower: { kind: 'hitter', own: [['batSpeed', 'track.avg_bat_speed', 1], ['maxEV', 'evbat.max_hit_speed', 1], ['ev50', 'evbat.ev50', 1]],
    unit: ['batSpeed', 'maxEV', 'batspeed.max_hit_speed'] },
  recognition: { kind: 'hitter', own: [['offWhiff', 'off.whiff_per_swing', -1], ['offChaseMinusFb', 'off.chase_minus_fb', -1]] },
  discipline: { kind: 'hitter', own: [['zMinusO', 'bat.zswing_minus_chase', 1], ['chase', 'bat.oz_swing_percent', -1]] },
  velocity: { kind: 'pitcher', own: [['fbSpeed', 'pit.ff_avg_speed', 1]],
    units: [['fbSpeed', 'k', 'dvelo.k_percent'], ['fbSpeed', 'whiff', 'velo.whiff_percent'], ['fbSpeed', 'ev', 'velo.exit_velocity_avg'], ['fbSpeed', 'hard', 'velo.hard_hit_percent']] },
  command: { kind: 'pitcher', own: [['edge', 'pit.edge_percent', 1], ['meatball', 'pit.meatball_percent', -1]] },
  deception: { kind: 'pitcher', own: [['chase', 'pit.oz_swing_percent', 1]] },
  grades: { kind: 'pitcher', own: [['whiffSL', 'type.SL.whiff', 1], ['whiffCH', 'type.CH.whiff', 1], ['whiffCU', 'type.CU.whiff', 1]] },
  speed: { kind: 'hitter', own: [['sprint', 'run.sprint_speed', 1], ['hpTo1b', 'run.hp_to_1b', -1]] },
  arm: { kind: 'hitter', own: [['armRF', 'arm.rf', 1], ['armSS', 'arm.ss', 1]] },
  stamina: { kind: 'pitcher', own: [['staminaPitches', null, 1]] }
};

function args() {
  const a = process.argv.slice(2);
  const opt = (k, d) => { const x = a.find((s) => s.startsWith('--' + k + '=')); return x ? x.slice(k.length + 3) : d; };
  return {
    games: parseInt(opt('games', '400'), 10),
    seed: opt('seed', '1'),
    jobs: parseInt(opt('jobs', String(os.cpus().length)), 10),
    only: opt('only', null),
    tweak: opt('tweak', null) ? path.resolve(opt('tweak')) : null,
    json: opt('json', null)
  };
}

// ---- Measuring one condition (in a worker) ----
function newAcc() {
  return { games: 0, runs: 0, pa: 0, ab: 0, k: 0, bb: 0, h1: 0, h2: 0, h3: 0, hr: 0, sf: 0,
    n: 0, zone: 0, sw: 0, zsw: 0, osw: 0, out: 0, contact: 0, zcontact: 0, whiff: 0, foul: 0,
    heart: 0, shadow: 0, chaseZ: 0, waste: 0, meat: 0, shTake: 0, shCalled: 0,
    fbN: 0, fbV: 0, offSw: 0, offWhiff: 0, offOut: 0, offOutSw: 0, fbOut: 0, fbOutSw: 0, sw95: 0, whiff95: 0,
    bySw: {}, byWhiff: {},
    bip: 0, evSum: 0, evs: [], laSum: 0, laSq: 0, hard: 0, barrel: 0, sweet: 0, gb: 0, ld: 0, fb: 0, pu: 0,
    pull: 0, straight: 0, oppo: 0, squared: 0, batSpeedSum: 0, swings: 0 };
}

function barrel(ev, la) {
  if (ev < 98) return false;
  if (ev >= 116) return la >= 8 && la <= 50;
  const lo = ev < 100 ? 26 - (ev - 98) : 24 - (ev - 100);
  const hi = ev < 100 ? 30 + 1.5 * (ev - 98) : 33 + (ev - 100) * 17 / 16;
  return la >= lo && la <= hi;
}

// Savant's attack zones, from the strike zone's half-width and half-height: heart inside 67%, shadow
// 67-133%, chase 133-200%, waste beyond. Meatball: the middle ninth of the zone (Claude's reading).
function attack(B3, x, z) {
  const Z = B3.data.ZONE, mid = (Z.top + Z.bottom) / 2, hh = (Z.top - Z.bottom) / 2;
  const u = Math.max(Math.abs(x) / Z.halfWidth, Math.abs(z - mid) / hh);
  const meat = Math.abs(x) <= Z.halfWidth / 3 && Math.abs(z - mid) <= hh / 3;
  return { zone: u <= 0.67 ? 'heart' : u <= 1.33 ? 'shadow' : u <= 2 ? 'chase' : 'waste', meat: meat };
}

function measure(B3, cond, games, seed) {
  const { averagePair } = require('./lib/testteams');
  const S = B3.tune.SWING;
  const a = newAcc();
  const side = cond.kind === 'hitter' ? 0 : 1; // the half whose events we read: away bats (0) or away pitches (1)
  for (let n = 0; n < games; n++) {
    const teams = averagePair();
    for (const id in teams.away.players) {
      const p = teams.away.players[id];
      const kind = p.pitches ? 'pitcher' : 'hitter';
      if (kind !== cond.kind) continue;
      if (cond.k === 'grades') for (const t in p.arsenal) p.arsenal[t].grade = cond.L;
      else p.ratings[cond.k] = cond.L;
    }
    const g = B3.game.sim(Object.assign(teams, { type: 'regular', rng: B3.rng.create('rs:' + seed + ':' + n) }));
    a.games++;
    a.runs += g.score[side === 0 ? 0 : 1];
    const bt = g.teams[side], pt = g.teams[1 - side];
    for (const e of g.log) {
      if (e.h !== side) continue;
      if (e.e === 'pa') {
        a.pa++;
        const r = e.res;
        if (r === 'K') a.k++; else if (r === 'BB') a.bb++; else if (r === 'SF') a.sf++;
        if (r === '1B') a.h1++; else if (r === '2B') a.h2++; else if (r === '3B') a.h3++; else if (r === 'HR') a.hr++;
        if (r !== 'BB' && r !== 'SF') a.ab++;
        continue;
      }
      if (e.e !== 'pitch') continue;
      a.n++;
      const inZ = B3.data.inZone(e.x, e.z);
      const swung = e.r === 'S' || e.r === 'F' || e.r === 'X';
      const az = attack(B3, e.x, e.z);
      a[az.zone === 'chase' ? 'chaseZ' : az.zone]++;
      if (az.meat) a.meat++;
      if (az.zone === 'shadow' && !swung) { a.shTake++; if (e.r === 'C') a.shCalled++; }
      if (FB[e.t]) { a.fbN++; a.fbV += e.v; }
      if (inZ) a.zone++; else a.out++;
      if (!swung) continue;
      a.sw++;
      if (inZ) a.zsw++; else a.osw++;
      a.bySw[e.t] = (a.bySw[e.t] || 0) + 1;
      const bi = bt.inp[e.b];
      a.swings++;
      a.batSpeedSum += bi.bat.batSpeed;
      if (e.r === 'S') { a.whiff++; a.byWhiff[e.t] = (a.byWhiff[e.t] || 0) + 1; } else { a.contact++; if (inZ) a.zcontact++; }
      if (e.r === 'F') a.foul++;
      if (OFF[e.t]) { a.offSw++; if (e.r === 'S') a.offWhiff++; }
      if (!inZ && OFF[e.t]) { a.offOutSw++; }
      if (!inZ && FB[e.t]) { a.fbOutSw++; }
      if (e.v >= 95) { a.sw95++; if (e.r === 'S') a.whiff95++; }
      if (e.r === 'X' && e.ev !== undefined) {
        a.bip++;
        a.evSum += e.ev; a.evs.push(e.ev);
        a.laSum += e.la; a.laSq += e.la * e.la;
        if (e.ev >= 95) a.hard++;
        if (barrel(e.ev, e.la)) a.barrel++;
        if (e.la >= 8 && e.la <= 32) a.sweet++;
        if (e.la < 10) a.gb++; else if (e.la < 25) a.ld++; else if (e.la <= 50) a.fb++; else a.pu++;
        const pi = pt.inp[e.p];
        const bats = bi.bats === 'S' ? (pi.throws === 'L' ? 'R' : 'L') : bi.bats;
        const toward = bats === 'R' ? -e.sp : e.sp; // plus is the pull side
        if (toward > 15) a.pull++; else if (toward < -15) a.oppo++; else a.straight++;
        const top = S.collision * e.v * S.plateShare + (1 + S.collision) * bi.bat.batSpeed;
        if (e.ev >= 0.8 * top) a.squared++;
      }
    }
    // Pitches outside the zone by class (for chase on off-speed and on fastballs).
    for (const e of g.log) {
      if (e.h !== side || e.e !== 'pitch' || B3.data.inZone(e.x, e.z)) continue;
      if (OFF[e.t]) a.offOut++;
      if (FB[e.t]) a.fbOut++;
    }
  }
  return a;
}

// Summary stats from an accumulator.
function stats(a) {
  const pc = (x, y) => (y ? 100 * x / y : NaN);
  const evs = a.evs.slice().sort((x, y) => x - y);
  const half = evs.slice(Math.floor(evs.length / 2));
  // Max exit speed per 400 batted balls (a regular's season), averaged over chunks.
  let maxSum = 0, chunks = 0;
  for (let i = 0; i + 400 <= a.evs.length; i += 400) { maxSum += Math.max.apply(null, a.evs.slice(i, i + 400)); chunks++; }
  const h = a.h1 + a.h2 + a.h3 + a.hr;
  const laMean = a.laSum / a.bip;
  const out = {
    runs: a.runs / a.games, pa: a.pa,
    k: pc(a.k, a.pa), bb: pc(a.bb, a.pa), avg: h / a.ab, obp: (h + a.bb) / (a.pa), slg: (a.h1 + 2 * a.h2 + 3 * a.h3 + 4 * a.hr) / a.ab,
    hrPa: pc(a.hr, a.pa), babip: (h - a.hr) / (a.ab - a.k - a.hr + a.sf),
    swing: pc(a.sw, a.n), zone: pc(a.zone, a.n), zSwing: pc(a.zsw, a.zone), chase: pc(a.osw, a.out),
    zMinusO: pc(a.zsw, a.zone) - pc(a.osw, a.out),
    whiff: pc(a.whiff, a.sw), zContact: pc(a.zcontact, a.zsw), contactPct: pc(a.contact, a.sw),
    edge: pc(a.shadow, a.n), meatball: pc(a.meat, a.n), heart: pc(a.heart, a.n), framingStrike: pc(a.shCalled, a.shTake),
    fbSpeed: a.fbV / a.fbN,
    offWhiff: pc(a.offWhiff, a.offSw), offChase: pc(a.offOutSw, a.offOut), fbChase: pc(a.fbOutSw, a.fbOut),
    offChaseMinusFb: pc(a.offOutSw, a.offOut) - pc(a.fbOutSw, a.fbOut), whiff95: pc(a.whiff95, a.sw95),
    ev: a.evSum / a.bip, ev50: half.reduce((x, y) => x + y, 0) / half.length, maxEV: chunks ? maxSum / chunks : NaN,
    ev90: evs[Math.floor(0.9 * evs.length)],
    hard: pc(a.hard, a.bip), barrel: pc(a.barrel, a.bip), sweet: pc(a.sweet, a.bip), la: laMean,
    laSd: Math.sqrt(a.laSq / a.bip - laMean * laMean),
    gb: pc(a.gb, a.bip), ld: pc(a.ld, a.bip), fb: pc(a.fb, a.bip), pu: pc(a.pu, a.bip),
    pull: pc(a.pull, a.bip), straight: pc(a.straight, a.bip), oppo: pc(a.oppo, a.bip),
    squared: pc(a.squared, a.contact), batSpeed: a.batSpeedSum / a.swings
  };
  for (const t of ['FF', 'SI', 'FC', 'SL', 'CU', 'CH', 'FS']) out['whiff' + t] = pc(a.byWhiff[t] || 0, a.bySw[t] || 0);
  return out;
}

// Direct inputs, no games: what one rating sets in the physics.
function direct(B3, k, L) {
  const inp = B3.ratings.inputs({ id: 'x', pitches: ['FF'], ratings: { [k]: L } });
  const P = B3.tune.POS;
  const out = {};
  if (k === 'rawPower') out.batSpeed = inp.bat.batSpeed;
  if (k === 'velocity') out.fbSpeed = inp.pit.velo;
  if (k === 'speed') { out.sprint = inp.run.speed; out.hpTo1b = B3.tune.BALL.batterBox + B3.ball.runTime(90, inp.run.speed, 0); }
  if (k === 'arm') { out.armRF = P.RF[1] + (inp.fld.armPlus || 0); out.armSS = P.SS[1] + (inp.fld.armPlus || 0); }
  if (k === 'stamina') out.staminaPitches = B3.ratings.stamina(L);
  return out;
}

// ---- Workers ----
function worker() {
  const { loadCore } = require('./lib/load');
  const B3 = loadCore();
  const tweak = process.argv[3];
  if (tweak && tweak !== '-') require(tweak)(B3);
  process.on('message', (m) => {
    if (m.done) process.exit(0);
    process.send({ id: m.id, out: measure(B3, m.cond, m.games, m.seed) });
  });
  process.send({ ready: true });
}

function pool(jobs, n, tweak, onDone) {
  const res = {};
  if (!jobs.length) { onDone(res); return; }
  let next = 0, active = 0;
  for (let w = 0; w < Math.min(n, jobs.length); w++) {
    const c = fork(__filename, ['--worker', tweak || '-']);
    active++;
    const give = () => { if (next < jobs.length) c.send(jobs[next++]); else c.send({ done: true }); };
    c.on('message', (m) => { if (m.ready) return give(); res[m.id] = m.out; give(); });
    c.on('exit', (code) => { if (code) console.error('a worker stopped with code ' + code); if (--active === 0) onDone(res); });
  }
}

function merge(list) {
  const a = newAcc();
  for (const b of list) {
    for (const k in a) {
      if (Array.isArray(a[k])) a[k] = a[k].concat(b[k]);
      else if (typeof a[k] === 'object') { for (const t in b[k]) a[k][t] = (a[k][t] || 0) + b[k][t]; }
      else a[k] += b[k];
    }
  }
  return a;
}

// ---- The ladder ----
function ladder(real, key, sign) {
  const s = real.pct[key];
  if (!s) return null;
  const t = {};
  for (const L of LEVELS) {
    const q = ANCHOR[L];
    const mirror = { min: 'max', p1: 'p99', p5: 'p95', p25: 'p75', p50: 'p50', p75: 'p25', p95: 'p5', p99: 'p1', max: 'min' };
    t[L] = s[sign > 0 ? q : mirror[q]];
  }
  return t;
}

function fmt(x, d) { return Number.isFinite(x) ? x.toFixed(d === undefined ? 1 : d) : '-'; }

function main() {
  const o = args();
  const real = require('./lib/real');
  const { loadCore } = require('./lib/load');
  const B3 = loadCore();
  if (o.tweak) require(o.tweak)(B3);
  const names = o.only ? o.only.split(',') : Object.keys(RATINGS);
  const chunk = Math.max(1, Math.ceil(o.games / 4));
  const jobs = [];
  for (const k of names) {
    const R = RATINGS[k];
    if (!R) { console.error('unknown rating ' + k); process.exit(1); }
    if (k === 'speed' || k === 'arm' || k === 'stamina') continue; // direct only for now
    for (const L of LEVELS) {
      for (let c = 0; c * chunk < o.games; c++) {
        jobs.push({ id: k + ':' + L + ':' + c, cond: { k: k, L: L, kind: R.kind }, games: Math.min(chunk, o.games - c * chunk), seed: o.seed + ':' + c });
      }
    }
  }
  const t0 = Date.now();
  pool(jobs, o.jobs, o.tweak, (res) => {
    const out = { games: o.games, levels: LEVELS, ratings: {} };
    for (const k of names) {
      const R = RATINGS[k];
      const rows = {};
      for (const L of LEVELS) {
        const parts = Object.keys(res).filter((id) => id.startsWith(k + ':' + L + ':')).map((id) => res[id]);
        rows[L] = Object.assign(parts.length ? stats(merge(parts)) : {}, direct(B3, k, L));
      }
      const own = R.own.map(([ek, rk, sign]) => ({ engine: ek, real: rk, sign: sign, target: rk ? ladder(real, rk, sign) : null,
        values: LEVELS.map((L) => rows[L][ek]) }));
      out.ratings[k] = { kind: R.kind, rows: rows, own: own };
      console.log('\n' + k + ' (' + R.kind + 's; ' + (jobs.some((j) => j.cond.k === k) ? o.games + ' games per level' : 'direct') + ')');
      console.log('  level ' + LEVELS.map((L) => String(L).padStart(7)).join(''));
      for (const ow of own) {
        console.log('  ' + ow.engine.padEnd(16).slice(0, 16) + LEVELS.map((L) => fmt(rows[L][ow.engine], 2).padStart(7)).join(''));
        if (ow.target) console.log('  real ' + (ow.real.padEnd(11).slice(0, 11)) + LEVELS.map((L) => fmt(ow.target[L], 2).padStart(7)).join(''));
      }
      if (jobs.some((j) => j.cond.k === k)) {
        for (const [lab, key, d] of [['K%', 'k', 1], ['BB%', 'bb', 1], ['AVG', 'avg', 3], ['SLG', 'slg', 3], ['EV', 'ev', 1], ['hard%', 'hard', 1], ['runs', 'runs', 2]]) {
          console.log('  ' + lab.padEnd(16) + LEVELS.map((L) => fmt(rows[L][key], d).padStart(7)).join(''));
        }
      }
      const units = R.units || (R.unit ? [R.unit] : []);
      for (const [ex, ey, rk] of units) {
        const a = rows[50], b = rows[70];
        const per = (b[ey] - a[ey]) / (b[ex] - a[ex]);
        const rs = real.slope[rk];
        if (Number.isFinite(per)) console.log('  per unit of ' + ex + ', ' + ey + ' (50 to 70): engine ' + fmt(per, 3) + ', real ' + (rs ? fmt(rs.per, 3) + ' +- ' + fmt(rs.se, 3) + ' (' + rk + ')' : 'n/a'));
      }
    }
    console.log('\n(' + Math.round((Date.now() - t0) / 1000) + ' s, ' + o.jobs + ' processes)');
    if (o.json) fs.writeFileSync(o.json, JSON.stringify(out));
  });
}

if (process.argv[2] === '--worker') worker();
else if (require.main === module) main();
module.exports = { RATINGS, LEVELS, ANCHOR, ladder, stats, measure, newAcc, merge, barrel, attack };
