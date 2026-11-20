// B3.rng: seeded, repeatable, saveable; and js/core/ can't reach Math.random.
'use strict';
const assert = require('assert');
const vm = require('vm');
const { loadCore, sandbox } = require('../lib/load');

function seq(r, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(r.uint32());
  return out;
}

module.exports = function (t) {
  const B3 = loadCore();

  t.test('the same seed gives the same sequence; different seeds differ', () => {
    assert.deepStrictEqual(seq(B3.rng.create(42), 100), seq(B3.rng.create(42), 100));
    assert.deepStrictEqual(seq(B3.rng.create(42), 20), seq(B3.rng.create('42'), 20));
    assert.notDeepStrictEqual(seq(B3.rng.create(42), 20), seq(B3.rng.create(43), 20));
    assert.notDeepStrictEqual(seq(B3.rng.create('game 1'), 20), seq(B3.rng.create('game 2'), 20));
  });

  t.test('the same seed gives the same sequence after a save and restore', () => {
    const a = B3.rng.create('save test');
    seq(a, 1000);
    const saved = JSON.parse(JSON.stringify(a.save())); // through JSON, as a save file would
    const expected = seq(a, 500);
    assert.deepStrictEqual(seq(B3.rng.restore(saved), 500), expected);
    const b = B3.rng.create(1);
    b.load(saved);
    assert.deepStrictEqual(seq(b, 500), expected);
    // Every helper continues the same way too.
    const c = B3.rng.restore(saved), d = B3.rng.restore(saved);
    const draw = (r) => [r.next(), r.int(10), r.range(2, 5), r.chance(0.3), r.normal(0, 1), r.pick(['x', 'y', 'z']), r.weighted([1, 2, 3])];
    assert.deepStrictEqual(draw(c), draw(d));
  });

  t.test('a bad state or seed is refused', () => {
    assert.throws(() => B3.rng.restore([1, 2, 3]));
    assert.throws(() => B3.rng.restore([1, 2, 3, -1]));
    assert.throws(() => B3.rng.restore([1, 2, 3, 1.5]));
    assert.throws(() => B3.rng.restore('1,2,3,4'));
    assert.throws(() => B3.rng.create());
    assert.throws(() => B3.rng.create({}));
  });

  t.test('draws look uniform and normal', () => {
    const r = B3.rng.create('dist');
    const n = 100000;
    let sum = 0, nsum = 0, nsq = 0;
    const faces = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < n; i++) {
      const x = r.next();
      assert.ok(x >= 0 && x < 1);
      sum += x;
      faces[r.int(6)]++;
      const z = r.normal();
      nsum += z; nsq += z * z;
    }
    assert.ok(Math.abs(sum / n - 0.5) < 0.005, 'mean ' + sum / n);
    for (const f of faces) assert.ok(Math.abs(f / n - 1 / 6) < 0.01, 'die faces ' + faces);
    assert.ok(Math.abs(nsum / n) < 0.02, 'normal mean ' + nsum / n);
    assert.ok(Math.abs(Math.sqrt(nsq / n) - 1) < 0.02, 'normal sd ' + Math.sqrt(nsq / n));
  });

  t.test('Math.random throws in the Node sandbox (a planted call is caught)', () => {
    const ctx = sandbox();
    assert.throws(() => vm.runInContext("Math['ran' + 'dom']()", ctx), /js\/core must use B3\.rng/);
  });
};
