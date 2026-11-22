// The CPU's choices (M1 step 1.3, task 10): swing or take (Discipline, Recognition, Deception,
// Aggressiveness, the count), the pitch (grades, the put-away pitch, the count, Aim) and pitching changes
// (Stamina, getting hit hard, roles); step 1.4: steals and tag-ups (Speed, Baserunning, Arm, Hands). Each choice is asked directly, many times, on a game waiting at its
// first pitch: the away leadoff man (AWY-CF) against the home starter (HOM-SP).
'use strict';
const assert = require('assert');
const { loadCore } = require('../lib/load');
const { averagePair, ratedPair } = require('../lib/testteams');

const N = 4000;
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || '') + ': ' + a + ' is not within ' + tol + ' of ' + b);
const B3min = (B3) => B3.tune.CPU.steal.min[0];

// opts: { bat, pit } rating overrides for the batter and the pitcher, tendencies, arsenal, sim hooks.
function setup(opts, seed) {
  opts = opts || {};
  const B3 = loadCore();
  const t = averagePair();
  const b = t.away.players['AWY-CF'], p = t.home.players['HOM-SP'];
  Object.assign(b.ratings, opts.bat || {});
  Object.assign(p.ratings, opts.pit || {});
  if (opts.agg) b.tendencies.aggressiveness = opts.agg;
  if (opts.aim) p.tendencies.aim = opts.aim;
  if (opts.arsenal) Object.assign(p.arsenal, opts.arsenal);
  if (opts.bats) b.bats = opts.bats;
  const g = B3.game.create(Object.assign(t, { type: 'regular', rng: B3.rng.create(seed || 'manager test') }));
  return { B3, g };
}

// Swing rate on pitches thrown at a target, in a count.
function swings(env, target, balls, strikes, n) {
  const { B3, g } = env;
  let sw = 0;
  for (let i = 0; i < (n || N); i++) {
    g.pitch = B3.pitch.throw(g, target);
    const d = { kind: 'swing', side: 0, batter: 'AWY-CF', balls: balls || 0, strikes: strikes || 0, pitch: g.pitch };
    if (B3.manager.cpu.swing(d, g).swing) sw++;
  }
  g.pitch = null;
  return sw / (n || N);
}

// The pitches the CPU picks in a count: { types: {type: share}, zone: share of targets in the zone, mid }.
function picks(env, balls, strikes, n) {
  const { B3, g } = env;
  const d = { kind: 'pitch', side: 1, pitcher: 'HOM-SP', batter: 'AWY-CF', pitches: g.teams[1].players['HOM-SP'].pitches.slice(), balls: balls, strikes: strikes };
  const types = {};
  let zone = 0, edge = 0, off = 0;
  for (let i = 0; i < (n || N); i++) {
    const a = B3.manager.cpu.pitch(d, g);
    types[a.type] = (types[a.type] || 0) + 1 / (n || N);
    if (B3.data.inZone(a.x, a.z)) { zone++; edge += -B3.data.zoneEdge(a.x, a.z); } else off += B3.data.zoneEdge(a.x, a.z);
  }
  return { types, zone: zone / (n || N), inset: edge / zone, off: off / ((n || N) - zone) };
}


