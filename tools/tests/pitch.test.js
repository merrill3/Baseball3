// Pitches, the two-error swing and contact (M1 step 1.2, task 6). Each rating hook moves its own
// numbers the right way. The functions are called directly on a game waiting at its first pitch.
'use strict';
const assert = require('assert');
const { loadCore } = require('../lib/load');
const { pair } = require('../lib/testteams');

const N = 3000;
const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs) => { const m = avg(xs); return Math.sqrt(avg(xs.map((x) => (x - m) * (x - m)))); };
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || '') + ': ' + a.toFixed(3) + ' is not within ' + tol + ' of ' + b);

// A game at its first pitch: the away leadoff man (AWY-CF) bats against the home starter (HOM-SP).
// opts: { bat, pit, fld } hook overrides for the batter, pitcher and catcher; bats/throws for hands.
function setup(opts, seed) {
  opts = opts || {};
  const B3 = loadCore();
  const t = pair();
  const b = t.away.players['AWY-CF'], p = t.home.players['HOM-SP'], c = t.home.players['HOM-C'];
  if (opts.bats) b.bats = opts.bats;
  if (opts.throws) p.throws = opts.throws;
  if (opts.bat) b.sim = { bat: opts.bat };
  if (opts.pit) p.sim = { pit: opts.pit };
  if (opts.fld) c.sim = { fld: opts.fld };
  const g = B3.game.create(Object.assign(t, { type: 'regular', rng: B3.rng.create(seed || 'pitch test') }));
  return { B3, g };
}

// Throws n pitches at a target and resolves each with a swing (timing ms, or 'cpu') or a take (null).
function trial(env, target, timing, n) {
  const { B3, g } = env;
  const out = [];
  for (let i = 0; i < (n || N); i++) {
    const p = B3.pitch.throw(g, target);
    const tm = timing === 'cpu' ? B3.pitch.cpuTiming(g, p) : timing;
    const r = B3.pitch.resolve(g, p, tm === null ? { swing: false } : { swing: true, timing: tm });
    out.push({ p, r, tm });
  }
  return out;
}
const rate = (rows, f) => rows.filter(f).length / rows.length;
const inPlay = (rows) => rows.filter((x) => x.r.contact);
const MID = { type: 'FF', x: 0, z: 2.55 };

