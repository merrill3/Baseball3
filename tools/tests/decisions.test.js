// Decision points (M1 step 1.1, task 4): a scripted "player" answers every choice for one side.
'use strict';
const assert = require('assert');
const { loadCore } = require('../lib/load');
const { pair } = require('../lib/testteams');
const { check } = require('../lib/gamecheck');

const eq = (actual, expected, msg) => assert.deepStrictEqual(JSON.parse(JSON.stringify(actual)), expected, msg);
const FIELDING = { change: true, pitch: true }; // the other kinds are the batting side's

// A deterministic player: it never uses the game's random numbers, like a person at the controls.
// It records every decision it is given and every answer it gives.
function player() {
  const p = { asked: [], given: [], n: 0 };
  const answer = (d, a) => { p.asked.push(d); p.given.push({ kind: d.kind, i: null, answer: a }); return a; };
  const targets = [{ x: 0, z: 2.5 }, { x: 0.5, z: 2 }, { x: -1.3, z: 2.4 }, { x: 0.2, z: 1.0 }, { x: -0.4, z: 3.1 }];
  p.change = (d, g) => {
    // Bring in a reliever to start the 4th and the 7th innings.
    const start = g.outs === 0 && g.balls === 0 && g.strikes === 0 && !g.log.some((e) => e.e === 'pa' && e.i === g.inning && e.h === g.half);
    return answer(d, start && (g.inning === 4 || g.inning === 7) && d.bullpen.length ? { pitcher: d.bullpen[d.bullpen.length - 1] } : null);
  };
  p.steal = (d) => {
    p.n++;
    if (d.runners.indexOf(1) >= 0 && d.runners.indexOf(2) >= 0) return answer(d, { runners: [1, 2] }); // double steal
    return answer(d, p.n % 4 === 0 ? { runners: [d.runners[0]] } : null);
  };
  p.pitch = (d) => { p.n++; return answer(d, Object.assign({ type: d.pitches[p.n % d.pitches.length] }, targets[p.n % targets.length])); };
  p.swing = (d) => answer(d, d.pitch.zone || d.strikes === 2 ? { swing: true, timing: (p.n % 7) * 10 - 30 } : { swing: false });
  p.tagup = (d) => answer(d, { go: d.from === 3 });
  return p;
}

function newGame(B3, seed) {
  return B3.game.create(Object.assign(pair(), { type: 'regular', rng: B3.rng.create(seed) }));
}

// Checks that the player's answers are what the game did.
function verify(g, p, side) {
  eq(check(g).problems, [], 'invariants');
  const kinds = {};
  for (const d of p.asked) {
    kinds[d.kind] = (kinds[d.kind] || 0) + 1;
    assert.strictEqual(d.side, side, 'the player was asked a ' + d.kind + ' for the other side');
  }
  for (const k of ['change', 'steal', 'pitch', 'swing', 'tagup']) assert.ok(kinds[k] > 0, 'the player was never asked: ' + k);
  // Its pitches: every pitch the home team threw has the player's type, in order.
  const thrown = g.log.filter((e) => e.e === 'pitch' && e.h === 1 - side);
  const chosen = p.given.filter((x) => x.kind === 'pitch').map((x) => x.answer.type);
  eq(thrown.map((e) => e.t), chosen);
  // Its swings: every pitch to its hitters records the swing or the take it chose.
  const faced = g.log.filter((e) => e.e === 'pitch' && e.h === side);
  const swings = p.given.filter((x) => x.kind === 'swing').map((x) => x.answer);
  eq(faced.map((e) => (e.tm === undefined ? null : e.tm)), swings.map((a) => (a.swing ? a.timing : null)));
  // Its pitching changes: one sub per change it asked for, with that pitcher.
  const asked = p.given.filter((x) => x.kind === 'change' && x.answer).map((x) => x.answer.pitcher);
  eq(g.log.filter((e) => e.e === 'sub' && e.side === side).map((e) => e.in), asked);
  // Its steals happened (or were wiped out by a foul or a ball in play); the CPU's side never stole for it.
  const steals = g.log.filter((e) => (e.e === 'sb' || e.e === 'cs') && e.h === side).length;
  assert.ok(steals > 0, 'none of the player\'s steals happened');
  // Its tag-ups: a tag on a PA only where it said go.
  const tags = g.log.filter((e) => e.e === 'pa' && e.h === side && e.tag);
  assert.ok(tags.every((e) => e.tag.from === 3), 'a tag-up the player did not send');
  return kinds;
}

