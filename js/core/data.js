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
    { code: 'CH', name: 'change-up', v: 0.914, hx: -14, vz: 6 }, // Session 34: v was 0.885 (10.9 mph under an average fastball; MLB's 8.1)
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

  // The field in feet, from above: home plate at (0, 0), y toward center field, x toward the first-base
  // side. One standard park in M1 (Claude's default; park sizes come with the league in M2).
  const D2R = Math.PI / 180;
  function polar(r, sp) { return [r * Math.sin(sp * D2R), r * Math.cos(sp * D2R)]; }
  const FIELD = {
    bases: [[0, 0], [63.64, 63.64], [0, 127.28], [-63.64, 63.64]], // home, first, second, third
    fence: [[0, 400], [25, 375], [45, 330]], // [degrees from center, feet], straight lines between
    wall: 8, // feet
    // Where fielders stand for an average batter (spray in degrees, plus toward right field; feet from home).
    pos: {
      P: [0, 56], C: [0, -3],
      '1B': polar(104, 37), '2B': polar(148, 14), SS: polar(148, -13), '3B': polar(104, -36),
      LF: polar(282, -31), CF: polar(325, 0), RF: polar(282, 31)
    },
    // Degrees fielders shift toward a batter's pull side. Session 23 (Claude's default): the outfield refitted on Statcast 2024's
    // air balls (10-50 degrees, not home runs, 12 Wednesdays), on hits and total bases by direction x distance, on who fielded them
    // (hit_location) and on all balls' hits, total bases and doubles by exit speed x launch angle: the corners 31 degrees out at
    // 282 ft and center field at 325 (were 27 at 290 and 318), shaded 2 degrees the other way (was 4 toward the pull side). Before,
    // the opposite-field corner stood too near center (he fielded 35.6% of MLB's air balls against 28.3%) and left the line open.
    // The infield keeps 3 (owner's choice, Session 23).
    shade: { infield: 3, outfield: -2 }
  };
  // The fence's distance at a spray angle: the standard park's (symmetric), or a park's own (M2 step 2.1b, Session 31:
  // park.fence lists [spray, feet] from the left-field line, -45, to the right-field line, 45; straight lines between).
  function interp(f, x) {
    if (x <= f[0][0]) return f[0][1];
    for (let i = 1; i < f.length; i++) {
      if (x <= f[i][0]) return f[i - 1][1] + (f[i][1] - f[i - 1][1]) * (x - f[i - 1][0]) / (f[i][0] - f[i - 1][0]);
    }
    return f[f.length - 1][1];
  }
  function fenceAt(sp, park) {
    if (park && park.fence) return interp(park.fence, Math.max(-45, Math.min(45, sp)));
    const a = Math.min(45, Math.abs(sp)), f = FIELD.fence;
    for (let i = 1; i < f.length; i++) {
      if (a <= f[i][0]) return f[i - 1][1] + (f[i][1] - f[i - 1][1]) * (a - f[i - 1][0]) / (f[i][0] - f[i - 1][0]);
    }
    return f[f.length - 1][1];
  }
  // The wall's height there: the standard 8 ft, or a park's (one height, or [spray, feet] points as the fence's).
  function wallAt(sp, park) {
    if (!park || park.wall === undefined) return FIELD.wall;
    return typeof park.wall === 'number' ? park.wall : interp(park.wall, Math.max(-45, Math.min(45, sp)));
  }

  B3.data = {
    FIELD: FIELD,
    FIELDERS: ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'],
    polar: polar,
    fenceAt: fenceAt,
    wallAt: wallAt,
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
