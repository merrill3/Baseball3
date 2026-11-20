// The one settings object for the engine: every calibration number, with what it does, and the
// placeholder value of every rating hook. Logic file: no DOM.
//
// Rating hooks (M1 step 1.2): the physics never reads a rating. It reads one input object per player, in
// physical units (inches, ms, mph, feet), made at game start by B3.ratings.inputs (step 1.3), which
// maps the player's ratings with the scales in RATE below and passes them to B3.tune.inputs. A rating of
// 60 gives exactly the placeholder value below (an average big-leaguer), and a player without ratings
// gets the placeholders. A test can override any input with player.sim = { bat: {...}, pit: {...},
// fld: {...}, run: {...} }. All values are Claude's defaults, set in steps 1.2-1.3 to give sane numbers;
// step 1.4 calibrates them against DESIGN.md section 7.
(function (root) {
  'use strict';
  const B3 = root.B3 = root.B3 || {};

  // ---- Rating hooks: placeholder inputs ----

  // Hitting (DESIGN.md section 10: each input names the rating whose job it is).
  const BAT = {
    contactSd: 1.35,   // Contact: spread of the *where* error, inches between bat and ball centers
    timingSd: 20,      // Timing: spread of a CPU hitter's *when* error at 92 mph, in ms
    timingTop: 93,     // Timing: the pitch speed (mph) above which he starts to run late
    batSpeed: 75,      // Raw Power: bat speed in mph; sets exit speed on a squared-up ball
    launchK: 22,       // Launch: degrees of launch angle per inch of *where* error (lower is a tighter band)
    launchSd: 8,       // Launch: extra launch-angle noise in degrees
    sprayNoise: 20,    // Launch: spray-direction noise in degrees (spray control)
    recognition: 0.75, // Recognition: share of a pitch's movement and speed change he reads (0 to 1)
    judgeSd: 0.45,     // Discipline: feet of noise in judging where a pitch will cross, for swing or take
    judgeLean: 0.1,    // Discipline: feet he leans toward seeing a ball as a strike (the CPU's swing choice)
    aggressiveness: 0  // tendency (-1 Patient, 0 Balanced, 1 Aggressive): the CPU's swing choice
  };

  // Pitching. Grades and shapes are per pitch type: { FF: 1.1, SL: 0.9 }; a missing type is average.
  const PIT = {
    velo: 93.5,        // Velocity: four-seam fastball speed in mph; other types are a share of it
    commandSd: 0.5,    // Command: scatter around the target, feet on each axis
    deception: 0,      // Deception: taken off the hitter's recognition (the mirror of Recognition)
    stamina: null,     // Stamina: pitches before fatigue sets in; null means the role's value in STAMINA
    grades: null,      // pitch grades: movement multiplier per type (1 average, 1.2 is 20% more break)
    shapes: null,      // pitch shapes: degrees taken off the launch angle per type (+ ground-ball tilt, - fly-ball tilt)
    putAway: null,     // the put-away pitch (his best-graded type); null: the CPU picks by pitch type
    aim: 0             // tendency (-1 Nibbler, 0 Balanced, 1 Attacker): the CPU's pitch targets
  };
  const STAMINA = { SP: 92, LR: 50, other: 28 }; // placeholder Stamina by role, in pitches

  // Fielding. A null takes the position's value from POS below (a fielder's inputs don't move with
  // his position in a game: there are no defensive substitutions in M1).
  // A fielder's ratings are graded against his position (step 1.4, Claude's default): Range and Arm at
  // 60 give the position's own first step and arm in POS.
  const FLD = {
    react: null,       // first step, seconds before he moves after contact (null: his position's, in POS)
    first: 1,          // Range: multiplier on that first step (below 1 is quicker)
    route: 0.92,       // Range: share of his top speed he keeps on the way to the ball (the route)
    hands: 1,          // Hands: error rate multiplier (0.5 is half as many fumbles, drops and wild throws)
    release: 0,        // Hands: seconds taken off every catch-and-throw (quick release; double-play pivots)
    arm: null,         // throw speed in mph (null: his position's, in POS)
    armPlus: 0,        // Arm: mph added to that throw speed
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

  // ---- Ratings to hook inputs (M1 step 1.3; B3.ratings) ----
  // Ratings run 20-99 and 60 is an average big-leaguer (DESIGN.md section 10). A rating first goes
  // through the top-end curve, then becomes u, tens of points from 60 (70 is u = 1). Each hook is then
  //   'mul': placeholder x step^u   (spreads and noise: they shrink as the rating rises, never below 0)
  //   'add': placeholder + step x u (speeds, shares and offsets)
  // Steps are Claude's defaults (step 1.3), aimed at +10 points for a whole lineup or staff being worth
  // about 0.3 runs per team-game; step 1.4's equal-value check tunes them.
  const RATE = {
    // The steep curve past 85 (the same shape for every rating): k x (r - 85)^2 extra points, so 90 plays
    // like 91.25, 95 like 100 and 99 like 108.8. The capped combination bonus: in each group (the hitting
    // ratings; the pitching ratings with every pitch grade) only the biggest extra counts in full, the
    // others count at `others`, and the extras together add at most `cap` points.
    // Groups: hitting; pitching (with every pitch grade); defense and running (step 1.4).
    top: { from: 85, k: 0.05, others: 0.5, cap: 12 },
    bat: {
      contactSd: ['contact', 'mul', 0.88],
      timingSd: ['timing', 'mul', 0.85],
      timingTop: ['timing', 'add', 2.0],
      launchK: ['launch', 'mul', 0.87],
      launchSd: ['launch', 'mul', 0.87],
      sprayNoise: ['launch', 'mul', 0.87],
      batSpeed: ['rawPower', 'add', 1.2],
      recognition: ['recognition', 'add', 0.07],
      judgeSd: ['discipline', 'mul', 0.85],
      judgeLean: ['discipline', 'mul', 0.7]
    },
    // Defense and running (step 1.4). Range, Arm and Framing count fully at their key spots (DESIGN.md
    // section 10: Range at SS and CF, Arm in RF and at C, Framing at C, Hands at SS, Speed in CF,
    // Baserunning for a regular), and less elsewhere, because those spots get the most chances.
    fld: {
      first: ['range', 'mul', 0.9],
      route: ['range', 'add', 0.012],
      hands: ['hands', 'mul', 0.8],
      release: ['hands', 'add', 0.03],
      armPlus: ['arm', 'add', 2.5],
      framing: ['framing', 'add', 0.015]
    },
    run: {
      speed: ['speed', 'add', 0.8],
      read: ['baserunning', 'mul', 0.85],
      jump: ['baserunning', 'mul', 0.85],
      judge: ['baserunning', 'mul', 0.85]
    },
    pit: {
      velo: ['velocity', 'add', 1.6],
      commandSd: ['command', 'mul', 0.88],
      deception: ['deception', 'add', 0.07] // the mirror of Recognition: the same step, taken off the read
    },
    grade: { step: 0.12, min: 0.3 }, // a pitch grade: movement multiplier 1 + step x u (at least min)
    shape: 4,          // degrees off the launch angle at shape +1 (ground-ball tilt); -1 is a fly-ball tilt
    // Stamina: pitches before fatigue sets in, by rating (straight lines between; past 100 the last
    // slope). One scale for every role: relievers are low-Stamina pitchers. 60 is the placeholder starter.
    stamina: [[20, 18], [30, 28], [40, 45], [50, 68], [60, 92], [70, 102], [80, 110], [90, 117], [100, 123]],
    tendency: {
      aggressiveness: { Patient: -1, Balanced: 0, Aggressive: 1 },
      aim: { Nibbler: -1, Balanced: 0, Attacker: 1 }
    }
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
    timeRadius: 0.7,   // share of the bat's reach (radius) lost at missMs; scales with the square of the *when*
                       // error (step 1.3: so velocity and Timing move whiffs, not only exit speed)
    // Location: pitches far from the middle are harder to square up (inches of extra spread per foot).
    edgeSd: 2.6,       // per foot from 0.4 ft inside the edge outward
    chaseSd: 3.0,      // per foot outside the zone, on top of edgeSd
    locLoss: 0.06,     // share of exit speed lost per foot from 0.4 ft inside the edge outward (step 1.3)
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
    sdPer10: 0.6,      // the spread grows by this share per 10 mph faster
    latePerMph: 6,     // ms late per mph above the hitter's timingTop (Velocity attacks Timing)
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

  // The CPU's choices (B3.manager.cpu, M1 step 1.3 task 10). Claude's defaults, tuned in step 1.4.
  const CPU = {
    // Steals (step 1.4): before each pitch the CPU judges the runner's chance (B3.ball.stealOdds: his jump
    // and Speed against the delivery and the catcher's release and Arm). Below `min` he stays; from there
    // to `full` his chance of going on this pitch rises to `rate`. Steals of third need more.
    steal: { min: [0.68, 0.78], full: [0.85, 0.92], rate: [0.05, 0.03], twoOut: 0.6 },
    // Tag-ups (step 1.4): the lead runner goes when he judges his chance (B3.ball.tagupOdds, plus his own
    // Baserunning error) is at least this, from second or from third.
    tagup: { need: { 2: 0.8, 3: 0.6 } },
    swing: {
      // A CPU hitter swings when the pitch looks to cross inside this line: feet from the edge of the zone
      // (below 0 inside), by balls (rows 0-3) and strikes (columns 0-2). He takes the corners early in the
      // count and protects the plate with two strikes; on 3-0 he waits for one down the middle.
      line: [[-0.12, -0.04, 0.1], [-0.12, -0.05, 0.1], [-0.13, -0.07, 0.08], [-0.5, -0.1, 0.05]],
      agg: [0.1, 0.08, 0.03], // feet the line moves out per step of Aggressiveness, by strikes, for an average
                           // lean (judgeLean); in proportion to his own lean
      // Chance he takes all the way, whatever the pitch looks like, by balls and strikes.
      take: [[0.3, 0.12, 0], [0.18, 0.1, 0], [0.3, 0.12, 0], [0.9, 0.15, 0]],
      aggTake: 0.6,        // share of those takes an Aggressive hitter skips (a Patient one adds): he judges
                           // more pitches himself, which pays off with good Discipline (owner's choice)
      lookShare: 1         // share of the movement he doesn't read that misleads where he thinks it crosses
    },
    pitch: {
      // How often each type is thrown when the pitcher has it, before grades and the count.
      use: { FF: 1.7, SI: 1.4, FC: 1.0, SL: 1.1, CU: 0.8, CH: 0.9, FS: 0.8 },
      gradeUse: 0.3,       // better pitches get thrown more: weight x e^(gradeUse x u), u = tens of grade points
      behind: 1.8,         // fastballs (FF, SI, FC) x this when 2 balls ahead of the strikes (2-0, 3-0, 3-1)
      putAway: 2.5,        // the put-away pitch x this with two strikes
      // Chance the target is in the zone, by balls (rows) and strikes (columns).
      zone: [[0.75, 0.65, 0.47], [0.85, 0.75, 0.58], [0.95, 0.88, 0.7], [1, 0.98, 0.9]],
      aimZone: 0.03,       // per step of Aim (-1 Nibbler, +1 Attacker): more targets in the zone
      // Targets in the zone: feet inside the nearest side and top or bottom, by Aim (Nibbler, Balanced,
      // Attacker). A nibbler works the corners; an attacker comes in toward the middle.
      inset: [[0.12, 0.52], [0.18, 0.62], [0.24, 0.72]],
      chase: [0.03, 0.5],  // targets outside the zone: feet off the edge
      low: { FF: 0.4, SI: 0.75, FC: 0.55, SL: 0.7, CU: 0.8, CH: 0.8, FS: 0.85 } // share of targets kept low, by type
    },
    pull: {
      starter: 0.3,        // fatigue steps (B3.tune.PITCH.fatigueSpan pitches each) at which a starter comes out
      late: 0,             // ... from the 7th inning on
      starterRuns: 5,      // runs that take a starter out (hit hard); 4 once he is within 25 pitches of his Stamina
      reliever: 0,         // fatigue steps at which a reliever comes out
      relieverRuns: 3,
      oneInning: ['CL', 'SU'], // roles that pitch one inning: out when a new inning starts after 3 outs
      middleOuts: 6        // a middle reliever goes at most this many outs
    }
  };

  function has(o, k) { return o && Object.prototype.hasOwnProperty.call(o, k); }

  function merge(base, over) {
    const out = {};
    for (const k in base) out[k] = has(over, k) ? over[k] : base[k];
    return out;
  }

  // One player's inputs for the physics: { bats, throws, bat, pit, fld, run }. The game makes these at
  // start through B3.ratings.inputs, which passes the inputs from his ratings as `rated` ({ bat, pit, fld,
  // run }, each partial). Layers, last wins: the placeholders here, then `rated`, then player.sim.
  function inputs(player, rated) {
    const sim = player.sim || {};
    rated = rated || {};
    const pit = merge(merge(PIT, rated.pit), sim.pit);
    if (pit.stamina === null) pit.stamina = has(STAMINA, player.role) ? STAMINA[player.role] : STAMINA.other;
    pit.grades = Object.assign({}, pit.grades || {});
    pit.shapes = Object.assign({}, pit.shapes || {});
    return {
      bats: player.bats || 'R',
      throws: player.throws || 'R',
      bat: merge(merge(BAT, rated.bat), sim.bat),
      pit: pit,
      fld: merge(merge(FLD, rated.fld), sim.fld),
      run: merge(merge(RUN, rated.run), sim.run)
    };
  }

  B3.tune = {
    BAT: BAT, PIT: PIT, STAMINA: STAMINA, FLD: FLD, POS: POS, RUN: RUN, BALL: BALL, ERR: ERR, STEAL: STEAL,
    PITCH: PITCH, TYPE: TYPE, SWING: SWING, TIMING: TIMING, PLATOON: PLATOON, RATE: RATE, CPU: CPU,
    inputs: inputs
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