module.exports = function (t) {
  t.test('swing or take: strikes down the middle get swung at, balls far off get taken; the count matters', () => {
    const env = setup({ pit: { command: 99 } }); // pitches land close to the target
    const mid = { type: 'FF', x: 0, z: 2.55 }, far = { type: 'FF', x: 2.2, z: 4.6 };
    assert.ok(swings(env, mid, 1, 1) > 0.75 && swings(env, mid, 0, 2) > 0.88, 'middle');
    assert.ok(swings(env, far, 1, 1) < 0.05, 'far off');
    const edge = { type: 'FF', x: 0.95, z: 2.4 };
    assert.ok(swings(env, edge, 0, 2) > swings(env, edge, 0, 0) + 0.2, 'two strikes: protect the plate');
    // Session 15: the blind takes are fitted to MLB 2024's swings at pitches deep in the zone, count by count
    // (0-0 52.0%, 1-1 85.5%, 2-1 89.5%, 3-0 17.7%).
    near(swings(env, mid, 3, 0), 0.177, 0.06, '3-0: take');
    near(swings(env, mid, 0, 0), 0.52, 0.06, 'first pitch');
    near(swings(env, mid, 1, 1), 0.855, 0.05, '1-1');
    near(swings(env, mid, 2, 1), 0.895, 0.05, '2-1');
    assert.ok(swings(env, mid, 0, 0) < swings(env, mid, 1, 1) - 0.1, 'more first-pitch takes');
  });

  t.test('Recognition and Deception: unread break makes a pitch off the plate look like a strike', () => {
    const low = { type: 'CU', x: 0.2, z: 1.05 }; // a curve in the dirt
    const chase = (o) => swings(setup(o), low, 1, 2);
    assert.ok(chase({ bat: { recognition: 30 } }) > chase({ bat: { recognition: 90 } }) + 0.12, 'poor recognizers chase the curve');
    assert.ok(chase({ pit: { deception: 90 } }) > chase({ pit: { deception: 30 } }) + 0.12, 'deceptive pitchers get the chase');
    // A fastball has no break to misread: Recognition doesn't change its chase rate much.
    const ff = { type: 'FF', x: 0.2, z: 1.2 };
    const fchase = (r) => swings(setup({ bat: { recognition: r } }), ff, 1, 2);
    assert.ok(Math.abs(fchase(30) - fchase(90)) < 0.05, 'fastball chase ' + fchase(30) + ' / ' + fchase(90));
    // look() sees an unread curve higher than it is (step 1.5 task 4: one read per pitch), and a read one where it is.
    const e = setup({ bat: { recognition: 30 } }), e2 = setup({ bat: { recognition: 90 } });
    const p = e.B3.pitch.throw(e.g, low);
    const seen = (read) => { p.read = read; return e.B3.pitch.look(e.g, p).z; };
    assert.ok(seen(false) > p.z + 0.5 && Math.abs(seen(true) - p.z) < 1e-9, 'an unread curve looks higher');
    // Better Recognition picks up more pitches; a hand-made pitch without a read counts as his average.
    const reads = (env) => { let n = 0; for (let i = 0; i < N; i++) if (env.B3.pitch.throw(env.g, low).read) n++; return n / N; };
    assert.ok(reads(e2) > reads(e) + 0.3, 'reads ' + reads(e) + ' / ' + reads(e2));
    delete p.read;
    assert.ok(e.B3.pitch.look(e.g, p).z > e2.B3.pitch.look(e2.g, p).z + 0.1, 'on average');
    // A misread never makes a pitch look farther from the zone (lookCloser): a curve up in the zone still looks like a strike.
    const high = e.B3.pitch.throw(e.g, { type: 'CU', x: 0.2, z: 3.3 });
    high.read = false;
    assert.ok(Math.abs(e.B3.pitch.look(e.g, high).z - high.z) < 1e-9, 'not pushed out of the zone');
  });

  t.test('Discipline: fewer chases, and a sharper line between strikes and balls', () => {
    const off = { type: 'FF', x: 1.1, z: 2.4 }, inside = { type: 'FF', x: 0.55, z: 2.4 };
    const z = (r) => { const env = setup({ bat: { discipline: r }, pit: { command: 99 } }); return [swings(env, off, 1, 1), swings(env, inside, 1, 1)]; };
    const poor = z(30), good = z(90);
    assert.ok(good[0] < poor[0] - 0.08, 'chases ' + poor[0] + ' -> ' + good[0]);
    assert.ok(good[1] - good[0] > poor[1] - poor[0] + 0.08, 'sharper: ' + (poor[1] - poor[0]) + ' -> ' + (good[1] - good[0]));
    assert.ok(Math.abs(good[1] - poor[1]) < (poor[0] - good[0]) * 0.75, 'poor Discipline shows mostly as chasing: strikes ' + poor[1] + ' -> ' + good[1]);
  });

  t.test('Aggressiveness: aggressive hitters swing more, most of all early in the count, and expand more with poor Discipline', () => {
    const mid = { type: 'FF', x: 0.3, z: 2.3 }, edge = { type: 'SL', x: 0.95, z: 2.0 };
    const at = (agg, target, b, s) => swings(setup({ agg }), target, b, s);
    for (const [target, b, s] of [[mid, 0, 0], [edge, 1, 0], [mid, 2, 1]]) {
      assert.ok(at('Aggressive', target, b, s) > at('Balanced', target, b, s) && at('Balanced', target, b, s) > at('Patient', target, b, s), JSON.stringify(target) + ' ' + b + '-' + s);
    }
    // The difference is early in the count; with two strikes everyone protects the plate alike.
    const gap = (b, s) => at('Aggressive', mid, b, s) - at('Patient', mid, b, s);
    assert.ok(gap(0, 0) > gap(1, 2) + 0.1, 'gaps ' + gap(0, 0) + ' / ' + gap(1, 2));
    // The less disciplined, the more an aggressive hitter expands his zone.
    const off = { type: 'FF', x: 1.15, z: 2.4 };
    const widen = (d) => swings(setup({ agg: 'Aggressive', bat: { discipline: d } }), off, 1, 1) - swings(setup({ bat: { discipline: d } }), off, 1, 1);
    assert.ok(widen(30) > widen(90) + 0.04, 'chases added ' + widen(30) + ' / ' + widen(90));
  });

  t.test('the pitch: better grades get thrown more, the put-away pitch with two strikes, fastballs when behind', () => {
    const base = picks(setup(), 1, 1);
    const slGood = picks(setup({ arsenal: { SL: { grade: 85, shape: 0 } } }), 1, 1);
    assert.ok(slGood.types.SL > base.types.SL + 0.05, 'a better slider gets thrown more');
    const chGood = setup({ arsenal: { CH: { grade: 80, shape: 0 } } });
    assert.strictEqual(chGood.g.teams[1].inp['HOM-SP'].pit.putAway, 'CH');
    // (Session 12: a smaller boost, as MLB's off-speed share rises from 41% to 51% with two strikes.)
    assert.ok(picks(chGood, 0, 2).types.CH > picks(chGood, 0, 0).types.CH + 0.06, 'the put-away pitch with two strikes');
    const behind = picks(setup(), 3, 1), even = picks(setup(), 1, 1);
    const fb = (x) => (x.types.FF || 0) + (x.types.SI || 0) + (x.types.FC || 0); // Session 12: the test starter has a sinker too
    assert.ok(fb(behind) > fb(even) + 0.1, 'fastballs when behind ' + fb(even) + ' -> ' + fb(behind));
    assert.ok(behind.zone > even.zone + 0.1 && picks(setup(), 0, 2).zone < even.zone - 0.1, 'the count moves the zone rate');
  });

  t.test('Aim: attackers aim in the zone and toward the middle, nibblers at the corners', () => {
    const nib = picks(setup({ aim: 'Nibbler' }), 1, 1), bal = picks(setup(), 1, 1), att = picks(setup({ aim: 'Attacker' }), 1, 1);
    // Step 1.4: Aim moves where in the zone he aims (B3.tune.CPU.pitch.aimZone is 0 for every style).
    const AZ = setup().B3.tune.CPU.pitch.aimZone;
    assert.ok((att.zone - bal.zone) * (AZ[2] - AZ[1]) >= 0 && (bal.zone - nib.zone) * (AZ[1] - AZ[0]) >= 0, 'zone targets ' + [nib.zone, bal.zone, att.zone]);
    assert.ok(att.inset > bal.inset + 0.04 && bal.inset > nib.inset + 0.04, 'inset ' + [nib.inset, bal.inset, att.inset]);
  });

  t.test('Command (Session 14): a sharp pitcher aims nearer the edges, in the zone and off it; a wild one deeper in the zone, but no farther off the plate', () => {
    const wild = picks(setup({ pit: { command: 25 } }), 1, 1), avg = picks(setup(), 1, 1), sharp = picks(setup({ pit: { command: 95 } }), 1, 1);
    assert.ok(wild.inset > avg.inset + 0.03 && avg.inset > sharp.inset + 0.03, 'inset ' + [wild.inset, avg.inset, sharp.inset]);
    assert.ok(sharp.off < avg.off - 0.02, 'off the plate, sharp ' + sharp.off + ' against ' + avg.off);
    near(wild.off, avg.off, 0.015, 'off the plate, wild against average');
    near(wild.zone, avg.zone, 0.03, 'Command does not move how often he aims in the zone');
  });

  t.test('pitching changes: Stamina sets when a starter tires; runs take him out; relievers by role', () => {
    const { B3, g } = setup({ pit: { stamina: 60 } });
    const cpu = B3.manager.cpu, team = g.teams[1];
    const d = () => ({ kind: 'change', side: 1, pitcher: team.pitcher, bullpen: team.bullpen.slice() });
    const live = team.live['HOM-SP'];
    live.pitches = 60;
    assert.strictEqual(cpu.change(d(), g), null, 'a fresh starter stays');
    live.pitches = team.inp['HOM-SP'].pit.stamina + 15;
    assert.ok(cpu.change(d(), g), 'a tired starter comes out');
    live.pitches = 50; live.runs = 6;
    assert.ok(cpu.change(d(), g), 'a starter hit hard comes out');
    live.runs = 0;
    // A higher Stamina rating keeps him in longer.
    const s70 = setup({ pit: { stamina: 75 } });
    s70.g.teams[1].live['HOM-SP'].pitches = team.inp['HOM-SP'].pit.stamina + 10;
    assert.strictEqual(s70.B3.manager.cpu.change({ kind: 'change', side: 1, pitcher: 'HOM-SP', bullpen: s70.g.teams[1].bullpen.slice() }, s70.g), null, 'Stamina 75 is not tired yet');
    // A setup man pitches one inning: out when a new inning starts after his 3 outs.
    team.pitcher = 'HOM-SU1'; team.used.push('HOM-SU1'); team.bullpen.splice(team.bullpen.indexOf('HOM-SU1'), 1);
    team.live['HOM-SU1'] = { pitches: 14, outs: 3, runs: 0, bf: 4 };
    assert.ok(cpu.change(d(), g), 'a setup man after his inning');
    team.live['HOM-SU1'].outs = 1; g.outs = 1;
    assert.strictEqual(cpu.change(d(), g), null, 'a setup man in the middle of his inning');
    g.outs = 0;
    // The count: never during a plate appearance.
    live.pitches = 200; team.pitcher = 'HOM-SP'; g.balls = 1;
    assert.strictEqual(cpu.change(d(), g), null, 'not in the middle of a plate appearance');
  });

  t.test('steals: the runner judges his odds (Speed, Baserunning against the catcher) and goes only when they are good', () => {
    // A runner on first (AWY-2B) with the home catcher behind the plate; ratings for both.
    const env = (runner, catcher) => {
      const B3 = loadCore();
      const t = averagePair();
      Object.assign(t.away.players['AWY-2B'].ratings, runner || {});
      Object.assign(t.home.players['HOM-C'].ratings, catcher || {});
      const g = B3.game.create(Object.assign(t, { type: 'regular', rng: B3.rng.create('steal test') }));
      g.bases[0] = { id: 'AWY-2B', resp: 'HOM-SP', earned: true };
      return { B3, g };
    };
    const odds = (e) => e.B3.ball.stealOdds(e.g, 1);
    const tries = (e, n) => {
      let k = 0;
      for (let i = 0; i < n; i++) if (e.B3.manager.cpu.steal({ kind: 'steal', side: 0, runners: [1] }, e.g)) k++;
      return k / n;
    };
    const avg = env(), fast = env({ speed: 80 }), quick = env({ baserunning: 80 }), arm = env({}, { arm: 80 }), hands = env({}, { hands: 80 });
    assert.ok(odds(fast) > odds(avg) + 0.05, 'Speed: ' + odds(fast) + ' vs ' + odds(avg));
    assert.ok(odds(quick) > odds(avg) + 0.02, 'Baserunning (the jump)');
    assert.ok(odds(arm) < odds(avg) - 0.03, 'the catcher\'s Arm (runners see half of it, BALL.armBlind)');
    assert.ok(odds(hands) < odds(avg) - 0.01, 'the catcher\'s quick release (Hands)');
    // He goes more often with better odds, and almost never when they are poor (only when he misjudges them).
    const slow = env({ speed: 35, baserunning: 35 }, { arm: 80 });
    assert.ok(odds(slow) < B3min(slow.B3), 'a slow runner against a strong arm has poor odds');
    assert.ok(tries(slow, 6000) < 0.01, 'so he almost never goes');
    assert.ok(tries(fast, 6000) > tries(avg, 6000) + 0.005, 'fast runners go more often');
    // The odds he judges match what happens: steals of second by the fast runner, on the CPU's own pitches.
    let safe = 0;
    const n = 6000;
    const pd = { kind: 'pitch', side: 1, pitcher: 'HOM-SP', batter: 'AWY-CF', pitches: fast.g.teams[1].players['HOM-SP'].pitches.slice(), balls: 0, strikes: 0 };
    for (let i = 0; i < n; i++) {
      fast.g.pitch = fast.B3.pitch.throw(fast.g, fast.B3.manager.cpu.pitch(pd, fast.g));
      if (fast.B3.ball.steal(fast.g, 1, fast.g.pitch)) safe++;
    }
    near(safe / n, odds(fast), 0.06, 'his judged odds against the real steals');
  });

  t.test('tag-ups: runners tag on deep catches and hold on shallow ones; faster runners tag more', () => {
    const run = (speed, games) => {
      const B3 = loadCore();
      const seen = [];
      const ctl = { tagup: (d, g) => { const a = B3.manager.cpu.tagup(d, g); if (d.from === 3) seen.push({ dist: d.dist, go: a.go }); return a; } };
      for (let n = 0; n < games; n++) {
        const t = averagePair();
        for (const s of t.away.lineup) t.away.players[s.id].sim = { run: { speed: speed } }; // sprint speed, ft/s
        B3.game.play(B3.game.create(Object.assign(t, { type: 'regular', rng: B3.rng.create('tag ' + n) })), [ctl, null]);
      }
      const rate = (lo, hi) => { const x = seen.filter((s) => s.dist >= lo && s.dist < hi); return x.filter((s) => s.go).length / Math.max(1, x.length); };
      // Medium catches: the mean of 20-ft bins, so a different mix of distances between runs doesn't count.
      const mid = (rate(230, 250) + rate(250, 270) + rate(270, 290)) / 3;
      return { deep: rate(300, 999), mid: mid, shallow: rate(0, 180) };
    };
    const avg = run(27, 250), fast = run(30, 250);
    assert.ok(avg.deep > 0.9, 'deep catches: ' + avg.deep);
    assert.ok(avg.shallow < 0.1, 'shallow catches: ' + avg.shallow);
    assert.ok(fast.mid > avg.mid + 0.05, 'faster runners tag more on medium catches: ' + fast.mid + ' vs ' + avg.mid);
  });

  t.test('simulated games stay sane with rated teams and with average teams', () => {
    for (const make of [averagePair, (B3, n) => ratedPair(B3.rng.create('teams:' + n))]) {
      const B3 = loadCore();
      let pa = 0, k = 0, bb = 0, runs = 0, spPitches = 0, pitches = 0;
      const games = 150;
      for (let n = 0; n < games; n++) {
        const g = B3.game.sim(Object.assign(make(B3, n), { type: 'regular', rng: B3.rng.create('sane:' + n) }));
        runs += g.score[0] + g.score[1];
        for (const e of g.log) {
          if (e.e === 'pa') { pa++; if (e.res === 'K') k++; if (e.res === 'BB') bb++; }
          if (e.e === 'pitch') { pitches++; if (e.p === g.teams[1 - e.h].used[0]) spPitches++; }
        }
      }
      const rpg = runs / games / 2, kp = k / pa, bbp = bb / pa, sp = spPitches / games / 2, ppa = pitches / pa;
      const msg = 'runs ' + rpg.toFixed(2) + ' K ' + kp.toFixed(3) + ' BB ' + bbp.toFixed(3) + ' SP pitches ' + sp.toFixed(1) + ' P/PA ' + ppa.toFixed(2);
      assert.ok(rpg > 3.2 && rpg < 5.8, msg);
      assert.ok(kp > 0.16 && kp < 0.27 && bbp > 0.05 && bbp < 0.12, msg);
      assert.ok(sp > 75 && sp < 102 && ppa > 3.3 && ppa < 4.2, msg);
    }
  });
};
