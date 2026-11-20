// Fixed baseball data: positions, the 7 pitch types, the strike zone. Logic file: no DOM.
// Step 1.1 has names only; step 1.2 adds pitch speeds and movement, and the field's size.
(function (root) {
  'use strict';
  const B3 = root.B3 = root.B3 || {};

  const POS_NAME = {
    P: 'pitcher', C: 'catcher', '1B': 'first base', '2B': 'second base', '3B': 'third base',
    SS: 'shortstop', LF: 'left field', CF: 'center field', RF: 'right field', DH: 'designated hitter'
  };

  // The 7 pitch types (owner's choice, DESIGN.md section 4). Codes are Claude's default.
  const PITCHES = [
    { code: 'FF', name: 'four-seam fastball' },
    { code: 'SI', name: 'sinker' },
    { code: 'FC', name: 'cutter' },
    { code: 'SL', name: 'slider' },
    { code: 'CU', name: 'curveball' },
    { code: 'CH', name: 'change-up' },
    { code: 'FS', name: 'splitter' }
  ];
  const PITCH = {};
  for (const p of PITCHES) PITCH[p.code] = p;

  // The strike zone in feet, seen from the catcher: x from the middle of the plate, z above the ground.
  // Half the plate (8.5 in) plus a ball's radius; a typical batter's height (Claude's default; step 1.2
  // may size it by batter).
  const ZONE = { halfWidth: 0.83, bottom: 1.6, top: 3.5 };

  B3.data = {
    // Lineup positions with the designated hitter (pitchers don't bat).
    LINEUP_POS: ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'],
    OUTFIELD: ['LF', 'CF', 'RF'],
    POS_NAME: POS_NAME,
    PITCHES: PITCHES,
    PITCH: PITCH,
    ZONE: ZONE,
    inZone: function (x, z) {
      return Math.abs(x) <= ZONE.halfWidth && z >= ZONE.bottom && z <= ZONE.top;
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
