// Ratings into the physics' inputs (M1 step 1.3, task 9): B3.ratings. A rating of 60 gives the
// placeholder; each rating moves only its own hooks, the right way; the top-end curve, the combination
// cap, Stamina, the arsenal and the tendencies. What the inputs then do in games is tools/worth.js's
// table (and pitch.test.js, ball.test.js for each hook).
'use strict';
const assert = require('assert');
const { loadCore } = require('../lib/load');
const { pair, average, rated } = require('../lib/testteams');

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || '') + ': ' + a + ' is not within ' + tol + ' of ' + b);
const hitter = (ratings, more) => Object.assign({ id: 'H', bats: 'R', ratings: ratings || {} }, more || {});
const pitcher = (ratings, more) => Object.assign({ id: 'P', role: 'SP', throws: 'R', pitches: ['FF', 'SL', 'CH', 'CU'], ratings: ratings || {} }, more || {});

module.exports = function (t) {
  t.test('no ratings, or every rating at 60, gives exactly the placeholder inputs', () => {
    const B3 = loadCore();
    const plain = pair().away;
    for (const id in plain.players) {
      const p = plain.players[id], a = B3.ratings.inputs(p), b = B3.tune.inputs(p);
      for (const side of ['bat', 'fld', 'run']) assert.deepStrictEqual(a[side], b[side], id + ' ' + side);
      for (const k in a.pit) {
        if (k === 'grades') assert.ok(Object.values(a.pit.grades).every((x) => x === 1), id + ' grades');
        else if (k === 'shapes') assert.ok(Object.values(a.pit.shapes).every((x) => x === 0), id + ' shapes');
        else if (k !== 'putAway') assert.deepStrictEqual(a.pit[k], b.pit[k], id + ' pit.' + k);
      }
    }
    const avg = average('AVG', 'Average');
    for (const id in avg.players) {
      const a = B3.ratings.inputs(avg.players[id]), b = B3.ratings.inputs(plain.players[id.replace('AVG', 'AWY')]);
      assert.deepStrictEqual(a.bat, b.bat, id + ' bat');
      for (const k in a.pit) if (k !== 'stamina') assert.deepStrictEqual(a.pit[k], b.pit[k], id + ' pit.' + k);
      near(a.pit.stamina, b.pit.stamina, 0.1, id + ' stamina');
    }
  });

  t.test('each rating moves its own hooks the right way, and no others', () => {
    const B3 = loadCore();
    // rating -> { hook: +1 (rises with the rating) or -1 (falls) }
    const own = {
      contact: { contactSd: -1 }, timing: { timingSd: -1, timingTop: 1 }, launch: { launchK: -1, launchSd: -1, sprayNoise: -1 },
      rawPower: { batSpeed: 1 }, recognition: { recognition: 1 }, discipline: { judgeSd: -1, judgeLean: -1 },
      velocity: { velo: 1 }, command: { commandSd: -1 }, deception: { deception: 1 }, stamina: { stamina: 1 }
    };
    const base = B3.ratings.inputs(pitcher(Object.assign({ stamina: 60 })));
    const baseH = B3.ratings.inputs(hitter());
    for (const k in own) {
      for (const at of [40, 70, 95]) {
        const pit = k === 'velocity' || k === 'command' || k === 'deception' || k === 'stamina';
        const r = {}; r[k] = at; if (pit && k !== 'stamina') r.stamina = 60;
        const inp = pit ? B3.ratings.inputs(pitcher(r)) : B3.ratings.inputs(hitter(r));
        const b = pit ? base : baseH, side = pit ? 'pit' : 'bat';
        for (const hk in inp[side]) {
          const d = JSON.stringify(inp[side][hk]) === JSON.stringify(b[side][hk]) ? 0 : Math.sign(inp[side][hk] - b[side][hk]);
          const want = own[k][hk] ? own[k][hk] * Math.sign(at - 60) : 0;
          assert.strictEqual(d, want, k + ' at ' + at + ' moved ' + side + '.' + hk + ' by sign ' + d);
        }
        const other = pit ? 'bat' : 'pit';
        assert.deepStrictEqual(inp[other], b[other], k + ' moved the ' + other + ' inputs');
        assert.deepStrictEqual(inp.fld, b.fld, k + ' moved fielding (step 1.4)');
        assert.deepStrictEqual(inp.run, b.run, k + ' moved running (step 1.4)');
      }
    }
    // The scales: +10 points is one step.
    const R = B3.tune.RATE;
    near(B3.ratings.inputs(hitter({ contact: 70 })).bat.contactSd, B3.tune.BAT.contactSd * R.bat.contactSd[2], 1e-12, 'contact step');
    near(B3.ratings.inputs(pitcher({ velocity: 50 })).pit.velo, B3.tune.PIT.velo - R.pit.velo[2], 1e-12, 'velocity step');
  });

  t.test('the steep curve past 85, and the capped combination bonus', () => {
    const B3 = loadCore();
    assert.strictEqual(B3.ratings.curve(40), 40);
    assert.strictEqual(B3.ratings.curve(85), 85);
    near(B3.ratings.curve(90), 91.25, 1e-9, '90');
    near(B3.ratings.curve(99), 108.8, 1e-9, '99');
    // Per point, the top is steeper than the middle.
    assert.ok(B3.ratings.curve(99) - B3.ratings.curve(89) > 1.5 * (B3.ratings.curve(70) - B3.ratings.curve(60)));
    // One elite rating gets its full extra; a second gets half; many together stop at the cap.
    const one = B3.ratings.effective(hitter({ contact: 95 }));
    near(one.contact, 100, 1e-9, 'one 95');
    const two = B3.ratings.effective(hitter({ contact: 95, rawPower: 90 }));
    near(two.contact, 100, 1e-9, 'the best of two');
    near(two.rawPower, 90 + 0.5 * 1.25, 1e-9, 'the second of two');
    const all = B3.ratings.effective(hitter({ contact: 99, timing: 99, launch: 99, rawPower: 99, recognition: 99, discipline: 99 }));
    const extra = B3.ratings.HIT.reduce((s, k) => s + all[k] - 99, 0);
    near(extra, B3.tune.RATE.top.cap, 1e-9, 'the cap');
    // Hitting and pitching are separate groups; pitch grades share the pitching group.
    const p = B3.ratings.effective(pitcher({ velocity: 95 }, { arsenal: { SL: { grade: 95 } } }));
    near(p.velocity + p.grades.SL, 95 + 5 + 95 + 2.5, 1e-9, 'velocity and the slider share a group');
    near(B3.ratings.effective(pitcher({ velocity: 95, stamina: 95 })).stamina, 100, 1e-9, 'Stamina is outside the cap');
  });

  t.test('Stamina sets the pitches before fatigue, one scale for every role', () => {
    const B3 = loadCore();
    near(B3.ratings.stamina(60), B3.tune.STAMINA.SP, 1e-9, 'a 60 is the placeholder starter');
    near(B3.ratings.stamina(30), B3.tune.STAMINA.other, 1e-9, 'a 30 is the placeholder reliever');
    let last = 0;
    for (let r = 20; r <= 110; r += 2.5) { const s = B3.ratings.stamina(r); assert.ok(s > last, 'rises at ' + r); last = s; }
    const sp = B3.ratings.inputs(pitcher({ stamina: 40 })), rp = B3.ratings.inputs(pitcher({ stamina: 40 }, { role: 'MR' }));
    assert.strictEqual(sp.pit.stamina, rp.pit.stamina, 'the role does not matter once there is a rating');
    assert.strictEqual(B3.ratings.inputs(pitcher({}, { role: 'MR' })).pit.stamina, B3.tune.STAMINA.other, 'no rating: the role placeholder');
  });

  t.test('the arsenal: grades scale movement, shapes add drop, the put-away pitch is the best grade', () => {
    const B3 = loadCore();
    const p = B3.ratings.inputs(pitcher({}, { arsenal: { FF: { grade: 50, shape: -0.5 }, SL: { grade: 80 }, CH: { grade: 70, shape: 1 } } }));
    near(p.pit.grades.FF, 1 - B3.tune.RATE.grade.step, 1e-12, 'FF grade');
    near(p.pit.grades.SL, 1 + 2 * B3.tune.RATE.grade.step, 1e-12, 'SL grade');
    assert.strictEqual(p.pit.grades.CU, 1, 'a pitch with no grade is average');
    assert.strictEqual(p.pit.shapes.FF, -0.5 * B3.tune.RATE.shape);
    assert.strictEqual(p.pit.shapes.CH, B3.tune.RATE.shape);
    assert.strictEqual(p.pit.putAway, 'SL');
    assert.ok(B3.ratings.inputs(pitcher({}, { arsenal: { CU: { grade: 20 } } })).pit.grades.CU >= B3.tune.RATE.grade.min);
    // A tie goes to the type that misses the most bats.
    assert.strictEqual(B3.ratings.inputs(pitcher()).pit.putAway, 'SL');
    assert.strictEqual(B3.ratings.inputs(pitcher({}, { pitches: ['FF', 'SI', 'CH'] })).pit.putAway, 'CH');
    assert.strictEqual(B3.ratings.inputs(pitcher({}, { pitches: ['FF', 'CU'], arsenal: { FF: { grade: 75 } } })).pit.putAway, 'FF');
  });

  t.test('tendencies map to the hooks; bad ratings, grades, shapes and tendencies are refused', () => {
    const B3 = loadCore();
    assert.strictEqual(B3.ratings.inputs(hitter({}, { tendencies: { aggressiveness: 'Aggressive' } })).bat.aggressiveness, 1);
    assert.strictEqual(B3.ratings.inputs(hitter({}, { tendencies: { aggressiveness: 'Patient' } })).bat.aggressiveness, -1);
    assert.strictEqual(B3.ratings.inputs(pitcher({}, { tendencies: { aim: 'Nibbler' } })).pit.aim, -1);
    assert.strictEqual(B3.ratings.inputs(pitcher({}, { tendencies: { aim: 'Attacker' } })).pit.aim, 1);
    assert.throws(() => B3.ratings.inputs(hitter({ contact: 100 })), /contact must be a number from 20 to 99/);
    assert.throws(() => B3.ratings.inputs(hitter({ contact: '70' })), /contact/);
    assert.throws(() => B3.ratings.inputs(pitcher({}, { arsenal: { SL: { grade: 10 } } })), /SL grade/);
    assert.throws(() => B3.ratings.inputs(pitcher({}, { arsenal: { SL: { shape: 2 } } })), /SL shape/);
    assert.throws(() => B3.ratings.inputs(hitter({}, { tendencies: { aggressiveness: 'Wild' } })), /Patient, Balanced, Aggressive/);
    // player.sim still overrides a rating.
    assert.strictEqual(B3.ratings.inputs(hitter({ contact: 90 }, { sim: { bat: { contactSd: 2.2 } } })).bat.contactSd, 2.2);
  });

  t.test('games use the ratings: rated teams play, and their inputs come from their ratings', () => {
    const B3 = loadCore();
    const rng = B3.rng.create('rated teams');
    const away = rated('AWY', 'Away', rng), home = rated('HOM', 'Home', rng);
    const g = B3.game.create({ type: 'regular', away: away, home: home, rng: B3.rng.create('game') });
    for (const id of ['AWY-CF', 'HOM-SP', 'HOM-CL']) {
      assert.deepStrictEqual(g.teams[id[0] === 'A' ? 0 : 1].inp[id], B3.ratings.inputs((id[0] === 'A' ? away : home).players[id]), id);
    }
    assert.ok(g.teams[1].inp['HOM-SP'].pit.stamina > g.teams[1].inp['HOM-CL'].pit.stamina, 'starters last longer');
    B3.game.play(g);
    assert.ok(g.over && g.result.reason);
    assert.throws(() => B3.game.create({ type: 'regular', away: Object.assign(average('AWY', 'A'), {}), home: (() => { const h = average('HOM', 'H'); h.players['HOM-C'].ratings.contact = 120; return h; })(), rng: B3.rng.create('x') }), /HOM-C contact/);
  });
};
