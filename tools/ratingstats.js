// Ratings against real stats (M1 step 1.5; DESIGN.md section 10, "Ratings measured against stats").
// Usage: node tools/ratingstats.js [--games=400] [--only=contact,velocity,...] [--seed=1] [--jobs=N]
//                                  [--tweak=file.js] [--json=out.json] [--part=sweep,pop] [--popteams=40]
//                                  [--html=page.html] [--value=calibrate.json] [--popkind=hitter|pitcher]
// For each rating it moves one side's players to 20, 30, ... 99 (everyone else at 60, Balanced) and reads:
//   layer 1  the rating's own stat (the one that isolates its job) against the real ladder: the real
//            players' percentiles mirrored around the 50th (owner's choice, Session 8): 20 = the worst
//            player-season, 30 = 1st percentile, 40 = 5th, 50 = 25th, 60 = 50th, 70 = 75th, 80 = 95th,
//            90 = 99th, 99 = the best (tools/lib/real.js, 2024-2026)
//   layer 2  each unit's effect (per mph of fastball, ...) between 50 and 70, against the real slope
//   and the downstream stats (K%, BB%, AVG, OBP, SLG, exit speed ...) for reading.
// Direct physical inputs (bat speed, fastball speed, sprint speed, arm, Stamina) are read from the
// rating hooks without games. --json writes every number for the chart page. It checks nothing (exit 0).
// --part=pop adds the population check (layer 3); --html writes the chart page (tools/lib/ratingspage.js),
// with the equal-value tables from `node tools/calibrate.js --part=value --json=file` when --value=file.
'use strict';
const os = require('os');
const path = require('path');
const fs = require('fs');
const { fork } = require('child_process');

const LEVELS = [20, 30, 40, 50, 60, 70, 80, 90, 99];
const ANCHOR = { 20: 'min', 30: 'p1', 40: 'p5', 50: 'p25', 60: 'p50', 70: 'p75', 80: 'p95', 90: 'p99', 99: 'max' };
const FB = { FF: 1, SI: 1, FC: 1 };
const OFF = { SL: 1, CU: 1, CH: 1, FS: 1 };
// The swing curve (Session 15): bins of feet from the zone's edge (below 0 inside; upper bounds).
const CURVE_BINS = [-0.4, -0.2, 0, 0.2, 0.4, 0.7, 1, Infinity];
const CURVE_LABELS = ['i.4+', 'i.2-.4', 'i0-.2', 'o0-.2', 'o.2-.4', 'o.4-.7', 'o.7-1', 'o1+']; // i: inside the zone, o: off it

// Each rating: the side it changes (kind), its own stats (engine key, real key, sign: + when a higher
// rating means a higher real stat), and its per-unit check (engine x, engine y, real slope key).
const RATINGS = {
  contact: { kind: 'hitter', own: [['zContact', 'bat.iz_contact_percent', 1], ['whiff', 'bat.whiff_percent', -1]] },
  // Timing's job is squaring up (owner's choice, Session 11, from real data: whiff against 95+ mph is fastball whiff, Contact's);
  // whiff against 95+ stays in the report (whiff95) as a check of Contact and Velocity.
  timing: { kind: 'hitter', own: [['squared', 'track.squared_up_per_bat_contact', 1]] },
  launch: { kind: 'hitter', own: [['sweet', 'bat.sweet_spot_percent', 1], ['pu', 'bat.popups_percent', -1]] },
  // Raw Power's per-mph checks (step 1.5, owner's choice, Session 10: a faster bat costs accuracy, so each mph moves
  // whiffs, squared-up % and average exit speed as it does across real hitters).
  rawPower: { kind: 'hitter', own: [['batSpeed', 'track.avg_bat_speed', 1], ['maxEV', 'evbat.max_hit_speed', 1], ['ev50', 'evbat.ev50', 1], ['fast', 'track.hard_swing_rate', 1]],
    units: [['batSpeed', 'maxEV', 'batspeed.max_hit_speed'], ['batSpeed', 'ev50', 'batspeed.ev50'], ['batSpeed', 'ev', 'batspeed.avg_hit_speed'],
      ['batSpeed', 'whiff', 'batspeed.whiff_percent'], ['batSpeed', 'zContact', 'batspeed.iz_contact_percent'], ['batSpeed', 'k', 'batspeed.k_percent'],
      ['batSpeed', 'squared', 'batspeed.squared_up_per_bat_contact'], ['batSpeed', 'hard', 'batspeed.hard_hit_percent'],
      ['batSpeed', 'barrel', 'batspeed.barrel_batted_rate'], ['batSpeed', 'iso', 'batspeed.isolated_power']] },
  recognition: { kind: 'hitter', own: [['offWhiff', 'off.whiff_per_swing', -1], ['offChaseMinusFb', 'off.chase_minus_fb', -1]] },
  discipline: { kind: 'hitter', own: [['zMinusO', 'bat.zswing_minus_chase', 1], ['chase', 'bat.oz_swing_percent', -1]] },
  velocity: { kind: 'pitcher', own: [['fbSpeed', 'pit.ff_avg_speed', 1]],
    units: [['fbSpeed', 'k', 'dvelo.k_percent'], ['fbSpeed', 'whiff', 'velo.whiff_percent'], ['fbSpeed', 'ev', 'velo.exit_velocity_avg'], ['fbSpeed', 'hard', 'velo.hard_hit_percent']] },
  // Command's own stats: walk % and edge % (owner's choice, Session 14: meatball % follows zone %, so it moved to Aim).
  command: { kind: 'pitcher', own: [['bb', 'pit.bb_percent', -1], ['edge', 'pit.edge_percent', 1]] },
  deception: { kind: 'pitcher', own: [['chase', 'pit.oz_swing_percent', 1]] },
  grades: { kind: 'pitcher', own: [['whiffSL', 'type.SL.whiff', 1], ['whiffCH', 'type.CH.whiff', 1], ['whiffCU', 'type.CU.whiff', 1]] },
  speed: { kind: 'hitter', own: [['sprint', 'run.sprint_speed', 1], ['hpTo1b', 'run.hp_to_1b', -1]] },
  arm: { kind: 'hitter', own: [['armRF', 'arm.rf', 1], ['armSS', 'arm.ss', 1]] },
  // Stamina (Session 16): only the starter moves; his pitches and innings per start against real starters' (Baseball-Reference
  // 2024-2026, 10+ starts), and the pitches before fatigue it sets.
  stamina: { kind: 'pitcher', only: 'SP', own: [['pps', 'sp.pitches_per_start', 1], ['ipps', 'sp.innings_per_start', 1], ['staminaPitches', null, 1]] }
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
    json: opt('json', null),
    parts: opt('part', 'sweep,pop').split(','),
    html: opt('html', null),
    value: opt('value', null),
    popTeams: parseInt(opt('popteams', '40'), 10),
    popKind: opt('popkind', null) // only the hitters' or the pitchers' population (Session 14)
  };
}

