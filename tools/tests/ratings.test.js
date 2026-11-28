// Ratings into the physics' inputs (M1 step 1.3, task 9): B3.ratings. A rating of 60 gives the
// placeholder; each rating moves only its own hooks, the right way; the top-end curve, the combination
// cap, Stamina, the arsenal and the tendencies. What the inputs then do in games is tools/worth.js's
// table (and pitch.test.js, ball.test.js for each hook).
'use strict';
const assert = require('assert');
const { loadCore } = require('../lib/load');
const { pair, average, rated, STAMINA } = require('../lib/testteams');

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
        else if (k === 'gaps') assert.ok(Object.values(a.pit.gaps).every((x) => x === 8.1), id + ' gaps'); // Session 34: the average change-up's gap
        else if (k !== 'putAway') assert.deepStrictEqual(a.pit[k], b.pit[k], id + ' pit.' + k);
      }
    }
    const avg = average('AVG', 'Average');
    for (const id in avg.players) {
      const a = B3.ratings.inputs(avg.players[id]), b = B3.ratings.inputs(plain.players[id.replace('AVG', 'AWY')]);
      assert.deepStrictEqual(a.bat, b.bat, id + ' bat');
      for (const k in a.pit) if (k !== 'stamina' && k !== 'gaps') assert.deepStrictEqual(a.pit[k], b.pit[k], id + ' pit.' + k);
      near(a.pit.stamina, b.pit.stamina, 0.1, id + ' stamina');
      assert.ok(Object.values(a.pit.gaps || {}).every((x) => x === 8.1), id + ' gaps'); // Session 34: the average change-up's own gap
    }
  });

  t.test('each rating moves its own hooks the right way, and no others', () => {
    const B3 = loadCore();
    // rating -> { 'side.hook': +1 (rises with the rating) or -1 (falls) }
    const own = {
      // Session 11: Timing squares up; Session 33 (Contact's parts split up): Timing handles velocity, Recognition tracks late break
      contact: { 'bat.contactSd': -1 }, timing: { 'bat.timingSd': -1, 'bat.square': -1, 'bat.timingTop': 1 },
      launch: { 'bat.launchK': -1, 'bat.launchSd': -1, 'bat.sprayNoise': -1 },
      rawPower: { 'bat.batSpeed': 1 }, recognition: { 'bat.recognition': 1, 'bat.breakRead': -1, 'bat.track': -1, 'bat.layOff': 1 }, discipline: { 'bat.judgeSd': -1, 'bat.judgeLean': -1 },
      velocity: { 'pit.velo': 1 }, command: { 'pit.commandSd': -1 }, deception: { 'pit.deception': 1, 'pit.soft': 1 }, stamina: { 'pit.stamina': 1 },
      // Defense and running (step 1.4): Range a quicker first step and a better route, Hands fewer errors
      // and a quicker release, Arm more mph, Framing a wider edge, Speed sprint speed, Baserunning a quicker
      // read and jump and a smaller error in judging an extra base.
      range: { 'fld.first': -1, 'fld.route': 1 }, hands: { 'fld.hands': -1, 'fld.release': 1 }, arm: { 'fld.armPlus': 1 },
      framing: { 'fld.framing': 1 }, speed: { 'run.speed': 1 }, baserunning: { 'run.read': -1, 'run.jump': -1, 'run.judge': -1, 'run.lead': 1 }
    };
    const PITR = ['velocity', 'command', 'deception', 'stamina'];
    const base = B3.ratings.inputs(pitcher(Object.assign({ stamina: 60 })));
    const baseH = B3.ratings.inputs(hitter());
    for (const k in own) {
      for (const at of [40, 70, 95]) {
        const pit = PITR.indexOf(k) >= 0;
        const r = {}; r[k] = at; if (pit && k !== 'stamina') r.stamina = 60;
        const inp = pit ? B3.ratings.inputs(pitcher(r)) : B3.ratings.inputs(hitter(r));
        const b = pit ? base : baseH;
        for (const side of ['bat', 'pit', 'fld', 'run']) {
          for (const hk in inp[side]) {
            const d = JSON.stringify(inp[side][hk]) === JSON.stringify(b[side][hk]) ? 0 : Math.sign(inp[side][hk] - b[side][hk]);
            const want = own[k][side + '.' + hk] ? own[k][side + '.' + hk] * Math.sign(at - 60) : 0;
            assert.strictEqual(d, want, k + ' at ' + at + ' moved ' + side + '.' + hk + ' by sign ' + d);
          }
        }
      }
    }
    const R = B3.tune.RATE;
    // The scales: each hook moves by its step per step from 60 (the rating's table in RATE.steps).
    const st = (k, r) => B3.ratings.steps(k, r);
    near(B3.ratings.inputs(hitter({ contact: 70 })).bat.contactSd, B3.tune.BAT.contactSd * Math.pow(R.bat.contactSd[2], st('contact', 70)), 1e-12, 'contact step');
    near(B3.ratings.inputs(pitcher({ velocity: 50 })).pit.velo, B3.tune.PIT.velo + R.pit.velo[2] * st('velocity', 50), 1e-12, 'velocity step');
    // Session 33: a moved job reads its own table on the new rating's points.
    near(B3.ratings.inputs(hitter({ timing: 70 })).bat.timingTop, B3.tune.BAT.timingTop + R.bat.timingTop[2] * st('timingTop', 70), 1e-12, 'timingTop on its own table');
    near(B3.ratings.inputs(hitter({ recognition: 40 })).bat.track, Math.pow(R.bat.track[2], st('track', 40)), 1e-12, 'track on its own table');
    near(B3.ratings.inputs(hitter({ arm: 70 })).fld.armPlus, R.fld.armPlus[2] * st('arm', 70), 1e-12, 'arm step');
    near(B3.ratings.inputs(hitter({ speed: 50 })).run.speed, B3.tune.RUN.speed + R.run.speed[2] * st('speed', 50), 1e-12, 'speed step');
    near(B3.ratings.inputs(hitter({ recognition: 70 })).bat.recognition, 1 - (1 - B3.tune.BAT.recognition) * Math.pow(R.bat.recognition[2], st('recognition', 70)), 1e-12, 'recognition nears 1');
    // Session 19: Deception's contact job steps by plain tens of points (after the curve), not by Deception's table.
    for (const r of [30, 40, 70, 99]) near(B3.ratings.inputs(pitcher({ deception: r })).pit.soft, Math.pow(R.pit.soft[2], (B3.ratings.curve(r) - 60) / 10), 1e-12, 'soft at ' + r);
    // A table's steps: 60 is 0, they rise with the points, and straight lines run between rows and past the ends.
    for (const k in R.steps) {
      assert.strictEqual(st(k, 60), 0, k + ' at 60');
      for (let r = 20; r < 115; r += 5) assert.ok(st(k, r + 5) > st(k, r), k + ' rises at ' + r);
    }
  });

  t.test('Range and Arm are graded against the position; defense and running share their own cap', () => {
    const B3 = loadCore();
    // The fielders the ball sees: a shortstop and a right fielder with Range 70 and Arm 70 against 60s.
    const play = (rt) => {
      const t = average('AWY', 'A'), h = average('HOM', 'H');
      for (const id of ['HOM-SS', 'HOM-RF']) Object.assign(h.players[id].ratings, rt);
      const g = B3.game.create({ type: 'regular', away: t, home: h, rng: B3.rng.create('def') });
      return { ss: g.teams[1].inp['HOM-SS'].fld, rf: g.teams[1].inp['HOM-RF'].fld };
    };
    const a = play({}), b = play({ range: 70, arm: 70 });
    assert.strictEqual(a.ss.first, 1);
    assert.strictEqual(a.ss.armPlus, 0);
    near(b.ss.first, Math.pow(B3.tune.RATE.fld.first[2], B3.ratings.steps('range', 70)), 1e-12, 'a quicker first step');
    near(b.rf.armPlus, B3.tune.RATE.fld.armPlus[2] * B3.ratings.steps('arm', 70), 1e-12, 'more arm');
    assert.strictEqual(b.ss.react, null, 'the first step itself stays the position\'s');
    // The cap: the defense-and-running group is separate from hitting.
    const e = B3.ratings.effective(hitter({ contact: 95, range: 95, speed: 95 }));
    near(e.contact, 100, 1e-9, 'hitting keeps its full extra');
    near(e.range + e.speed, 95 + 5 + 95 + 2.5, 1e-9, 'Range and Speed share a group');
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
    // (Timing, not Raw Power: Contact with Raw Power is a synergy pair, Session 26.)
    const two = B3.ratings.effective(hitter({ contact: 95, timing: 90 }));
    near(two.contact, 100, 1e-9, 'the best of two');
    near(two.timing, 90 + 0.5 * 1.25, 1e-9, 'the second of two');
    const all = B3.ratings.effective(hitter({ contact: 99, timing: 99, launch: 99, rawPower: 99, recognition: 99, discipline: 99 }));
    const extra = B3.ratings.HIT.reduce((s, k) => s + all[k] - 99, 0);
    near(extra, B3.tune.RATE.top.cap, 1e-9, 'the cap');
    // Hitting and pitching are separate groups; pitch grades share the pitching group.
    // (Command, not Velocity: Velocity with the put-away pitch is a synergy pair, Session 26.)
    const p = B3.ratings.effective(pitcher({ command: 95 }, { arsenal: { SL: { grade: 95 } } }));
    near(p.command + p.grades.SL, 95 + 5 + 95 + 2.5, 1e-9, 'command and the slider share a group');
    near(B3.ratings.effective(pitcher({ velocity: 95, stamina: 95 })).stamina, 100, 1e-9, 'Stamina is outside the cap');
  });

  t.test('the pair synergies (Session 26): both above 60 pay off, inside the cap; physical measures never receive', () => {
    const B3 = loadCore();
    const rows = B3.tune.RATE.synergy;
    assert.strictEqual(rows.map((r) => r.pair.join('+')).join(' '), 'contact+rawPower recognition+discipline velocity+putAway speed+baserunning velocity+command');
    for (const r of rows) assert.ok(r.k > 0 && r.to.length >= 1 && r.to.every((k) => r.pair.indexOf(k) >= 0), r.pair.join('+') + ' has a size and its own receivers');
    const k = (a, b) => rows.find((r) => r.pair[0] === a && r.pair[1] === b).k;
    // Nothing unless both are above 60: a specialist with a hole plays as before.
    for (const rt of [{ contact: 80 }, { rawPower: 80 }, { contact: 80, rawPower: 60 }, { contact: 80, rawPower: 40 }, { contact: 40, rawPower: 40 }]) {
      const e = B3.ratings.effective(hitter(rt));
      near(e.contact, rt.contact || 60, 1e-12, JSON.stringify(rt) + ' contact');
      near(e.rawPower, rt.rawPower || 60, 1e-12, JSON.stringify(rt) + ' rawPower');
    }
    // Both above 60: k x (a - 60) x (b - 60) / 100 points to the receivers; bat speed (Raw Power's own stat) is untouched.
    const cp = B3.ratings.effective(hitter({ contact: 80, rawPower: 70 }));
    near(cp.contact, 80 + k('contact', 'rawPower') * 20 * 10 / 100, 1e-9, 'contact gets the points');
    near(cp.rawPower, 70, 1e-12, 'raw power stays');
    assert.strictEqual(B3.ratings.synergy(hitter({ contact: 80, rawPower: 70 })).filter((b) => b.points > 0).map((b) => b.pair.join('+')).join(' '), 'contact+rawPower');
    // A pair with two receivers shares them equally.
    const rd = B3.ratings.effective(hitter({ recognition: 75, discipline: 75 }));
    near(rd.recognition, 75 + k('recognition', 'discipline') * 15 * 15 / 100 / 2, 1e-9, 'recognition gets half');
    near(rd.discipline, rd.recognition, 1e-12, 'discipline gets half');
    // Velocity with the put-away pitch: the put-away grade gets the points, Velocity (fastball mph) stays.
    const vp = B3.ratings.effective(pitcher({ velocity: 75 }, { arsenal: { SL: { grade: 70 }, CH: { grade: 65 } } }));
    near(vp.grades.SL, 70 + k('velocity', 'putAway') * 15 * 10 / 100, 1e-9, 'the put-away slider gets the points');
    near(vp.grades.CH, 65, 1e-12, 'another pitch does not');
    near(vp.velocity, 75, 1e-12, 'velocity stays');
    const vpIn = B3.ratings.inputs(pitcher({ velocity: 75 }, { arsenal: { SL: { grade: 70 } } })), vpOff = B3.ratings.inputs(pitcher({ velocity: 60 }, { arsenal: { SL: { grade: 70 } } }));
    assert.ok(vpIn.pit.grades.SL > vpOff.pit.grades.SL, 'and it reaches the slider\'s movement');
    // Velocity with Command (Session 34): Command gets the points, Velocity stays.
    const vc = B3.ratings.effective(pitcher({ velocity: 75, command: 70 }));
    near(vc.command, 70 + k('velocity', 'command') * 15 * 10 / 100, 1e-9, 'command gets the points');
    near(vc.velocity, 75, 1e-12, 'velocity stays');
    // Speed with Baserunning: Baserunning gets the points, sprint speed stays.
    const sb = B3.ratings.effective(hitter({ speed: 80, baserunning: 80 }));
    near(sb.baserunning, 80 + k('speed', 'baserunning') * 4, 1e-9, 'baserunning gets the points');
    near(sb.speed, 80, 1e-12, 'speed stays');
    // Inside the cap: a hitter at 99 everywhere still adds at most the cap in all.
    const all = B3.ratings.effective(hitter({ contact: 99, timing: 99, launch: 99, rawPower: 99, recognition: 99, discipline: 99 }));
    near(B3.ratings.HIT.reduce((x, kk) => x + all[kk] - 99, 0), B3.tune.RATE.top.cap, 1e-9, 'the cap holds');
    // More of either rating adds more once both are above 60 (the payoff grows with the partner).
    let last = -1;
    for (let r = 61; r <= 85; r += 2) { const e = B3.ratings.effective(hitter({ contact: 70, rawPower: r })); assert.ok(e.contact > last, 'grows at ' + r); last = e.contact; }
  });

  t.test('Stamina sets the pitches before fatigue, one scale for every role', () => {
    const B3 = loadCore();
    near(B3.ratings.stamina(60), B3.tune.STAMINA.SP, 1e-9, 'a 60 is the placeholder starter');
    // Session 16: relievers sit at about 20-30 on the scale (from 30 up it follows real starters' pitches per start).
    near(B3.ratings.stamina(STAMINA.other), B3.tune.STAMINA.other, 1e-9, 'the test teams\' reliever Stamina is the placeholder reliever');
    near(B3.ratings.stamina(STAMINA.LR), B3.tune.STAMINA.LR, 1e-9, 'and the long man\'s');
    assert.ok(STAMINA.other > 20 && STAMINA.LR < 30, 'relievers between 20 and 30');
    let last = 0;
    for (let r = 20; r <= 110; r += 2.5) { const s = B3.ratings.stamina(r); assert.ok(s > last, 'rises at ' + r); last = s; }
    const sp = B3.ratings.inputs(pitcher({ stamina: 40 })), rp = B3.ratings.inputs(pitcher({ stamina: 40 }, { role: 'MR' }));
    assert.strictEqual(sp.pit.stamina, rp.pit.stamina, 'the role does not matter once there is a rating');
    assert.strictEqual(B3.ratings.inputs(pitcher({}, { role: 'MR' })).pit.stamina, B3.tune.STAMINA.other, 'no rating: the role placeholder');
  });

  t.test('the arsenal: grades scale movement, shapes add drop, the put-away pitch is the best grade', () => {
    const B3 = loadCore();
    const p = B3.ratings.inputs(pitcher({}, { arsenal: { FF: { grade: 50, shape: -0.5 }, SL: { grade: 80 }, CH: { grade: 70, shape: 1 } } }));
    // Session 30: each type's own step (TYPE.gradeStep, 1 when unset, as for the four-seamer)
    const gs = (r, t) => B3.ratings.steps('grade', r) * B3.tune.RATE.grade.step * (B3.tune.TYPE[t].gradeStep || 1);
    near(p.pit.grades.FF, 1 + gs(50, 'FF'), 1e-12, 'FF grade');
    near(p.pit.grades.SL, 1 + gs(80, 'SL'), 1e-12, 'SL grade');
    near(B3.ratings.gradeUnits('CH', p.pit.grades.CH), B3.ratings.steps('grade', 70), 1e-12, 'gradeUnits turns a multiplier back into the table\'s steps');
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
    // Swing path (owner's choice, Session 11): Ground-ball -1, Level 0, Lift 1.
    assert.strictEqual(B3.ratings.inputs(hitter({}, { tendencies: { swingPath: 'Lift' } })).bat.swingPath, 1);
    assert.strictEqual(B3.ratings.inputs(hitter({}, { tendencies: { swingPath: 'Ground-ball' } })).bat.swingPath, -1);
    assert.strictEqual(B3.ratings.inputs(hitter({})).bat.swingPath, 0);
    assert.throws(() => B3.ratings.inputs(hitter({}, { tendencies: { swingPath: 'Chop' } })), /Ground-ball, Level, Lift/);
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
