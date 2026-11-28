// Player generation and names (M2 step 2.1a task 2, Session 27): B3.players and B3.names. The same seed gives the same
// players; every player is one the engine takes; a league's population has the spread and links DESIGN.md section 10
// sets (60 +- 12.2, Raw Power against Contact -0.3, Command against stuff, Aim's lean), the hands, ages, positions,
// arsenal sizes and potential the docs give; no two players share a name and no name is a real MLB player's. How the
// population plays is tools/ratingstats.js --part=pop's job; tools/genleague.js prints the make-up.
'use strict';
const assert = require('assert');
const { loadCore } = require('../lib/load');
const { generatedPair } = require('../lib/testteams');

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || '') + ': ' + a + ' is not within ' + tol + ' of ' + b);
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs) => { const m = mean(xs); return Math.sqrt(mean(xs.map((x) => (x - m) * (x - m)))); };
const corr = (xs, ys) => {
  const mx = mean(xs), my = mean(ys);
  let a = 0, b = 0, c = 0;
  xs.forEach((x, i) => { a += (x - mx) * (ys[i] - my); b += (x - mx) ** 2; c += (ys[i] - my) ** 2; });
  return a / Math.sqrt(b * c);
};
const share = (list, f) => list.filter(f).length / list.length;

// 120 organizations (4,800 players), built once.
let LEAGUE = null;
function league() {
  if (LEAGUE) return LEAGUE;
  const B3 = loadCore();
  const rng = B3.rng.create('players test'), ctx = B3.players.context();
  const orgs = [];
  for (let i = 0; i < 120; i++) orgs.push(B3.players.squad(rng, ctx));
  const tier = (k) => [].concat(...orgs.map((o) => o[k]));
  LEAGUE = { B3: B3, orgs: orgs, regulars: tier('regulars'), bench: tier('bench'), starters: tier('starters'), relievers: tier('relievers'), reserves: tier('reserves') };
  LEAGUE.all = [].concat(LEAGUE.regulars, LEAGUE.bench, LEAGUE.starters, LEAGUE.relievers, LEAGUE.reserves);
  LEAGUE.hitters = LEAGUE.all.filter((p) => !p.pitches);
  LEAGUE.pitchers = LEAGUE.all.filter((p) => p.pitches);
  return LEAGUE;
}

