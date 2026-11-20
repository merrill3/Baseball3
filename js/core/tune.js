// The one settings object for the engine: every calibration number, with what it does, and the
// placeholder value of every rating hook. Logic file: no DOM.
//
// Rating hooks (M1 step 1.2): the physics never reads a rating. It reads one input object per player, in
// physical units (inches, ms, mph, feet), made by B3.tune.inputs at game start. In step 1.2 every input
// is the placeholder value below (an average big-leaguer, rating 60), and a test can override any of
// them with player.sim = { bat: {...}, pit: {...}, fld: {...}, run: {...} }. Step 1.3's ratings.js fills
// the same inputs from ratings, so the physics does not change. All values are Claude's defaults, set
// in step 1.2 to give sane numbers; step 1.4 calibrates them against DESIGN.md section 7.
(function (root) {
  'use strict';
  const B3 = root.B3 = root.B3 || {};

  // ---- Rating hooks: placeholder inputs ----

  // Hitting (DESIGN.md section 10: each input names the rating whose job it is).
  const BAT = {
    contactSd: 1.8,    // Contact: spread of the *where* error, inches between bat and ball centers
    timingSd: 20,      // Timing: spread of a CPU hitter's *when* error at 92 mph, in ms
    timingTop: 95,     // Timing: the pitch speed (mph) above which he starts to run late
    batSpeed: 73,      // Raw Power: bat speed in mph; sets exit speed on a squared-up ball
    launchK: 22,       // Launch: degrees of launch angle per inch of *where* error (lower is a tighter band)
    launchSd: 8,       // Launch: extra launch-angle noise in degrees
    sprayNoise: 20,    // Launch: spray-direction noise in degrees (spray control)
    recognition: 0.75, // Recognition: share of a pitch's movement and speed change he reads (0 to 1)
    discipline: 0.5,   // Discipline: swing-or-take judgment. Hook for step 1.3's choices; unused in step 1.2
    aggressiveness: 0  // tendency (-1 Patient, 0 Balanced, 1 Aggressive). Hook for step 1.3; unused in step 1.2
  };

  // Pitching. Grades and shapes are per pitch type: { FF: 1.1, SL: 0.9 }; a missing type is average.
  const PIT = {
    velo: 93.5,        // Velocity: four-seam fastball speed in mph; other types are a share of it
    commandSd: 0.5,    // Command: scatter around the target, feet on each axis
    deception: 0,      // Deception: taken off the hitter's recognition (the mirror of Recognition)
    stamina: null,     // Stamina: pitches before fatigue sets in; null means the role's value in STAMINA
    grades: null,      // pitch grades: movement multiplier per type (1 average, 1.2 is 20% more break)
    shapes: null,      // pitch shapes: inches of extra drop per type (+ ground-ball tilt, - fly-ball tilt)
    aim: 0             // tendency (-1 Nibbler, 0 Balanced, 1 Attacker). Hook for step 1.3; unused in step 1.2
  };
  const STAMINA = { SP: 92, LR: 50, other: 28 }; // placeholder Stamina by role, in pitches

  // Fielding. (Step 1.2 task 7 adds Range, Hands and Arm.)
  const FLD = {
    framing: 0         // Framing (catchers): feet the borderline edge of the zone moves toward strikes
  };

  // ---- Physics and rules numbers ----

  const PITCH = {
    releaseFt: 54.5,   // release point, feet in front of the plate (extension off the 60.5 ft rubber)
    contactFt: 3.4,    // the ideal contact point, feet in front of the plate's tip
    avgSpeedShare: 0.92, // average speed over the flight, as a share of release speed (drag)
    speedSd: 0.7,      // pitch-to-pitch speed spread, mph
    fatigueSpan: 20,   // pitches past Stamina for one step of fatigue
    fatigueMax: 3,     // fatigue steps cap
    fatigueVelo: 1.2,  // mph lost per fatigue step
    fatigueCommand: 0.3, // Command scatter grows by this share per fatigue step
    callWidth: 0.055,  // umpire: feet over which a borderline call goes from likely strike to likely ball
    framingCap: 0.1    // a catcher's framing can move the edge at most this many feet
  };

  // How each pitch type plays (on top of its speed and movement in B3.data.PITCH).
  //   bite      extra *where* spread (inches): late, hard-to-track movement
  //   surprise  share of the unread movement (inches) that becomes *where* error
  //   lift      degrees added to the launch angle: the type's usual tilt (sinkers and splitters on the
  //             ground, four-seamers in the air)
  const TYPE = {
    FF: { bite: 0.5, surprise: 0.12, lift: 6 },
    SI: { bite: 0.0, surprise: 0.12, lift: -6 },
    FC: { bite: 0.9, surprise: 0.12, lift: 1 },
    SL: { bite: 1.6, surprise: 0.12, lift: 0 },
    CU: { bite: 1.3, surprise: 0.12, lift: -1 },
    CH: { bite: 1.5, surprise: 0.12, lift: -4 },
    FS: { bite: 1.5, surprise: 0.12, lift: -8 }
  };

  const SWING = {
    radius: 2.75,      // bat radius plus ball radius, inches: a bigger *where* error misses
    foulBack: 0.53,    // share of radius past which contact is a glancing foul (tipped back)
    missMs: 80,        // a *when* error past this many ms misses the ball
    // Location: pitches far from the middle are harder to square up (inches of extra spread per foot).
    edgeSd: 1.2,       // per foot from 0.4 ft inside the edge outward
    chaseSd: 2.6,      // per foot outside the zone, on top of edgeSd
    collision: 0.2,    // exit speed = collision x pitch speed at the plate + (1 + collision) x bat speed
    plateShare: 0.9,   // pitch speed at the plate as a share of release speed
    offLoss: 0.42,     // exit speed lost at the glancing edge (scales with the square of the *where* error)
    timeLoss: 0.45,    // exit speed lost at missMs (scales with the square of the *when* error)
    evSd: 2.5,         // exit-speed noise, mph
    attack: 12,        // launch angle of a dead-center hit at the middle of the zone, degrees
    heightLA: 7,       // degrees of launch angle per foot the pitch is above the middle of the zone (2.55 ft)
    pullAt0: -6,       // spray of a perfectly timed swing, degrees toward the pull side (minus is pull)
    sprayPerMs: 1.0,   // degrees of spray per ms of *when* error (early pulls, late goes the other way)
    insidePull: 12,    // degrees toward the pull side per foot the pitch is inside
    foulLine: 45       // the foul lines, degrees from straightaway center
  };

  const TIMING = {
    refMph: 92,        // timingSd is the spread at this pitch speed
    sdPer10: 0.35,     // the spread grows by this share per 10 mph faster
    latePerMph: 1.2,   // ms late per mph above the hitter's timingTop (Velocity attacks Timing)
    readShare: 0.45    // share of an unread speed change that shows up as timing error (hitters adjust mid-swing)
  };

  // Handedness (owner's choice, Session 3): a small platoon edge for hitters facing opposite-handed
  // pitchers. Its size is set and reported at calibration (step 1.4).
  const PLATOON = {
    recognition: 0.03, // recognition added against an opposite-handed pitcher (taken off against same-handed)
    contactSd: 0.03    // share of the *where* spread taken off against an opposite-handed pitcher (added against same)
  };

  function has(o, k) { return o && Object.prototype.hasOwnProperty.call(o, k); }

  function merge(base, over) {
    const out = {};
    for (const k in base) out[k] = has(over, k) ? over[k] : base[k];
    return out;
  }

  // One player's inputs for the physics: { bats, throws, bat, pit, fld }. The game makes these at start.
  function inputs(player) {
    const sim = player.sim || {};
    const pit = merge(PIT, sim.pit);
    if (pit.stamina === null) pit.stamina = has(STAMINA, player.role) ? STAMINA[player.role] : STAMINA.other;
    pit.grades = Object.assign({}, pit.grades || {});
    pit.shapes = Object.assign({}, pit.shapes || {});
    return {
      bats: player.bats || 'R',
      throws: player.throws || 'R',
      bat: merge(BAT, sim.bat),
      pit: pit,
      fld: merge(FLD, sim.fld)
    };
  }

  B3.tune = {
    BAT: BAT, PIT: PIT, STAMINA: STAMINA, FLD: FLD,
    PITCH: PITCH, TYPE: TYPE, SWING: SWING, TIMING: TIMING, PLATOON: PLATOON,
    inputs: inputs
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
