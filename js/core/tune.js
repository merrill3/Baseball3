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

  // Fielding. A null takes the position's value from POS below (a fielder's inputs don't move with
  // his position in a game: there are no defensive substitutions in M1).
  const FLD = {
    react: null,       // Range: first step, seconds before he moves after contact
    route: 0.92,       // Range: share of his top speed he keeps on the way to the ball (the route)
    hands: 1,          // Hands: error rate multiplier (0.5 is half as many fumbles, drops and wild throws)
    release: 0,        // Hands: seconds taken off every catch-and-throw (quick release; double-play pivots)
    arm: null,         // Arm: throw speed in mph
    framing: 0         // Framing (catchers): feet the borderline edge of the zone moves toward strikes
  };
  // Position values: [react s, arm mph, catch-to-throw s]. Shortstops and center fielders start quickest.
  const POS = {
    P: [0.55, 80, 0.75], C: [0.45, 80, 0.72], '1B': [0.32, 76, 0.6], '2B': [0.28, 78, 0.55],
    '3B': [0.28, 84, 0.7], SS: [0.26, 85, 0.62], LF: [0.42, 85, 0.95], CF: [0.36, 87, 0.9], RF: [0.42, 89, 0.95],
    DH: [0.4, 80, 0.8]
  };

  // Running.
  const RUN = {
    speed: 27,         // Speed: top sprint speed, feet per second (also a fielder's speed to the ball)
    read: 0.2,         // Baserunning: seconds to read a ball in play and break
    jump: 0.12,        // Baserunning: seconds lost on the jump when stealing
    judge: 0.14        // Baserunning: seconds of error when he judges an extra base (lower is better)
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

  // Ball flight, fielding, throws and running (M1 step 1.2 task 7).
  const BALL = {
    drag: 0.00175,     // air drag per foot (sets carry: 100 mph at 28 degrees goes about 390 ft)
    lift: 0.0009,      // backspin lift per foot on balls hit in the air
    liftFull: 35,      // degrees of launch angle at which backspin (and lift) is full; less below it
    dt: 0.02,          // integration step in the air, seconds
    sample: 0.1,       // the ball's path is kept every this many seconds (fielding and the play script)
    startHeight: 3,    // feet: the ball's height at contact
    bounceUp: 0.42,    // share of the downward speed kept on a bounce
    bounceOn: 0.78,    // share of the forward speed kept on a bounce
    rolling: 4,        // ft/s of bounce below which the ball rolls (slowing at a steady rate)
    rollDecel: 9,      // ft/s per second a rolling ball slows (grass)
    wallBack: 0.2,     // share of speed a ball keeps bouncing off the wall
    maxTime: 12,       // seconds: a guard
    reach: 8,          // feet: a fielder can catch a ball this high (with a reach or jump)
    glove: 4,          // feet: a fielder gets a ball this far from where he stands (arm, glove, lean)
    diveReach: 4,      // feet a dive (a diving stop or catch) reaches past the glove
    wallReach: 10.5,   // feet: a leap at the wall
    fieldHeight: 3.5,  // feet: a bouncing ball this low can be fielded
    catchSd: 0.09,     // seconds: how sharply a catch's chance falls off with the margin
    catchAt: 0.05,     // seconds of margin for an even chance at a running or diving catch
    diveLoss: 0.6,     // seconds a diving stop adds before the throw
    getUp: 1.0,        // seconds a fielder loses chasing a ball he dove for and missed
    gather: 0.25,      // seconds to pick up a ball in the outfield
    accel: 20,         // ft/s per second: how fast runners and fielders reach top speed
    throwShort: 0.9,   // average speed of a throw as a share of release speed, up to 100 ft
    throwLong: 0.68,   // ... at 300 ft and more (an arc, a bounce or a relay); in between it slides
    tag: 0.12,         // seconds to apply a tag (a force needs none)
    playSd: 0.07,      // seconds: how sharply a close play's chance falls off
    turn: 0.12,        // seconds a runner loses rounding a base
    batterBox: 0.3,    // seconds out of the box after the swing
    lefty: 0.08,       // seconds a left-handed batter saves to first
    pivot: 0.45,       // seconds for the pivot man to catch and throw on a double play
    infield: 125,      // feet: grounders past this have left the infield
    lead: [12, 18, 12], // feet: leads off first, second and third
    dare: 0.2,         // seconds of margin a runner wants before taking an extra base: one number for every
                       // runner, not a player trait (owner's choice, Session 3)
    halfway: 0.45,     // share of the way a runner goes on a fly ball that may be caught
    dropRead: 1,       // a runner at halfway breaks this many reads (RUN.read) after the ball drops
    foulRoom: 28,      // feet of foul ground beyond the lines where a foul fly can be caught
    backstop: 55       // feet behind home plate to the backstop
  };

  // Errors (Hands sets the multiplier). About 0.5 errors a team-game is the target (DESIGN.md section 7).
  const ERR = {
    ground: 0.032,     // a fumbled ground ball
    throw: 0.018,      // a wild throw, per 100 ft of throw
    fly: 0.009,        // a dropped fly ball or line drive
    hard: 2            // multiplier on a diving or running play
  };

  // Steals: the runner against the pitcher's delivery, the pitch's flight and the catcher's throw.
  const STEAL = {
    delivery: 1.05,    // seconds from the pitcher's first move to release (from the stretch)
    secondLead: [5, 9], // extra feet of lead a stealing runner takes off first and off second
    sd: 0.12           // seconds of noise on a steal play
  };

  function has(o, k) { return o && Object.prototype.hasOwnProperty.call(o, k); }

  function merge(base, over) {
    const out = {};
    for (const k in base) out[k] = has(over, k) ? over[k] : base[k];
    return out;
  }

  // One player's inputs for the physics: { bats, throws, bat, pit, fld, run }. The game makes these at start.
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
      fld: merge(FLD, sim.fld),
      run: merge(RUN, sim.run)
    };
  }

  B3.tune = {
    BAT: BAT, PIT: PIT, STAMINA: STAMINA, FLD: FLD, POS: POS, RUN: RUN, BALL: BALL, ERR: ERR, STEAL: STEAL,
    PITCH: PITCH, TYPE: TYPE, SWING: SWING, TIMING: TIMING, PLATOON: PLATOON,
    inputs: inputs
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
