// The one settings object for the engine: every calibration number, with what it does, and the
// placeholder value of every rating hook. Logic file: no DOM.
//
// Rating hooks (M1 step 1.2): the physics never reads a rating. It reads one input object per player, in
// physical units (inches, ms, mph, feet), made at game start by B3.ratings.inputs (step 1.3), which
// maps the player's ratings with the scales in RATE below and passes them to B3.tune.inputs. A rating of
// 60 gives exactly the placeholder value below (an average big-leaguer), and a player without ratings
// gets the placeholders. A test can override any input with player.sim = { bat: {...}, pit: {...},
// fld: {...}, run: {...} }. All values are Claude's defaults, set in steps 1.2-1.3 to give sane numbers
// and calibrated in step 1.4 against DESIGN.md section 7 (node tools/calibrate.js).
(function (root) {
  'use strict';
  const B3 = root.B3 = root.B3 || {};

  // ---- Rating hooks: placeholder inputs ----

  // Hitting (DESIGN.md section 10: each input names the rating whose job it is).
  const BAT = {
    contactSd: 1.33,   // Contact: spread of the *where* error, inches between bat and ball centers
    timingSd: 20,      // Timing: spread of a CPU hitter's *when* error at 92 mph, in ms
    square: 1,         // Timing (Session 11, owner's choice: Timing's job is squaring up): multiplier on the exit speed he
                       // loses to a mishit, off center or mistimed (below 1: he keeps the barrel on the ball)
    timingTop: 92,     // Contact (Session 11; Timing's until then): the pitch speed (mph) around which he starts to run
                       // late (a soft step, TIMING.lateSoft); real data: whiffs against 95+ mph follow fastball whiffs
    batSpeed: 71.7,    // Raw Power: average bat speed in mph (Savant's bat tracking: the sweet spot's speed at
                       // contact; step 1.5, real units, was 90.3 in the engine's own); each swing varies by SWING.batSd
    launchK: 15,       // Launch: degrees of launch angle per inch of *where* error near the bat's center (lower is a
                       // tighter band); it bends steeper toward the bat's edge (SWING.launchCurve; step 1.5, was 22)
    launchSd: 12,      // Launch: extra launch-angle noise in degrees (the swing's own plane; step 1.5, was 15)
    sprayNoise: 29,    // Launch: spray-direction noise in degrees (spray control), on a mishit at the glancing edge
                       // (SWING.sprayBase; step 1.5, was 20 on every ball)
    recognition: 0.75, // Recognition: share of a pitch's movement and speed change he reads (0 to 1)
    judgeSd: 0.45,     // Discipline: feet of noise in judging where a pitch will cross, for swing or take
    judgeLean: 0.1,    // Discipline: feet he leans toward seeing a ball as a strike (the CPU's swing choice)
    aggressiveness: 0, // tendency (-1 Patient, 0 Balanced, 1 Aggressive): the CPU's swing choice
    swingPath: 0       // tendency (-1 Ground-ball, 0 Level, 1 Lift; owner's choice, Session 11): his swing's tilt
  };

  // Pitching. Grades and shapes are per pitch type: { FF: 1.1, SL: 0.9 }; a missing type is average.
  const PIT = {
    velo: 93.5,        // Velocity: four-seam fastball speed in mph; other types are a share of it
    commandSd: 0.48,   // Command: scatter around the target, feet on each axis
    deception: 1,      // Deception: multiplier on the share of movement and speed change a hitter doesn't read
                       // (the mirror of Recognition; step 1.4, was taken off his recognition)
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
    route: 0.915,      // Range: share of his top speed he keeps on the way to the ball (the route)
    hands: 1,          // Hands: error rate multiplier (0.5 is half as many fumbles, drops and wild throws)
    release: 0,        // Hands: seconds taken off every catch-and-throw (quick release; double-play pivots)
    arm: null,         // throw speed in mph (null: his position's, in POS)
    armPlus: 0,        // Arm: mph added to that throw speed
    framing: 0         // Framing (catchers): feet the borderline edge of the zone moves toward strikes
  };
  // Position values: [react s, arm mph, catch-to-throw s]. Shortstops and center fielders start quickest.
  // Step 1.5: infielders' catch-to-throw is 0.25 s slower than step 1.4's (so ground balls by exit speed become hits
  // about as often as Statcast's: slow rollers beat more throws, and fewer runs come from hard grounders).
  const POS = {
    P: [0.55, 80, 0.75], C: [0.45, 80, 0.72], '1B': [0.32, 76, 0.85], '2B': [0.28, 78, 0.8],
    '3B': [0.28, 84, 0.95], SS: [0.26, 85, 0.87], LF: [0.42, 85, 0.95], CF: [0.36, 87, 0.9], RF: [0.42, 89, 0.95],
    DH: [0.4, 80, 0.8]
  };

  // Running.
  const RUN = {
    speed: 27,         // Speed: top sprint speed, feet per second (also a fielder's speed to the ball)
    read: 0.2,         // Baserunning: seconds to read a ball in play and break
    jump: 0.12,        // Baserunning: seconds lost on the jump when stealing
    judge: 0.14,       // Baserunning: seconds of error when he judges an extra base (lower is better)
    lead: 0            // Baserunning: feet added to his lead off every base, and when he steals (step 1.4)
  };

  // ---- Ratings to hook inputs (M1 step 1.3; B3.ratings) ----
  // Ratings run 20-99 and 60 is an average big-leaguer (DESIGN.md section 10). A rating first goes
  // through the top-end curve, then becomes u, tens of points from 60 (70 is u = 1). Each hook is then
  //   'mul': placeholder x step^u   (spreads and noise: they shrink as the rating rises, never below 0)
  //   'add': placeholder + step x u (speeds, shares and offsets)
  //   'up':  1 - (1 - placeholder) x step^u (a share that nears 1: what is left shrinks by a fixed share)
  // u is the rating's steps from 60, from its table in RATE.steps below (step 1.4), else tens of points.
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
      square: ['timing', 'mul', 0.9],
      timingTop: ['contact', 'add', 1.0],
      launchK: ['launch', 'mul', 0.87],
      launchSd: ['launch', 'mul', 0.87],
      sprayNoise: ['launch', 'mul', 0.87],
      batSpeed: ['rawPower', 'add', 1], // a step is one mph (step 1.5: the table below is the real ladder)
      recognition: ['recognition', 'up', 0.75],
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
      read: ['baserunning', 'mul', 0.8],
      jump: ['baserunning', 'mul', 0.8],
      judge: ['baserunning', 'mul', 0.8],
      lead: ['baserunning', 'add', 1.0]
    },
    pit: {
      velo: ['velocity', 'add', 1.6],
      commandSd: ['command', 'mul', 0.88],
      deception: ['deception', 'mul', 1 / 0.75] // the mirror of Recognition: the unread share grows by the same step
    },
    grade: { step: 0.12, min: 0.3 }, // a pitch grade: movement multiplier 1 + step x u (at least min)
    // Step tables (step 1.4): for each rating, [points after the curve, steps from 60], straight lines
    // between rows. Set by node tools/calibrate.js --part=fit so that +10 points are worth about the same
    // runs at every level and for every rating (the equal-value check); a rating without a table steps
    // one per 10 points.
    steps: {
      // Contact (step 1.5 task 4): step 1.4's table x 0.6 now that Contact scales the whole *where* spread (SWING.contactAll),
      // so the test population's whiff and zone-contact spreads match MLB's (the owner's ladder rule, Session 10).
      contact: [[20, -2.426], [30, -1.9], [40, -1.33], [50, -0.702], [60, 0], [70, 0.802], [80, 1.742], [90, 2.891], [100, 4.388], [110, 6.312]],
      timing: [[20, -2.535], [30, -1.972], [40, -1.409], [50, -0.787], [60, 0], [70, 0.687], [80, 1.786], [90, 3.113], [100, 5.236], [110, 8.632]],
      launch: [[20, -3.046], [30, -2.229], [40, -1.462], [50, -0.726], [60, 0], [70, 0.731], [80, 1.486], [90, 2.288], [100, 3.18], [110, 4.266]],
      // Raw Power (step 1.5): mph of average bat speed from 71.7, on the real ladder (Savant 2024-2026: the worst
      // player-season 62.4, 5th percentile 67.3, median 71.7, 95th 76.1, best 81.2), rows at the points after the curve.
      rawPower: [[20, -9.332], [30, -7.2], [40, -4.438], [50, -1.751], [60, 0], [70, 1.724], [80, 4.322], [85, 5.251], [91.25, 6.181], [100, 8.013], [108.8, 9.478]],
      recognition: [[20, -2.382], [30, -1.85], [40, -1.369], [50, -0.746], [60, 0], [70, 0.946], [80, 2.287], [90, 4.433], [100, 7.866], [110, 13.358]],
      discipline: [[20, -4.112], [30, -3.042], [40, -2.014], [50, -1.014], [60, 0], [70, 0.945], [80, 2.147], [90, 3.667], [100, 5.975], [110, 8.284]],
      velocity: [[20, -15.069], [30, -8.4], [40, -4.233], [50, -1.628], [60, 0], [70, 1.236], [80, 2.057], [90, 2.746], [100, 3.379], [110, 4.008]],
      command: [[20, -3.317], [30, -2.508], [40, -1.698], [50, -0.87], [60, 0], [70, 0.92], [80, 1.899], [90, 2.952], [100, 4.098], [110, 5.368]],
      deception: [[20, -7.939], [30, -4.465], [40, -2.294], [50, -0.937], [60, 0], [70, 0.739], [80, 1.358], [90, 1.896], [100, 2.376], [110, 2.812]],
      grade: [[20, -7.141], [30, -4.387], [40, -2.666], [50, -1.304], [60, 0], [70, 1.461], [80, 2.408], [90, 3.128], [100, 3.831], [110, 4.534]],
      range: [[20, -2.101], [30, -1.611], [40, -1.099], [50, -0.563], [60, 0], [70, 0.593], [80, 1.22], [90, 1.884], [100, 2.591], [110, 3.347]],
      hands: [[20, -2.405], [30, -1.882], [40, -1.313], [50, -0.69], [60, 0], [70, 0.774], [80, 1.653], [90, 2.665], [100, 3.836], [110, 5.129]],
      arm: [[20, -1.594], [30, -1.305], [40, -0.965], [50, -0.548], [60, 0], [70, 0.799], [80, 1.92], [90, 2.851], [100, 3.559], [110, 4.263]],
      framing: [[20, -1.179], [30, -0.902], [40, -0.613], [50, -0.312], [60, 0], [70, 0.322], [80, 0.653], [90, 0.991], [100, 1.334], [110, 1.678]],
      speed: [[20, -1.564], [30, -1.157], [40, -0.765], [50, -0.381], [60, 0], [70, 0.382], [80, 0.771], [90, 1.171], [100, 1.591], [110, 2.04]],
      baserunning: [[20, -5.57], [30, -3.415], [40, -2.068], [50, -0.985], [60, 0], [70, 0.952], [80, 1.917], [90, 2.949], [100, 4.152], [110, 6.043]]
    },
    shape: 4,          // degrees off the launch angle at shape +1 (ground-ball tilt); -1 is a fly-ball tilt
    // Stamina: pitches before fatigue sets in, by rating (straight lines between; past 100 the last
    // slope). One scale for every role: relievers are low-Stamina pitchers. 60 is the placeholder starter.
    stamina: [[20, 18], [30, 28], [40, 45], [50, 68], [60, 92], [70, 102], [80, 110], [90, 117], [100, 123]],
    tendency: {
      aggressiveness: { Patient: -1, Balanced: 0, Aggressive: 1 },
      aim: { Nibbler: -1, Balanced: 0, Attacker: 1 },
      swingPath: { 'Ground-ball': -1, Level: 0, Lift: 1 }
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
    foulBack: 0.45,    // share of radius past which contact is a glancing foul (tipped back; step 1.5, was 0.52: about
                       // half of all bat contact is foul, as in MLB)
    missMs: 80,        // a *when* error past this many ms misses the ball
    timeRadius: 0.7,   // share of the bat's reach (radius) lost at missMs; scales with the square of the *when*
                       // error (step 1.3: so velocity and Timing move whiffs, not only exit speed)
    // Location: pitches far from the middle are harder to square up (inches of extra spread per foot).
    edgeFrom: 0.8,     // feet inside the zone's edge from which location starts to matter (step 1.4: from near the
                       // middle, so a pitch down the middle is the easiest to hit; it was 0.4)
    edgeSd: 2.4,       // per foot from edgeFrom inside the edge outward
    chaseSd: 3.0,      // per foot outside the zone, on top of edgeSd
    locLoss: 0.04,     // share of exit speed lost per foot from edgeFrom inside the edge outward (step 1.3; step 1.5,
                       // was 0.08)
    collision: 0.23,   // exit speed = collision x pitch speed at the plate + (1 + collision) x bat speed, for a
                       // squared-up ball (step 1.5: Savant's 0.23 with bat speed in real units; step 1.4 had 0.12)
    contactAll: 1,     // Contact's reach (step 1.5 task 4): the location and movement parts of the *where* spread are
                       // multiplied by (his Contact spread / an average hitter's) to this power (0: Contact moves only its
                       // own part, as in steps 1.2-1.5 task 3; 1: the whole spread)
    speedCost: 0.04,   // a faster bat costs accuracy (step 1.5, owner's choice, Session 10): the *where* spread is
                       // multiplied by e^(speedCost x mph of his average bat speed above BAT.batSpeed), tuned so each mph
                       // moves whiffs, squared-up % and average exit speed as across real hitters (tools/ratingstats.js)
    barrelCost: 0.0035, // and along the bat (the same choice): exit speed is multiplied by e^(-barrelCost x those mph), so
                       // each mph of average bat speed adds about as much exit speed as across real hitters (0.57 mph
                       // on average, 0.83 at the top) instead of the squared-up formula's 1.23
    effort: 0.5,       // share of the *where* spread added per standard deviation of a swing's bat speed above his own
                       // average (taken off below it): a harder swing than his usual is less accurate (step 1.5)
    batSd: 3.8,        // mph: one swing's bat speed against his average (step 1.5: Savant's fast-swing rate, 75+ mph,
                       // is about 19% of swings at a 71.7 average)
    batCap: 1.3,       // his hardest swing: batSd x this above his average (step 1.5: Raw Power is a ceiling; Statcast's
                       // hardest-hit balls stop near 110 mph for an average bat)
    plateShare: 0.9,   // pitch speed at the plate as a share of release speed
    offLoss: 0.45,     // exit speed lost at the glancing edge (scales with the *where* error to offPow; step 1.5, was 0.42
                       // with a square)
    offPow: 2.5,       // the power: a near-center hit loses little, a mishit near the edge a lot (step 1.5)
    offUnder: 0.89,    // share of that loss when the bat passes under the ball (step 1.5: Statcast's fly balls come off
                       // harder than its ground balls)
    timeLoss: 0.28,    // exit speed lost at missMs (scales with the square of the *when* error; step 1.5, was 0.45)
    lateLoss: 0.75,       // a late swing loses this share more than an early one (step 1.5: the bat isn't up to speed yet;
                       // Statcast's opposite-field balls come off slower than pulled ones)
    evSd: 1,           // exit-speed noise, mph (step 1.5, was 2.5: a swing's own bat speed carries most of the spread)
    attack: 19.5,      // launch angle of a dead-center hit at the middle of the zone, degrees (step 1.5, was 13.5)
    launchCurve: 1.5, // per square inch: the *where* error's launch angle grows as off x (1 + launchCurve x off^2), so
                       // a ball hit far under the center pops up and one far over it is chopped (step 1.5)
    heightLA: 13.5,      // degrees of launch angle per foot the pitch is above the middle of the zone (2.55 ft; step 1.5,
                       // was 7)
    pullAt0: -7.5,     // spray of a perfectly timed swing, degrees toward the pull side (minus is pull; step 1.5, was -6)
    sprayPerMs: 1.0,   // degrees of spray per ms of *when* error (early pulls, late goes the other way)
    insidePull: 12,    // degrees toward the pull side per foot the pitch is inside
    sprayBase: 0.35,    // share of the batter's spray noise on a dead-center hit, growing to all of it at the glancing edge
                       // (step 1.5: a squared-up ball goes where the bat points; a mishit squirts)
    sprayLA: 1.4,      // degrees toward the opposite field per degree of launch angle he gets from hitting under the
                       // ball's center (step 1.5: a ball hit under slices the other way; Statcast 2024: 27% of fly balls
                       // are pulled and 57% of pop-ups go the other way, against 49% of ground balls pulled)
    twoStrike: [0.64, 2], // with two strikes a hitter shortens up (step 1.4): [share of his *where* spread, mph of bat
                       // speed he gives up (step 1.5; it was 4% of exit speed)]
    shapeSd: [0.112, 0.09], // the shape's counterweight (step 1.4, owner's choice: value-neutral): share of the
                       // *where* spread taken off per unit of ground-ball shape (easier to square up), and
                       // added per unit of fly-ball shape (harder)
    // Swing path (owner's choice, Session 11: a hitter's own shape; the sizes are Claude's defaults): per unit of
    // swingPath (+1 Lift, -1 Ground-ball), degrees added to his launch angle (real: the 15th and 85th percentiles of
    // hitters' average launch angle sit about 4.5 degrees from the median), degrees of spray toward his pull side
    // (real: +0.8 pull points per degree of launch angle), and the share of his *where* spread added (taken off for
    // Ground-ball): the counterweight that keeps it about value-neutral (real: +0.19 whiff points per degree).
    pathLA: 3.7,
    pathPull: 5,
    pathSd: [0.035, 0.02], // [share taken off per unit of Ground-ball, share added per unit of Lift]
    foulLine: 45       // the foul lines, degrees from straightaway center
  };

  const TIMING = {
    refMph: 92,        // timingSd is the spread at this pitch speed
    sdPow: 6,          // the spread grows as (speed / refMph) to this power (step 1.4; was +60% per 10 mph, floored)
    latePerMph: 8,     // ms late per mph well above the hitter's timingTop (Velocity attacks Timing)
    lateSoft: 4,       // mph over which lateness eases in around timingTop (step 1.4: a soft step, so every
                       // mph of Velocity counts; 8 x 4 x ln(1 + e^((speed - top) / 4)) ms)
    gearUp: 0.6,       // share of his fastball's lateness a hitter makes up by starting earlier, on every pitch
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
    drag: 0.00165,     // air drag per foot (step 1.5, was 0.0018; with dragPow and lift below, Statcast's fly-ball
                       // distances by exit speed: 230 / 280 / 315 / 345 / 370 / 395 ft for 74 / 86 / 93 / 98 / 102 / 108 mph)
    dragRef: 140,      // ft/s (95 mph) at which the first flight's drag is `drag` ...
    dragPow: 0.3,      // ... and it grows as (dragRef / speed) to this power below it, falls above it (step 1.5)
    lift: 0.00065,      // backspin lift per foot on balls hit in the air (step 1.5, was 0.0009: Statcast 2024 fly balls
                       // average 314 ft, and 12% of those hit 95-100 mph and 41% at 100-105 mph are home runs)
    sliceLift: 0.015,  // share of that lift lost per degree a ball goes toward the opposite field (step 1.5: it leaves with
                       // slice spin; Statcast 2024 fly balls carry 338 ft pulled, 326 to center, 285 the other way)
    liftFull: 35,      // degrees of launch angle at which backspin (and lift) is full; less below it
    dt: 0.02,          // integration step in the air, seconds
    sample: 0.1,       // the ball's path is kept every this many seconds (fielding and the play script)
    startHeight: 3,    // feet: the ball's height at contact
    bounceUp: 0.42,    // share of the downward speed kept on a bounce
    bounceOn: 0.72,    // share of the forward speed kept on a bounce (step 1.5, was 0.78: hard grounders reach fielders
                       // as often as Statcast's do)
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
    throwLong: 0.68,   // ... at throwFar and more (an arc, a bounce or a relay); in between it slides
    throwFar: 300,     // feet where a throw reaches throwLong's share
    tag: 0.12,         // seconds to apply a tag (a force needs none)
    playSd: 0.07,      // seconds: how sharply a close play's chance falls off
    turn: 0.12,        // seconds a runner loses rounding a base
    batterBox: 0.3,    // seconds out of the box after the swing
    lefty: 0.08,       // seconds a left-handed batter saves to first
    pivot: 0.45,       // seconds for the pivot man to catch and throw on a double play
    infield: 125,      // feet: grounders past this have left the infield
    lead: [12, 18, 12], // feet: leads off first, second and third
    shuffle: [6, 8, 5], // feet a runner who isn't stealing adds on the pitch (his secondary lead), off each base
    shuffleV: 5,       // ft/s he is still moving toward the next base when the ball is hit
    chargeFt: 15,      // feet an outfielder must come in toward home to field a hit for it to count as charging it
    chargeGain: 0.3,   // seconds quicker his throw is then (momentum toward the infield)
    frontSp: 5,        // degrees: a grounder hit left of this is in front of a runner on second (he holds till it's through)
    armBlind: 0.5,     // share of a fielder's arm above (or below) his position's that runners don't see when they
                       // judge a throw (step 1.4: so a strong arm throws out runners who test it, not only holds them)
    dare: 0.08,        // seconds of margin a runner wants before taking an extra base: one number for every
                       // runner, not a player trait (owner's choice, Session 3)
    // Break-even chance of being safe for taking third (3) or home (4) on a hit, by outs (0, 1, 2), from a
    // run-expectancy table: an out at third or home costs a lot with nobody out, little with two out
    // (Session 7; the rule by base and outs is the owner's choice, Session 8; the rates are Claude's default).
    // Still one rule for every runner, not a player trait.
    breakEven: { 3: [0.73, 0.73, 0.9], 4: [0.93, 0.75, 0.42] },
    dareShift: 0,      // seconds added to every break-even margin (a calibration knob)
    ofIn: 12,          // feet outfielders play in with a runner on second (Session 7, provisional)
    ofEffort: 0.55,    // share of an outfielder's top arm speed on a short throw after a hit, rising to all of it by
                       // throwFar (Statcast arm strength is his hardest throws; Session 7, provisional)
    halfway: 0.45,     // share of the way a runner goes on a fly ball that may be caught
    dropRead: 1,       // a runner at halfway breaks this many reads (RUN.read) after the ball drops
    dropSure: 0.4,     // seconds a fielder must be judged short of a ball in the air for runners to go before it lands
    dropJudge: 1,      // the runner's error judging that, as a multiple of his RUN.judge
    airRead: 2,        // ... and then he goes after this many reads (a line drive's freeze)
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
    secondLead: [3, 7], // extra feet of lead a stealing runner takes off first and off second
    sd: 0.12           // seconds of noise on a steal play
  };

  // The CPU's choices (B3.manager.cpu, M1 step 1.3 task 10). Claude's defaults, tuned in step 1.4.
  const CPU = {
    // Steals (step 1.4): before each pitch the CPU judges the runner's chance (B3.ball.stealOdds: his jump
    // and Speed against the delivery and the catcher's release and Arm). Below `min` he stays; from there
    // to `full` his chance of going on this pitch rises to `rate`. Steals of third need more. He judges
    // his chance with an error of `judge` x his Baserunning's judge seconds on the margin.
    steal: { min: [0.68, 0.78], full: [0.85, 0.92], rate: [0.09, 0.05], twoOut: 0.6, judge: 0.8 },
    // Tag-ups (step 1.4): the lead runner goes when he judges his chance (B3.ball.tagupOdds, plus his own
    // Baserunning error) is at least this, from second or from third.
    tagup: { need: { 2: 0.8, 3: 0.6 } },
    swing: {
      // A CPU hitter swings when the pitch looks to cross inside this line: feet from the edge of the zone
      // (below 0 inside), by balls (rows 0-3) and strikes (columns 0-2). He takes the corners early in the
      // count and protects the plate with two strikes; on 3-0 he waits for one down the middle.
      line: [[-0.12, -0.04, 0.24], [-0.12, -0.05, 0.24], [-0.13, -0.07, 0.22], [-0.5, -0.1, 0.19]],
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
      zone: [[0.53, 0.42, 0.21], [0.62, 0.52, 0.32], [0.73, 0.67, 0.47], [0.82, 0.8, 0.72]],
      aimZone: [0, 0, 0], // targets in the zone added by Aim (Nibbler, Balanced, Attacker)
      // Targets in the zone: feet inside the nearest side and top or bottom, by Aim (Nibbler, Balanced,
      // Attacker). A nibbler works the corners; an attacker comes in toward the middle.
      inset: [[0.24, 0.72], [0.3, 0.8], [0.36, 0.88]],
      groove: 0.04,        // feet of extra inset (toward the middle) on targets in the zone with three balls
      chase: [0.03, 0.5],  // targets outside the zone: feet off the edge
      commandAim: [0.5, 0.4, 1.5], // targets (insets and feet off the edge) x (his scatter / the average's) to this
                           // power, between these limits: sharper command aims nearer the edges (step 1.4)
      low: { FF: 0.4, SI: 0.75, FC: 0.55, SL: 0.7, CU: 0.8, CH: 0.8, FS: 0.85 } // share of targets kept low, by type
    },
    pull: {
      starter: 0.55,       // fatigue steps (B3.tune.PITCH.fatigueSpan pitches each) at which a starter comes out
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
