// Loads the js/core/ scripts into Node, in the order index.html lists them.
// Each call gets a fresh sandbox with no DOM (so a logic file that touches the DOM fails here) and a Math.random that throws.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');

function stripHtmlComments(html) {
  return html.replace(/<!--[\s\S]*?-->/g, '');
}

// Every <script> tag in index.html, in order: { src, attrs }.
function scriptTags() {
  const html = stripHtmlComments(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'));
  const tags = [];
  const re = /<script\b([^>]*)>/gi;
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[1];
    const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(attrs);
    tags.push({ src: src ? src[1] : null, attrs });
  }
  return tags;
}

function coreFiles() {
  return scriptTags().map((t) => t.src).filter((s) => s && s.startsWith('js/core/'));
}

// A fresh sandbox with no DOM, where Math.random throws: js/core/ must use B3.rng, and this catches
// calls the text check in rules.test.js can't see (such as Math['random']).
function sandbox() {
  const ctx = vm.createContext({ console });
  vm.runInContext("Math.random = function () { throw new Error('Math.random called: js/core must use B3.rng'); };", ctx);
  return ctx;
}

// Returns the B3 namespace built by the core scripts in a fresh sandbox.
function loadCore() {
  const ctx = sandbox();
  for (const rel of coreFiles()) {
    const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    vm.runInContext(code, ctx, { filename: rel });
  }
  return ctx.B3;
}

module.exports = { ROOT, scriptTags, coreFiles, sandbox, loadCore, stripHtmlComments };
