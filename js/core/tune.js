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
    contactSd: 1.22,   // Contact: spread of the *where* error, inches between bat and ball centers (Session 22, was 1.33: the
                       // level fit, SWING.attack; rated teams' whiffs 26.2 -> 25.5% of swings [MLB 2024 25.3]; Session 28, was
                       // 1.26: the level fit on the generated league, whose wider spread had whiffs at 26.7% and strikeouts 23.6%;
                       // Session 30, was 1.18: the level again after the pitching balance (the grades), which took the generated
                       // league to about 4.72 runs, K 22.4%, whiffs 25.4%; now 4.69, 22.7%, 25.8% over four seeds)
    timingSd: 20,      // Timing: spread of a CPU hitter's *when* error at 92 mph, in ms
    square: 1,         // Timing (Session 11, owner's choice: Timing's job is squaring up): multiplier on the exit speed he
                       // loses to a mishit, off center or mistimed (below 1: he keeps the barrel on the ball)
    timingTop: 92,     // Contact (Session 11; Timing's until then): the pitch speed (mph) around which he starts to run
                       // late (a soft step, TIMING.lateSoft); real data: whiffs against 95+ mph follow fastball whiffs
    batSpeed: 71.7,    // Raw Power: average bat speed in mph (Savant's bat tracking: the sweet spot's speed at
                       // contact; step 1.5, real units, was 90.3 in the engine's own); each swing varies by SWING.batSd
    launchK: 15,       // Launch: degrees of launch angle per inch of *where* error near the bat's center (lower is a
                       // tighter band); it bends steeper toward the bat's edge (SWING.launchCurve; step 1.5, was 22)
    launchSd: 16,      // Launch: extra launch-angle noise in degrees (the swing's own plane; step 1.5, was 15; Session 22, was 12:
                       // the level fit, SWING.attack; Session 23, was 13.9: with SWING.launchBase, less on squared-up balls)
    sprayNoise: 23,    // Launch: spray-direction noise in degrees (spray control), on a mishit at the glancing edge
                       // (SWING.sprayBase; step 1.5, was 20 on every ball; Session 22, was 29: the spray fit, SWING.pullAt0)
    recognition: 0.8,  // Recognition: the chance he picks up a pitch (its movement and speed change), 0 to 1; one read per
                       // pitch (step 1.5 task 4, Session 12: was a share of every pitch, 0.75)
    breakRead: 1,      // Recognition: multiplier on the late break (TYPE bite) of an off-speed pitch he swings at (below 1:
                       // he tracks the break; step 1.5 task 4, Session 12: so Recognition still counts once he reads nearly
                       // every pitch, as DESIGN.md section 10 says, "less fooled by off-speed and break")
    judgeSd: 0.4,      // Discipline: feet of noise in judging where a pitch will cross, for swing or take (Session 12, was
                       // 0.45: MLB hitters chase fastballs off the plate 24.8% of the time)
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
    soft: 1,           // Deception (Session 19, owner's choice: the pitchers' contact skill): multiplier on the exit speed
                       // a hitter loses to a mishit against him, off center or mistimed (above 1: he is squared up less;
                       // the mirror of Timing's square)
    stamina: null,     // Stamina: pitches before fatigue sets in; null means the role's value in STAMINA
    grades: null,      // pitch grades: movement multiplier per type (1 average, 1.2 is 20% more break)
    shapes: null,      // pitch shapes: degrees taken off the launch angle per type (+ ground-ball tilt, - fly-ball tilt)
    putAway: null,     // the put-away pitch (his best-graded type); null: the CPU picks by pitch type
    aim: 0             // tendency (-1 Nibbler, 0 Balanced, 1 Attacker): the CPU's pitch targets
  };
  const STAMINA = { SP: 82, LR: 50, other: 28 }; // placeholder Stamina by role, in pitches (Session 17: SP was 88, 92 before Session 16)

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
  // Position values: [react s, arm mph, catch-to-throw s]. Shortstops and center fielders start quickest. Arms (Session 20):
  // Savant's 2024-2026 medians where step 1.4's were more than 1 mph off (1B 74.7, SS 83.5, LF 86.6); the catcher stays at 80
  // mph and 0.72 s (his pop time 2.02 s against Savant's median 1.95, arm 82.8 and exchange 0.65: with those, steals fell
  // to 0.58 a team-game at 66% safe, MLB's about 0.9 at 78%; reported)
  // Step 1.5: infielders' catch-to-throw is 0.25 s slower than step 1.4's (so ground balls by exit speed become hits
  // about as often as Statcast's: slow rollers beat more throws, and fewer runs come from hard grounders). Session 20: 0.05 s
  // slower than step 1.4's; the rest of that work now comes from fielding on the run (BALL.onRun), so slow rollers he
  // charges still beat throws while a ball hit at him is turned two (with Speed's real range and home to first).
  const POS = {
    P: [0.55, 80, 0.75], C: [0.45, 80, 0.72], '1B': [0.32, 74.7, 0.65], '2B': [0.28, 78, 0.6],
    '3B': [0.28, 84, 0.75], SS: [0.26, 83.5, 0.67], LF: [0.42, 86.6, 0.95], CF: [0.36, 87, 0.9], RF: [0.42, 89, 0.95],
    DH: [0.4, 80, 0.8]
  };

  // Running.
  const RUN = {
    speed: 27.5,       // Speed: top sprint speed, feet per second (also a fielder's speed to the ball). Session 20: was 27;
                       // Savant's median (2024-2026, 1,712 player-seasons with 10+ competitive runs) is 27.5
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
  // A fourth entry 'tens' makes u plain tens of points from 60 (after the curve), not the rating's step table (Session 19).
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
    // The pair synergies (Session 26, M2 step 2.1a, the owner's note 1; DESIGN.md section 10): when both ratings of a pair
    // are above 60 (as rated), the pair gives k x (a - 60) x (b - 60) / 100 points to its `to` ratings (shared equally),
    // inside the group's cap above. Claude's defaults: the four pairs from Session 25's summary; a rating whose own stat is a
    // raw physical measure (bat speed, fastball mph, sprint speed) never receives points, so the partner skill takes them;
    // k sized with tools/calibrate.js --part=synergy (the pair's payoff at 80 and 80, physics included).
    // Session 28 (the calibration on the generated league): Velocity with the put-away pitch k 1.0 (was 2.0): it stretched the
    // generated starters' strikeout tail past MLB's (K% 95th percentile 33.3 [MLB starters 30.0]; 9.8% of starters as far above
    // the median as MLB's top 5%); the hitters' pairs keep their sizes (they don't move the hitters' stars).
    synergy: [
      { pair: ['contact', 'rawPower'], to: ['contact'], k: 0.4 },
      { pair: ['recognition', 'discipline'], to: ['recognition', 'discipline'], k: 1.8 },
      { pair: ['velocity', 'putAway'], to: ['putAway'], k: 1.0 },
      { pair: ['speed', 'baserunning'], to: ['baserunning'], k: 0.6 }
    ],
    bat: {
      contactSd: ['contact', 'mul', 0.88],
      timingSd: ['timing', 'mul', 0.85],
      square: ['timing', 'mul', 0.9],
      timingTop: ['contact', 'add', 1.0],
      launchK: ['launch', 'mul', 0.87],
      launchSd: ['launch', 'mul', 0.87],
      sprayNoise: ['launch', 'mul', 0.87],
      batSpeed: ['rawPower', 'add', 1], // a step is one mph (step 1.5: the table below is the real ladder)
      recognition: ['recognition', 'up', 0.6], // Session 12: was 0.75, so the population's off-speed whiff spreads as MLB's
      breakRead: ['recognition', 'mul', 0.95],
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
      armPlus: ['arm', 'add', 1], // a step is one mph (Session 20: the table below is the real ladder; was 2.5 mph a step)
      framing: ['framing', 'add', 0.015]
    },
    run: {
      speed: ['speed', 'add', 1], // a step is one ft/s (Session 20: the table below is the real ladder; was 0.8 a step)
      read: ['baserunning', 'mul', 0.8],
      jump: ['baserunning', 'mul', 0.8],
      judge: ['baserunning', 'mul', 0.8],
      lead: ['baserunning', 'add', 1.0]
    },
    pit: {
      velo: ['velocity', 'add', 1], // a step is one mph (Session 13: the table below is the real ladder)
      commandSd: ['command', 'mul', 0.92], // Session 14: was 0.88 (the test population's walk, edge and chase spreads)
      deception: ['deception', 'mul', 1 / 0.75], // the mirror of Recognition: the unread share grows by the same step
      // Session 19 (owner's choice): Deception also carries the pitchers' contact skill, on its own gentle scale ('tens': tens
      // of points after the curve, not Deception's step table, which is steep below 60), sized so the test population's exit
      // speed and hard-hit % against spread as MLB's (Savant 2024-2025: exit speed against repeats year to year at r 0.54,
      // about 1 mph per standard deviation, and goes with chase % against, not with whiffs)
      soft: ['deception', 'mul', 1.079, 'tens']
    },
    grade: { step: 0.12, min: 0.3 }, // a pitch grade: movement multiplier 1 + step x u (at least min)
    // Step tables (step 1.4): for each rating, [points after the curve, steps from 60], straight lines
    // between rows. Set by node tools/calibrate.js --part=fit so that +10 points are worth about the same
    // runs at every level and for every rating (the equal-value check); a rating without a table steps
    // one per 10 points. Session 23 (step 1.5 task 7, the one calibration): Timing, Launch, Recognition, Discipline, Hands, Framing
    // and Baserunning refitted after the new weak contact, the hook spin, the outfield and the aim (115,321 plate appearances a
    // condition); not Raw Power and Velocity (real ladders), Contact and Command (the population), Speed, Arm and Range (real
    // ladders; owner's choices, Sessions 14 and 23). The grades and Deception were refitted too and put back: refitted, the rated
    // starters' K% came out 13.6 / 19.7 / 26.4 at the 5th / 50th / 95th percentiles [MLB 15.3 / 21.5 / 30.0] (kept: 15.6 / 22.2 /
    // 29.0) and the league's strikeouts 20.5% [21.5-23]; realism wins (owner's choice, Session 8), so they stay set by the
    // pitchers' population (Sessions 13 and 19) and their worth is reported. Session 24: Recognition's and Discipline's are back
    // to Session 22's as well: refitted they narrowed the ratings' own ladders and the test population's spreads (chase %, 40 to 80,
    // 9.6 points [MLB 19.2]; off-speed whiff 11.3 [25.2]); Timing's refit stays (its ladder narrower, but the population's
    // squared-up spread is already wider than MLB's: the league's spread wins, owner's choice, Session 10).
    steps: {
      // Contact (step 1.5 task 4): step 1.4's table x 0.6 now that Contact scales the whole *where* spread (SWING.contactAll),
      // so the test population's whiff and zone-contact spreads match MLB's (the owner's ladder rule, Session 10).
      contact: [[20, -2.426], [30, -1.9], [40, -1.33], [50, -0.702], [60, 0], [70, 0.802], [80, 1.742], [90, 2.891], [100, 4.388], [110, 6.312]],
      timing: [[20, -1.883], [30, -1.405], [40, -0.933], [50, -0.465], [60, 0], [70, 0.464], [80, 0.928], [90, 1.393], [100, 1.862], [110, 2.337]],
      launch: [[20, -2.701], [30, -2.047], [40, -1.382], [50, -0.702], [60, 0], [70, 0.732], [80, 1.504], [90, 2.334], [100, 3.252], [110, 4.311]],
      // Raw Power (step 1.5): mph of average bat speed from 71.7, on the real ladder (Savant 2024-2026: the worst
      // player-season 62.4, 5th percentile 67.3, median 71.7, 95th 76.1, best 81.2), rows at the points after the curve.
      rawPower: [[20, -9.332], [30, -7.2], [40, -4.438], [50, -1.751], [60, 0], [70, 1.724], [80, 4.322], [85, 5.251], [91.25, 6.181], [100, 8.013], [108.8, 9.478]],
      recognition: [[20, -2.382], [30, -1.85], [40, -1.369], [50, -0.746], [60, 0], [70, 0.946], [80, 2.287], [90, 4.433], [100, 7.866], [110, 13.358]],
      discipline: [[20, -4.112], [30, -3.042], [40, -2.014], [50, -1.014], [60, 0], [70, 0.945], [80, 2.147], [90, 3.667], [100, 5.975], [110, 8.284]],
      // Velocity (Session 13): mph of four-seam speed from PIT.velo, on the real ladder (Savant 2024-2026, pitchers with 250+
      // batters faced, against their median 94.4: the worst season 82.3, 1st percentile 87.8, 5th 90.7, 25th 92.9, 75th 95.9,
      // 95th 97.9, 99th 99.3, best 101.4), rows at the points after the curve; the step 1.4 fit had 20 at 69 mph.
      velocity: [[20, -12.1], [30, -6.59], [40, -3.7], [50, -1.5], [60, 0], [70, 1.5], [80, 3.5], [85, 4.2], [91.25, 4.9], [100, 6.0], [108.8, 7.0]],
      // Command (Session 14): step 1.4's rows below 60 x 0.75, so poor Command walks as MLB's worst do (with the 0.92 step).
      command: [[20, -2.488], [30, -1.881], [40, -1.274], [50, -0.653], [60, 0], [70, 0.92], [80, 1.899], [90, 2.952], [100, 4.098], [110, 5.368]],
      deception: [[20, -7.939], [30, -4.465], [40, -2.294], [50, -0.937], [60, 0], [70, 0.739], [80, 1.358], [90, 1.896], [100, 2.376], [110, 2.812]],
      // The grades (Session 30, M2 step 2.1a task 4, the owner's balancing of the pitching ratings; the sizes Claude's defaults): refitted
      // on whiff % against the table's steps (the slider, change-up and curve averaged; every pitch of a staff at one step, 1,600
      // games a step) so each +10 adds about the same whiffs: from 40 to 80 the distances from the engine's own average are 0.8 of
      // MLB's at the population's percentiles (60 +- 12.2 per standard deviation, so 50 and 70 are the 20.5th and 79.5th, between
      // the real ladder's 25th / 75th and 5th / 95th; 0.8 keeps the pitchers' population on MLB's spreads, which carry a season's
      // noise and the other skills), and below 40 and above 80 they follow MLB's ladder step for step. With TYPE's gradeStep (each
      // type's own ladder) and the off-speed pitches' gradeSd below average. Was (Session 28) [[20, -7.141], [30, -4.387],
      // [40, -2.666], [50, -1.304], [60, 0], [70, 1.388], [80, 2.288], [90, 2.972], [100, 3.639], [110, 4.307]]: steep from 60 to 70
      // (slider 31.6 to 39.1 [MLB 33.9 to 39.3]), flat from 70 to 80 and at both ends.
      grade: [[20, -2.892], [30, -2.541], [40, -1.733], [50, -0.901], [60, 0], [70, 1.147], [80, 2.108], [90, 2.934], [100, 4.037], [110, 5.14]],
      range: [[20, -2.101], [30, -1.611], [40, -1.099], [50, -0.563], [60, 0], [70, 0.593], [80, 1.22], [90, 1.884], [100, 2.591], [110, 3.347]],
      hands: [[20, -2.765], [30, -2.158], [40, -1.507], [50, -0.793], [60, 0], [70, 0.896], [80, 1.931], [90, 3.165], [100, 4.703], [110, 6.513]],
      // Arm (Session 20, the ladder rule): mph from his position's arm (POS), on the real ladder (Savant 2024-2026 arm strength,
      // the eight positions' ladders around their medians, averaged: the worst -9.9, 1st percentile -7.7, 5th -5.6, 25th -2.4,
      // 75th +2.5, 95th +6.3, 99th +8.8, the best +10.4), rows at the points after the curve. Was step 1.4's fit at 2.5 mph a
      // step (-4.0 mph at 20, -2.4 at 40, +4.8 at 80, +10.5 at 99).
      arm: [[20, -9.9], [30, -7.7], [40, -5.6], [50, -2.4], [60, 0], [70, 2.5], [80, 6.3], [85, 7.55], [91.25, 8.8], [100, 9.7], [108.8, 10.4]],
      framing: [[20, -1.189], [30, -0.912], [40, -0.62], [50, -0.315], [60, 0], [70, 0.322], [80, 0.647], [90, 0.969], [100, 1.285], [110, 1.59]],
      // Speed (Session 20, the owner's Session 7-8 choices: a realistic range, each ft/s doing what it does in real baseball):
      // ft/s of sprint speed from RUN.speed, on the real ladder (Savant 2024-2026, 1,712 player-seasons with 10+ competitive
      // runs: the worst 22.1, 1st percentile 23.9, 5th 25.0, 25th 26.5, median 27.5, 75th 28.3, 95th 29.4, 99th 30.0, best
      // 30.5), rows at the points after the curve. Was step 1.4's fit at 0.8 ft/s a step (25.75 ft/s at 20, 28.6 at 99).
      speed: [[20, -5.4], [30, -3.6], [40, -2.5], [50, -1.0], [60, 0], [70, 0.8], [80, 1.9], [85, 2.2], [91.25, 2.5], [100, 2.78], [108.8, 3.0]],
      baserunning: [[20, -5.002], [30, -3.609], [40, -2.34], [50, -1.147], [60, 0], [70, 1.122], [80, 2.235], [90, 3.355], [100, 4.499], [110, 5.685]]
    },
    shape: 8,          // degrees off the launch angle at shape +1 (ground-ball tilt); -1 is a fly-ball tilt (Session 19: was 4,
                       // with which a pitcher's every pitch at +1 or -1 gave a ground-ball % of only about 46.5 or 33.5 [MLB
                       // starters 2024-2025: 5th percentile 32.9, 95th 53.0, best 66.0])
    // Stamina: pitches before fatigue sets in, by rating (points after the curve; straight lines between; past the last row
    // its slope). One scale for every role: relievers are low-Stamina pitchers. 60 is the placeholder starter.
    // Session 16 (step 1.5 task 4): from 30 up, fitted so a starter's pitches per start (everyone else at 60) follow the
    // real starters' ladder (Baseball-Reference 2024-2026, 615 seasons with 10+ starts: 1st percentile 63, 5th 76, 25th 83,
    // median 87, 75th 90.5, 95th 95, 99th 98, best 100); 20 stays a short reliever (the worst real starter-season was an
    // opener's, 17). Relievers sit at about 20-30. Was [[20, 18], [30, 28], [40, 45], [50, 68], [60, 92], [70, 102], [80, 110],
    // [90, 117], [100, 123]] (a starter's 56 pitches a start at 40, 111 at 99).
    stamina: [[20, 18], [30, 57], [40, 70], [50, 77.5], [60, 82], [70, 86], [80, 91], [91.25, 95], [108.8, 97.5]],
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
    // The fade (Session 17, the owner's Session 16 choice: a gradual fade paced by Stamina, wearing down velocity, command and
    // stuff together; replaces Session 16's fatigue, none until his Stamina's pitches and then 1.2 mph and 30% more scatter
    // every 20). With x = his pitches / his Stamina's pitches (B3.ratings.stamina), he plays as if his Velocity, Command and
    // every pitch grade were points x x^power + past x (x - 1)^2 (past his Stamina) points lower. A point is a rating's slope
    // at 60: velo mph, command on the log of his scatter (RATE.pit.commandSd's 0.92 over the step table's 50-70 rows),
    // grade on the movement multiplier (RATE.grade.step over the grade table's 50-70 rows). Claude's defaults, fitted with
    // tools/starters.js to MLB 2024's starters (DESIGN.md section 10, "Starters deeper in games").
    // max (Session 20, Claude's default): the fade stops growing at this many points (about 15 mph off his fastball), so a
    // pitcher a player leaves in long past his Stamina stays a pitcher (without it a reliever at eight times his pitches threw
    // at minus 300,000 mph and walked every batter; the CPU's pitching changes almost never let a pitcher get that far)
    // Session 30: grade 0.0123 (was 0.0166), the new grade table's 50-70 rows (x the type's gradeStep in B3.pitch), so a point of fade
    // is still a grade point.
    fade: { points: 3, power: 2, past: 40, velo: 0.15, command: 0.00656, grade: 0.0123, max: 100 },
    // Familiarity (Session 17, the owner's Session 16 choice: an order penalty, the same for every pitcher): each time a
    // hitter has already faced this pitcher in the game he plays as if his Recognition and Timing were `points` higher. Per
    // point (the ratings' slopes at 60): the share of pitches he doesn't pick up x unread (RATE.bat.recognition's 0.6 over
    // the table's 50-70 rows), his *when* spread x timingSd and the exit speed he loses to a mishit x square (Timing's 0.85
    // and 0.9 over its 50-70 rows; Session 24: recomputed for Session 23's Timing table, were 0.9881 and 0.9923).
    familiar: { points: 1, unread: 0.9577, timingSd: 0.9925, square: 0.9951 },
    callWidth: 0.085,  // umpire: feet over which a borderline call goes from likely strike to likely ball (the logistic's
                       // scale; Session 15, was 0.055: MLB 2024's called strikes by feet from the zone padded by the ball,
                       // 97.6 / 93.1 / 85.7 / 66.6 / 33.9 / 15.9 / 5.3% from 0.4 ft inside to 0.3 ft off, 109,184 pitches)
    framingCap: 0.1,   // a catcher's framing can move the edge at most this many feet
    // A pitch's grade (its movement multiplier g, 1 average) beyond its movement (Session 13, step 1.5 task 4: the grades'
    // whiffs had come through the bite, which Session 12 made small next to a hitter's own spread):
    gradeHide: 2.5,    // the share of pitches a hitter doesn't pick up: x (1 + gradeHide x (g - 1)), at least 0 (a better
                       // pitch is harder to read; at 99, g 1.46, he misses reading 2.15x as many)
    gradeSurprise: 1.5 // how far an unread pitch fools him: x (1 + gradeSurprise x (g - 1)), at least 0 (B3.pitch fool)
  };

  // How each pitch type plays (on top of its speed and movement in B3.data.PITCH).
  //   bite      extra *where* spread (inches): late, hard-to-track movement
  //   surprise  share of the unread movement (inches) that becomes *where* error
  //   lift      degrees added to the launch angle: the type's usual tilt (sinkers and splitters on the
  //             ground, four-seamers in the air)
  //   miss      MLB's whiff % per swing for the type (Savant 2024 pitch-arsenal leaderboard; sliders with sweepers):
  //             only for breaking a tie for the put-away pitch (B3.ratings.putAway)
  const TYPE = {
    //   chase     multiplier on SWING.chaseSd (the extra spread per foot outside the zone; step 1.5 task 4): an off-speed
    //             pitch off the plate is still breaking away from the bat (MLB 2024 whiff % of swings: fastballs 16.2 in
    //             the zone and 32.1 outside it, off-speed pitches 19.3 and 52.8)
    //   breaking  an off-speed pitch: Recognition's breakRead scales its bite (Session 12)
    //   foolTime  the grade also scales the timing error when he doesn't read it (Session 13: a change-up's or splitter's
    //             grade is its speed change as much as its movement; a curve's is its drop)
    //   gradeStep (Session 30, M2 step 2.1a task 4; Claude's default) the grade's movement multiplier is 1 + RATE.grade.step x this x
    //             the grade table's steps (1 when unset): fitted on each type's whiff % against the table's steps so its ladder
    //             climbs as MLB's for that type does (the change-up's most, the curve's least: MLB 2024-2026 from the 5th to the 95th
    //             percentile 18.1 to 46.4 and 20.5 to 44.5; the slider 20.0 to 47.5)
    //   gradeSd   the whole *where* spread x the grade^gradeSd (Session 19: a four-seamer's ride or a sinker's sink beats the
    //             bat; MLB 2024-2026, four-seam whiff % across pitchers 12.7 to 32.0 at the 5th and 95th percentiles, velocity
    //             explaining r 0.34 of it). Session 30: the off-speed pitches below an average grade too ([0.5, 0]): a flat
    //             breaking ball or change-up is easier to put the bat on, so the ladder keeps falling below 40 (it read as one level,
    //             about 19% whiffs, from 20 to 40 [MLB 12-20]: below a grade of about 40 every pitch was read and fooled no one)
    // Session 12 (step 1.5 task 4, with one read per pitch): fastballs' bite +0.15, off-speed pitches' bite x 0.4 and
    // surprise 0.15 (an unread pitch now carries the whole surprise, a read one none), so the whiffs by type and zone
    // follow MLB's. Session 13 (the grades' reach): the curve's surprise 0.085 (was 0.15: its drop against a fastball is
    // 26 in, so an unread curve was nearly always missed; MLB's curve whiff at an average grade, 32.8%).
    FF: { bite: 0.65, surprise: 0.12, lift: 6, miss: 21.9, chase: 0.7, gradeSd: [0.3, 0.8] },
    SI: { bite: 0.15, surprise: 0.12, lift: -6, miss: 13.5, chase: 0.7, gradeSd: [0.15, 0.3] },
    FC: { bite: 1.05, surprise: 0.12, lift: 1, miss: 23.7, chase: 0.7 },
    SL: { bite: 0.64, surprise: 0.15, lift: 0, miss: 33.8, chase: 2.3, breaking: true, gradeSd: [0.5, 0], gradeStep: 0.957 },
    CU: { bite: 0.52, surprise: 0.085, lift: -1, miss: 33.0, chase: 2.3, breaking: true, gradeSd: [0.5, 0], gradeStep: 0.869 },
    CH: { bite: 0.6, surprise: 0.15, lift: -4, miss: 31.9, chase: 2.3, breaking: true, foolTime: true, gradeSd: [0.5, 0], gradeStep: 1.174 },
    FS: { bite: 0.6, surprise: 0.15, lift: -8, miss: 35.1, chase: 2.3, breaking: true, foolTime: true, gradeSd: [0.5, 0], gradeStep: 0.974 }
  };

  const SWING = {
    radius: 2.75,      // bat radius plus ball radius, inches: a bigger *where* error misses
    foulBack: 0.545,   // share of radius past which contact is a glancing foul (tipped back; step 1.5, was 0.52: about
                       // half of all bat contact is foul, as in MLB; Session 12, 0.45; Session 22, was 0.42: with the wider
                       // spray more fouls come from balls hit outside the lines, so fewer are tipped back; 0.445 in the spray
                       // fit, 0.463 in the level fit; Session 23, 0.465 in the spray refit, 0.495 for strikeouts 22.7% and 3.89 pitches per PA on the target table;
                       // Session 25, was 0.495: with timeFoul's fouls, for strikeouts and pitches per PA again), for a pitch at foulRef mph ...
    foulRef: 88,       // ... and it narrows as (foulRef / pitch speed)^foulPow (step 1.5 task 4: a faster pitch is fouled
    foulPow: 2.5,      // back more often; MLB 2024: 43% of swings at fastballs are fouls, 32% at off-speed pitches)
    foulSpeedShare: 0, // share of this pitch's own speed in that (Session 13; the rest is the type's typical speed, PIT.velo x
                       // its share): 0 keeps the fastball/off-speed split without tying a pitcher's velocity to his BABIP (with
                       // 1, from 50 to 20 Velocity his BABIP fell .290 to .258 and pop-ups rose 9.5 to 15.2%).
                       // Session 30 (M2 step 2.1a task 4, the owner's Velocity top-up, stopped under the owner's rule): 1 gave per mph
                       // of fastball K% +1.70 [MLB the same pitcher year to year +1.69] with whiffs +0.99 [across pitchers +0.93]
                       // (paired replays, 116,000 PA; with 0, +1.28 and +1.00) and BABIP stayed flat, but fouls rose 1.0 per swing per
                       // mph [MLB about +0.05 across 249 pitchers], and the generated starters' strikeouts spread past MLB's: K% as far
                       // above the median as MLB's top 5%, 9.4% of starters (0.5: 8.6%; 0: 7.5%) [5], the population's K% 13.2-32.5
                       // [15.6-31.7]. MLB's K per mph across pitchers is +0.99, and the population is across pitchers.
    missMs: 80,        // a *when* error past this many ms misses the ball
    timeRadius: 0.7,   // share of the bat's reach (radius) lost at missMs; scales with the square of the *when*
                       // error (step 1.3: so velocity and Timing move whiffs, not only exit speed)
    timeFoul: 1.5,     // share of the fair core (foulBack) lost at missMs, with the square of the *when* error: a mistimed swing that
                       // reaches the ball is fouled away more often (Session 25, owner's choice to fix Velocity's exit-speed miss; Claude's
                       // default for the mechanism). Per mph of fastball the engine's exit speed against fell 0.39 mph and hard-hit % 0.81
                       // points (MLB +0.05 / +0.15): a harder thrower's late swings were weak balls in play, through the bar's timing part
                       // (about 0.28 mph) and timeLoss (about 0.21). With this, TIMING.sdPow 3 and SWING.bar refitted: -0.05 / -0.09 on
                       // three seeds' average, whiff +0.93 [+0.93], K% +1.38 (was 1.36) [+1.69]
    // Location: pitches far from the middle are harder to square up (inches of extra spread per foot).
    edgeFrom: 0.8,     // feet inside the zone's edge from which location starts to matter (step 1.4: from near the
                       // middle, so a pitch down the middle is the easiest to hit; it was 0.4)
    edgeSd: 2.4,       // per foot from edgeFrom inside the edge outward
    chaseSd: 3.0,      // per foot outside the zone, on top of edgeSd
    veloSd: 4.2,       // the whole spread x (his fastball / PIT.velo)^veloSd (Session 13: Velocity brings whiffs, not weak
                       // contact; real per mph, the same pitcher year to year: whiff +1.65, K% +1.69, exit speed -0.16).
                       // Session 31 (owner's choice: MLB's year-to-year numbers; the size Claude's default), was 2.5: paired
                       // replays per mph K +1.79, whiffs +1.52 (were +1.33, +1.03); one knob moves both, K a little faster
    chaseGrade: true,  // an off-speed pitch's extra spread off the plate (TYPE.chase above 1) scales with its grade (Session 13)
    locLoss: 0,        // share of exit speed lost per foot from edgeFrom inside the edge outward (step 1.3; step 1.5,
                       // was 0.08; Session 23, was 0.04: the bar's location part, SWING.bar, carries it)
    chaseOff: 1.9,     // an off-center hit's loss (offLoss) grows by this share per foot outside the zone (Session 21, Claude's
                       // default: a chased pitch is mostly met weakly, a squared-up one still hard; Statcast 2024, 54,043 pitches:
                       // 82.5 / 78.8 / 74.3 mph at 0-0.2 / 0.2-0.4 / 0.4-0.7 ft off the zone, the engine's 86.3 / 85.8 / 82.6, now
                       // about 86 / 80 / 74)
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
    offLoss: 0.37,     // exit speed lost at the glancing edge (scales with the *where* error to offPow; step 1.5, was 0.42
                       // with a square; Session 22, was 0.45: with foulBack's wider fair core; Session 23, was 0.485: with SWING.bar)
    offPow: 2.5,       // the power: a near-center hit loses little, a mishit near the edge a lot (step 1.5)
    offUnder: 0.855,   // share of that loss when the bat passes under the ball (step 1.5: Statcast's fly balls come off
                       // harder than its ground balls)
    timeLoss: 0.245,   // exit speed lost at missMs (scales with the square of the *when* error; step 1.5, was 0.45)
    lateLoss: 0.47,    // a late swing loses this share more than an early one (step 1.5: the bat isn't up to speed yet;
                       // Statcast's opposite-field balls come off slower than pulled ones; Session 22, was 0.75: the engine's
                       // opposite-field fly balls came off 9.7 mph slower than its pulled ones, MLB's 6.6, now about 8)
    bar: {             // Along the bat (Session 23, owner's choice: a ball met off the wrong part of the bat, jammed or off the end,
                       // set by the pitch's side-to-side location and the swing's timing plus noise; it costs exit speed, keeps the
                       // launch angle; Timing makes it smaller and Deception larger). The error: inches from the barrel's sweet spot
                       // toward the handle (jammed, above 0) ...
      perFt: 11,       // ... per foot the pitch is inside (toward the batter; Session 25, was 9.1: with the larger noise, so pitches 0.7+ ft
                       // inside are still met under 80 mph about 45% of the time [53], as before)
      perMs: 0.18,     // ... per ms the swing is late (early: toward the end; Session 25, was 0.235: a harder thrower's later swings
                       // jammed him too much, so his exit speed against fell where MLB's doesn't)
      sd: 4.1,         // ... and its noise, inches (Session 25, was 2.3: it keeps the soft contact that the timing part and timeFoul's
                       // fouls took away; rated teams' exit speed 88.9 [89.2], grounders under 80 mph 10.8% of balls in play, was 11.4)
      loss: 0.11,      // share of exit speed lost 10 inches from the sweet spot (to the power pow), x jam when jammed
      pow: 1.8,
      jam: 1.35
      // Fitted (Session 23, two Nelder-Mead fits with offLoss, offUnder, timeLoss, locLoss, launchBase, BAT.launchSd and launchK)
      // on rated test teams against the 12 Wednesdays of 2024: balls in play by exit speed x launch angle (64 cells), their worth at
      // Statcast's expected BA and wOBA by exit speed x launch angle, squared-up efficiency (exit speed / (1.23 bat speed + 0.23
      // pitch speed)) and the share under 80 mph by the pitch's side-to-side location, the share at 0.8 or more, exit speed's
      // percentiles and by direction. Soft (under 85 mph) balls at 18-25 degrees 2.4% of balls in play [2.4], was 1.3; at 10-18
      // degrees 2.4 [2.4], was 1.6; pitches 0.7+ ft inside under 80 mph about 47% [53], was 29; xBA / xwOBA on contact .316 / .367
      // [.316 / .367], was .309 / .355 after the first fit
    },
    evSd: 2.5,         // exit-speed noise, mph (step 1.5, was 2.5: a swing's own bat speed carries most of the spread; Session 21: 2.5
                       // again, with chaseOff the exit speeds' 10th-90th percentiles 68 / 82 / 93 / 99 / 103.5 [69 / 80.5 / 91.5 / 99 / 104.5])
    attack: 15.8,      // launch angle of a dead-center hit at the middle of the zone, degrees (step 1.5, was 13.5; Session 12,
                       // 19.5: with one read per pitch fewer swings roll over an unread pitch; Session 22, was 17.5: the level fit
                       // (a Nelder-Mead with BAT.launchSd, foulBack, BAT.contactSd, offLoss and the two-strike takes, CPU.swing.take,
                       // on rated test teams against MLB 2024: launch angles by band and percentile, strikeouts and the share
                       // looking, whiffs, fouls, pitches per plate appearance, chase, with the spray kept). Launch angles are now
                       // compared by band, as the engine sorts its balls (12 Wednesdays of 2024, all balls in play: under 10
                       // degrees 44.6%, 10-25 22.3, 25-50 22.3, over 50 10.8; 10th / 50th / 90th percentiles -22 / 13 / 51): the
                       // engine's had 41.2 / 23.8 / 25.2 / 9.8, too few ground balls and too many fly balls, now 44.4 / 22.3 / 22.9 /
                       // 10.4
    launchBase: 0.75,  // share of the hitter's launch noise (BAT.launchSd) on a dead-center hit, growing to all of it at the glancing
                       // edge (Session 23, with SWING.bar: MLB 2024's best-squared balls leave at 10.4 degrees with a spread of 15.5,
                       // the engine's had 14.7 / 18.8, so its hardest balls flew too high and too low)
    launchCurve: 1.5, // per square inch: the *where* error's launch angle grows as off x (1 + launchCurve x off^2), so
                       // a ball hit far under the center pops up and one far over it is chopped (step 1.5)
    heightLA: 13.5,      // degrees of launch angle per foot the pitch is above the middle of the zone (2.55 ft; step 1.5,
                       // was 7)
    // Session 23 (Claude's default): the spray refitted (sprayTop, pullAt0, sprayLA, insidePull, sprayBase, BAT.sprayNoise; a
    // Nelder-Mead with foulBack, on the same 12 Wednesdays) with ground balls' recorded angles x 0.95 instead of 0.75 (the squeeze
    // was wrong: tools/replay.js) and with who fields MLB's grounders and air balls (Statcast's hit_location): the engine's
    // pull-side corner infielder fielded 17.9% of its grounders [26.8], now 22-23; hits per ball in play on 2024's ball .316
    // [.320], was .309; grounders' bins weighted 0.2 (Statcast's coordinates for grounders cluster where the fielders stand).
    // The spray (Session 22, step 1.5 task 6, Claude's defaults: a Nelder-Mead fit with foulBack and offLoss on 12 Wednesdays of
    // 2024, 9,374 balls in play and 54,043 pitches: the spray's bins by type, fouls and foul outs, exit speed's percentiles and by
    // direction; DESIGN.md section 10, "The spray"). The tilted bat carries most of it: a ball hit under the center rises and
    // drifts the other way, one hit over it is driven down and pulled.
    pullAt0: -17,      // spray of a perfectly timed swing, degrees toward the pull side (minus is pull; step 1.5, was -6;
                       // Session 12, -7.5: fewer swings are early on an unread pitch, and more pitches are fastballs; Session 22, -16)
    sprayPerMs: 1.05,  // degrees of spray per ms of *when* error (early pulls, late goes the other way; Session 22, was 1.0)
    insidePull: 19.4,  // degrees toward the pull side per foot the pitch is inside (Session 22, was 12: the measured slope,
                       // diluted by the noise, now near MLB's 11-12 for air balls)
    sprayBase: 0.78,   // share of the batter's spray noise on a dead-center hit, growing to all of it at the glancing edge
                       // (step 1.5: a squared-up ball goes where the bat points; a mishit squirts; Session 22, was 0.35: hard-hit
                       // balls went too often to the pull side, MLB's go everywhere)
    sprayLA: 2.25,     // degrees toward the opposite field per degree of launch angle he gets from hitting under the
                       // ball's center (step 1.5: a ball hit under slices the other way; Statcast 2024: 27% of fly balls
                       // are pulled and 57% of pop-ups go the other way, against 49% of ground balls pulled; Session 22, was 1.4)
    sprayTop: 0.41,    // degrees toward the pull side per degree of launch angle he loses hitting over the ball (Session 21 hook;
                       // Session 22, was 0)
    sprayCap: 34,      // degrees of lift (either way) past which sprayLA and sprayTop add no more (Session 21 hook; Session 22, was
                       // 99: a pop-up drifts the other way no further than a high fly ball, so fewer slice foul)
    sprayAng: 0,       // degrees toward the opposite field per degree of launch angle above sprayMid (toward the pull side below it,
    sprayMid: 15,      // within 30 degrees either way; Session 21 hook, at no effect: the Session 22 fit found 0.04)
    twoStrike: [0.75, 2], // with two strikes a hitter shortens up (step 1.4; Session 12, was 0.64: MLB 2024 whiffs 25.9% of
                       // swings before two strikes and 24.5% with two): [share of his *where* spread, mph of bat
                       // speed he gives up (step 1.5; it was 4% of exit speed)]
    shapeSd: [0.12, 0], // the shape's counterweight (step 1.4, owner's choice: value-neutral): share of the
                       // *where* spread taken off per unit of ground-ball shape (easier to square up), and
                       // added per unit of fly-ball shape (harder). Session 19, with the 8-degree shape: refitted (was
                       // [0.112, 0.09], which on Session 18's code cost +0.29 runs a team-game at +1 and saved 0.27 at -1); the
                       // value bends (a big tilt either way moves hitters off their best launch angle), so +-0.5 and +-1 are
                       // balanced within about +-0.1 runs. Session 24 (step 1.5 task 7): refitted again (was [0.137, 0.065]:
                       // after Session 23's flight, a fly-ball shape at -1 saved 0.24 runs; a larger fly-ball share saves
                       // more, as a harder-to-square ball is weak contact): over seeds 1-3, +0.5 / -0.5 / +1 / -1 cost
                       // +0.05 / +0.09 / -0.03 / -0.02 runs a team-game. Session 25 (with Velocity's fix, SWING.timeFoul): was
                       // [0.125, 0.015], -1 saved 0.13 over seeds 1-3; now +0.06 / +0.09 / -0.00 / -0.07
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
    sdPow: 3,          // the spread grows as (speed / refMph) to this power (step 1.4; was +60% per 10 mph, floored; Session 25, was 6:
                       // Velocity's whiffs come from SWING.veloSd, and a harder thrower's wider timing spread made weak contact, not whiffs)
    latePerMph: 6,     // ms late per mph well above the hitter's timingTop (Velocity attacks Timing; Session 13, was 8: with
                       // SWING.veloSd carrying Velocity's whiffs, less of it goes into late, weak contact)
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
    // Session 21 (step 1.5 task 6, Claude's default): drag, dragPow, lift and liftFull refitted on 4,296 real air balls (Statcast,
    // 12 Wednesdays of 2024, 10-70 degrees and 70+ mph, each one's own exit speed, launch angle and spray through this flight):
    // the gap to Statcast's distance falls from 30 to 23 ft rms, and the home runs (367 against MLB's 369) peak at 25-35 degrees
    // as MLB's do. Before, balls at 20-30 degrees fell 10-16 ft short and those at 35+ carried 20-60 ft too far (at 100-105 mph
    // and 35-40 degrees, 61% home runs against MLB's 26%), so high fly balls fell in and left the park too often.
    drag: 0.00158,     // air drag per foot for 2024's ball (step 1.5: 0.00165; before that 0.0018; Session 21: 0.00161; Session 23: refitted
                       // with the hook spin below, on the same air balls from 6 degrees: the distance gap by launch angle x direction
                       // 18.7 -> 5.4 ft, home runs 369 [369])
    live: 0.95,        // the league's ball: its drag is drag x live (owner's choice, Session 22: a livelier ball, near 2019's, so the
                       // league scores 4.6-4.7 runs with more home runs and SLG than the bands; 1 is the 2024 ball the flight was
                       // fitted on, which tools/replay.js uses for real balls). Rated teams at 1 / 0.981 / 0.969 / 0.95 / 0.932:
                       // runs 3.89 / 4.15 / 4.35 / 4.67 / 5.00, AVG .234 / .239 / .242 / .248 / .254, home runs 1.14 / 1.29 / 1.43 /
                       // 1.62 / 1.81 a team-game
    dragRef: 140,      // ft/s (95 mph) at which the first flight's drag is `drag` ...
    dragPow: 0.77,     // ... and it grows as (dragRef / speed) to this power below it, falls above it (step 1.5: 0.3): the drag
                       // crisis, so a high fly ball slows and dies near its peak
    lift: 0.00123,     // backspin lift per foot on balls hit in the air (step 1.5: 0.00065, before that 0.0009; Session 21: 0.00117)
    sliceLift: 0.016,  // share of that lift lost per degree a ball goes toward the opposite field (step 1.5: it leaves with
                       // slice spin; Statcast 2024 fly balls carry 338 ft pulled, 326 to center, 285 the other way)
    hookLift: 0.025,   // Session 23 (hook spin, Claude's default): share of full lift taken off per degree a low ball goes toward the pull
    hookFrom: 13,      // side past hookFrom degrees short of straightaway, ...
    hookTo: 27,        // ... fading to none at hookTo degrees of launch angle (it may push the ball down: topspin). Real pulled line
                       // drives come off a topped swing and dive: on Statcast 2024's air balls at 10-14 degrees pulled 30+, 183 ft [the
                       // engine's had 234], at 18-22 degrees 9 home runs [27]; now 176 ft and 12
    liftFull: 29,      // degrees of launch angle at which backspin (and lift) is full; less below it (Session 21: was 35)
    dt: 0.02,          // integration step in the air, seconds
    sample: 0.1,       // the ball's path is kept every this many seconds (fielding and the play script)
    startHeight: 3,    // feet: the ball's height at contact
    bounceUp: 0.42,    // share of the downward speed kept on a bounce
    bounceOn: 0.72,    // share of the forward speed kept on a bounce (step 1.5, was 0.78: hard grounders reach fielders
                       // as often as Statcast's do)
    bounceFric: 1.07,  // friction on a bounce (Session 21, Claude's default): the forward speed lost is bounceFric x (1 + bounceUp) x
                       // the downward speed, at most down to bounceOn (the rolling limit), so a skimming grounder keeps its speed
                       // and a steep chop doesn't. Before, every bounce took bounceOn's share: real grounders at -10 to 0 degrees
                       // and 90-100 mph are hits 30-33% of the time (Statcast 2024), the engine's 6-9% on the same balls.
                       // Fitted with reach, glove and catchAt below on 9,374 real balls in play (12 Wednesdays of 2024, each
                       // through this engine's flight and fielding with average fielders, ground balls' directions x 0.75 as
                       // Savant's own pull shares say; tools/replay.js): hits .318 of them [.317], total bases .499 [.507], the
                       // error by exit speed and launch angle about half what it was
    rolling: 4,        // ft/s of bounce below which the ball rolls (slowing at a steady rate)
    rollDecel: 9,      // ft/s per second a rolling ball slows (grass)
    wallBack: 0.2,     // share of speed a ball keeps bouncing off the wall
    maxTime: 12,       // seconds: a guard
    reach: 8.3,        // feet: a fielder can catch a ball this high (with a reach or jump; Session 21: was 8)
    glove: 4.4,        // feet: a fielder gets a ball this far from where he stands (arm, glove, lean; Session 21: was 4)
    diveReach: 4,      // feet a dive (a diving stop or catch) reaches past the glove
    wallReach: 10.5,   // feet: a leap at the wall
    fieldHeight: 3.5,  // feet: a bouncing ball this low can be fielded
    catchSd: 0.09,     // seconds: how sharply a catch's chance falls off with the margin
    catchAt: 0.045,    // seconds of margin for an even chance at a running or diving catch (Session 21: was 0.05)
    diveLoss: 0.6,     // seconds a diving stop adds before the throw
    getUp: 1.0,        // seconds a fielder loses chasing a ball he dove for and missed
    gather: 0.25,      // seconds to pick up a ball in the outfield
    accel: 20,         // ft/s per second: how fast runners and fielders reach top speed
    fieldSpeed: 0.35,  // share of a fielder's sprint-speed edge over the placeholder Speed that he runs to a ball with (Session 20,
                       // Claude's default: Statcast's sprint speed is a top speed on the bases, and a catch is a short burst where
                       // the jump and the route count more). Savant 2024-2025 OAA against sprint speed: center fielders +3.0 outs
                       // a ft/s (r 0.42, 122 seasons), corner outfielders +0.9-1.0; with the full edge the engine's center fielder
                       // gained 9-13 a ft/s, now 2.6-4.6 (left field 0.6-1.2)
    throwShort: 0.9,   // average speed of a throw as a share of release speed, up to 100 ft
    throwLong: 0.68,   // ... at throwFar and more (an arc, a bounce or a relay); in between it slides
    throwFar: 300,     // feet where a throw reaches throwLong's share
    tag: 0.12,         // seconds to apply a tag (a force needs none)
    playSd: 0.07,      // seconds: how sharply a close play's chance falls off
    turn: 0.12,        // seconds a runner loses rounding a base
    batterBox: 0.525,  // seconds out of the box after the swing, for a right-handed batter at RUN.speed (Session 20: was 0.3,
                       // which made home to first 4.31 s at the median Speed; Savant 2024-2025, 1,009 player-seasons: 4.45 s at
                       // 27.5 ft/s, both sides together, about 40% of them from the left)
    boxPer: 0.0345,    // seconds he gains out of the box per ft/s of Speed above RUN.speed (Session 20, Claude's default: fast
                       // runners also burst out quicker; with it home to first falls 0.128 s per ft/s, as Savant's, r -0.88;
                       // acceleration alone gives 0.094)
    lefty: 0.08,       // seconds a left-handed batter saves to first
    pivot: 0.45,       // seconds for the pivot man to catch and throw on a double play
    onRun: 0.02,       // seconds an infielder adds to his catch-to-throw per foot he ran to a ground ball (Session 20, Claude's
                       // default: he sets his feet before he throws), fitted with the catch-to-throw in POS so infield hits
                       // (FanGraphs 2024-2025: 0.71-0.72 a team-game, bunt hits included) and grounded-into double plays
                       // (0.64-0.67) come out as MLB's
    onRunFree: 8,      // ... past this many feet (a ball hit near him is fielded set)
    adapt: 0.7,        // share of a batter's time to first above or below the average batter's that the infield makes up on
                       // plays at first (Session 20, Claude's default): it plays in and hurries against fast runners, and takes
                       // its time against slow ones. Fitted to MLB's infield hits by sprint speed (FanGraphs and Savant
                       // 2024-2025, 633 player-seasons with 250+ PA, bunts left out: 2.1% of balls in play under 26 ft/s, 2.5%
                       // at 27-28, 3.6% at 29+, +0.34 points a ft/s; without it the engine's rose 1.2 points a ft/s)
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
    sd: 0.12,          // seconds of noise on a steal play
    adapt: 0.8         // share of a runner's Speed edge (his time to the next base against a runner at the placeholder Speed)
                       // the battery makes up (Session 20, Claude's default): it holds fast runners and slide-steps, and pays slow
                       // ones less mind. MLB's steal success hardly moves with speed (FanGraphs and Savant 2024-2025: 75% under
                       // 25.5 ft/s, 75-79% from 25.5 to 29.5, 82% past 29.5); without it the engine's went 30% / 75% / 91%
  };

  // The CPU's choices (B3.manager.cpu, M1 step 1.3 task 10). Claude's defaults, tuned in step 1.4.
  const CPU = {
    // Steals (step 1.4): before each pitch the CPU judges the runner's chance (B3.ball.stealOdds: his jump
    // and Speed against the delivery and the catcher's release and Arm). Below `min` he stays; from there
    // to `full` his chance of going on this pitch rises to `rate`. Steals of third need more. He judges
    // his chance with an error of `judge` x his Baserunning's judge seconds on the margin.
    // green (Session 20): his chance of going on a pitch x e^(green x his ft/s over the placeholder Speed): fast runners get the
    // green light more often (MLB's attempts rise steeply with sprint speed while their success stays about flat).
    // Fitted: a lineup at Speed 40 / 80 tries 0.23 / 2.47 times as many steals as an average one [MLB, per time on first: 0.21 /
    // 2.3; attempts 2.0% of times on first under 25.5 ft/s, 12.8% at 27.5-28.5, 26.3% past 29.5].
    // Session 28: rate x 0.93 (was 0.09 / 0.05): the generated league's Speed leans by position sent more runners (1.04 attempts
    // a team-game [0.8-1]).
    steal: { min: [0.68, 0.78], full: [0.85, 0.92], rate: [0.084, 0.047], twoOut: 0.6, judge: 0.8, green: 0.42 },
    // Tag-ups (step 1.4): the lead runner goes when he judges his chance (B3.ball.tagupOdds, plus his own
    // Baserunning error) is at least this, from second or from third.
    tagup: { need: { 2: 0.8, 3: 0.6 } },
    swing: {
      // A CPU hitter swings when the pitch looks to cross inside this line: feet from the edge of the zone
      // (below 0 inside), by balls (rows 0-3) and strikes (columns 0-2). He takes the corners early in the
      // count and protects the plate with two strikes; on 3-0 he waits for one down the middle.
      // Session 12: two strikes 0.09 ft tighter (MLB 2024 swings at 59.9% of two-strike pitches).
      // Session 15: before two strikes 0.05 ft looser, with more blind takes (below): MLB 2024's swing curve by feet from
      // the zone (tools/ratingstats.js, the population check's swing curves by thirds of hitters).
      // Session 18: two strikes 0.04 ft looser (was 0.15 / 0.15 / 0.13 / 0.1), with twoSd and the two-strike takes (below).
      line: [[-0.07, 0.01, 0.19], [-0.07, 0.04, 0.19], [-0.08, -0.02, 0.17], [-0.3, -0.05, 0.14]],
      agg: [0.05, 0.04, 0.015], // feet the line moves out per step of Aggressiveness, by strikes, for an average
                           // lean (judgeLean); in proportion to his own lean (Session 15: x 0.5, so the tendency stays about
                           // value-neutral with the fitted takes: each chase costs more than a first-pitch take)
      // Chance he takes all the way, whatever the pitch looks like, by balls and strikes.
      // Session 15: fitted count by count to MLB 2024's swings at pitches 0.4 ft or more inside the zone (0-0 52.0%, 0-1 84.6,
      // 1-0 71.2, 1-1 85.5, 2-0 66.0, 2-1 89.5, 3-0 17.7, 3-1 83.9; 109,184 Statcast pitches): real hitters take mostly the first
      // pitch and 3-0 (was [[0.24, 0.096, 0], [0.144, 0.08, 0], [0.24, 0.096, 0], [0.9, 0.12, 0]]).
      // Session 18: with two strikes 0.02 (was 0): frozen by a pitch he wasn't looking for (MLB 2024 takes 4.9% of two-strike
      // pitches 0.4 ft or more inside the zone; the engine took 2.8%, all from Discipline's noise).
      // Session 22: with two strikes 0.009 (was 0.02; the level fit, SWING.attack): strikeouts looking 25.6% of strikeouts on rated
      // teams, now 23.6 [MLB 2024 23.7].
      take: [[0.44, 0.1, 0.009], [0.22, 0.1, 0.009], [0.25, 0.03, 0.009], [0.8, 0.1, 0.009]],
      aggTake: 0.45,       // share of those takes an Aggressive hitter skips (a Patient one adds): he judges
                           // more pitches himself, which pays off with good Discipline (owner's choice). Session 15:
                           // was 0.6 (Aggressive moved zone swing 2x as much as chase; MLB's overall swing moves both alike)
      // With two strikes he commits sooner to protect the plate, so he judges where the pitch will cross more roughly: feet of
      // noise added (in quadrature) to his Discipline's judgeSd, the same for everyone (Session 18: MLB 2024's two-strike swing
      // curve is flatter than its curve before two strikes; the engine's had the same steepness, so it swung 2-3 points too
      // often in the zone and chased 3-5 points too little).
      twoSd: 0.15,
      lookShare: 1,        // share of the movement he doesn't read that misleads where he thinks it crosses
      lookCloser: true     // a misread draws his eye toward the zone, never away from it, on each axis (step 1.5 task 4)
    },
    pitch: {
      // How often each type is thrown when the pitcher has it, before grades and the count.
      // Session 12: so the test staffs throw MLB 2024's mix (fastballs 56%: FF 35.6, SI 16.6, FC 8.0; SL 21.2, CU 6.3,
      // CH 9.0, FS 3.2; Savant's pitch-arsenal leaderboard, sweepers and slurves with sliders).
      use: { FF: 2.5, SI: 1.45, FC: 2.5, SL: 1.6, CU: 0.65, CH: 0.75, FS: 2.5 },
      gradeUse: 0.3,       // better pitches get thrown more: weight x e^(gradeUse x u), u = tens of grade points
      behind: 1.8,         // fastballs (FF, SI, FC) x this when 2 balls ahead of the strikes (2-0, 3-0, 3-1)
      putAway: 1.6,        // the put-away pitch x this with two strikes (Session 12, was 2.5: MLB 2024 throws 40.9% off-speed
                           // pitches before two strikes and 50.7% with two)
      // Chance the target is in the zone, by balls (rows) and strikes (columns), for a Balanced pitcher.
      // Session 16: fitted so average pitchers' zone % by count is MLB's (2024-2025 Statcast, every pitch: 0-0 54.4, 0-1 45.5,
      // 0-2 32.4, 1-0 55.7, 1-1 50.5, 1-2 38.2, 2-0 59.5, 2-1 56.8, 2-2 47.1, 3-0 63.2, 3-1 62.2, 3-2 58.9; the engine had the
      // first pitch 50.3 and 3-0 72.0). Was [[0.53, 0.42, 0.21], [0.62, 0.52, 0.32], [0.73, 0.67, 0.47], [0.82, 0.8, 0.72]].
      // Session 18: two strikes +0.047 / +0.038 / +0.02 / +0.015 (was 0.219 / 0.317 / 0.484 / 0.673), so zone % by count stays
      // MLB's with the buried put-aways (bury, below: they no longer stray into the zone as nearer targets did).
      // Session 28: every count -0.012 (the level fit on the generated league: its pitchers' zone % was 50.4 [MLB 49.4] and its
      // walks 7.8% [8-9]).
      zone: [[0.588, 0.425, 0.254], [0.622, 0.517, 0.343], [0.668, 0.649, 0.492], [0.718, 0.678, 0.676]],
      // Targets in the zone added by Aim, by balls and strikes, per step (Attacker +1, Nibbler -1; none with three balls).
      // Session 16 (was one number per style, all 0): fitted so Attacker and Nibbler sit as far from Balanced, count by count, as
      // MLB's top and bottom thirds of pitchers by the zone % their walks don't explain (2024-2025, 566 pitcher-seasons with 250+
      // batters faced: half the gap 2.5 / 4.45 / 4.85 at 0-0 / 0-1 / 0-2, 2.4 / 3.8 / 4.85 at 1-0 / 1-1 / 1-2, 0.95 / 2.75 / 3.8
      // at 2-0 / 2-1 / 2-2, none with three balls). With the insets (below) that is about the 15th and 85th percentiles of zone %.
      aimZone: [[0.025, 0.065, 0.083], [0.025, 0.056, 0.086], [-0.01, 0.02, 0.051], [0, 0, 0]],
      // aimZone x this for Nibbler, Balanced, Attacker (Session 16): with the table as fitted, a nibbler gave back part of his gap by
      // falling behind more often (his extra balls are chased less than MLB's nibblers'), so x1.5 makes the gaps in zone % alike
      // both ways, as MLB's thirds are (47.4 / 50.4 / 53.3): Nibbler 46.9, Balanced 49.9, Attacker 52.9 for average pitchers, near the
      // 15th and 85th percentiles (46.1, 52.7). The cost: ahead in the count his gap is about 1.5x MLB's low third's.
      aimSide: [1.5, 0, 1],
      // Targets in the zone added by pitch type (step 1.5 task 4: MLB 2024 zone % 55.0 for fastballs, 42.5 for off-speed).
      zoneType: { FF: 0.08, SI: 0.08, FC: 0.08, SL: -0.135, CU: -0.135, CH: -0.135, FS: -0.135 },
      // Targets in the zone: feet inside the nearest side and top or bottom, by Aim (Nibbler, Balanced,
      // Attacker). A nibbler works the corners; an attacker comes in toward the middle.
      // Session 14: +0.04 (MLB's attack zones). Session 16: the styles half as far from Balanced (was [0.28, 0.76] and
      // [0.4, 0.92]): MLB's nibblers don't work the edges more (edge % 43.1 / 43.3 / 43.1 by thirds of the zone % their walks
      // don't explain); they throw strikes less often (aimZone) and a little less over the middle (meatball % 6.9 / 7.7 / 8.5).
      inset: [[0.31, 0.8], [0.34, 0.84], [0.37, 0.88]],
      groove: 0.04,        // feet of extra inset (toward the middle) on targets in the zone with three balls
      chase: [0.06, 0.55], // targets outside the zone: feet off the edge (Session 14: was 0.03-0.5; MLB's attack zones)
      // With two strikes, the chance (by balls) that a target outside the zone is a put-away buried well off the plate, buryOff
      // feet off the edge (any pitcher alike). Session 18: MLB 2024's share of out-of-zone pitches 1 ft or more off grows with
      // strikes, 0-2 21.6%, 1-2 19.0, 2-2 13.5, 3-2 10.1 (8 Wednesdays, 35,393 Statcast pitches); the engine's was about 7-10% in
      // every count, so it threw too many two-strike pitches near the edges (too many called strikes, too few chased whiffs).
      bury: [0.15, 0.12, 0.065, 0.05],
      buryOff: [1.1, 1.7],
      commandAim: [0.5, 0.4, 1.5], // targets in the zone (insets) x (his scatter / the average's) to this
                           // power, between these limits: sharper command aims nearer the edges (step 1.4)
      commandOff: [0.5, 0.4, 1], // the same for targets off the plate (feet off the edge), but a wild pitcher doesn't aim
                           // farther off than an average one (Session 14)
      low: { FF: 0.4, SI: 0.75, FC: 0.55, SL: 0.7, CU: 0.8, CH: 0.8, FS: 0.85 } // share of targets kept low, by type
    },
    pull: {
      // The starter's hook (Session 17, the owner's Session 16 choice: MLB-like; replaces Session 16's rules, out at 11 pitches
      // past his Stamina, at his Stamina from the 7th inning, or for 5 runs). Before each batter he comes out with chance
      // 1 / (1 + e^-z), x his pitches over his Stamina's (B3.manager.load): before an inning z = (x - at) / width; in the
      // middle of one z = (x - midAt) / midWidth + trouble x (runs this inning + onBase x runners on); + fourth when the batter
      // due up would face him a fourth time. Claude's defaults, fitted with tools/starters.js to MLB 2024's exits (DESIGN.md
      // section 10).
      hook: { at: 1, width: 0.05, midAt: 1.25, midWidth: 0.04, trouble: 2.4, onBase: 0.3, fourth: 3 },
      reliever: 1,         // a reliever comes out at this share of his Stamina's pitches
      relieverRuns: 3,
      oneInning: ['CL', 'SU'], // roles that pitch one inning: out when a new inning starts after 3 outs
      middleOuts: 6,       // a middle reliever goes at most this many outs,
      middleRest: 12       // and doesn't start another inning (after 3 outs) within this many pitches of his Stamina's
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
