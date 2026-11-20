// The core scripts load in Node (no DOM) and set up the B3 namespace.
'use strict';
const assert = require('assert');
const { loadCore } = require('../lib/load');

module.exports = function (t) {
  t.test('core scripts load in Node and define B3', () => {
    const B3 = loadCore();
    assert.ok(B3, 'B3 is not defined');
    assert.strictEqual(B3.NAME, 'Diamond Dash');
    assert.match(B3.VERSION, /^\d+\.\d+\.\d+$/);
  });

  t.test('save names are unique to Baseball3', () => {
    const { SAVE } = loadCore();
    assert.strictEqual(SAVE.idb, 'baseball3');
    assert.ok(SAVE.lsPrefix.startsWith('baseball3'), 'localStorage prefix: ' + SAVE.lsPrefix);
    for (const v of Object.values(SAVE)) assert.ok(!/diamond-dash/i.test(v), 'collides with Baseball1: ' + v);
  });
};
