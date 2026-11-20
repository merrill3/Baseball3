// Runs every tools/tests/*.test.js file. Usage: node tools/test.js [filter]
// A test file exports function (t) and calls t.test(name, fn); fn may be async and throws to fail.
'use strict';
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'tests');
const filter = process.argv[2] || '';
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.test.js') && f.includes(filter)).sort();

const tests = [];
for (const f of files) {
  require(path.join(dir, f))({ test: (name, fn) => tests.push({ name: f.replace('.test.js', '') + ': ' + name, fn }) });
}

(async () => {
  let failed = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log('ok    ' + name);
    } catch (e) {
      failed++;
      console.log('FAIL  ' + name + '\n      ' + (e && e.message ? e.message : e));
    }
  }
  console.log('');
  if (tests.length === 0) {
    console.log('no tests found');
    process.exit(1);
  }
  if (failed) {
    console.log(failed + ' of ' + tests.length + ' tests failed');
    process.exit(1);
  }
  console.log('all tests passed (' + tests.length + ')');
})();
