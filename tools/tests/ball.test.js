// Balls in play, steals and tag-ups (M1 step 1.2, task 7). The flight's distances, the wall, foul
// ground, and each fielding and running hook moving its own numbers. B3.ball is called directly on a
// game waiting at its first pitch, with runners placed by hand, so only the hook under test changes.
'use strict';
const assert = require('assert');
const { loadCore } = require('../lib/load');
const { pair } = require('../lib/testteams');

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || '') + ': ' + a.toFixed(3) + ' is not within ' + tol + ' of ' + b);
const more = (a, b, by, msg) => assert.ok(a > b + by, (msg || '') + ': ' + a.toFixed(3) + ' is not more than ' + b.toFixed(3) + ' by ' + by);
const HITS = ['1B', '2B', '3B', 'HR'];
const INFIELD = ['P', 'C', '1B', '2B', '3B', 'SS'];
const D2R = Math.PI / 180;

// Real batted balls: the contacts of 120 simulated games (both sides, every batter), made once.
let CONTACTS = null;
function contacts() {
  if (CONTACTS) return CONTACTS;
  const B3 = loadCore();
  const out = [];
  const inPlay = B3.ball.inPlay;
  B3.ball.inPlay = function (g, c, steal) { out.push({ ev: c.ev, la: c.la, sp: c.sp }); return inPlay(g, c, steal); };
  for (let n = 0; n < 120; n++) B3.game.sim(Object.assign(pair(), { type: 'regular', rng: B3.rng.create('ball contacts ' + n) }));
  CONTACTS = out;
  return out;
}
const fair = () => contacts().filter((c) => Math.abs(c.sp) <= 45);
const grounders = () => fair().filter((c) => c.la < 10);

// A game at its first pitch: the away side bats (AWY-CF, a left-handed hitter, is up), the home side
// fields. opts: { fld: { pos: {...} }, run: { id: {...} }, bases: [id or null x3], outs }.
// fld.all and run.all apply to every fielder or every away player.
function setup(opts, seed) {
  opts = opts || {};
  const B3 = loadCore();
  const t = pair();
  const fld = opts.fld || {}, run = opts.run || {};
  for (const id in t.home.players) {
    const pos = id === 'HOM-SP' ? 'P' : id.slice(4);
    const f = Object.assign({}, fld.all || {}, fld[pos] || {});
    if (Object.keys(f).length) t.home.players[id].sim = { fld: f };
  }
  for (const id in t.away.players) {
    const r = Object.assign({}, run.all || {}, run[id] || {});
    if (Object.keys(r).length) t.away.players[id].sim = { run: r };
  }
  const g = B3.game.create(Object.assign(t, { type: 'regular', rng: B3.rng.create(seed || 'ball test') }));
  const place = () => {
    g.outs = opts.outs || 0;
    g.bases = (opts.bases || [null, null, null]).map((id) => (id ? { id: id, resp: 'HOM-SP', earned: true } : null));
  };
  place();
  return { B3, g, place };
}

// Every contact through B3.ball.inPlay with the same runners and outs before each one.
function plays(env, list, steal) {
  const out = [];
  for (const c of list) {
    env.place();
    const st = steal ? steal.map((from) => ({ from: from, runner: env.g.bases[from] })) : null;
    out.push({ c: c, p: env.B3.ball.inPlay(env.g, c, st) });
  }
  return out;
}
const rate = (rows, f) => rows.filter(f).length / rows.length;
const isHit = (x) => HITS.indexOf(x.p.code) >= 0;
const atPos = (POS, k) => { const o = {}; for (const pos in POS) o[pos] = { [k]: POS[pos] }; return o; };

