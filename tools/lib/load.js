// Loads the js/core/ scripts into Node, in the order index.html lists them.
// Each call gets a fresh sandbox with no DOM, so a logic file that touches the DOM fails here.
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

// Returns the B3 namespace built by the core scripts in a fresh sandbox.
function loadCore() {
  const sandbox = { console };
  vm.createContext(sandbox);
  for (const rel of coreFiles()) {
    const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    vm.runInContext(code, sandbox, { filename: rel });
  }
  return sandbox.B3;
}

module.exports = { ROOT, scriptTags, coreFiles, loadCore, stripHtmlComments };
