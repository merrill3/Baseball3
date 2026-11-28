// The overall and the Arsenal numbers (M2 step 2.1a task 3, Session 29): B3.overall. The scale's anchors (the league's
// average regular at each position and its average starter at 50), each rating counting by its worth and by position,
// the Arsenal number as a grade weighted toward his best pitch, potential on the overall's scale, and a generated
// league's spread. How well the overall matches the game's replays is tools/overall.js --part=check's job.
'use strict';
const assert = require('assert');
const { loadCore } = require('../lib/load');

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const median = (xs) => { const v = xs.slice().sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; };

function hitter(pos, r) { return { id: 't-' + pos, pos: pos, ratings: Object.assign({}, r || {}) }; }
function pitcher(role, r, arsenal) {
  const a = arsenal || { FF: 60, SL: 60, CH: 60, CU: 60 };
  const p = { id: 't-' + role, pos: 'P', role: role, ratings: Object.assign({ stamina: role === 'SP' ? 60 : 23 }, r || {}), pitches: Object.keys(a), arsenal: {} };
  for (const t in a) p.arsenal[t] = { grade: a[t], shape: 0 };
  return p;
}

let LEAGUE = null;
function league() {
  if (LEAGUE) return LEAGUE;
  const B3 = loadCore();
  const rng = B3.rng.create('overall test'), ctx = B3.players.context();
  const orgs = [];
  for (let i = 0; i < 60; i++) orgs.push(B3.players.squad(rng, ctx));
  const tier = (k) => [].concat(...orgs.map((o) => o[k]));
  LEAGUE = { B3: B3, orgs: orgs, regulars: tier('regulars'), starters: tier('starters'), relievers: tier('relievers'), reserves: tier('reserves'), bench: tier('bench') };
  return LEAGUE;
}