module.exports = function (t) {
  t.test('flight: 100 mph at 28 degrees carries about 390 ft; carry grows with exit speed', () => {
    const B3 = loadCore();
    near(B3.ball.flight({ ev: 100, la: 28, sp: 0 }).land.r, 390, 8, '100 mph at 28 degrees');
    let last = 0;
    for (let ev = 70; ev <= 110; ev += 5) {
      const r = B3.ball.flight({ ev: ev, la: 28, sp: 20 }).land.r;
      assert.ok(r > last + 5, ev + ' mph carries farther than ' + (ev - 5) + ' mph');
      last = r;
    }
    // A line drive lands sooner than a fly ball at the same speed, and a pop-up hangs longest.
    const at = (la) => B3.ball.flight({ ev: 95, la: la, sp: 0 }).land.t;
    assert.ok(at(15) < at(30) && at(30) < at(60), 'hang time grows with launch angle');
    // A grounder bounces and rolls to a stop.
    const gb = B3.ball.flight({ ev: 85, la: -5, sp: 5 });
    assert.ok(gb.land.r < 30 && gb.stop && gb.stop.r > 150 && !gb.hr, 'a grounder rolls on');
  });

  t.test('home runs only over the wall; every other fair ball stays inside the fence', () => {
    const B3 = loadCore();
    const F = B3.data.FIELD;
    let hrs = 0, walls = 0;
    for (let ev = 85; ev <= 115; ev += 3) {
      for (let la = 12; la <= 46; la += 2) {
        for (let sp = -44; sp <= 44; sp += 8) {
          const p = B3.ball.flight({ ev: ev, la: la, sp: sp });
          const fence = B3.data.fenceAt(sp);
          if (p.hr) {
            hrs++;
            assert.ok(p.hr.h > F.wall, 'a home run clears the wall: ' + ev + '/' + la + '/' + sp);
            assert.ok(!p.wall, 'a home run never hits the wall');
          } else {
            for (const q of p.pts) assert.ok(q[4] <= fence + 0.5, 'in play inside the fence: ' + ev + '/' + la + '/' + sp + ' at ' + q[4].toFixed(1) + ' ft');
            // Off the wall below its top, or after a bounce (no ground-rule doubles in M1).
            if (p.wall) { walls++; assert.ok(p.wall.h <= F.wall + 1e-9 || (p.land && p.land.t <= p.wall.t), 'a ball off the wall is under its top'); }
          }
        }
      }
    }
    assert.ok(hrs > 200 && walls > 50, 'the grid has home runs (' + hrs + ') and balls off the wall (' + walls + ')');
    // In games, home runs come only from balls that carry past the fence.
    const env = setup();
    for (const x of plays(env, fair())) {
      if (x.p.code !== 'HR') continue;
      const p = B3.ball.flight(x.c);
      assert.ok(p.hr, 'a home run in play is a flight over the wall');
    }
  });

  t.test('foul flies are caught only in foul ground, fair balls only in fair ground', () => {
    const env = setup({}, 'foul flies');
    const r = env.g.rng;
    const list = [];
    for (let i = 0; i < 3000; i++) {
      const side = r.chance(0.5) ? 1 : -1;
      list.push({ ev: r.range(55, 95), la: r.range(15, 80), sp: side * r.range(46, 140) });
    }
    let caught = 0;
    for (const x of plays(env, list)) {
      if (x.p.foul) continue;
      caught++;
      assert.ok(['FO', 'PO', 'LO', 'E'].indexOf(x.p.code) >= 0, 'a foul ball in play is a catch or a drop: ' + x.p.code);
      if (x.p.code === 'E') continue;
      const at = x.p.meta.catchAt;
      const off = Math.abs(Math.atan2(at[0], at[1])) / D2R;
      assert.ok(off > 45 || at[1] < 0, 'caught in foul ground: ' + JSON.stringify(at));
    }
    assert.ok(caught > 150 && caught < 2400, 'some foul flies are caught, not all: ' + caught);
    // Fair by direction and by where it comes down: a pop-up straight up can drift back behind the plate
    // on its backspin, and lands foul (step 1.4).
    const env2 = setup();
    for (const x of plays(env2, fair().filter((c) => env2.B3.ball.flight(c).fair))) {
      if (!x.p.caught) continue;
      const at = x.p.meta.catchAt;
      assert.ok(Math.abs(Math.atan2(at[0], at[1])) / D2R <= 45.01 && at[1] >= 0, 'a fair ball is caught in fair ground');
    }
  });

  t.test('Range (first step and route) turns more balls in play into outs', () => {
    const POS = loadCore().tune.POS;
    const react = (d) => { const o = {}; for (const pos in POS) o[pos] = { react: Math.max(0.05, POS[pos][0] + d) }; return o; };
    const good = Object.assign(react(-0.08), {}); for (const pos in good) good[pos].route = 1.0;
    const poor = Object.assign(react(0.08), {}); for (const pos in poor) poor[pos].route = 0.84;
    const list = fair();
    const hits = (fld) => rate(plays(setup({ fld: fld }), list).filter((x) => x.p.code !== 'HR'), isHit);
    const g = hits(good), p = hits(poor), a = hits({});
    more(a, g, 0.015, 'great range takes away hits');
    more(p, a, 0.015, 'poor range gives up hits');
    // Range at one position shows up there: a quick shortstop makes more plays.
    const ss = (fld) => rate(plays(setup({ fld: fld }), grounders()), (x) => x.p.fielder === 'SS' && !isHit(x) && x.p.code !== 'E');
    more(ss({ SS: { react: 0.12, route: 1.0 } }), ss({ SS: { react: 0.4, route: 0.84 } }), 0.01, 'shortstop outs');
  });

  t.test('Hands: fewer errors; a quick release turns more double plays', () => {
    const list = fair();
    const errors = (h) => rate(plays(setup({ fld: { all: { hands: h } } }), list), (x) => x.p.code === 'E');
    const sure = errors(0.4), avg = errors(1), stone = errors(2.5);
    assert.ok(sure < avg * 0.6 && stone > avg * 1.8, 'errors scale with Hands: ' + [sure, avg, stone].map((x) => x.toFixed(4)).join(', '));
    near(avg * 100, 2, 0.7, 'about 2% of fair balls in play are errors (about 1.3% of plate appearances)');
    const dp = (rel) => rate(plays(setup({ fld: { all: { release: rel } }, bases: ['AWY-SS', null, null] }), grounders()), (x) => x.p.code === 'DP');
    more(dp(0.15), dp(0), 0.02, 'double plays with a quick release');
  });

  t.test('Arm: more runners thrown out and fewer extra bases taken', () => {
    const OF = { LF: {}, CF: {}, RF: {} };
    const arm = (mph) => { const o = {}; for (const pos in OF) o[pos] = { arm: mph }; return o; };
    // Tag-ups from third on balls caught in the outfield.
    const deep = fair().filter((c) => c.la >= 20 && c.la <= 45);
    const tags = (mph) => {
      const env = setup({ fld: arm(mph), bases: [null, null, 'AWY-SS'] });
      let safe = 0, n = 0;
      for (const x of plays(env, deep)) {
        if (!x.p.caught || ['LF', 'CF', 'RF'].indexOf(x.p.fielder) < 0 || x.p.meta.dist > 300) continue;
        env.place();
        n++;
        if (env.B3.ball.tagup(env.g, x.p, 3)) safe++;
      }
      return safe / n;
    };
    more(tags(75), tags(97), 0.08, 'tag-ups from third on catches inside 300 ft');
    // Runners on second scoring on a single.
    const scores = (mph) => {
      const rows = plays(setup({ fld: arm(mph), bases: [null, 'AWY-SS', null] }), fair()).filter((x) => x.p.code === '1B' && ['LF', 'CF', 'RF'].indexOf(x.p.fielder) >= 0);
      return rate(rows, (x) => x.p.runners[1] === 4);
    };
    more(scores(75), scores(97), 0.05, 'runners from second scoring on a single');
  });

  t.test('steals: catcher Arm and quick release against the runner\'s Speed and jump', () => {
    const safe = (opts) => {
      const env = setup(Object.assign({ bases: ['AWY-SS', null, null] }, opts));
      let s = 0;
      for (let i = 0; i < 3000; i++) { env.place(); if (env.B3.ball.steal(env.g, 1, { ms: 420 })) s++; }
      return s / 3000;
    };
    const base = safe({});
    more(base, safe({ fld: { C: { arm: 88, release: 0.15 } } }), 0.08, 'a strong, quick catcher');
    more(safe({ fld: { C: { arm: 72 } } }), base, 0.05, 'a weak-armed catcher');
    more(safe({ run: { 'AWY-SS': { speed: 30 } } }), base, 0.08, 'a fast runner');
    more(safe({ run: { 'AWY-SS': { jump: 0 } } }), safe({ run: { 'AWY-SS': { jump: 0.35 } } }), 0.15, 'a good jump (Baserunning)');
    assert.ok(base > 0.5 && base < 0.95, 'an average steal of second is usually safe: ' + base.toFixed(3));
  });

  t.test('Speed: more infield hits and more extra bases', () => {
    const ifh = (speed) => rate(plays(setup({ run: { 'AWY-CF': { speed: speed } } }), grounders()), (x) => x.p.code === '1B' && INFIELD.indexOf(x.p.fielder) >= 0);
    more(ifh(31), ifh(23), 0.01, 'infield hits');
    const extra = (speed) => {
      const rows = plays(setup({ run: { 'AWY-CF': { speed: speed } } }), fair()).filter((x) => isHit(x) && x.p.code !== 'HR');
      return rate(rows, (x) => x.p.code !== '1B');
    };
    more(extra(31), extra(23), 0.03, 'doubles and triples among hits in play');
    const thirdOnSingle = (speed) => {
      const rows = plays(setup({ run: { 'AWY-SS': { speed: speed } }, bases: ['AWY-SS', null, null] }), fair()).filter((x) => x.p.code === '1B' && ['LF', 'CF', 'RF'].indexOf(x.p.fielder) >= 0);
      return rate(rows, (x) => x.p.runners[0] >= 3);
    };
    more(thirdOnSingle(31), thirdOnSingle(23), 0.05, 'first to third on a single');
  });

  t.test('Baserunning: a quick read takes extra bases; good judgment avoids outs on the bases', () => {
    const singles = (run) => plays(setup({ run: { 'AWY-SS': run }, bases: ['AWY-SS', null, null] }), fair())
      .filter((x) => (x.p.code === '1B' || x.p.code === '2B') && ['LF', 'CF', 'RF'].indexOf(x.p.fielder) >= 0);
    const adv = (run) => rate(singles(run), (x) => x.p.runners[0] >= 3);
    more(adv({ read: 0.05 }), adv({ read: 0.45 }), 0.03, 'first to third (or home) with a quick read');
    const outs = (run) => rate(singles(run), (x) => x.p.runners[0] === 0);
    assert.ok(outs({ judge: 0.02 }) <= outs({ judge: 0.4 }), 'fewer runners thrown out with good judgment');
    more(outs({ judge: 0.4 }), outs({ judge: 0.02 }), 0.005, 'poor judgment runs into outs');
  });

  t.test('runners going on the pitch get their jump, and are doubled off on a catch', () => {
    const list = fair();
    const still = plays(setup({ bases: ['AWY-SS', null, null] }), list);
    const going = plays(setup({ bases: ['AWY-SS', null, null] }), list, [0]);
    const third = (rows) => rate(rows.filter((x) => x.p.code === '1B' && ['LF', 'CF', 'RF'].indexOf(x.p.fielder) >= 0), (x) => x.p.runners[0] >= 3);
    more(third(going), third(still), 0.1, 'first to third on a single with the runner going');
    const dbl = (rows) => rate(rows.filter((x) => x.p.caught && x.p.code === 'LO'), (x) => x.p.runners[0] === 0);
    assert.ok(dbl(still) === 0, 'a runner who held is never doubled off');
    more(dbl(going), 0.05, 0, 'line drives double off a runner who was going');
    // Ground balls: the runner going beats the force at second more often.
    const dp = (rows) => rate(rows.filter((x) => x.c.la < 10), (x) => x.p.code === 'DP');
    more(dp(still), dp(going), 0.03, 'fewer double plays with the runner going');
  });
};