module.exports = function (t) {
  t.test('a scripted player answers every choice for one side through B3.game.play', () => {
    const B3 = loadCore();
    let total = { change: 0, steal: 0, pitch: 0, swing: 0, tagup: 0 }, doubles = 0;
    // Several seeds, so every kind of decision comes up.
    for (let s = 0; s < 6; s++) {
      const p = player();
      const g = newGame(B3, 'player ' + s);
      B3.game.play(g, [null, p]);
      const kinds = {};
      for (const d of p.asked) kinds[d.kind] = (kinds[d.kind] || 0) + 1;
      for (const k in kinds) total[k] += kinds[k];
      doubles += p.given.filter((x) => x.kind === 'steal' && x.answer && x.answer.runners.length === 2).length;
      eq(check(g).problems, []);
    }
    for (const k in total) assert.ok(total[k] > 0, 'never asked: ' + k);
    assert.ok(doubles > 0, 'no double steal was tried');
  });

  t.test('the same game driven by hand, one answer at a time, as the UI will', () => {
    const B3 = loadCore();
    // Find a seed where the player sees every kind, then check every answer took effect.
    for (let s = 0; s < 40; s++) {
      const p = player();
      const g = newGame(B3, 'by hand ' + s);
      while (g.pending) {
        const d = g.pending;
        if (FIELDING[d.kind] ? d.side !== 1 - g.half : d.side !== g.half) assert.fail('decision ' + d.kind + ' is for the wrong side');
        const a = d.side === 1 ? p[d.kind](d, g) : B3.manager.cpu[d.kind](d, g);
        const next = B3.game.answer(g, a);
        assert.strictEqual(next, g.pending);
      }
      const kinds = {};
      for (const d of p.asked) kinds[d.kind] = 1;
      const steals = g.log.filter((e) => (e.e === 'sb' || e.e === 'cs') && e.h === 1).length;
      if (Object.keys(kinds).length === 5 && steals > 0) {
        verify(g, p, 1);
        // The same seed and the same answers repeat exactly.
        const p2 = player();
        const g2 = newGame(B3, 'by hand ' + s);
        B3.game.play(g2, [null, p2]);
        assert.strictEqual(JSON.stringify(g2.log), JSON.stringify(g.log));
        return;
      }
    }
    assert.fail('no seed gave the player every kind of decision');
  });

  t.test('a bad answer is refused and leaves the decision waiting', () => {
    const B3 = loadCore();
    const g = newGame(B3, 'bad answers');
    const tries = {
      change: [{ pitcher: 'HOM-SP' }, { pitcher: 'nobody' }, 'yes'],
      steal: [{ runners: [3] }, { runners: 1 }, 7],
      pitch: [{ type: 'XX', x: 0, z: 2 }, { type: 'FF', x: 0 }, { type: 'FF', x: NaN, z: 2 }, null],
      swing: [{ swing: 'yes' }, { swing: true }, { swing: true, timing: Infinity }, null],
      tagup: [{ go: 1 }, null]
    };
    const refused = {};
    let guard = 0;
    while (g.pending && guard++ < 5000) {
      const d = g.pending;
      const before = JSON.stringify([d, g.log.length, g.balls, g.strikes, g.outs]);
      for (const bad of tries[d.kind]) {
        assert.throws(() => B3.game.answer(g, bad), /B3\.game/, d.kind + ' accepted ' + JSON.stringify(bad));
        assert.strictEqual(JSON.stringify([g.pending, g.log.length, g.balls, g.strikes, g.outs]), before, 'a refused answer changed the game');
        refused[d.kind] = true;
      }
      B3.game.answer(g, B3.manager.cpu[d.kind](d, g));
    }
    assert.throws(() => B3.game.answer(g, null), /game is over/);
    for (const k of ['change', 'steal', 'pitch', 'swing', 'tagup']) assert.ok(refused[k], 'never tried a bad ' + k);
    eq(check(g).problems, []);
  });

  t.test('the runner on first can go only with the runner on second when second is taken', () => {
    const B3 = loadCore();
    let tested = false;
    for (let s = 0; s < 30 && !tested; s++) {
      const g = newGame(B3, 'steal rule ' + s);
      while (g.pending) {
        const d = g.pending;
        if (d.kind === 'steal' && g.bases[0] && g.bases[1] && !g.bases[2]) {
          eq(d.runners, [1, 2]);
          assert.throws(() => B3.game.answer(g, { runners: [1] }), /runner on second goes too/);
          tested = true;
        }
        B3.game.answer(g, B3.manager.cpu[d.kind](d, g));
      }
    }
    assert.ok(tested, 'never had runners on first and second with third open');
  });

  t.test('the CPU answers every decision, for every game type', () => {
    const B3 = loadCore();
    for (const opts of [{ type: 'regular' }, { type: 'spring' }, { type: 'postseason' }, { type: 'quick', innings: 1 }, { type: 'quick', innings: 3 }, { type: 'quick', innings: 9 }]) {
      const g = B3.game.sim(Object.assign(pair(), opts, { rng: B3.rng.create('cpu ' + opts.type + opts.innings) }));
      assert.ok(g.over);
      eq(check(g).problems, []);
    }
  });
};
