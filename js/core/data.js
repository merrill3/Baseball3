// Fixed baseball data: positions, the 7 pitch types with their speed and movement, the strike zone.
// Logic file: no DOM. Step 1.2 adds pitch speeds and movement (task 6) and the field (task 7).
(function (root) {
  'use strict';
  const B3 = root.B3 = root.B3 || {};

  const POS_NAME = {
    P: 'pitcher', C: 'catcher', '1B': 'first base', '2B': 'second base', '3B': 'third base',
    SS: 'shortstop', LF: 'left field', CF: 'center field', RF: 'right field', DH: 'designated hitter'
  };

  // The 7 pitch types (owner's choice, DESIGN.md section 4). Codes and numbers are Claude's defaults,
  // typical big-league values from general baseball knowledge:
  //   v   speed as a share of the pitcher's four-seam fastball
  //   hx  sideways movement in inches for a right-handed pitcher, seen from the catcher: minus is arm
  //       side (toward a right-handed batter), plus is glove side. Mirrored for a left-hander.
  //   vz  induced vertical movement in inches: how much less the pitch drops than a spinless ball
  const PITCHES = [
    { code: 'FF', name: 'four-seam fastball', v: 1.0, hx: -7, vz: 16 },
    { code: 'SI', name: 'sinker', v: 0.985, hx: -15, vz: 8 },
    { code: 'FC', name: 'cutter', v: 0.94, hx: 3, vz: 8 },
    { code: 'SL', name: 'slider', v: 0.885, hx: 6, vz: 1 },
    { code: 'CU', name: 'curveball', v: 0.815, hx: 8, vz: -10 },
    { code: 'CH', name: 'change-up', v: 0.885, hx: -14, vz: 6 },
    { code: 'FS', name: 'splitter', v: 0.90, hx: -9, vz: 2 }
  ];
  const PITCH = {};
  for (const p of PITCHES) PITCH[p.code] = p;

  // The strike zone in feet, seen from the catcher: x from the middle of the plate, z above the ground.
  // Half the plate (8.5 in) plus a ball's radius; a typical batter's height (Claude's default; step 1.2
  // may size it by batter).
  const ZONE = { halfWidth: 0.83, bottom: 1.6, top: 3.5 };

  // Signed distance in feet from the edge of the zone: below 0 inside, above 0 outside.
  function zoneEdge(x, z) {
    return Math.max(Math.abs(x) - ZONE.halfWidth, ZONE.bottom - z, z - ZONE.top);
  }

  B3.data = {
    // Lineup positions with the designated hitter (pitchers don't bat).
    LINEUP_POS: ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'],
    OUTFIELD: ['LF', 'CF', 'RF'],
    POS_NAME: POS_NAME,
    PITCHES: PITCHES,
    PITCH: PITCH,
    ZONE: ZONE,
    HANDS: { bats: ['R', 'L', 'S'], throws: ['R', 'L'] },
    inZone: function (x, z) {
      return Math.abs(x) <= ZONE.halfWidth && z >= ZONE.bottom && z <= ZONE.top;
    },
    zoneEdge: zoneEdge
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