module.exports = function (t) {
  t.test('pitch speed and movement by type; a left-hander mirrors the break', () => {
    const env = setup();
    const speed = {};
    for (const type of ['FF', 'SI', 'FC', 'SL', 'CU', 'CH', 'FS']) {
      const rows = trial(env, { type, x: 0, z: 2.5 }, null, 400);
      speed[type] = avg(rows.map((x) => x.p.speed));
      assert.ok(rows.every((x) => Number.isInteger(x.p.ms) && x.p.ms > 300 && x.p.ms < 600), type + ' flight time');
    }
    near(speed.FF, 93.5, 0.2, 'four-seam speed');
    assert.ok(speed.FF > speed.SI && speed.SI > speed.FC && speed.FC > speed.FS && speed.FS > speed.CH && speed.CH > speed.CU, JSON.stringify(speed));
    near(env.B3.pitch.flightMs(93.5), 404, 6, 'flight of a 93.5 mph pitch');
    const right = env.B3.pitch.throw(env.g, { type: 'SL', x: 0, z: 2.5 });
    const left = setup({ throws: 'L' }).B3.pitch.throw(setup({ throws: 'L' }).g, { type: 'SL', x: 0, z: 2.5 });
    assert.ok(right.hx > 0 && left.hx < 0 && Math.abs(right.hx + left.hx) < 1e-9, 'a slider breaks to the glove side');
  });

  t.test('Command scatters pitches around the target; fatigue widens it and costs speed', () => {
    for (const cmd of [0.25, 0.5, 0.9]) {
      const rows = trial(setup({ pit: { commandSd: cmd } }), { type: 'FF', x: 0.4, z: 2.2 }, null);
      near(avg(rows.map((x) => x.p.x)), 0.4, 0.05, 'mean x');
      near(avg(rows.map((x) => x.p.z)), 2.2, 0.05, 'mean z');
      near(sd(rows.map((x) => x.p.x)), cmd, cmd * 0.08, 'scatter x');
      near(sd(rows.map((x) => x.p.z)), cmd, cmd * 0.08, 'scatter z');
    }
    const fresh = trial(setup(), MID, null);
    const tired = setup();
    tired.g.teams[1].live['HOM-SP'].pitches = 92 + 40; // two fatigue steps past Stamina
    const late = trial(tired, MID, null);
    near(avg(fresh.map((x) => x.p.speed)) - avg(late.map((x) => x.p.speed)), 2.4, 0.15, 'speed lost');
    near(sd(late.map((x) => x.p.x)) / sd(fresh.map((x) => x.p.x)), 1.6, 0.12, 'scatter growth');
  });

  t.test('the umpire: strikes down the middle, balls well outside, either way at the edge; Framing moves the edge', () => {
    const call = (env, x, z) => { let c = 0; for (let i = 0; i < 2000; i++) if (env.B3.pitch.call(env.g, { type: 'FF', x, z }) === 'C') c++; return c / 2000; };
    const env = setup({ fld: { framing: 0 } });
    const edge = env.B3.data.ZONE.halfWidth;
    assert.strictEqual(call(env, 0, 2.55), 1);
    assert.strictEqual(call(env, edge + 1, 2.55), 0);
    near(call(env, edge, 2.55), 0.5, 0.05, 'a pitch on the edge');
    near(call(env, 0, env.B3.data.ZONE.bottom), 0.5, 0.05, 'a pitch at the knees');
    assert.ok(call(env, edge + 0.08, 2.55) < 0.25, 'a pitch an inch off is mostly a ball');
    const framer = setup({ fld: { framing: 0.06 } });
    assert.ok(call(framer, edge, 2.55) > 0.65 && call(framer, edge + 0.08, 2.55) > 0.35, 'a good framer gets the edge');
    const takes = trial(env, { type: 'SL', x: 1.6, z: 1.0 }, null).map((x) => x.r.r);
    assert.ok(takes.every((r) => r === 'B' || r === 'C'));
  });

  t.test('the *where* error: Contact sets whiffs; over the ball is a ground ball, under it a fly ball', () => {
    const good = trial(setup({ bat: { contactSd: 1.0 } }), MID, 0);
    const poor = trial(setup({ bat: { contactSd: 2.6 } }), MID, 0);
    const whiff = (rows) => rate(rows, (x) => x.r.r === 'S');
    // (Step 1.4: location matters from near the middle, so even these pitches carry a little location spread.)
    assert.ok(whiff(good) < 0.2 && whiff(poor) > 0.3 && whiff(poor) > whiff(good) + 0.15, 'whiffs ' + whiff(good) + ' / ' + whiff(poor));
    assert.ok(rate(good, (x) => x.r.r === 'X') > rate(poor, (x) => x.r.r === 'X'));
    // The bat's height against the ball sets the launch angle.
    const rows = inPlay(trial(setup(), MID, 0));
    // (Session 12: a fastball's fair core is narrower, SWING.foulPow, so its fair mishits are smaller.)
    const over = rows.filter((x) => x.r.off > 0.5), under = rows.filter((x) => x.r.off < -0.5);
    const laOver = avg(over.map((x) => x.r.contact.la)), laUnder = avg(under.map((x) => x.r.contact.la));
    assert.ok(laOver < 10 && laUnder > 25 && laUnder > laOver + 30, 'launch angle over ' + laOver + ', under ' + laUnder);
    // Pitches outside the zone are harder to hit well.
    const chase = trial(setup(), { type: 'FF', x: 0, z: 0.9 }, 0);
    assert.ok(whiff(chase) > whiff(trial(setup(), MID, 0)) + 0.15, 'chasing a low ball misses more');
  });

  t.test('the *when* error: early pulls, late goes the other way, perfect timing hits hardest, far off misses', () => {
    for (const bats of ['R', 'L']) {
      const pullSign = bats === 'R' ? -1 : 1;
      const early = inPlay(trial(setup({ bats }), MID, -25)), late = inPlay(trial(setup({ bats }), MID, 25));
      assert.ok(pullSign * avg(early.map((x) => x.r.contact.sp)) > 15, bats + ' pulls an early swing');
      assert.ok(pullSign * avg(late.map((x) => x.r.contact.sp)) < -10, bats + ' takes a late swing the other way');
    }
    const ev = (tm) => avg(inPlay(trial(setup(), MID, tm)).map((x) => x.r.contact.ev));
    assert.ok(ev(0) > ev(-40) + 4 && ev(0) > ev(40) + 4, 'exit speed falls off with bad timing');
    const env = setup();
    assert.ok(trial(env, MID, env.B3.tune.SWING.missMs + 1, 300).every((x) => x.r.r === 'S'), 'too early or late misses');
    // Timing squares it up (Session 11, owner's choice): bat.square scales the exit speed lost to a mishit, not the whiffs.
    const sq = (square, tm) => trial(setup({ bat: { square } }), MID, tm);
    const evOf = (rows) => avg(inPlay(rows).map((x) => x.r.contact.ev));
    assert.ok(evOf(sq(0.5, 30)) > evOf(sq(1.5, 30)) + 4, 'a hitter who keeps the barrel on it loses less to a late swing');
    assert.ok(evOf(sq(0.5, 0)) > evOf(sq(1.5, 0)) + 2, 'and less to an off-center hit');
    near(rate(sq(0.5, 30), (x) => x.r.r === 'S'), rate(sq(1.5, 30), (x) => x.r.r === 'S'), 1e-9, 'the same whiffs');
  });

  t.test('Raw Power sets exit speed at a cost in accuracy; Launch sets the launch-angle band and spray', () => {
    // free: without the cost, the squared-up formula's 1.23 per mph (less the average mishit)
    const swings = (batSpeed, free) => {
      const env = setup({ bat: { batSpeed } });
      if (free) { env.B3.tune.SWING.speedCost = 0; env.B3.tune.SWING.barrelCost = 0; }
      return trial(env, MID, 0);
    };
    const ev = (rows) => avg(inPlay(rows).map((x) => x.r.contact.ev));
    const whiff = (rows) => rate(rows, (x) => x.r.r === 'S');
    near(ev(swings(80, true)) - ev(swings(66, true)), 14 * 1.2 * 0.85, 4, 'exit speed per mph of bat speed, without the cost');
    // The cost (step 1.5, owner's choice, Session 10): a faster bat misses more and gains less exit speed per mph.
    const fast = swings(80), slow = swings(66);
    near(ev(fast) - ev(slow), 14 * 0.63, 2.5, 'exit speed per mph of bat speed, with the cost');
    assert.ok(whiff(fast) > whiff(slow) + 0.05, 'a faster bat misses more: ' + whiff(fast).toFixed(3) + ' against ' + whiff(slow).toFixed(3));
    near(whiff(swings(80, true)), whiff(swings(66, true)), 0.03, 'no cost, no extra misses');
    const tight = inPlay(trial(setup({ bat: { launchK: 12, launchSd: 4, sprayNoise: 8 } }), MID, 0));
    const loose = inPlay(trial(setup({ bat: { launchK: 30, launchSd: 12, sprayNoise: 30 } }), MID, 0));
    assert.ok(sd(tight.map((x) => x.r.contact.la)) < sd(loose.map((x) => x.r.contact.la)) - 6, 'launch-angle spread');
    assert.ok(sd(tight.map((x) => x.r.contact.sp)) < sd(loose.map((x) => x.r.contact.sp)) - 8, 'spray spread');
  });

  t.test('Swing path (Session 11): Lift raises the launch angle and pulls more, Ground-ball the reverse; a Lift swing misses a little more', () => {
    const rows = (swingPath) => trial(setup({ bats: 'R', bat: { swingPath } }), MID, 0, 3000);
    const lift = rows(1), level = rows(0), gb = rows(-1);
    const la = (r) => avg(inPlay(r).map((x) => x.r.contact.la)), pull = (r) => -avg(inPlay(r).map((x) => x.r.contact.sp));
    const whiff = (r) => rate(r, (x) => x.r.r === 'S');
    assert.ok(la(lift) > la(level) + 2.5 && la(gb) < la(level) - 2.5, 'launch angle: ' + [la(gb), la(level), la(lift)].map((x) => x.toFixed(1)).join(' / '));
    assert.ok(pull(lift) > pull(level) + 2.5 && pull(gb) < pull(level) - 2.5, 'pull: ' + [pull(gb), pull(level), pull(lift)].map((x) => x.toFixed(1)).join(' / '));
    assert.ok(whiff(lift) > whiff(gb), 'whiffs: ' + whiff(gb).toFixed(3) + ' against ' + whiff(lift).toFixed(3));
  });

  t.test('Recognition and Deception mirror each other; reading pitches means fewer whiffs on breaking balls', () => {
    const CU = { type: 'CU', x: 0, z: 2.4 };
    // A thrown pitch carries one read (step 1.5 task 4); without one (deleted here) it counts as his average share.
    const e = (o, read) => { const env = setup(o); const p = env.B3.pitch.throw(env.g, CU); if (read === undefined) delete p.read; else p.read = read; return env.B3.pitch.expect(env.g, p); };
    near(e({ bat: { recognition: 0.8 }, pit: { deception: 2.5 } }).mean, e({ bat: { recognition: 0.5 } }).mean, 1e-9, 'deception multiplies what he doesn\'t read');
    assert.ok(e({ bat: { recognition: 0.5 } }).mean > e({ bat: { recognition: 0.95 } }).mean + 0.5, 'an unread curve leaves the bat over the ball');
    assert.ok(e({}, false).mean > 2 && e({}, true).mean === 0, 'the whole surprise on an unread pitch, none on a read one');
    const whiff = (rec) => rate(trial(setup({ bat: { recognition: rec } }), CU, 'cpu'), (x) => x.r.r === 'S');
    assert.ok(whiff(0.4) > whiff(0.95) + 0.05, 'whiffs on curves fall with Recognition');
    // An unread change-up makes a CPU hitter early.
    const tm = (rec) => avg(trial(setup({ bat: { recognition: rec } }), { type: 'CH', x: 0, z: 2.4 }, 'cpu').map((x) => x.tm));
    assert.ok(tm(0.3) < tm(0.95) - 8 && tm(0.3) < -10, 'early on change-ups');
  });

  t.test('Velocity: faster pitches make CPU hitters late and less consistent; Contact sets where lateness starts (Session 11)', () => {
    const tm = (o) => trial(setup(o), MID, 'cpu').map((x) => x.tm);
    const slow = tm({ pit: { velo: 90 } }), fast = tm({ pit: { velo: 100 } });
    assert.ok(avg(fast) > avg(slow) + 4, 'late against 100 mph');
    assert.ok(sd(fast) > sd(slow) * 1.25, 'wider timing against 100 mph');
    near(sd(tm({ bat: { timingSd: 10 }, pit: { velo: 92 } })), 10, 1, 'Timing sets the spread');
    assert.ok(avg(tm({ bat: { timingTop: 102 }, pit: { velo: 100 } })) < avg(fast) - 4, 'a good Contact hitter is not late at 100 (timingTop is Contact\'s since Session 11)');
    const whiff = (velo) => rate(trial(setup({ pit: { velo } }), MID, 'cpu'), (x) => x.r.r === 'S');
    assert.ok(whiff(100) > whiff(90), 'more whiffs against velocity');
  });

  t.test('pitch grades and shapes: more break, more whiffs; a ground-ball shape, more ground balls', () => {
    const whiff = (grade) => rate(trial(setup({ pit: { grades: { SL: grade } } }), { type: 'SL', x: 0.3, z: 2.3 }, 'cpu'), (x) => x.r.r === 'S');
    assert.ok(whiff(1.4) > whiff(0.7) + 0.04, 'a better slider misses more bats');
    const env = setup({ pit: { grades: { SL: 1.5 } } });
    assert.ok(Math.abs(env.B3.pitch.throw(env.g, { type: 'SL', x: 0, z: 2.5 }).hx) > 8.9, 'grade scales movement');
    const la = (shape) => avg(inPlay(trial(setup({ pit: { shapes: { FF: shape } } }), MID, 0)).map((x) => x.r.contact.la));
    assert.ok(la(4) < la(-4) - 3, 'a sinking shape lowers the launch angle');
  });

  t.test('pitch grades (Session 13): a better pitch is harder to pick up and fools more when he misses it', () => {
    const unread = (grade) => rate(trial(setup({ pit: { grades: { SL: grade } } }), { type: 'SL', x: 0.3, z: 2.3 }, null), (x) => !x.p.read);
    const avgShare = unread(1), P = loadCore().tune.PITCH;
    near(unread(1.4), avgShare * (1 + P.gradeHide * 0.4), 0.03, 'the unread share grows with the grade');
    assert.ok(unread(0.5) < 0.02, 'a poor pitch is nearly always read');
    // The *where* error's mean on an unread pitch, and the timing on an unread change-up (TYPE.foolTime), grow with the grade.
    const miss = (type, grade) => { const env = setup({ pit: { grades: { [type]: grade } } }); const p = env.B3.pitch.throw(env.g, { type: type, x: 0, z: 2.5 }); p.read = false; return { env, p }; };
    const mean = (grade) => { const m = miss('SL', grade); return m.env.B3.pitch.expect(m.env.g, m.p).mean; };
    near(mean(1.4) / mean(1), 1 + P.gradeSurprise * 0.4, 1e-9, 'an unread slider fools more');
    const early = (type, grade) => avg(Array.from({ length: 400 }, () => { const m = miss(type, grade); return m.env.B3.pitch.cpuTiming(m.env.g, m.p); }));
    assert.ok(early('CH', 1.4) < early('CH', 1) - 5, 'an unread change-up of a better grade makes him earlier');
    assert.ok(Math.abs(early('CU', 1.4) - early('CU', 1)) < 3, 'a curve\'s grade does not change his timing');
  });

  t.test('handedness: switch hitters bat opposite the pitcher; a small platoon edge', () => {
    assert.strictEqual(setup({ bats: 'S', throws: 'R' }).B3.pitch.who(setup({ bats: 'S', throws: 'R' }).g).bats, 'L');
    const s = setup({ bats: 'S', throws: 'L' });
    assert.strictEqual(s.B3.pitch.who(s.g).bats, 'R');
    const e = (bats) => { const env = setup({ bats, throws: 'R' }); return env.B3.pitch.expect(env.g, env.B3.pitch.throw(env.g, { type: 'SL', x: 0, z: 2.5 })); };
    const opp = e('L'), same = e('R');
    assert.ok(opp.rec > same.rec && opp.sd < same.sd, 'opposite hand reads better');
    assert.ok(opp.rec - same.rec < 0.1, 'the edge is small');
  });

  t.test('pitch functions change nothing in the game but its random draws', () => {
    const env = setup();
    const snap = () => JSON.stringify(Object.assign({}, env.g, { rng: null }));
    const before = snap();
    trial(env, MID, 'cpu', 500);
    trial(env, MID, null, 200);
    assert.strictEqual(snap(), before);
  });

  t.test('the same seed gives the same pitches and swings', () => {
    const a = trial(setup({}, 'same'), { type: 'CH', x: 0.2, z: 2 }, 'cpu', 300);
    const b = trial(setup({}, 'same'), { type: 'CH', x: 0.2, z: 2 }, 'cpu', 300);
    assert.strictEqual(JSON.stringify(a), JSON.stringify(b));
  });
};
