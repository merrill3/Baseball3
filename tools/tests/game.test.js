// Game state and rules (M1 step 1.1, task 3).
'use strict';
const assert = require('assert');
const { loadCore } = require('../lib/load');
const { pair } = require('../lib/testteams');
const { check } = require('../lib/gamecheck');
const gametest = require('../gametest');

// Replaces the pitch outcome with a script: plan['inning.half'] lists one step per plate
// appearance in that half: 'K' (strikes until out), 'BB' (balls until a walk) or (g) => play.
// Anything unlisted is a strikeout.
function scripted(plan, stubs) {
  const B3 = loadCore();
  const step = (g) => {
    const list = plan[g.inning + '.' + g.half] || [];
    let n = 0;
    for (const e of g.log) if (e.e === 'pa' && e.i === g.inning && e.h === g.half) n++;
    return list[n] || 'K';
  };
  B3.pitch.resolve = function (g) {
    const s = step(g);
    return s === 'K' ? { r: 'S' } : s === 'BB' ? { r: 'B' } : { r: 'X', contact: { ev: 90, la: 10, sp: 0 } };
  };
  B3.ball.inPlay = (g) => step(g)(g);
  Object.assign(B3.ball, stubs || {});
  return B3;
}

// Controllers that never steal or change pitchers, and always tag up; pitches and swings from the CPU.
const quiet = { change: () => null, steal: () => null, tagup: () => ({ go: true }) };

function playGame(B3, opts, controllers) {
  const g = B3.game.create(Object.assign(pair(), { rng: B3.rng.create('scripted') }, opts));
  B3.game.play(g, controllers || [quiet, quiet]);
  const c = check(g);
  eq(c.problems, [], 'invariants');
  return g;
}

// Values from the Node sandbox are another realm's arrays, so compare them as plain JSON.
const eq = (actual, expected, msg) => assert.deepStrictEqual(JSON.parse(JSON.stringify(actual)), expected, msg);

const up = (n) => (g) => g.bases.map((r, i) => (r ? Math.min(4, i + 1 + n) : null));
const single = (g) => ({ code: '1B', bb: 'line', fielder: 'CF', caught: false, batter: 1, runners: up(1)(g) });
const single2 = (g) => Object.assign(single(g), { runners: up(2)(g) }); // runners move up two bases
const double = (g) => ({ code: '2B', bb: 'line', fielder: 'LF', caught: false, batter: 2, runners: up(3)(g) });
const homer = (g) => ({ code: 'HR', bb: 'fly', fielder: 'CF', caught: false, batter: 4, runners: up(3)(g) });
const flyout = (g) => ({ code: 'FO', bb: 'fly', fielder: 'RF', caught: true, batter: 0, runners: up(0)(g) });
const lastPA = (g) => [...g.log].reverse().find((e) => e.e === 'pa');
const pas = (g, i, h) => g.log.filter((e) => e.e === 'pa' && e.i === i && e.h === h);