module.exports = function (t) {
  t.test('the league\'s average player is 50: regulars at each position and starters, and a player with his position\'s average ratings about that', () => {
    const { B3, regulars, starters } = league();
    const G = B3.players.GEN, O = B3.overall;
    const pts = (p) => 50 + O.SEASON.points * O.detail(p).runs / O.SEASON.runsPerWin; // before rounding and the 20-99 clip
    for (const pos of B3.data.LINEUP_POS) {
      const m = mean(regulars.filter((p) => p.pos === pos).map(pts));
      assert.ok(Math.abs(m - 50) < 4, pos + ' mean ' + m.toFixed(1));
      const avg = O.of(hitter(pos, { rawPower: 60 + G.posPower[pos], speed: 60 + G.posSpeed[pos] }));
      assert.ok(Math.abs(avg - 50) <= 3, pos + ' average ratings ' + avg);
    }
    assert.ok(Math.abs(mean(regulars.map(pts)) - 50) < 1.5, 'regulars ' + mean(regulars.map(pts)).toFixed(1));
    assert.ok(Math.abs(mean(starters.map(pts)) - 50) < 1.5, 'starters ' + mean(starters.map(pts)).toFixed(1));
    assert.ok(Math.abs(O.detail(regulars[0]).war - O.SEASON.regularWins - O.detail(regulars[0]).runs / O.SEASON.runsPerWin) < 1e-9);
  });

  t.test('every rating counts by its worth: a better rating never lowers the overall, and the job decides how much', () => {
    const B3 = loadCore(), O = B3.overall;
    const runs = (p) => O.detail(p).runs;
    for (const k of ['contact', 'timing', 'launch', 'rawPower', 'recognition', 'discipline', 'speed', 'baserunning', 'range', 'hands', 'arm']) {
      let last = -Infinity;
      for (let r = 20; r <= 99; r += 5) {
        const x = runs(hitter('SS', { [k]: r }));
        assert.ok(x >= last - 1e-9, k + ' at ' + r);
        last = x;
      }
      assert.ok(runs(hitter('SS', { [k]: 80 })) > runs(hitter('SS', { [k]: 40 })), k + ' moves it');
    }
    for (const k of ['velocity', 'command', 'deception', 'stamina']) {
      assert.ok(runs(pitcher('SP', { [k]: 80 })) > runs(pitcher('SP', { [k]: 40 })), k);
    }
    // Position-weighted: Range is worth more at shortstop than at first base, and nothing at DH; Framing only for a catcher.
    const gain = (pos, k) => runs(hitter(pos, { [k]: 80 })) - runs(hitter(pos, { [k]: 60 }));
    assert.ok(gain('SS', 'range') > gain('1B', 'range'), 'Range SS > 1B');
    assert.strictEqual(gain('DH', 'range'), 0);
    assert.strictEqual(gain('DH', 'arm'), 0);
    assert.ok(gain('C', 'framing') > 0);
    assert.strictEqual(gain('SS', 'framing'), 0);
    assert.ok(gain('DH', 'speed') > 0 && gain('CF', 'speed') > gain('DH', 'speed'), 'Speed runs everywhere, fields too in center');
    // Stamina counts for a starter, not for a reliever.
    assert.ok(runs(pitcher('SP', { stamina: 80 })) > runs(pitcher('SP', { stamina: 60 })));
    assert.strictEqual(runs(pitcher('CL', { stamina: 28 })), runs(pitcher('CL', { stamina: 20 })));
  });

  t.test('the overall is a whole number from 20 to 99, the same each time, and leaves the player unchanged', () => {
    const { B3, regulars, starters, relievers, reserves } = league();
    for (const p of [].concat(regulars, starters, relievers, reserves)) {
      const before = JSON.stringify(p);
      const o = B3.overall.of(p);
      assert.ok(Number.isInteger(o) && o >= 20 && o <= 99, p.id + ' ' + o);
      assert.strictEqual(B3.overall.of(p), o);
      assert.strictEqual(JSON.stringify(p), before);
    }
    assert.strictEqual(B3.overall.of(hitter('C', { contact: 99, timing: 99, launch: 99, rawPower: 99, recognition: 99, discipline: 99, framing: 99 })), 99);
    assert.strictEqual(B3.overall.of(hitter('C', { contact: 20, timing: 20, launch: 20, rawPower: 20, recognition: 20, discipline: 20, framing: 20 })), 20);
    assert.throws(() => B3.overall.of({ id: 'x', ratings: {} }), /lineup position/);
  });

  t.test('the Arsenal number is a grade: every pitch at a grade reads that grade, weighted toward his best', () => {
    // Session 31: the numbers are re-centered so the league's average pitcher reads 60 (BASE.arsenal); before that shift
    // (raw) a flat arsenal reads its grade.
    const B3 = loadCore(), A = (a) => B3.overall.arsenal(pitcher('SP', {}, a), true);
    const shifted = B3.overall.arsenal(pitcher('SP', {}, { FF: 70, SL: 70, CH: 70 }));
    assert.ok(Math.abs(shifted.arsenal - (70 - B3.overall.BASE.arsenal.arsenal)) <= 1, 'the shift ' + shifted.arsenal);
    for (const g of [30, 45, 60, 75, 90]) {
      const x = A({ FF: g, SI: g, SL: g, CH: g, CU: g });
      assert.ok(Math.abs(x.arsenal - g) <= 1, g + ': ' + x.arsenal);
      assert.ok(Math.abs(x.fastball - g) <= 1 && Math.abs(x.breaking - g) <= 1 && Math.abs(x.offspeed - g) <= 1, g + ' groups');
    }
    // His best pitch counts most: raising it moves the number more than raising his worst (both by 20 points).
    const base = A({ FF: 60, SL: 70, CH: 50 }).arsenal;
    const best = A({ FF: 60, SL: 90, CH: 50 }).arsenal, worst = A({ FF: 60, SL: 70, CH: 70 }).arsenal;
    assert.ok(best - base > worst - base, 'best ' + (best - base) + ', worst ' + (worst - base));
    // Above a plain mean of the grades when the best pitch is the standout.
    assert.ok(A({ FF: 50, SL: 85, CH: 50 }).arsenal > 62);
    // Groups he doesn't throw are null; a hitter has none.
    const two = A({ SI: 70, SL: 55 });
    assert.strictEqual(two.offspeed, null);
    assert.ok(two.fastball > two.breaking);
    assert.deepStrictEqual(Object.assign({}, B3.overall.arsenal(hitter('SS'))), { arsenal: null, fastball: null, breaking: null, offspeed: null });
    // A better Arsenal is a better pitcher.
    assert.ok(B3.overall.of(pitcher('SP', {}, { FF: 70, SL: 75, CH: 65 })) > B3.overall.of(pitcher('SP', {}, { FF: 50, SL: 55, CH: 45 })));
  });

  t.test('potential on the overall\'s scale: above the overall for the young, below it for the old', () => {
    const { B3, regulars, starters } = league();
    const all = regulars.concat(starters);
    const young = all.filter((p) => p.age <= 23), old = all.filter((p) => p.age >= 35);
    assert.ok(mean(young.map((p) => B3.overall.potential(p) - B3.overall.of(p))) > 3, 'young');
    assert.ok(mean(old.map((p) => B3.overall.potential(p) - B3.overall.of(p))) < -2, 'old');
    for (const p of all.filter((x) => x.age >= 28 && x.age <= 31 && x.potential.shown === 0)) assert.strictEqual(B3.overall.potential(p), B3.overall.of(p));
  });

  t.test('a generated league: regulars, starters and relievers about 50 in the middle, real stars and holes, closers the best', () => {
    const { B3, orgs, regulars, starters, relievers, bench, reserves } = league();
    const o = (list) => list.map((p) => B3.overall.of(p));
    const reg = o(regulars), sp = o(starters), rp = o(relievers);
    assert.ok(median(reg) >= 47 && median(reg) <= 53, 'regulars ' + median(reg));
    assert.ok(median(sp) >= 47 && median(sp) <= 53, 'starters ' + median(sp));
    assert.ok(reg.some((x) => x >= 75) && reg.some((x) => x <= 30), 'regulars spread');
    assert.ok(median(o(bench)) < median(reg) && median(o(reserves.filter((p) => !p.pitches))) < median(o(bench)), 'tiers');
    // Session 31 (owner's choice): relievers on a scale of their own, the league's average reliever about 50; their real wins
    // stay lower than a starter's (fewer innings).
    assert.ok(median(rp) >= 46 && median(rp) <= 54, 'relievers on their own scale ' + median(rp));
    assert.ok(median(relievers.map((p) => B3.overall.detail(p).war)) < median(starters.map((p) => B3.overall.detail(p).war)) - 1, 'relievers\' wins below starters\'');
    assert.ok(relievers.every((p) => B3.overall.detail(p).scale === 'relief') && starters.every((p) => B3.overall.detail(p).scale === 'wins'));
    // Session 31 (owner's choice): the league's average pitcher's Arsenal reads 60.
    const ars = starters.concat(relievers).map((p) => B3.overall.arsenal(p).arsenal);
    assert.ok(Math.abs(ars.reduce((a, b) => a + b, 0) / ars.length - 60) <= 1.5, 'Arsenal centered on 60');
    for (const org of orgs) {
      const r = org.relievers;
      assert.deepStrictEqual(Array.from(r, (p) => p.role), ['CL', 'SU', 'SU', 'MR', 'MR', 'MR', 'MR', 'LR']);
      for (let i = 1; i < 7; i++) assert.ok(B3.overall.of(r[i - 1]) >= B3.overall.of(r[i]), 'pen order');
    }
  });
};