// ---- Measuring one condition (in a worker) ----
function newAcc() {
  return { games: 0, runs: 0, pa: 0, ab: 0, k: 0, bb: 0, h1: 0, h2: 0, h3: 0, hr: 0, sf: 0,
    n: 0, zone: 0, sw: 0, zsw: 0, osw: 0, out: 0, contact: 0, zcontact: 0, ocontact: 0, whiff: 0, foul: 0,
    heart: 0, shadow: 0, chaseZ: 0, waste: 0, meat: 0, shTake: 0, shCalled: 0,
    fbN: 0, fbV: 0, offSw: 0, offWhiff: 0, offOut: 0, offOutSw: 0, fbOut: 0, fbOutSw: 0, sw95: 0, whiff95: 0,
    bySw: {}, byWhiff: {}, paBy: {}, curve: {}, zc: {},
    bip: 0, evSum: 0, evs: [], laSum: 0, laSq: 0, hard: 0, barrel: 0, sweet: 0, gb: 0, ld: 0, fb: 0, pu: 0, starts: 0, spPitches: 0, spOuts: 0,
    pull: 0, straight: 0, oppo: 0, squared: 0, blast: 0, fast: 0, batSpeedSum: 0, swings: 0 };
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

// Counts one game's events for the side that bats (side 0: away bats) into accFor(e)'s accumulator.
function addGame(B3, g, side, accFor) {
  const S = B3.tune.SWING;
  const bt = g.teams[side], pt = g.teams[1 - side];
  let last = null; // the type of the last pitch (the one a plate appearance ends on)
  for (const e of g.log) {
    if (e.h !== side) continue;
    if (e.e === 'pitch') last = e.t;
    const a = accFor(e);
    if (!a) continue;
    if (e.e === 'pa') {
      a.pa++;
      if (last) a.paBy[last] = (a.paBy[last] || 0) + 1;
      last = null;
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
    if (inZ) a.zone++; else { a.out++; if (OFF[e.t]) a.offOut++; if (FB[e.t]) a.fbOut++; }
    a.zc['n' + e.c] = (a.zc['n' + e.c] || 0) + 1; // zone % by count (Session 16)
    if (inZ) a.zc['z' + e.c] = (a.zc['z' + e.c] || 0) + 1;
    // The swing curve (Session 15): swings by feet from the zone's edge, before two strikes (e) and with two (t).
    const cb = (+e.c.split('-')[1] >= 2 ? 't' : 'e') + CURVE_BINS.findIndex((b) => B3.data.zoneEdge(e.x, e.z) < b);
    a.curve['n' + cb] = (a.curve['n' + cb] || 0) + 1;
    if (swung) a.curve['s' + cb] = (a.curve['s' + cb] || 0) + 1;
    if (!swung) continue;
    a.sw++;
    if (inZ) a.zsw++; else a.osw++;
    a.bySw[e.t] = (a.bySw[e.t] || 0) + 1;
    const bi = bt.inp[e.b];
    a.swings++;
    const bat = e.bat !== undefined ? e.bat : bi.bat.batSpeed; // this swing's bat speed (logged from step 1.5)
    a.batSpeedSum += bat;
    if (bat >= 75) a.fast++; // Savant's fast swing
    // Squared-up and blasts (Savant): exit speed against the most this swing could give (1.23 x bat speed +
    // 0.23 x pitch speed at the plate), on every contact with a measured exit speed (fouls too).
    if (e.ev !== undefined) {
      const sq = e.ev / (S.collision * e.v * S.plateShare + (1 + S.collision) * bat);
      if (sq >= 0.8) a.squared++;
      if (100 * sq + bat >= 164) a.blast++;
    }
    if (e.r === 'S') { a.whiff++; a.byWhiff[e.t] = (a.byWhiff[e.t] || 0) + 1; } else { a.contact++; if (inZ) a.zcontact++; else a.ocontact++; }
    if (e.r === 'F') a.foul++;
    if (OFF[e.t]) { a.offSw++; if (e.r === 'S') a.offWhiff++; }
    if (!inZ && OFF[e.t]) a.offOutSw++;
    if (!inZ && FB[e.t]) a.fbOutSw++;
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
    }
  }
}

// The sweep: one side's players of cond.kind at rating cond.k = cond.L, everyone else 60.
function measure(B3, cond, games, seed) {
  const { averagePair } = require('./lib/testteams');
  const a = newAcc();
  const side = cond.kind === 'hitter' ? 0 : 1; // the half we read: away bats (0) or away pitches (1)
  for (let n = 0; n < games; n++) {
    const teams = averagePair();
    for (const id in teams.away.players) {
      const p = teams.away.players[id];
      const kind = p.pitches ? 'pitcher' : 'hitter';
      if (kind !== cond.kind) continue;
      if (cond.only && p.role !== cond.only) continue; // Stamina moves only the starter (Session 16)
      if (cond.k === 'grades') for (const t in p.arsenal) p.arsenal[t].grade = cond.L;
      else if (cond.k) p.ratings[cond.k] = cond.L;
      if (cond.also) Object.assign(p.ratings, cond.also); // more ratings (the tendencies' payoff checks, Session 11)
      if (cond.tend) p.tendencies = Object.assign({}, p.tendencies, cond.tend);
    }
    const g = B3.game.sim(Object.assign(teams, { type: 'regular', rng: B3.rng.create('rs:' + seed + ':' + n) }));
    a.games++;
    a.runs += g.score[side === 0 ? 0 : 1];
    if (side === 1) { const sp = g.teams[0].live[g.teams[0].used[0]]; a.starts++; a.spPitches += sp.pitches; a.spOuts += sp.outs; }
    addGame(B3, g, side, () => a);
  }
  return a;
}

// The population check (layer 3): test players with realistic mixed ratings (Claude's default: about 12.2
// points per standard deviation around 60, so 40 and 80 are the 5th and 95th percentiles; the correlations below),
// each playing about a season against average
// opponents. Returns one accumulator per player (with his innings pitched for pitchers).
// The owner's choice (Session 10): ratings independent, except Raw Power and Contact lean opposite (POP_PC -0.3: power
// hitters tend to whiff more); pitchers independent too (Claude's reading). POPR and POPPC override them for experiments.
const POP_SD = 12.2, POP_R = process.env.POPR !== undefined ? +process.env.POPR : 0;
// POP_PC: the correlation between Raw Power and Contact.
const POP_PC = process.env.POPPC !== undefined ? +process.env.POPPC : -0.3;
const POP_DC = process.env.POPDC !== undefined ? +process.env.POPDC : 0;
const POP_SC = process.env.POPSC !== undefined ? +process.env.POPSC : 0;
const POP_AIM = process.env.POPAIM !== undefined ? +process.env.POPAIM : 0;
// Pitch shapes (Session 19): the spread of a pitch's shape and the share of it his own tilt carries (POPSHAPE and POPSHAPER for
// experiments).
const POP_SHAPE = process.env.POPSHAPE !== undefined ? +process.env.POPSHAPE : 0.35;
const POP_SHAPE_R = process.env.POPSHAPER !== undefined ? +process.env.POPSHAPER : 0.8;
function popRatings(rng, keys) {
  const common = rng.normal(0, 1), z = {}, out = {};
  for (const k of keys) z[k] = Math.sqrt(POP_R) * common + Math.sqrt(1 - POP_R) * rng.normal(0, 1);
  if (POP_PC && z.rawPower !== undefined && z.contact !== undefined) z.rawPower = POP_PC * z.contact + Math.sqrt(1 - POP_PC * POP_PC) * z.rawPower;
  // POPDC (experiments only, Session 15): a link between Discipline and Contact.
  if (POP_DC && z.discipline !== undefined && z.contact !== undefined) z.discipline = POP_DC * z.contact + Math.sqrt(1 - POP_DC * POP_DC) * z.discipline;
  // POPSC (experiments only, Session 19): a link between a pitcher's stuff (his Velocity and grades together) and his Command.
  if (POP_SC && z.command !== undefined) {
    const st = keys.filter((k) => k === 'velocity' || k.startsWith('g:'));
    const zs = st.reduce((t, k) => t + z[k], 0) / Math.sqrt(st.length);
    z.command = POP_SC * zs + Math.sqrt(1 - POP_SC * POP_SC) * z.command;
  }
  for (const k of keys) out[k] = Math.round(Math.max(20, Math.min(99, 60 + POP_SD * z[k])));
  return out;
}
function measurePop(B3, spec) {
  const { averagePair, HIT, PIT } = require('./lib/testteams');
  const rng = B3.rng.create('pop:' + spec.seed + ':' + spec.kind + ':' + spec.team);
  const teams = averagePair();
  const draws = {};
  // Tendencies as in the rated test teams (step 1.5 task 4, Claude's default): Patient / Balanced / Aggressive hitters and
  // Nibbler / Balanced / Attacker pitchers at 1 : 2 : 1, from their own stream so the ratings draws stay the same.
  const srng = B3.rng.create('popstyle:' + spec.seed + ':' + spec.kind + ':' + spec.team);
  const style = (words) => words[srng.weighted([1, 2, 1])];
  const prng = B3.rng.create('poppath:' + spec.seed + ':' + spec.kind + ':' + spec.team);
  for (const id in teams.away.players) {
    const p = teams.away.players[id];
    if (spec.kind === 'hitter' && !p.pitches) p.tendencies = { aggressiveness: style(['Patient', 'Balanced', 'Aggressive']) };
    // Swing path (Session 11) from a third stream, so the other draws stay the same.
    if (spec.kind === 'hitter' && !p.pitches) p.tendencies.swingPath = ['Ground-ball', 'Level', 'Lift'][prng.weighted([1, 2, 1])];
    if (spec.kind === 'pitcher' && p.pitches) p.tendencies = { aim: style(['Nibbler', 'Balanced', 'Attacker']) };
  }
  // The starter's Stamina (Session 16) from a fourth stream, about 60 +- 12.2 as the other ratings; relievers keep the placeholders.
  const strng = B3.rng.create('popstam:' + spec.seed + ':' + spec.kind + ':' + spec.team);
  for (const id in teams.away.players) {
    const p = teams.away.players[id];
    if (spec.kind === 'pitcher' && p.role === 'SP') p.ratings.stamina = Math.round(Math.max(20, Math.min(99, 60 + POP_SD * strng.normal(0, 1))));
  }
  // Pitch shapes (Session 19, Claude's default; the rated test teams have them, the population had none): a pitcher's own tilt
  // shared by his pitches (POP_SHAPE_R of each pitch's variance) plus each pitch's own, POP_SHAPE x a standard normal, rounded to
  // 0.1 and kept within -1 to 1, from a fifth stream so the other draws stay the same.
  const shrng = B3.rng.create('popshape:' + spec.seed + ':' + spec.kind + ':' + spec.team);
  for (const id in teams.away.players) {
    const p = teams.away.players[id];
    if (spec.kind !== 'pitcher' || !p.pitches || !POP_SHAPE) continue;
    const own = shrng.normal(0, 1);
    for (const t of p.pitches) {
      const z = Math.sqrt(POP_SHAPE_R) * own + Math.sqrt(1 - POP_SHAPE_R) * shrng.normal(0, 1);
      p.arsenal[t].shape = Math.round(Math.max(-1, Math.min(1, POP_SHAPE * z)) * 10) / 10;
    }
  }
  for (const id in teams.away.players) {
    const p = teams.away.players[id];
    if (spec.kind === 'hitter' && !p.pitches) Object.assign(p.ratings, draws[id] = popRatings(rng, HIT));
    if (spec.kind === 'pitcher' && p.pitches) {
      const r = popRatings(rng, PIT.concat(p.pitches.map((t) => 'g:' + t)));
      for (const t of p.pitches) { p.arsenal[t].grade = r['g:' + t]; delete r['g:' + t]; }
      Object.assign(p.ratings, r);
      draws[id] = r;
    }
  }
  // POPAIM (experiments only, Session 19): pitchers whose stuff gets chases (Deception and grades) lean Nibbler; Aim then comes
  // from that lean plus noise, cut at the 25th and 75th percentiles (still 1 : 2 : 1).
  if (POP_AIM && spec.kind === 'pitcher') {
    const arng = B3.rng.create('popaim:' + spec.seed + ':' + spec.team);
    for (const id in teams.away.players) {
      const p = teams.away.players[id];
      if (!p.pitches) continue;
      const zs = [(p.ratings.deception - 60) / POP_SD].concat(p.pitches.map((t) => (p.arsenal[t].grade - 60) / POP_SD));
      const st = zs.reduce((a, b) => a + b, 0) / Math.sqrt(zs.length);
      const za = -POP_AIM * st + Math.sqrt(1 - POP_AIM * POP_AIM) * arng.normal(0, 1);
      p.tendencies.aim = za < -0.674 ? 'Nibbler' : za > 0.674 ? 'Attacker' : 'Balanced';
    }
  }
  // Each player's games are cut into "player-seasons" of CHUNK plate appearances (batters faced), so the
  // spread carries the same sampling noise as real seasons; a last piece of 250 or more counts too.
  const CHUNK = 500, side = spec.kind === 'hitter' ? 0 : 1;
  const chunks = {};
  const cur = (id) => {
    const list = chunks[id] = chunks[id] || [];
    if (!list.length || list[list.length - 1].pa >= CHUNK) { const a = newAcc(); a.outs = 0; a.er = 0; list.push(a); }
    return list[list.length - 1];
  };
  for (let n = 0; n < spec.games; n++) {
    const g = B3.game.sim(Object.assign(JSON.parse(JSON.stringify(teams)), { type: 'regular', rng: B3.rng.create('pg:' + spec.seed + ':' + spec.kind + ':' + spec.team + ':' + n) }));
    // Outs and runs first (they go to the chunk the plate appearance belongs to, before addGame counts it).
    const starter = g.teams[0].used[0];
    let started = false;
    for (const e of g.log) {
      if (e.h !== side || e.e !== 'pa') continue;
      const a = cur(spec.kind === 'hitter' ? e.b : e.p);
      if (spec.kind === 'pitcher' && e.p === starter && !started) { a.starts++; started = true; }
      a.outs += e.out;
      if (spec.kind === 'pitcher') for (const sc of e.sc) { const r = cur(sc.p); r.runs++; r.er += sc.er; }
      a.games = 1;
    }
    addGame(B3, g, side, (e) => cur(spec.kind === 'hitter' ? e.b : e.p));
  }
  const out = [];
  for (const id in chunks) for (const a of chunks[id]) {
    if (a.starts) { a.spPitches = a.n; a.spOuts = a.outs; } // a starter's pitches and outs all come in his starts
    if (a.pa >= 250) out.push({ id: id, acc: a, ratings: draws[id] || null });
  }
  return out;
}

// Summary stats from an accumulator.
function stats(a) {
  const pc = (x, y) => (y ? 100 * x / y : NaN);
  const evs = a.evs.slice().sort((x, y) => x - y);
  const half = evs.slice(Math.floor(evs.length / 2));
  // Max exit speed per 400 batted balls (a regular's season), averaged over chunks.
  let maxSum = 0, chunks = 0;
  for (let i = 0; i + 400 <= a.evs.length; i += 400) { maxSum += Math.max.apply(null, a.evs.slice(i, i + 400)); chunks++; }
  if (!chunks && a.evs.length >= 100) { maxSum = Math.max.apply(null, a.evs); chunks = 1; } // a shorter season: its own max
  const h = a.h1 + a.h2 + a.h3 + a.hr;
  const laMean = a.laSum / a.bip;
  const out = {
    runs: a.runs / a.games, pa: a.pa,
    k: pc(a.k, a.pa), bb: pc(a.bb, a.pa), avg: h / a.ab, obp: (h + a.bb) / (a.pa), slg: (a.h1 + 2 * a.h2 + 3 * a.h3 + 4 * a.hr) / a.ab,
    iso: (a.h2 + 2 * a.h3 + 3 * a.hr) / a.ab,
    hrPa: pc(a.hr, a.pa), babip: (h - a.hr) / (a.ab - a.k - a.hr + a.sf),
    swing: pc(a.sw, a.n), zone: pc(a.zone, a.n), zSwing: pc(a.zsw, a.zone), chase: pc(a.osw, a.out),
    zMinusO: pc(a.zsw, a.zone) - pc(a.osw, a.out),
    whiff: pc(a.whiff, a.sw), zContact: pc(a.zcontact, a.zsw), oContact: pc(a.ocontact, a.osw), contactPct: pc(a.contact, a.sw),
    edge: pc(a.shadow, a.n), meatball: pc(a.meat, a.n), heart: pc(a.heart, a.n), framingStrike: pc(a.shCalled, a.shTake),
    fbSpeed: a.fbV / a.fbN,
    offWhiff: pc(a.offWhiff, a.offSw), offChase: pc(a.offOutSw, a.offOut), fbChase: pc(a.fbOutSw, a.fbOut),
    offChaseMinusFb: pc(a.offOutSw, a.offOut) - pc(a.fbOutSw, a.fbOut), whiff95: pc(a.whiff95, a.sw95),
    ev: a.evSum / a.bip, ev50: half.reduce((x, y) => x + y, 0) / half.length, maxEV: chunks ? maxSum / chunks : NaN,
    ev90: evs[Math.floor(0.9 * evs.length)],
    hard: pc(a.hard, a.bip), barrel: pc(a.barrel, a.bip), sweet: pc(a.sweet, a.bip), la: laMean,
    pps: a.starts >= 10 ? a.spPitches / a.starts : NaN, ipps: a.starts >= 10 ? a.spOuts / 3 / a.starts : NaN, // per start (Session 16)
    laSd: Math.sqrt(a.laSq / a.bip - laMean * laMean),
    gb: pc(a.gb, a.bip), ld: pc(a.ld, a.bip), fb: pc(a.fb, a.bip), pu: pc(a.pu, a.bip),
    pull: pc(a.pull, a.bip), straight: pc(a.straight, a.bip), oppo: pc(a.oppo, a.bip),
    squared: pc(a.squared, a.contact), blast: pc(a.blast, a.contact), fast: pc(a.fast, a.swings), batSpeed: a.batSpeedSum / a.swings
  };
  // Whiff % by pitch type, when 50+ plate appearances end on the type (as Savant's arsenal table).
  for (const t of ['FF', 'SI', 'FC', 'SL', 'CU', 'CH', 'FS']) out['whiff' + t] = (a.paBy[t] || 0) >= 50 ? pc(a.byWhiff[t] || 0, a.bySw[t]) : NaN;
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
  if (k === 'stamina') out.staminaPitches = B3.ratings.stamina(B3.ratings.curve(L));
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
    process.send({ id: m.id, out: m.pop ? measurePop(B3, m.pop) : measure(B3, m.cond, m.games, m.seed) });
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

// Layer 3: the spread (5th to 95th percentile) of combined stats over the test population's
// player-seasons against real ones.
const POP_STATS = {
  hitter: [['K%', 'k', 'bat.k_percent', 1], ['BB%', 'bb', 'bat.bb_percent', 1], ['AVG', 'avg', 'bat.batting_avg', 3], ['OBP', 'obp', 'bat.on_base_percent', 3],
    ['SLG', 'slg', 'bat.slg_percent', 3], ['ISO', 'iso', 'bat.isolated_power', 3], ['BABIP', 'babip', 'bat.babip', 3], ['exit speed', 'ev', 'bat.exit_velocity_avg', 1],
    ['hard-hit %', 'hard', 'bat.hard_hit_percent', 1], ['barrel %', 'barrel', 'bat.barrel_batted_rate', 1], ['whiff %', 'whiff', 'bat.whiff_percent', 1],
    ['swing %', 'swing', 'bat.swing_percent', 1], ['zone swing %', 'zSwing', 'bat.z_swing_percent', 1],
    ['chase %', 'chase', 'bat.oz_swing_percent', 1], ['zone swing - chase', 'zMinusO', 'bat.zswing_minus_chase', 1], ['zone contact %', 'zContact', 'bat.iz_contact_percent', 1], ['chase contact %', 'oContact', 'bat.oz_contact_percent', 1], ['sweet-spot %', 'sweet', 'bat.sweet_spot_percent', 1],
    ['pull %', 'pull', 'bat.pull_percent', 1], ['oppo %', 'oppo', 'bat.opposite_percent', 1], ['ground-ball %', 'gb', 'bat.groundballs_percent', 1],
    ['max exit speed', 'maxEV', 'evbat.max_hit_speed', 1], ['bat speed', 'batSpeed', 'track.avg_bat_speed', 1], ['fast-swing %', 'fast', 'track.hard_swing_rate', 1],
    ['squared-up %', 'squared', 'track.squared_up_per_bat_contact', 1], ['blasts %', 'blast', 'track.blast_per_bat_contact', 1],
    // Plate discipline by pitch group (step 1.5 task 4: the owner's ladder rule, Session 10, matches these spreads first)
    // (whiff against 95+ mph is left out: the test pitchers are average, so few of their pitches reach 95)
    ['off-speed whiff %', 'offWhiff', 'off.whiff_per_swing', 1], ['off-speed chase - FB', 'offChaseMinusFb', 'off.chase_minus_fb', 1]],
  pitcher: [['K%', 'k', 'pit.k_percent', 1], ['BB%', 'bb', 'pit.bb_percent', 1], ['ERA', 'era', 'pit.p_era', 2], ['AVG against', 'avg', 'pit.batting_avg', 3],
    ['SLG against', 'slg', 'pit.slg_percent', 3], ['exit speed against', 'ev', 'pit.exit_velocity_avg', 1], ['hard-hit % against', 'hard', 'pit.hard_hit_percent', 1],
    ['ground-ball %', 'gb', 'pit.groundballs_percent', 1], ['whiff %', 'whiff', 'pit.whiff_percent', 1], ['chase % against', 'chase', 'pit.oz_swing_percent', 1],
    ['edge %', 'edge', 'pit.edge_percent', 1], ['meatball %', 'meatball', 'pit.meatball_percent', 1], ['zone %', 'zone', 'pit.in_zone_percent', 1],
    // Starters only (Session 16): Stamina about 60 +- 12.2; real Baseball-Reference 2024-2026, 10+ starts.
    ['pitches per start', 'pps', 'sp.pitches_per_start', 1], ['innings per start', 'ipps', 'sp.innings_per_start', 2],
    // Whiff % by pitch type (Session 13: the pitch grades' spread; real: Savant's arsenal table, 50+ PA ending on the pitch)
    ['FF whiff %', 'whiffFF', 'type.FF.whiff', 1], ['SL whiff %', 'whiffSL', 'type.SL.whiff', 1], ['CH whiff %', 'whiffCH', 'type.CH.whiff', 1],
    ['CU whiff %', 'whiffCU', 'type.CU.whiff', 1]]
};
// How Command's stats go together across pitchers (Session 14). Real: Savant's custom leaderboard 2024-2026, pitchers with
// 250+ PA (843 player-seasons). Meatball % mostly follows zone % and, once zone % is known, hardly moves with walks.
const POP_CORR = {
  // Hitters: Savant's custom leaderboard 2024-2026, 250+ PA (951 player-seasons). Chasing doesn't add strikeouts (chasers
  // swing at strikes too and end at-bats early) but costs walks.
  hitter: [['chase', 'zSwing', 0.53], ['chase', 'k', -0.03], ['chase', 'bb', -0.71], ['zSwing', 'k', 0.12], ['zSwing', 'bb', -0.41],
    ['zMinusO', 'k', 0.15], ['zMinusO', 'bb', 0.33], ['swing', 'bb', -0.70], ['chase', 'oContact', 0.09], ['oContact', 'zContact', 0.71]],
  pitcher: [['edge', 'bb', -0.35], ['meatball', 'bb', -0.29], ['zone', 'bb', -0.52], ['meatball', 'zone', 0.71], ['edge', 'zone', 0.34], ['edge', 'meatball', -0.07],
    ['zone', 'chase', -0.22], ['chase', 'bb', -0.28]]
};
// Per-point effects across the population (least squares), against the same fit on real player-seasons (Session 14; hitters:
// Savant 2024-2026, 250+ PA, 951 seasons): K% and BB% on chase %, zone swing % and zone contact %.
const POP_FIT = {
  hitter: [['k', ['chase', 'zSwing', 'zContact'], [0.076, -0.213, -1.057], 0.74],
    ['k', ['chase', 'zSwing', 'zContact', 'oContact'], [0.162, -0.279, -0.670, -0.295], 0.85], // Session 15: with chase contact %
    ['bb', ['chase', 'zSwing', 'zContact'], [-0.321, -0.067, -0.128], 0.56]]
};
function fitLine(ys, X) {
  const ok = ys.map((y, i) => [y, X[i]]).filter(([y, x]) => Number.isFinite(y) && x.every(Number.isFinite));
  const p = X[0].length + 1, A = Array.from({ length: p }, () => new Array(p).fill(0)), v = new Array(p).fill(0);
  for (const [y, x] of ok) { const r = [1, ...x]; for (let a = 0; a < p; a++) { v[a] += r[a] * y; for (let b = 0; b < p; b++) A[a][b] += r[a] * r[b]; } }
  for (let c = 0; c < p; c++) {
    let m = c; for (let r = c + 1; r < p; r++) if (Math.abs(A[r][c]) > Math.abs(A[m][c])) m = r;
    [A[c], A[m]] = [A[m], A[c]]; [v[c], v[m]] = [v[m], v[c]];
    for (let r = 0; r < p; r++) { if (r === c) continue; const f = A[r][c] / A[c][c]; for (let k = c; k < p; k++) A[r][k] -= f * A[c][k]; v[r] -= f * v[c]; }
  }
  const beta = v.map((x, i) => x / A[i][i]);
  const my = ok.reduce((t, q) => t + q[0], 0) / ok.length;
  let ss = 0, st = 0;
  for (const [y, x] of ok) { const f = [1, ...x].reduce((t, z, j) => t + z * beta[j], 0); ss += (y - f) ** 2; st += (y - my) ** 2; }
  return { beta: beta.slice(1), r2: 1 - ss / st };
}
function corr(xs, ys) {
  const ok = xs.map((x, i) => [x, ys[i]]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  const mx = ok.reduce((s, p) => s + p[0], 0) / ok.length, my = ok.reduce((s, p) => s + p[1], 0) / ok.length;
  let sxy = 0, sxx = 0, syy = 0;
  for (const [x, y] of ok) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; }
  return sxy / Math.sqrt(sxx * syy);
}
// MLB 2024 swing curves (Session 15): Statcast pitches on 24 days, a Wednesday each week from April 10 to September 25
// (109,184 pitches, bunts, pitchouts and hit-by-pitches left out), feet from the zone padded by the ball's radius on every
// side (the batter's own top and bottom), before two strikes (e) and with two (t); hitters in thirds by their 2024 season
// (Savant custom leaderboard, 250+ PA): chase %, chase % + zone swing % (overall), zone swing % - chase % (sharp).
const REAL_CURVE = {
  note: '109,184 pitches, 24 days of 2024',
  // K%, BB%, chase %, zone swing %, zone contact %, chase contact % by the same thirds of hitters (2024-2026, 951 seasons).
  thirds: {
    chase: [[21.9, 10.8, 23.0, 63.9, 83.8, 56.1], [22.2, 8.5, 28.8, 67.6, 83.2, 55.9], [21.4, 6.3, 35.6, 70.7, 83.7, 58.1]],
    overall: [[21.6, 10.6, 23.6, 62.0, 84.6, 57.6], [21.8, 8.4, 28.9, 67.3, 83.5, 57.0], [22.2, 6.5, 34.8, 72.9, 82.5, 55.5]],
    sharp: [[20.5, 7.5, 32.5, 64.7, 85.5, 60.9], [22.4, 8.7, 28.5, 66.9, 83.3, 55.9], [22.6, 9.4, 26.3, 70.5, 81.8, 53.3]]
  },
  all: { e: [68.3, 60.4, 50.6, 37.5, 27.4, 16.5, 8.3, 4.1], t: [95.1, 88.5, 81.4, 67.2, 53.7, 35, 20.1, 7.3] },
  // Session 18: the share of pitches in each bin, from 8 other Wednesdays of 2024 (April 17 to September 11, 35,393 pitches,
  // the same method; their swing curves within about 1 point of the 24 days')
  share: { e: [21.4, 15.9, 15.8, 14.1, 10.8, 10.9, 6.0, 5.2], t: [17.3, 13.3, 14.1, 13.0, 11.4, 13.3, 8.0, 9.5] },
  chase: [{ e: [65.8, 55, 43.9, 31.3, 20.7, 11.4, 3.8, 1.6], t: [94.8, 86.6, 80.4, 62.2, 48.9, 27.1, 13.8, 5] }, { e: [67.6, 61.4, 51.5, 36.3, 27.2, 15.9, 8.1, 4.6], t: [95.1, 88, 80.8, 67.9, 51.4, 33.3, 16.9, 6.7] }, { e: [71.7, 64.6, 57.6, 46.4, 34.9, 22, 12.1, 5.6], t: [96.1, 93.7, 85.5, 73.7, 62.5, 45.3, 28.8, 9.3] }],
  overall: [{ e: [62.3, 53.3, 43.3, 30.6, 20.6, 11.7, 4.5, 1.8], t: [94.5, 86.1, 80.8, 62.4, 49.9, 29.1, 14.6, 5.9] }, { e: [68.6, 60.3, 50.2, 37.2, 26.6, 15.9, 8.2, 4.1], t: [95.4, 89.7, 81.1, 69.3, 53.3, 34.6, 20.2, 7.3] }, { e: [74.6, 67.8, 59.7, 46.2, 35.6, 21.6, 11.3, 6.1], t: [96.1, 92.6, 84.6, 71.8, 59.1, 41.7, 25.1, 8] }],
  sharp: [{ e: [62.6, 56.2, 50.6, 39.5, 29.8, 18.1, 10.8, 4.4], t: [96.1, 90.2, 82.8, 71.6, 60.4, 44.5, 26.2, 10] }, { e: [67.6, 59.5, 48, 37.8, 26, 15.7, 7.3, 4.3], t: [94.7, 89.7, 82.1, 67.4, 54, 33.4, 18.6, 6.1] }, { e: [74, 65, 53.9, 36, 26.8, 15.1, 6, 3.2], t: [95.1, 88, 81.4, 64.6, 48.3, 28.1, 14.9, 5.3] }]
};
function popReport(res, real) {
  const q = (xs, p) => { const v = xs.filter(Number.isFinite).sort((a, b) => a - b); return v.length ? v[Math.min(v.length - 1, Math.floor(p * v.length))] : NaN; };
  const rep = {};
  for (const kind of ['hitter', 'pitcher']) {
    if (!Object.keys(res).some((id) => id.startsWith('pop:' + kind[0] + ':'))) continue;
    const seasons = [];
    for (const id in res) if (id.startsWith('pop:' + kind[0] + ':')) for (const x of res[id]) {
      const st = stats(x.acc);
      st.era = x.acc.outs ? 27 * x.acc.er / x.acc.outs : NaN;
      st.curve = x.acc.curve;
      st.zc = x.acc.zc;
      seasons.push(st);
    }
    const rows = [];
    console.log('\nPopulation check, ' + kind + 's: ' + seasons.length + ' test player-seasons (250+ PA; ratings about 60 +- ' + POP_SD + ', r ' + POP_R + ', Raw Power-Contact ' + POP_PC + '; tendencies 1:2:1) against real 2024-2026');
    console.log('  stat                   engine p5    p25    p50    p75    p95  |   real p5    p25    p50    p75    p95');
    for (const [lab, key, rk, d] of POP_STATS[kind]) {
      const xs = seasons.map((s2) => s2[key]);
      const e = [0.05, 0.25, 0.5, 0.75, 0.95].map((p) => q(xs, p));
      const r = real.pct[rk];
      const rr = r ? [r.p5, r.p25, r.p50, r.p75, r.p95] : [NaN, NaN, NaN, NaN, NaN];
      rows.push({ label: lab, key: key, real: rk, engine: e, target: rr });
      const n = xs.filter(Number.isFinite).length;
      console.log('  ' + lab.padEnd(22) + e.map((x) => fmt(x, d).padStart(7)).join('') + '  |' + rr.map((x) => fmt(x, d).padStart(7)).join('') + (n < seasons.length ? '   (' + n + ')' : ''));
    }
    const cs = (POP_CORR[kind] || []).map(([a, b, rv]) => ({ a: a, b: b, engine: corr(seasons.map((s2) => s2[a]), seasons.map((s2) => s2[b])), real: rv }));
    if (cs.length) console.log('  correlations (engine [real]): ' + cs.map((c) => c.a + '-' + c.b + ' ' + fmt(c.engine, 2) + ' [' + fmt(c.real, 2) + ']').join(', '));
    for (const [y, xs, rb, rr2] of POP_FIT[kind] || []) {
      const f = fitLine(seasons.map((s2) => s2[y]), seasons.map((s2) => xs.map((x) => s2[x])));
      console.log('  ' + y + ' per point of ' + xs.map((x, i) => x + ' ' + fmt(f.beta[i], 3) + ' [' + fmt(rb[i], 3) + ']').join(', ') + '; R2 ' + fmt(f.r2, 2) + ' [' + fmt(rr2, 2) + ']');
    }
    if (kind === 'hitter') rep.curves = curveReport(seasons);
    if (kind === 'pitcher') rep.aim = aimReport(seasons);
    if (kind === 'pitcher') rep.starters = startersReport(seasons, q);
    rep[kind] = { n: seasons.length, rows: rows, corr: cs };
  }
  return rep;
}

// The swing curve by thirds of hitters (Session 15): swing % by feet from the zone's edge, before two strikes and with two,
// for the lowest and highest third of hitters by chase %, by their overall swing (chase % + zone swing %) and by their
// sharpness (zone swing % - chase %), against the same on real pitches (REAL_CURVE).
function curveReport(seasons) {
  const by = { chase: (s) => s.chase, overall: (s) => s.chase + s.zSwing, sharp: (s) => s.zSwing - s.chase };
  const curve = (list) => {
    const c = {};
    for (const s of list) for (const k in s.curve) c[k] = (c[k] || 0) + s.curve[k];
    const pc = (t) => CURVE_BINS.map((_, i) => (c['n' + t + i] ? 100 * (c['s' + t + i] || 0) / c['n' + t + i] : NaN));
    // Session 18: the share of pitches in each bin (where the pitches are, before two strikes and with two)
    const sh = (t) => { const n = CURVE_BINS.reduce((q, _, i) => q + (c['n' + t + i] || 0), 0); return CURVE_BINS.map((_, i) => 100 * (c['n' + t + i] || 0) / n); };
    return { e: pc('e'), t: pc('t'), ne: sh('e'), nt: sh('t') };
  };
  const out = { all: curve(seasons), thirds: {} };
  const avg = (list, k) => list.reduce((t, s) => t + s[k], 0) / list.length;
  for (const g in by) {
    const v = seasons.slice().sort((a, b) => by[g](a) - by[g](b)), n3 = Math.floor(v.length / 3);
    const parts = [v.slice(0, n3), v.slice(n3, v.length - n3), v.slice(v.length - n3)];
    out[g] = parts.map(curve);
    out.thirds[g] = parts.map((l) => ['k', 'bb', 'chase', 'zSwing', 'zContact', 'oContact'].map((k) => avg(l, k)));
  }
  console.log('  thirds of hitters: K% / BB% / chase % / zone swing % / zone contact % / chase contact %, engine [MLB 2024-2026]');
  for (const g in by) console.log('  ' + g.padEnd(8) + out.thirds[g].map((t, i) => t.map((x) => fmt(x, 1)).join('/') + ' [' + REAL_CURVE.thirds[g][i].join('/') + ']').join('  '));
  const row = (lab, e, r) => console.log('  ' + lab.padEnd(22) + e.map((x) => fmt(x, 1).padStart(6)).join('') + '  |' + r.map((x) => fmt(x, 1).padStart(6)).join(''));
  console.log('  swing % by feet from the zone edge, engine | MLB 2024 (' + REAL_CURVE.note + ')');
  console.log('  ' + ''.padEnd(22) + CURVE_LABELS.map((x) => x.padStart(6).slice(-6)).join('') + '  |' + CURVE_LABELS.map((x) => x.padStart(6).slice(-6)).join(''));
  for (const t of ['e', 't']) {
    const w = t === 'e' ? 'before 2 strikes' : 'two strikes';
    row('all, ' + w, out.all[t], REAL_CURVE.all[t]);
    row('  share of pitches', out.all['n' + t], REAL_CURVE.share[t]);
    for (const g in by) for (const i of [0, 2]) row(g + (i ? ' high' : ' low') + ' third', out[g][i][t], REAL_CURVE[g][i][t]);
  }
  return out;
}

// MLB starters (Session 19): the population's pitcher-seasons are starters' (about 97%), while real.pct pools every pitcher
// with 250+ batters faced (about 40% of them relievers, whose ERA is lower). Savant's custom leaderboard 2024-2026, 250+
// batters faced and 10+ starts (528 seasons); percentiles 5 / 25 / 50 / 75 / 95.
const REAL_STARTERS = {
  note: 'Savant 2024-2026, 250+ batters faced and 10+ starts, 528 seasons',
  rows: [['K%', 'k', 1, [15.3, 18.6, 21.5, 24.9, 30.0]], ['BB%', 'bb', 1, [4.8, 6.4, 7.7, 9.3, 11.4]], ['ERA', 'era', 2, [2.66, 3.46, 4.08, 4.87, 6.08]],
    ['AVG against', 'avg', 3, [0.195, 0.225, 0.246, 0.263, 0.295]], ['SLG against', 'slg', 3, [0.318, 0.367, 0.404, 0.440, 0.510]],
    ['exit speed against', 'ev', 1, [86.9, 88.4, 89.3, 90.1, 91.2]], ['hard-hit % against', 'hard', 1, [33.2, 37.2, 40.0, 42.6, 46.5]],
    ['ground-ball %', 'gb', 1, [32.9, 37.8, 41.5, 45.3, 53.4]], ['whiff %', 'whiff', 1, [18.1, 21.6, 24.0, 27.3, 31.2]],
    ['chase % against', 'chase', 1, [24.3, 27.1, 29.0, 31.1, 34.3]], ['zone %', 'zone', 1, [44.3, 47.3, 49.5, 51.4, 54.6]]]
};
function startersReport(seasons, q) {
  const sp = seasons.filter((s) => Number.isFinite(s.pps)); // 10+ starts in the season
  console.log('  starters only: ' + sp.length + ' engine seasons with 10+ starts, against MLB starters (' + REAL_STARTERS.note + ')');
  const rows = [];
  for (const [lab, key, d, real] of REAL_STARTERS.rows) {
    const e = [0.05, 0.25, 0.5, 0.75, 0.95].map((p) => q(sp.map((s) => s[key]), p));
    rows.push({ label: lab, key: key, engine: e, target: real });
    console.log('  ' + lab.padEnd(22) + e.map((x) => fmt(x, d).padStart(7)).join('') + '  |' + real.map((x) => fmt(x, d).padStart(7)).join(''));
  }
  return { n: sp.length, rows: rows };
}

// The Aim level by count (Session 16): MLB 2024-2025 (Statcast searches grouped by pitcher, by count and in the zone; 566
// pitcher-seasons with 250+ batters faced, Savant's leaderboard). Pitchers in thirds by the zone % their walks don't explain
// (the residual of zone % on BB%): the gap is ahead and even in the count, none with three balls, and costs nothing.
const COUNTS = ['0-0', '0-1', '0-2', '1-0', '1-1', '1-2', '2-0', '2-1', '2-2', '3-0', '3-1', '3-2'];
const REAL_AIM = {
  note: 'Statcast 2024-2025, 566 pitcher-seasons with 250+ batters faced',
  league: [54.4, 45.5, 32.4, 55.7, 50.5, 38.2, 59.5, 56.8, 47.1, 63.2, 62.2, 58.9],
  thirds: [[52.5, 41.1, 26.9, 53.7, 47.1, 33.2, 59.6, 54.9, 43.6, 64.9, 63.6, 58.8], [54.5, 45.7, 32.2, 56.0, 50.6, 38.5, 60.0, 57.6, 47.5, 64.9, 63.2, 59.8],
    [57.5, 50.0, 36.6, 58.5, 54.7, 42.9, 61.5, 60.4, 51.2, 64.1, 63.4, 60.5]],
  // zone %, BB%, K%, chase %, meatball %, edge % of the same thirds
  stats: [[47.4, 8.0, 23.4, 29.9, 6.9, 43.1], [50.4, 8.1, 22.6, 28.3, 7.7, 43.3], [53.3, 7.9, 22.7, 27.7, 8.5, 43.1]]
};
function aimReport(seasons) {
  const ok = seasons.filter((s) => Number.isFinite(s.zone) && Number.isFinite(s.bb));
  const f = fitLine(ok.map((s) => s.zone), ok.map((s) => [s.bb]));
  const res = ok.map((s) => ({ s: s, r: s.zone - f.beta[0] * s.bb }));
  res.sort((a, b) => a.r - b.r);
  const n3 = Math.floor(res.length / 3), parts = [res.slice(0, n3), res.slice(n3, res.length - n3), res.slice(res.length - n3)].map((l) => l.map((x) => x.s));
  const byCount = (l) => COUNTS.map((c) => { let n = 0, z = 0; for (const s of l) { n += s.zc['n' + c] || 0; z += s.zc['z' + c] || 0; } return n ? 100 * z / n : NaN; });
  const avg = (l, k) => l.reduce((t, s) => t + s[k], 0) / l.length;
  const out = { all: byCount(ok), thirds: parts.map(byCount), stats: parts.map((l) => ['zone', 'bb', 'k', 'chase', 'meatball', 'edge'].map((k) => avg(l, k))) };
  console.log('  Aim level: thirds of pitchers by the zone % their walks don\'t explain; zone % by count, engine | MLB (' + REAL_AIM.note + ')');
  console.log('  ' + ''.padEnd(10) + COUNTS.map((c) => c.padStart(6)).join('') + '  |' + COUNTS.map((c) => c.padStart(6)).join(''));
  const row = (lab, e, r) => console.log('  ' + lab.padEnd(10) + e.map((x) => fmt(x, 1).padStart(6)).join('') + '  |' + r.map((x) => fmt(x, 1).padStart(6)).join(''));
  row('all', out.all, REAL_AIM.league);
  ['low', 'middle', 'high'].forEach((lab, i) => row(lab, out.thirds[i], REAL_AIM.thirds[i]));
  console.log('  thirds: zone % / BB% / K% / chase % / meatball % / edge %, engine [MLB]');
  console.log('  ' + out.stats.map((t, i) => t.map((x) => fmt(x, 1)).join('/') + ' [' + REAL_AIM.stats[i].join('/') + ']').join('  '));
  return out;
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
  for (const k of (o.parts.indexOf('sweep') >= 0 ? names : [])) {
    const R = RATINGS[k];
    if (!R) { console.error('unknown rating ' + k); process.exit(1); }
    if (k === 'speed' || k === 'arm') continue; // direct only for now
    for (const L of LEVELS) {
      for (let c = 0; c * chunk < o.games; c++) {
        jobs.push({ id: k + ':' + L + ':' + c, cond: { k: k, L: L, kind: R.kind, only: R.only }, games: Math.min(chunk, o.games - c * chunk), seed: o.seed + ':' + c });
      }
    }
  }
  if (o.parts.indexOf('pop') >= 0) {
    // Hitters: 9 per team, about 118 games for a 500-PA season each. Pitchers: three times the teams at
    // 40 games each (the starter's two seasons; relievers rarely reach 250 batters faced).
    if (o.popKind !== 'pitcher') for (let t = 0; t < o.popTeams; t++) jobs.push({ id: 'pop:h:' + t, pop: { kind: 'hitter', team: t, games: 118, seed: o.seed } });
    if (o.popKind !== 'hitter') for (let t = 0; t < 3 * o.popTeams; t++) jobs.push({ id: 'pop:p:' + t, pop: { kind: 'pitcher', team: t, games: 40, seed: o.seed } });
  }
  const t0 = Date.now();
  pool(jobs, o.jobs, o.tweak, (res) => {
    const out = { games: o.games, levels: LEVELS, ratings: {}, pop: null };
    if (o.parts.indexOf('pop') >= 0) out.pop = popReport(res, real);
    for (const k of (o.parts.indexOf('sweep') >= 0 ? names : [])) {
      const R = RATINGS[k];
      const rows = {};
      for (const L of LEVELS) {
        const parts = Object.keys(res).filter((id) => id.startsWith(k + ':' + L + ':')).map((id) => res[id]);
        rows[L] = Object.assign(parts.length ? stats(merge(parts)) : {}, direct(B3, k, L));
      }
      const own = R.own.map(([ek, rk, sign]) => ({ engine: ek, real: rk, sign: sign, target: rk ? ladder(real, rk, sign) : null,
        values: LEVELS.map((L) => rows[L][ek]) }));
      out.ratings[k] = { kind: R.kind, rows: rows, own: own, direct: !jobs.some((j) => j.cond && j.cond.k === k), units: [] };
      console.log('\n' + k + ' (' + R.kind + 's; ' + (jobs.some((j) => j.cond && j.cond.k === k) ? o.games + ' games per level' : 'direct') + ')');
      console.log('  level ' + LEVELS.map((L) => String(L).padStart(7)).join(''));
      for (const ow of own) {
        console.log('  ' + ow.engine.padEnd(16).slice(0, 16) + LEVELS.map((L) => fmt(rows[L][ow.engine], 2).padStart(7)).join(''));
        if (ow.target) console.log('  real ' + (ow.real.padEnd(11).slice(0, 11)) + LEVELS.map((L) => fmt(ow.target[L], 2).padStart(7)).join(''));
      }
      if (jobs.some((j) => j.cond && j.cond.k === k)) {
        for (const [lab, key, d] of [['whiff%', 'whiff', 1], ['whiff 95+', 'whiff95', 1], ['squared-up%', 'squared', 1], ['K%', 'k', 1], ['BB%', 'bb', 1], ['AVG', 'avg', 3], ['SLG', 'slg', 3], ['EV', 'ev', 1], ['hard%', 'hard', 1], ['runs', 'runs', 2]]) {
          console.log('  ' + lab.padEnd(16) + LEVELS.map((L) => fmt(rows[L][key], d).padStart(7)).join(''));
        }
      }
      const units = R.units || (R.unit ? [R.unit] : []);
      for (const [ex, ey, rk] of units) {
        const a = rows[50], b = rows[70];
        const per = (b[ey] - a[ey]) / (b[ex] - a[ex]);
        const rs = real.slope[rk];
        if (Number.isFinite(per)) out.ratings[k].units.push({ label: ey + ' per ' + ex, engine: per, real: rk });
        if (Number.isFinite(per)) console.log('  per unit of ' + ex + ', ' + ey + ' (50 to 70): engine ' + fmt(per, 3) + ', real ' + (rs ? fmt(rs.per, 3) + ' +- ' + fmt(rs.se, 3) + ' (' + rk + ')' : 'n/a'));
      }
    }
    console.log('\n(' + Math.round((Date.now() - t0) / 1000) + ' s, ' + o.jobs + ' processes)');
    if (o.json) fs.writeFileSync(o.json, JSON.stringify(out));
    if (o.html) {
      const value = o.value ? JSON.parse(fs.readFileSync(o.value, 'utf8')) : null;
      let engine = 'working tree';
      try { engine = 'commit ' + require('child_process').execSync('git rev-parse --short HEAD', { cwd: __dirname }).toString().trim(); } catch (e) { /* not a git checkout */ }
      fs.writeFileSync(o.html, require('./lib/ratingspage').page(out, value, { date: new Date().toISOString().slice(0, 10), engine: engine, real: real }));
      console.log('wrote ' + o.html);
    }
  });
}

if (process.argv[2] === '--worker') worker();
else if (require.main === module) main();
module.exports = { RATINGS, LEVELS, ANCHOR, ladder, stats, measure, measurePop, newAcc, merge, barrel, attack };