module.exports = function (t) {
  t.test('the same seed gives the same players; another seed others', () => {
    const B3 = loadCore();
    const make = (seed) => B3.players.squad(B3.rng.create(seed), B3.players.context());
    assert.deepStrictEqual(make('a'), make('a'));
    assert.notDeepStrictEqual(make('a'), make('b'));
  });

  t.test('a squad is 40 players by tier, with unique ids and names, each one the engine takes', () => {
    const { B3, orgs, all } = league();
    const o = orgs[0];
    // (Arrays from the engine's sandbox are copied before comparing: deepStrictEqual checks their prototypes.)
    assert.deepStrictEqual([o.regulars.length, o.bench.length, o.starters.length, o.relievers.length, o.reserves.length], [9, 4, 5, 8, 14]);
    assert.deepStrictEqual(Array.from(o.regulars, (p) => p.pos), Array.from(B3.data.LINEUP_POS));
    assert.deepStrictEqual(Array.from(o.relievers, (p) => p.role), ['CL', 'SU', 'SU', 'MR', 'MR', 'MR', 'MR', 'LR']);
    assert.strictEqual(new Set(all.map((p) => p.id)).size, all.length, 'ids');
    assert.strictEqual(new Set(all.map((p) => p.name)).size, all.length, 'names');
    for (const p of all) {
      B3.ratings.inputs(p); // throws on a bad rating, shape or tendency
      for (const k in p.ratings) assert.ok(Number.isInteger(p.ratings[k]) && p.ratings[k] >= 20 && p.ratings[k] <= 99, p.id + ' ' + k + ' ' + p.ratings[k]);
      assert.ok(p.age >= 21 && p.age <= 40, p.id + ' age ' + p.age);
      assert.ok(p.name === p.first + ' ' + p.last && typeof p.country === 'string');
      assert.ok(Number.isFinite(p.potential.hidden) && Number.isInteger(p.potential.shown));
    }
    // A game between two generated teams plays to the end.
    const g = B3.game.sim(Object.assign(generatedPair(B3, B3.rng.create('gen game')), { type: 'regular', rng: B3.rng.create('gen game play') }));
    assert.ok(g.over && g.score[0] !== g.score[1]);
  });

  t.test('ratings spread as the test population: 60 +- 12.2, the hitters trade-off links, Command against stuff', () => {
    const { regulars, starters, relievers, bench, reserves } = league();
    for (const k of ['contact', 'timing', 'launch', 'rawPower', 'recognition', 'discipline', 'range', 'hands', 'arm', 'speed', 'baserunning']) {
      const xs = regulars.map((p) => p.ratings[k]);
      near(mean(xs), k === 'range' || k === 'hands' || k === 'arm' ? 60 - 8 / 9 : 60, 1.2, k + ' mean'); // the DH fields poorly
      near(sd(xs), 12.2, 1.0, k + ' sd');
    }
    // Session 31: the hitters' trade-off links (GEN.hitLinks; Raw Power's position lean thins its link a little)
    const r = (a, b) => corr(regulars.map((p) => p.ratings[a]), regulars.map((p) => p.ratings[b]));
    near(r('rawPower', 'contact'), -0.48, 0.08, 'Raw Power-Contact');
    near(r('discipline', 'contact'), -0.35, 0.08, 'Discipline-Contact');
    near(r('recognition', 'contact'), -0.4, 0.08, 'Recognition-Contact');
    near(r('rawPower', 'discipline'), 0.29, 0.08, 'Raw Power-Discipline');
    const big = starters.concat(relievers);
    for (const k of ['command', 'deception']) near(mean(big.map((p) => p.ratings[k])), 60, 1.2, k + ' mean');
    near(mean(starters.map((p) => p.ratings.velocity)), 60, 1.5, 'starters Velocity');
    near(mean(relievers.map((p) => p.ratings.velocity)) - mean(starters.map((p) => p.ratings.velocity)), 5, 2, 'relievers throw harder');
    // Session 31: the grades lean against Velocity (GEN.veloGrades), so Command's lean shows against the grades.
    const grades = (p) => p.pitches.reduce((a, ty) => a + p.arsenal[ty].grade, 0) / p.pitches.length;
    assert.ok(corr(big.map((p) => p.ratings.command), big.map(grades)) < -0.1, 'Command leans against the stuff');
    near(corr(big.map((p) => p.ratings.velocity), big.map((p) => p.arsenal[p.pitches[0]].grade)), -0.3, 0.08, 'grades against Velocity');
    // Bench players and reserves are weaker hitters.
    const hit = (list) => mean(list.filter((p) => !p.pitches).map((p) => p.ratings.contact + p.ratings.rawPower + p.ratings.discipline));
    assert.ok(hit(bench) < hit(regulars) - 6 && hit(reserves) < hit(bench), 'tiers');
  });

  t.test('Aggressiveness (Session 33): 1 : 2 : 1, and with GEN.aggLean low Discipline leans Aggressive from the same one draw', () => {
    const draw = (lean) => {
      const B3 = loadCore(); B3.players.GEN.aggLean = lean;
      const rng = B3.rng.create('agg test'), ctx = B3.players.context(), out = [];
      for (let i = 0; i < 3000; i++) out.push(B3.players.hitter(rng, ctx, { pos: 'LF', tier: 'regular' }));
      return out;
    };
    const plain = draw(0), lean = draw(0.5);
    for (const list of [plain, lean]) {
      near(share(list, (p) => p.tendencies.aggressiveness === 'Patient'), 0.25, 0.03, 'Patient share');
      near(share(list, (p) => p.tendencies.aggressiveness === 'Aggressive'), 0.25, 0.03, 'Aggressive share');
    }
    assert.strictEqual(JSON.stringify(lean.map((p) => p.ratings)), JSON.stringify(plain.map((p) => p.ratings)), 'the lean changes no ratings (one draw either way)');
    const d = (list, t) => mean(list.filter((p) => p.tendencies.aggressiveness === t).map((p) => p.ratings.discipline));
    assert.ok(Math.abs(d(plain, 'Aggressive') - d(plain, 'Patient')) < 2, 'at 0 no lean');
    assert.ok(d(lean, 'Patient') - d(lean, 'Aggressive') > 10, 'at 0.5 Patient hitters are the disciplined ones');
  });

  t.test('positions: Speed and Raw Power lean by position, catchers frame, about 1 hitter in 20 plays both sides', () => {
    const { regulars, hitters } = league();
    const at = (pos, k) => mean(regulars.filter((p) => p.pos === pos).map((p) => p.ratings[k]));
    assert.ok(at('CF', 'speed') > at('C', 'speed') + 15, 'center fielders faster than catchers');
    assert.ok(at('1B', 'rawPower') > at('2B', 'rawPower') + 4, 'first basemen stronger than second basemen');
    for (const p of hitters) assert.strictEqual(p.ratings.framing !== undefined, p.pos === 'C', p.id + ' framing');
    for (const p of hitters) if (['C', '2B', '3B', 'SS'].indexOf(p.pos) >= 0 || p.cross === '2B' || p.cross === '3B') assert.strictEqual(p.throws, 'R', p.id + ' throws');
    near(share(hitters, (p) => p.cross), 0.05, 0.015, 'infield and outfield both');
    for (const p of hitters.filter((x) => x.cross)) {
      const inf = ['1B', '2B', '3B', 'SS'];
      assert.notStrictEqual(inf.indexOf(p.pos) >= 0, inf.indexOf(p.cross) >= 0, p.id + ' crosses to the other side');
    }
  });

  t.test('hands, ages and potential', () => {
    const { hitters, pitchers, all, reserves } = league();
    near(share(hitters, (p) => p.bats === 'R'), 0.58, 0.04, 'bat right');
    near(share(hitters, (p) => p.bats === 'L'), 0.32, 0.04, 'bat left');
    near(share(hitters, (p) => p.bats === 'S'), 0.10, 0.03, 'switch');
    near(share(pitchers, (p) => p.throws === 'L'), 0.28, 0.04, 'left-handed pitchers');
    const big = all.filter((p) => reserves.indexOf(p) < 0), ages = big.map((p) => p.age).sort((a, b) => a - b);
    near(ages[Math.floor(ages.length / 2)], 28, 1, 'big-leaguers median age');
    assert.ok(mean(reserves.map((p) => p.age)) < mean(big.map((p) => p.age)) - 2, 'reserves younger');
    const pot = (lo, hi) => mean(all.filter((p) => p.age >= lo && p.age <= hi).map((p) => p.potential.hidden));
    assert.ok(pot(21, 23) > 5 && pot(24, 26) > 1.5, 'young players have room to grow');
    assert.strictEqual(pot(28, 31), 0, 'none at 28-31');
    assert.ok(pot(35, 40) < -4, 'older players are headed down');
    // The shown potential is the hidden one with an error, never far off.
    for (const p of all) assert.ok(Math.abs(p.potential.shown - p.potential.hidden) < 16, p.id + ' potential');
  });

  t.test('arsenals: sizes by role, a fastball first, then a breaking or off-speed pitch; shapes and Aim', () => {
    const { starters, relievers, pitchers } = league();
    const sizes = (list) => { const c = {}; for (const p of list) c[p.pitches.length] = (c[p.pitches.length] || 0) + 1; return c; };
    const s = sizes(starters), r = sizes(relievers);
    assert.deepStrictEqual(Object.keys(s).map(Number).sort(), [3, 4, 5, 6], 'starters 3-6');
    assert.deepStrictEqual(Object.keys(r).map(Number).sort(), [2, 3, 4], 'relievers 2-4');
    assert.ok(s[4] > s[3] && s[4] > s[5] && s[6] < 0.08 * starters.length, 'starters mostly 4, 6 very rarely');
    assert.ok(r[2] > r[3] && r[4] < 0.12 * relievers.length, 'relievers mostly 2, 4 very rarely');
    for (const p of pitchers) {
      assert.strictEqual(new Set(p.pitches).size, p.pitches.length, p.id + ' no repeats');
      assert.ok(['FF', 'SI'].indexOf(p.pitches[0]) >= 0, p.id + ' a fastball first');
      assert.ok(['SL', 'CU', 'CH', 'FS'].indexOf(p.pitches[1]) >= 0, p.id + ' then a breaking or off-speed pitch');
      assert.deepStrictEqual(Object.keys(p.arsenal).sort(), Array.from(p.pitches).sort());
      for (const ty of p.pitches) assert.ok(Math.abs(p.arsenal[ty].shape * 10 - Math.round(p.arsenal[ty].shape * 10)) < 1e-9 && Math.abs(p.arsenal[ty].shape) <= 1);
    }
    const aim = (w) => share(pitchers, (p) => p.tendencies.aim === w);
    near(aim('Balanced'), 0.5, 0.04, 'Aim 1 : 2 : 1');
    // Chase-getters (Deception and grades) lean Nibbler.
    const chase = (p) => p.ratings.deception + p.pitches.reduce((a, ty) => a + p.arsenal[ty].grade, 0) / p.pitches.length;
    assert.ok(mean(pitchers.filter((p) => p.tendencies.aim === 'Nibbler').map(chase)) > mean(pitchers.filter((p) => p.tendencies.aim === 'Attacker').map(chase)) + 5, 'Aim lean');
  });

  t.test('names: varied lists, unique in a league, never a real MLB player\'s', () => {
    const { B3, all } = league();
    const N = B3.names;
    for (const side of ['FIRST', 'LAST']) for (const g in N[side]) {
      const keys = N[side][g].map(N.norm);
      assert.strictEqual(new Set(keys).size, keys.length, side + ' ' + g + ' has a repeat');
    }
    // The owner's note (Session 27): at least about 500 last names, the Latin American and Asian lists varied too.
    assert.ok(N.LAST.us.length >= 500 && N.LAST.latin.length >= 250 && N.LAST.jp.length >= 80 && N.FIRST.latin.length >= 120, 'list sizes');
    assert.ok(new Set(all.map((p) => p.last)).size > 900, 'a league of 4,800 has 900+ last names');
    assert.ok(B3.realNames.count > 1000 && B3.realNames.hashes.split(',').length === B3.realNames.count, 'the real-name hashes');
    assert.ok(B3.realNames.hashes.split(',').every((h) => /^[0-9a-z]{1,7}$/.test(h)));
    for (const p of all) assert.ok(!N.isReal(p.first, p.last), p.name);
    // A name made real (by planting its hash) is never drawn again.
    const rng = B3.rng.create('names'), first = N.pick(rng, {});
    const saved = B3.realNames.hashes;
    try {
      B3.realNames.hashes = saved + ',' + N.hash(N.key(first.first, first.last));
      assert.ok(N.isReal(first.first, first.last));
      const again = B3.rng.create('names');
      const p = N.pick(again, {});
      assert.notStrictEqual(p.first + ' ' + p.last, first.first + ' ' + first.last);
    } finally { B3.realNames.hashes = saved; }
    // Keys drop accents, case and anything but letters.
    assert.strictEqual(N.key('José', "O'Neill-Peña"), 'jose oneillpena');
  });

  t.test('bad options are refused', () => {
    const B3 = loadCore();
    const rng = B3.rng.create('bad'), ctx = B3.players.context();
    assert.throws(() => B3.players.hitter(rng, ctx, { pos: 'P' }), /bad position/);
    assert.throws(() => B3.players.pitcher(rng, ctx, { role: 'XX' }), /bad role/);
    assert.throws(() => B3.players.hitter(rng, ctx, { tier: 'minors' }), /tier/);
    assert.throws(() => B3.players.hitter(rng, {}, {}), /context/);
    assert.throws(() => B3.players.hitter(rng, ctx, { age: 60 }), /age/);
  });
};
