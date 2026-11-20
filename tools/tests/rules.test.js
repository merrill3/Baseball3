// The hard rules that a test can check (ARCHITECTURE.md "Hard rules").
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { ROOT, scriptTags } = require('../lib/load');

function jsFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = dir + '/' + e.name;
    if (e.isDirectory()) out.push(...jsFiles(rel));
    else if (e.name.endsWith('.js')) out.push(rel);
  }
  return out;
}

// Rough comment stripper: good enough to keep comments from tripping the checks below.
function code(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"\\])\/\/.*$/gm, '$1');
}

module.exports = function (t) {
  t.test('every script tag points at a file that exists', () => {
    for (const tag of scriptTags()) {
      assert.ok(tag.src, 'a script tag has no src (inline scripts are not allowed)');
      assert.ok(fs.existsSync(path.join(ROOT, tag.src)), 'missing file: ' + tag.src);
    }
  });

  t.test('no ES modules in index.html', () => {
    for (const tag of scriptTags()) {
      assert.ok(!/type\s*=\s*["']module["']/i.test(tag.attrs), 'type="module" on ' + tag.src);
    }
  });

  t.test('load order: js/core, then js/view, then js/ui, with boot.js last', () => {
    const rank = { 'js/core/': 0, 'js/view/': 1, 'js/ui/': 2 };
    const srcs = scriptTags().map((x) => x.src);
    let last = -1;
    for (const s of srcs) {
      const folder = Object.keys(rank).find((k) => s.startsWith(k));
      assert.ok(folder, 'script outside js/core, js/view or js/ui: ' + s);
      assert.ok(rank[folder] >= last, 'out of order: ' + s);
      last = rank[folder];
    }
    assert.strictEqual(srcs[srcs.length - 1], 'js/ui/boot.js', 'js/ui/boot.js must load last');
  });

  t.test('every file in js/ is loaded by index.html', () => {
    const loaded = new Set(scriptTags().map((x) => x.src));
    for (const f of jsFiles('js')) assert.ok(loaded.has(f), 'not loaded by index.html: ' + f);
  });

  t.test('no import/export, fetch or workers in js/', () => {
    for (const f of jsFiles('js')) {
      const c = code(f);
      assert.ok(!/^\s*(import|export)\b/m.test(c), 'import/export in ' + f);
      assert.ok(!/\bfetch\s*\(/.test(c), 'fetch( in ' + f);
      assert.ok(!/\b(Worker|SharedWorker|importScripts)\s*\(/.test(c), 'worker in ' + f);
    }
  });

  t.test('js/core never touches the DOM, browser storage or Math.random', () => {
    const banned = /\b(document|window|localStorage|sessionStorage|indexedDB|navigator|Math\.random)\b/;
    for (const f of jsFiles('js/core')) {
      const m = banned.exec(code(f));
      assert.ok(!m, (m && m[0]) + ' in ' + f);
    }
  });
};
