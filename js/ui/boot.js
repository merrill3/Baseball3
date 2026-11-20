// Starts the page. For now it shows the title screen only.
(function (root) {
  'use strict';
  const B3 = root.B3 = root.B3 || {};

  B3.boot = function () {
    const app = document.getElementById('app');
    const wrap = document.createElement('main');
    wrap.className = 'title-screen';

    const h1 = document.createElement('h1');
    h1.textContent = B3.NAME;
    const status = document.createElement('p');
    status.className = 'status';
    status.textContent = 'A browser baseball game, in development. Nothing is playable yet.';
    const version = document.createElement('p');
    version.className = 'version';
    version.textContent = 'Baseball3 · version ' + B3.VERSION;

    wrap.append(h1, status, version);
    app.replaceChildren(wrap);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', B3.boot);
  } else {
    B3.boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
