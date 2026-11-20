// The B3 namespace: the game's name, version and save names. Logic file: no DOM.
(function (root) {
  'use strict';
  const B3 = root.B3 = root.B3 || {};

  B3.NAME = 'Diamond Dash'; // working title (owner's choice, Nov 20, 2026)
  B3.VERSION = '0.0.1';

  // Save names unique to Baseball3, so saves never collide with Baseball1
  // (which uses 'diamond-dash...') on merrill3.github.io.
  B3.SAVE = Object.freeze({
    idb: 'baseball3',          // IndexedDB database
    store: 'saves',            // object store
    franchiseKey: 'franchise', // the one franchise slot
    lsPrefix: 'baseball3.'     // localStorage keys for settings and records
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