module.exports = function (t) {
  t.test('1,500 seeded games of every type end correctly with every invariant holding', () => {
    // Session 22: 1,500 (was 1,000): the mercy rule is rare (4 in these 1,500, none in their first 1,000 once the ball changed)
    const r = gametest.run(1500, 'unit');
    assert.deepStrictEqual(r.problems.slice(0, 5), []);
    assert.strictEqual(r.games, 1500);
    // Every rule path was exercised.
    for (const k of ['walk-off', 'walk-off home run', 'tie', 'mercy rule', 'extra innings, runner on second',
      'extra innings, no runner on second', 'home skips the last bottom half', 'caught stealing ends the inning',
      'double play', 'inning-ending double play', 'sac fly', 'tag-up out', "fielder's choice", 'reached on error',
      'stolen base', 'pitching change']) {
      assert.ok(r.seen[k] > 0, 'never saw: ' + k);
    }
  });

  t.test('two runs with the same seed give identical output; another seed differs', () => {
    const a = gametest.report(gametest.run(120, 'repeat'), 'repeat');
    const b = gametest.report(gametest.run(120, 'repeat'), 'repeat');
    const c = gametest.report(gametest.run(120, 'other'), 'other');
    assert.strictEqual(a, b);
    assert.notStrictEqual(a.split('checksum')[1], c.split('checksum')[1]);
  });

  t.test('create refuses bad setups', () => {
    const B3 = loadCore();
    const ok = () => Object.assign(pair(), { rng: B3.rng.create(1) });
    assert.throws(() => B3.game.create(Object.assign(pair(), {})), /rng/);
    assert.throws(() => B3.game.create(Object.assign(pair(), { rng: { next: () => 0.5 } })), /rng/);
    assert.throws(() => B3.game.create(Object.assign(ok(), { type: 'exhibition' })), /type/);
    assert.throws(() => B3.game.create(Object.assign(ok(), { type: 'quick', innings: 5 })), /1, 3 or 9/);
    assert.throws(() => B3.game.create(Object.assign(ok(), { type: 'regular', innings: 7 })), /9 innings/);
    const short = ok(); short.away.lineup.pop();
    assert.throws(() => B3.game.create(short), /9 players/);
    const twoC = ok(); twoC.home.lineup[1].pos = 'C'; twoC.home.lineup[7].pos = 'C';
    assert.throws(() => B3.game.create(twoC), /two players/);
    const noPitches = ok(); noPitches.home.players[noPitches.home.pitcher].pitches = ['XX'];
    assert.throws(() => B3.game.create(noPitches), /pitch types/);
    const same = ok(); same.home = same.away;
    assert.throws(() => B3.game.create(same), /different ids/);
    assert.doesNotThrow(() => B3.game.create(ok()));
  });

  t.test('a walk-off hit counts only the winning run and only the bases that run moved', () => {
    const B3 = scripted({ '9.1': ['BB', 'BB', 'BB', double] });
    const g = playGame(B3, { type: 'regular' });
    eq(g.score, [0, 1]);
    assert.strictEqual(g.result.reason, 'walkoff');
    const pa = lastPA(g);
    assert.strictEqual(pa.res, '1B'); // the winning run moved one base (third to home)
    assert.strictEqual(pa.sc.length, 1);
    assert.strictEqual(pa.rbi, 1);
    assert.strictEqual(g.line[1][8], 1);
  });

  t.test('a walk-off home run counts every run', () => {
    const g = playGame(scripted({ '9.1': ['BB', 'BB', 'BB', homer] }), { type: 'regular' });
    eq(g.score, [0, 4]);
    assert.strictEqual(lastPA(g).res, 'HR');
    assert.strictEqual(lastPA(g).rbi, 4);
  });

  t.test('a bases-loaded walk forces in a run with an RBI; home ahead after the top of the 9th does not bat', () => {
    const g = playGame(scripted({ '1.1': ['BB', 'BB', 'BB', 'BB'] }), { type: 'regular' });
    const walk = pas(g, 1, 1)[3];
    assert.strictEqual(walk.res, 'BB');
    assert.strictEqual(walk.sc.length, 1);
    assert.strictEqual(walk.rbi, 1);
    eq(g.score, [0, 1]);
    assert.strictEqual(g.result.reason, 'final');
    assert.strictEqual(g.line[0].length, 9);
    assert.strictEqual(g.line[1].length, 8);
  });

  t.test('earned runs: unearned when the runner reached on an error or scored on an error play', () => {
    const err = (g) => ({ code: 'E', bb: 'ground', fielder: 'SS', caught: false, batter: 1, runners: up(1)(g) });
    const g = playGame(scripted({
      '1.0': [single, double, 'K', 'K', 'K'],     // the runner on first scores on the double: earned
      '2.0': [single, single2, err, 'K', 'K', 'K'], // single; single moves him to third; he scores on the error: unearned
      '3.0': [err, double, 'K', 'K', 'K']           // he reached on an error and scores on a hit: unearned
    }), { type: 'regular' });
    const runs = (i) => pas(g, i, 0).flatMap((e) => e.sc);
    eq(runs(1).map((x) => x.er), [1]);
    eq(runs(2).map((x) => x.er), [0]);
    eq(runs(3).map((x) => x.er), [0]);
    assert.strictEqual(pas(g, 2, 0)[2].rbi, 0, 'no RBI on an error');
  });

  t.test('runs do not count on a double play that makes the third out', () => {
    const dp = (g) => ({ code: 'DP', bb: 'ground', fielder: 'SS', caught: false, batter: 0, runners: [0, null, 4] });
    // Top 1st: runners on first and third, one out, double play: no run. Top 2nd: the same with none out: the run counts, no RBI.
    const g = playGame(scripted({ '1.0': [single, (g) => ({ code: '1B', bb: 'line', fielder: 'RF', caught: false, batter: 1, runners: [3, null, null] }), 'K', dp],
      '2.0': [single, (g) => ({ code: '1B', bb: 'line', fielder: 'RF', caught: false, batter: 1, runners: [3, null, null] }), dp] }), { type: 'regular' });
    const first = pas(g, 1, 0)[3], second = pas(g, 2, 0)[2];
    assert.strictEqual(first.o, 3);
    eq(first.sc, []);
    assert.strictEqual(g.line[0][0], 0);
    assert.strictEqual(second.sc.length, 1);
    assert.strictEqual(second.rbi, 0);
    assert.strictEqual(g.line[0][1], 1);
  });

  t.test('a tag-up from third scores a sac fly; a runner thrown out tagging is an out', () => {
    const B3 = scripted({ '1.0': [single, (g) => ({ code: '1B', bb: 'line', fielder: 'RF', caught: false, batter: 1, runners: [3, null, null] }), flyout, flyout] });
    let tags = 0;
    B3.ball.tagup = () => (++tags === 1); // safe the first time, out the second
    const g = playGame(B3, { type: 'regular' });
    const sf = pas(g, 1, 0)[2], doubled = pas(g, 1, 0)[3];
    assert.strictEqual(sf.res, 'SF');
    assert.strictEqual(sf.rbi, 1);
    eq(sf.tag, { r: 'AWY-CF', from: 3, ok: 1 });
    assert.strictEqual(doubled.res, 'FO');
    assert.strictEqual(doubled.out, 2);
    assert.strictEqual(doubled.o, 3);
    assert.strictEqual(g.line[0][0], 1);
  });

  t.test('caught stealing for the third out: the same batter leads off the next inning', () => {
    const B3 = scripted({ '1.0': ['K', 'K', single] });
    B3.ball.steal = () => false;
    const thief = Object.assign({}, quiet, { steal: (d, g) => (g.inning === 1 ? { runners: [1] } : null) });
    const g = playGame(B3, { type: 'quick', innings: 9 }, [thief, quiet]); // no runs: a tie after 12
    const cs = g.log.find((e) => e.e === 'cs');
    assert.ok(cs && cs.o === 3 && cs.r === 'AWY-1B');
    assert.strictEqual(pas(g, 1, 0).length, 3);
    const leadoff = g.log.find((e) => e.e === 'pitch' && e.i === 2 && e.h === 0);
    assert.strictEqual(leadoff.b, g.teams[0].lineup[3]);
    assert.strictEqual(leadoff.c, '0-0');
  });

  t.test('a pitcher brought in before an extra inning\'s first pitch takes over the placed runner', () => {
    const B3 = loadCore();
    let checked = 0;
    for (let n = 0; n < 400 && checked < 3; n++) {
      let fresh = null;
      const ctl = {
        change: (d, g) => {
          if (g.inning >= 10 && !g.halfPitches && g.bases[1] && g.bases[1].placed && d.bullpen.length) { fresh = d.bullpen[0]; return { pitcher: fresh }; }
          return B3.manager.cpu.change(d, g);
        },
        pitch: (d, g) => {
          if (fresh) { assert.strictEqual(g.bases[1].resp, fresh, 'the placed runner is charged to the new pitcher'); fresh = null; checked++; }
          return B3.manager.cpu.pitch(d, g);
        }
      };
      B3.game.play(B3.game.create(Object.assign(pair(), { type: 'regular', rng: B3.rng.create('placed ' + n) })), [ctl, ctl]);
    }
    assert.ok(checked >= 1, 'some game went to extra innings');
  });

  t.test('extra innings by game type', () => {
    // Regular season: a runner on second, the batter before the leadoff man; his run is unearned.
    const reg = playGame(scripted({ '10.0': [single2] }), { type: 'regular' });
    const placed = reg.log.filter((e) => e.e === 'placed');
    eq(placed.map((e) => [e.i, e.h, e.r, e.base]), [[10, 0, 'AWY-2B', 2], [10, 1, 'HOM-2B', 2]]);
    const run = pas(reg, 10, 0)[0].sc[0];
    eq([run.r, run.er], ['AWY-2B', 0]);
    eq([reg.score, reg.result.reason, reg.inning], [[1, 0], 'final', 10]);
    // Spring: the same rule.
    const spr = playGame(scripted({ '11.1': [single2] }), { type: 'spring' });
    eq([spr.score, spr.result.reason], [[0, 1], 'walkoff']);
    assert.strictEqual(spr.log.filter((e) => e.e === 'placed').length, 4);
    // Postseason: no runner on second.
    const post = playGame(scripted({ '13.0': [homer] }), { type: 'postseason' });
    eq([post.score, post.inning], [[1, 0], 13]);
    assert.strictEqual(post.log.filter((e) => e.e === 'placed').length, 0);
    // Quick Game: a tie after 3 extra innings, at every length.
    for (const n of [1, 3, 9]) {
      const q = playGame(scripted({}), { type: 'quick', innings: n });
      eq([q.result.reason, q.result.winner, q.inning, q.line[0].length, q.line[1].length], ['tie', null, n + 3, n + 3, n + 3]);
    }
  });

  t.test('the mercy rule: Quick Game, 9 innings, a 10-run lead once the trailing team has batted 7 times', () => {
    const ten = [homer, homer, homer, homer, homer, homer, homer, homer, homer, homer];
    // Away leads 10-0 from the 1st: ends after the bottom of the 7th.
    const a = playGame(scripted({ '1.0': ten }), { type: 'quick', innings: 9 });
    eq([a.result.reason, a.inning, a.line[0].length, a.line[1].length], ['mercy', 7, 7, 7]);
    // Home leads 10-0 from the 1st: ends after the top of the 7th.
    const b = playGame(scripted({ '1.1': ten }), { type: 'quick', innings: 9 });
    eq([b.result.reason, b.inning, b.line[0].length, b.line[1].length], ['mercy', 7, 7, 6]);
    // Home reaches a 10-run lead while batting in the 7th: ends at once.
    const c = playGame(scripted({ '7.1': ten }), { type: 'quick', innings: 9 });
    eq([c.result.reason, c.score, c.line[1][6]], ['mercy', [0, 10], 10]);
    assert.strictEqual(c.log.filter((e) => e.e === 'half').pop().outs, 0);
    // Not before the 7th: 10 runs in the bottom of the 6th play on.
    const d = playGame(scripted({ '6.1': ten }), { type: 'quick', innings: 9 });
    eq([d.result.reason, d.inning], ['mercy', 7]);
    // Never in 3-inning Quick Games or league games.
    assert.strictEqual(playGame(scripted({ '1.0': ten }), { type: 'quick', innings: 3 }).result.reason, 'final');
    assert.strictEqual(playGame(scripted({ '1.0': ten }), { type: 'regular' }).inning, 9);
  });

  t.test('the checker catches planted mistakes', () => {
    const B3 = loadCore();
    const base = B3.game.sim(Object.assign(pair(), { rng: B3.rng.create('plant') }));
    assert.deepStrictEqual(check(base).problems, []);
    const copy = () => Object.assign({}, base, { log: JSON.parse(JSON.stringify(base.log)), score: base.score.slice(), line: base.line.map((x) => x.slice()) });
    const plants = [
      (g) => { g.score[0]++; },
      (g) => { g.log.find((e) => e.e === 'pitch' && e.c === '0-0').c = '1-0'; },
      (g) => { g.log.find((e) => e.e === 'half').outs = 2; },
      (g) => { const pa = g.log.find((e) => e.e === 'pa'); pa.b = 'AWY-C'; },
      (g) => { g.log.find((e) => e.e === 'pa' && e.out === 1).out = 0; },
      (g) => { g.line[1].pop(); },
      (g) => { g.result = Object.assign({}, g.result, { reason: 'tie' }); }
    ];
    plants.forEach((plant, n) => {
      const g = copy();
      plant(g);
      assert.ok(check(g).problems.length > 0, 'plant ' + n + ' was not caught');
    });
  });
};
