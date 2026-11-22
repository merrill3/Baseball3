// Pitches, the swing's two errors and contact. Logic file: no DOM.
//
//   B3.pitch.throw(g, { type, x, z })  the pitch as thrown: speed, movement and where it crosses the plate
//                                      (Command's scatter around the target; all three wear down with his fade)
//   B3.pitch.fade(p, live)             a pitcher's fade this game, in rating points (B3.tune.PITCH.fade)
//   B3.pitch.call(g, pitch)            a taken pitch: 'C' called strike or 'B' ball (Framing at the edges)
//   B3.pitch.resolve(g, pitch, swing)  { r, ... }: B or C on a take; on a swing S (whiff), F (foul) or
//                                      X (in play, with contact { ev, la, sp, slice }), and the swing's bat speed (bat)
//   B3.pitch.cpuTiming(g, pitch)       a CPU hitter's *when* error in ms (Timing, Velocity, Recognition)
//   B3.pitch.expect(g, pitch)          the *where* error's mean and spread, in inches (for tests and tools)
//   B3.pitch.look(g, pitch)            where a CPU hitter thinks it will cross, for swing or take
//                                      (Recognition, Deception, Discipline)
//
// The swing has two errors (DESIGN.md section 10):
//   *when*  ms from perfect timing (below 0 early, above 0 late), the same number the game view will
//           measure from the tap. It sets the spray direction (early pulls) and costs exit speed; past
//           missMs the bat misses.
//   *where* inches between the bat's center and the ball's center at contact (above 0 the bat is over the
//           ball). Its spread comes from Contact, the pitch type's bite and how far from the middle the
//           pitch is; its mean from movement the hitter doesn't read (Recognition against Deception and
//           the pitch's grade). Past the bat's radius it is a whiff, near it a foul; otherwise it sets the
//           launch angle (over the ball is a ground ball) and costs exit speed.
// Your own batting is timing only: the UI gives the *when*, and your hitter's ratings roll the *where*.
//
// Deeper in games (Session 17, the owner's Session 16 choices; sizes Claude's defaults, PITCH.fade and PITCH.familiar):
//   the fade      from the first pitch a pitcher slowly loses ground, at a pace set by his Stamina and steeper past it: he
//                 plays as if his Velocity, Command and every pitch grade were a few points lower (the same for every role)
//   familiarity   each time a hitter has already faced this pitcher in the game, he reads and times him a little better: he
//                 plays as if his Recognition and Timing were a few points higher (the same for every pitcher)
//
// Coordinates: x in feet from the middle of the plate, seen from the catcher (plus is the first-base
// side), z feet above the ground. Spray in degrees from straightaway center, plus toward right field.
// Every function reads the game but changes nothing except drawing from g.rng.
(function (root) {
  'use strict';
  const B3 = root.B3 = root.B3 || {};

  const MPH = 5280 / 3600; // feet per second in one mph

  function T() { return B3.tune; }
  function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }

  // The players on this pitch: inputs for the batter, pitcher and catcher, the batter's side, and how many times this
  // batter has already faced this pitcher in the game (seen).
  function who(g) {
    const bat = g.teams[g.half], fld = g.teams[1 - g.half];
    const id = bat.lineup[bat.spot], live = fld.live[fld.pitcher];
    const b = bat.inp[id], p = fld.inp[fld.pitcher], c = fld.inp[fld.byPos.C];
    const throws = p.throws;
    const bats = b.bats === 'S' ? (throws === 'L' ? 'R' : 'L') : b.bats;
    const seen = live && live.seen && live.seen[id] ? live.seen[id] : 0;
    return { b: b, p: p, c: c, bats: bats, throws: throws, live: live, seen: seen };
  }

  // His fade this game, in rating points (Session 17): with x his pitches over his Stamina's (B3.ratings.stamina),
  // fade.points x x^fade.power, plus fade.past x (x - 1)^2 past his Stamina, at most fade.max (Session 20). One curve for
  // every role.
  function fade(p, live) {
    const F = T().PITCH.fade, x = (live ? live.pitches : 0) / p.pit.stamina;
    return Math.min(F.max, F.points * Math.pow(x, F.power) + (x > 1 ? F.past * (x - 1) * (x - 1) : 0));
  }

  // Familiarity (Session 17): his read and timing against a pitcher he has already faced `seen` times this game, as
  // multipliers on the share of pitches he doesn't pick up, his *when* spread and the exit speed he loses to a mishit.
  function familiar(w) {
    const F = T().PITCH.familiar, pts = F.points * (w.seen || 0);
    return { unread: Math.pow(F.unread, pts), timingSd: Math.pow(F.timingSd, pts), square: Math.pow(F.square, pts) };
  }

  // Flight time in ms from release to the ideal contact point, for a release speed in mph.
  function flightMs(speed) {
    const P = T().PITCH;
    return 1000 * (P.releaseFt - P.contactFt) / (speed * P.avgSpeedShare * MPH);
  }

  // The fastball this pitcher throws now, mph (what a hitter times by default), for his fade in points.
  function fastball(p, d) { return p.pit.velo - T().PITCH.fade.velo * (d || 0); }

  function throwPitch(g, a) {
    const r = g.rng, P = T().PITCH, w = who(g);
    const type = B3.data.PITCH[a.type];
    // His fade wears down all three (the owner's choice, Session 16): speed, Command's scatter and the pitch's grade.
    const d = fade(w.p, w.live);
    const sd = w.p.pit.commandSd * Math.exp(P.fade.command * d);
    const x = a.x + r.normal(0, sd), z = a.z + r.normal(0, sd);
    const speed = Math.round((fastball(w.p, d) * type.v + r.normal(0, P.speedSd)) * 10) / 10;
    const rated = w.p.pit.grades[a.type] === undefined ? 1 : w.p.pit.grades[a.type];
    const grade = Math.max(T().RATE.grade.min, rated - P.fade.grade * d);
    const mirror = w.throws === 'L' ? -1 : 1;
    // Does the hitter pick this pitch up? (step 1.5 task 4: one read per pitch, his read share being the chance.) The same
    // read sets his swing choice (look), his timing (cpuTiming) and where his bat goes (expect), so a breaking ball he chases
    // because he took it for a fastball is the one he misses.
    const read = r.chance(readChance(w, grade));
    return {
      type: a.type, speed: speed, x: x, z: z, zone: B3.data.inZone(x, z),
      ms: Math.round(flightMs(speed)),
      hx: mirror * type.hx * grade, vz: type.vz * grade, // movement as thrown, inches
      grade: grade, shape: w.p.pit.shapes[a.type] || 0, throws: w.throws, fade: d, read: read
    };
  }

  // The umpire's call on a taken pitch. Borderline pitches go either way; Framing moves the edge.
  function call(g, pitch) {
    const P = T().PITCH, w = who(g);
    const frame = clamp(w.c.fld.framing, -P.framingCap, P.framingCap);
    const d = B3.data.zoneEdge(pitch.x, pitch.z) - frame;
    const pStrike = 1 / (1 + Math.exp(d / P.callWidth));
    return g.rng.chance(pStrike) ? 'C' : 'B';
  }

  // The hitter's read of this pitch: recognition against the pitcher's deception, plus the platoon edge and familiarity.
  function readOf(w) {
    const L = T().PLATOON;
    const opp = w.bats !== w.throws ? 1 : -1;
    return {
      // Deception multiplies the share he doesn't read (step 1.4: the mirror of Recognition, which shrinks it), and so does
      // having faced him already this game (Session 17: familiarity, a few points of Recognition a time).
      rec: clamp(1 - (1 - w.b.bat.recognition) * w.p.pit.deception * familiar(w).unread + L.recognition * opp, 0, 0.98),
      contactSd: w.b.bat.contactSd * (1 - L.contactSd * opp)
    };
  }

  // The chance he picks up a pitch of this grade (the movement multiplier, 1 average). A better pitch is harder to pick up
  // (Session 13, step 1.5 task 4): the share he doesn't read grows by PITCH.gradeHide of itself per 1 of grade (a straight
  // line, so a population of mixed grades averages out about as an average grade does).
  function readChance(w, grade) {
    const g = grade === undefined ? 1 : grade;
    return clamp(1 - (1 - readOf(w).rec) * Math.max(0, 1 + T().PITCH.gradeHide * (g - 1)), 0, 0.98);
  }

  // How far an unread pitch of this grade fools him, against an average one: 1 + PITCH.gradeSurprise x (grade - 1), at
  // least 0 (Session 13: a straight line through average; step 1.4 had it in step with the grade below average, a flat
  // slider hanging, and no more than average above it). It scales both errors an unread pitch brings: where the bat goes
  // (expect), the timing of a change-up or splitter (cpuTiming, TYPE.foolTime), and how much harder it is to hit off the plate (chaseGrade).
  function fool(grade) {
    const g = grade === undefined ? 1 : grade;
    return Math.max(0, 1 + T().PITCH.gradeSurprise * (g - 1));
  }

  // How much of this pitch he misses reading: 1 if he didn't pick it up (he takes it for a fastball), 0 if he did. A pitch
  // without a read (a test's hand-made pitch) counts as his average: the share he doesn't read.
  function unread(w, pitch) {
    return pitch.read === undefined ? 1 - readChance(w, pitch.grade) : pitch.read ? 0 : 1;
  }

  // The *where* error's mean and spread for this pitch, in inches (above 0: the bat passes over the ball).
  function expect(g, pitch) {
    const w = who(g), S = T().SWING, kind = T().TYPE[pitch.type];
    const read = readOf(w);
    // A pitch he doesn't read he expects to move like a fastball. The pitch's real movement against that is the
    // surprise; only its vertical part moves the bat's height.
    // The surprise is the type's own movement (step 1.4: not the grade's extra, which would only move the
    // launch angle; the grade acts through the bite below and through how the pitch looks, B3.pitch.look).
    const type = B3.data.PITCH[pitch.type], ff = B3.data.PITCH.FF;
    const surprise = unread(w, pitch) * (ff.vz - type.vz); // above 0: the ball ends lower than he thought, so the bat is over it
    const mean = kind.surprise * surprise * fool(pitch.grade);
    // Spread: Contact, the type's bite (grade makes it bigger), and distance from the middle of the zone.
    const edge = B3.data.zoneEdge(pitch.x, pitch.z);
    // Off the plate an off-speed pitch keeps breaking away from the bat (TYPE.chase); from Session 13 the grade scales
    // that extra (fool: a better pitch breaks away more, a flat one hangs) when S.chaseGrade is on.
    const ch = kind.chase === undefined ? 1 : kind.chase;
    const chase = S.chaseGrade && ch > 1 ? 1 + (ch - 1) * fool(pitch.grade) : ch;
    const loc = S.edgeSd * Math.max(0, edge + S.edgeFrom) + S.chaseSd * chase * Math.max(0, edge);
    const bite = kind.bite * pitch.grade * (kind.breaking ? w.b.bat.breakRead : 1); // Recognition tracks the break (Session 12)
    // The shape's counterweight (step 1.4, owner's choice: a value-neutral tilt): a ground-ball shape is
    // easier to square up, a fly-ball shape harder (SWING.shapeSd per unit of shape).
    const s = (pitch.shape || 0) / T().RATE.shape;
    const tilt = 1 - (s > 0 ? S.shapeSd[0] : S.shapeSd[1]) * s;
    // A faster bat costs accuracy (step 1.5, owner's choice, Session 10): the whole spread grows by speedCost per mph
    // of his average bat speed above an average hitter's (BAT.batSpeed), so Raw Power brings swing and miss, as in MLB.
    const cost = Math.exp(S.speedCost * (w.b.bat.batSpeed - T().BAT.batSpeed));
    // Contact also scales the location and movement parts (step 1.5 task 4: bat control; contactAll is the power on
    // his spread against an average hitter's, 0 for his own part only), so the best contact hitters reach real zone contact.
    const m = Math.pow(w.b.bat.contactSd / T().BAT.contactSd, S.contactAll); // his own Contact, not the platoon edge
    // Swing path (Session 11, owner's choice): a Lift swing crosses the zone more steeply and misses a little more.
    const sp = w.b.bat.swingPath || 0;
    const path = 1 + (sp < 0 ? S.pathSd[0] : S.pathSd[1]) * sp;
    // A harder thrower's pitches are harder to put the bat on (Session 13: Velocity brings whiffs, not weak contact): the whole
    // spread grows as (his fastball today / an average fastball, PIT.velo)^SWING.veloSd, his off-speed pitches too.
    const velo = Math.pow(fastball(w.p, pitch.fade) / T().PIT.velo, S.veloSd);
    // A better four-seamer or sinker is harder to put the bat on (Session 19: its ride or sink beats the bat, so MLB's four-seam
    // whiffs spread far more than velocity explains): the whole spread x its grade^TYPE.gradeSd; a flat one is easier.
    // [below average, above average]: an elite fastball stands out more than a flat one falls behind (MLB's four-seam whiffs
    // spread further above the median than below it).
    const gr = pitch.grade === undefined ? 1 : pitch.grade;
    const life = kind.gradeSd ? Math.pow(gr, kind.gradeSd[gr < 1 ? 0 : 1]) : 1;
    const sd = velo * life * cost * tilt * path * Math.sqrt(read.contactSd * read.contactSd + m * m * (bite * bite + loc * loc));
    return { mean: mean, sd: sd, rec: read.rec, bats: w.bats };
  }

  function resolve(g, pitch, swing) {
    if (!swing.swing) return { r: call(g, pitch) };
    const r = g.rng, S = T().SWING, w = who(g);
    const tm = swing.timing;
    const e = expect(g, pitch);
    // With two strikes he shortens up (step 1.4): a smaller *where* error, less exit speed.
    const two = g.strikes >= 2;
    // This swing's bat speed (step 1.5, Savant's units): his average, varying swing to swing, slower with two strikes.
    // A swing harder than his usual is a little less accurate (step 1.5: effort), a softer one a little more.
    const z = Math.min(S.batCap, r.normal(0, 1)); // he can't swing faster than his ceiling
    const bat = w.b.bat.batSpeed + S.batSd * z - (two ? S.twoStrike[1] : 0);
    const off = r.normal(e.mean, e.sd * (two ? S.twoStrike[0] : 1) * Math.max(0.5, 1 + S.effort * z));
    const out = { r: 'S', off: Math.round(off * 100) / 100, bat: Math.round(bat * 10) / 10 };
    // A mistimed swing meets the ball with less of the bat in its path (the arc is off), so it misses more.
    const v = tm / S.missMs;
    const radius = S.radius * Math.max(0, 1 - S.timeRadius * v * v);
    if (Math.abs(tm) > S.missMs || Math.abs(off) > radius) return out; // whiff
    // Glancing contact is fouled back. The faster the pitch, the more of it goes back (step 1.5 task 4: on a glancing hit the
    // ball keeps much of its own speed toward the catcher), so the fair core narrows as (foulRef / speed)^foulPow.
    // Session 13: the speed is the type's typical one (its share of an average fastball, PIT.velo), blended with this pitch's
    // by S.foulSpeedShare (0: the type's only): MLB's fastball/off-speed foul split stays, but a pitcher's own velocity no
    // longer moves his BABIP (with this pitch's speed a slow thrower's glancing hits stayed fair as pop-ups and topped balls).
    const typical = T().PIT.velo * B3.data.PITCH[pitch.type].v;
    const fair = radius * S.foulBack * Math.pow(S.foulRef / (typical + S.foulSpeedShare * (pitch.speed - typical)), S.foulPow);
    if (Math.abs(off) > fair) { out.r = 'F'; return out; }
    // Exit speed: bat speed and pitch speed (Savant's most a swing can give), less for an off-center hit and for bad timing.
    const u = off / fair;
    // A faster bat also meets the ball a little off the barrel's sweet spot more often (step 1.5, owner's choice, Session 10:
    // a faster bat costs accuracy along the bat too): barrelCost of the exit speed per mph of his average bat speed.
    const along = Math.exp(-S.barrelCost * (w.b.bat.batSpeed - T().BAT.batSpeed));
    const top = along * (S.collision * pitch.speed * S.plateShare + (1 + S.collision) * bat);
    // A pitch away from the middle is hit off the end of the bat or jammed: less exit speed (step 1.3).
    const away = Math.max(0, B3.data.zoneEdge(pitch.x, pitch.z) + S.edgeFrom);
    // Off center (step 1.5): the loss grows with the *where* error to offPow, a little less under the ball than over it.
    // Timing squares it up (Session 11, owner's choice): bat.square scales both losses (1 for an average hitter).
    // and a hitter who has faced him already squares him up a little better; a deceptive pitcher is squared up less (Session 19,
    // owner's choice: Deception carries the pitchers' contact skill, pit.soft)
    const sq = w.b.bat.square * familiar(w).square * w.p.pit.soft;
    // Off the plate (Session 21) an off-center hit loses more: x (1 + chaseOff x feet outside the zone), so a chased pitch is
    // mostly met weakly while a squared-up one still comes off hard (Statcast 2024: 0.4-0.7 ft off, 74.3 mph on average and
    // 11% hit 95+).
    const outside = Math.max(0, B3.data.zoneEdge(pitch.x, pitch.z));
    const lossOff = Math.min(0.9, sq * S.offLoss * (1 + S.chaseOff * outside) * Math.pow(Math.abs(u), S.offPow) * (u < 0 ? S.offUnder : 1));
    const ev = top * (1 - lossOff) * (1 - sq * S.timeLoss * v * v * (v > 0 ? 1 + S.lateLoss : 1)) * (1 - S.locLoss * away) + r.normal(0, S.evSd);
    // Launch angle: over the ball drives it down; high pitches go up. Launch sets the band.
    // The pitch's shape tilts it: a ground-ball shape (above 0) lowers the launch angle (step 1.3: a tilt,
    // not a quality, so it adds no movement for the hitter to misread).
    // The *where* error's part bends steeper toward the bat's edge (step 1.5): pop-ups and chopped grounders.
    const lift = -w.b.bat.launchK * off * (1 + S.launchCurve * off * off); // degrees from hitting under (+) or over (-) the center
    const path = w.b.bat.swingPath || 0; // Swing path (Session 11): Lift raises his launch angle and pulls more
    const la = S.attack + S.pathLA * path + T().TYPE[pitch.type].lift - (pitch.shape || 0) + lift + S.heightLA * (pitch.z - 2.55) + r.normal(0, w.b.bat.launchSd);
    // Spray: worked out for the pull side (minus), then turned for the batter's side.
    const inside = w.bats === 'R' ? -pitch.x : pitch.x; // feet toward the batter
    // A ball hit under the center drifts the other way (step 1.5); one topped over it is pulled (Session 21: sprayTop), as off a
    // tilted bat, up to sprayCap degrees of lift either way (Session 22: the spray fit, B3.tune.SWING).
    // A squared-up ball goes where the bat points (timing); a mishit squirts more (step 1.5: sprayBase).
    const noise = w.b.bat.sprayNoise * (S.sprayBase + (1 - S.sprayBase) * Math.min(1, Math.abs(u)));
    const pull = S.pullAt0 - S.pathPull * path + S.sprayPerMs * tm - S.insidePull * inside + S.sprayLA * clamp(lift, 0, S.sprayCap) + S.sprayTop * clamp(lift, -S.sprayCap, 0) +
      S.sprayAng * clamp(la - S.sprayMid, -30, 30) + r.normal(0, noise);
    const sp = w.bats === 'R' ? pull : -pull;
    // slice: degrees toward the opposite field; that ball's sidespin costs it some carry (B3.ball.flight, step 1.5).
    out.contact = { ev: Math.round(Math.max(20, ev) * 10) / 10, la: Math.round(clamp(la, -80, 89) * 10) / 10, sp: Math.round(sp * 10) / 10,
      slice: Math.round(Math.max(0, pull) * 10) / 10 };
    // A ground ball outside the lines is a foul; a ball in the air goes to B3.ball, which may catch it.
    out.r = Math.abs(sp) > S.foulLine && la < 10 ? 'F' : 'X';
    return out;
  }

  // A CPU hitter's *when* error. He times the fastball unless he reads the pitch, so slower pitches he
  // doesn't read make him early; faster pitches make him late and widen his spread (Velocity against Timing).
  function cpuTiming(g, pitch) {
    const w = who(g), M = T().TIMING;
    const ff = fastball(w.p, pitch.fade);
    const expected = pitch.speed + unread(w, pitch) * (Math.max(pitch.speed, ff) - pitch.speed);
    // ms early: he swings for a faster pitch. Measured against a fastball at refMph (step 1.4), so the speed
    // change counts as a share: a soft-tossing pitcher's change-up doesn't fool more than a hard thrower's.
    const early = M.readShare * (flightMs(pitch.speed) - flightMs(expected)) * ff / M.refMph * (T().TYPE[pitch.type].foolTime ? fool(pitch.grade) : 1);
    // Late: rising smoothly with the pitch's speed over his timingTop (step 1.4: a soft step, so every mph of
    // Velocity counts, not only those past timingTop). The spread grows with speed as a power of it.
    // He also gears up for this pitcher's fastball: he starts earlier by `gearUp` of the lateness that
    // fastball would give him, on every pitch, so a harder thrower makes him early on the slower ones.
    const lateAt = (mph) => { const x = (mph - w.b.bat.timingTop) / M.lateSoft; return M.latePerMph * M.lateSoft * (x > 30 ? x : Math.log(1 + Math.exp(x))); };
    const late = lateAt(pitch.speed) - M.gearUp * lateAt(ff);
    const sd = w.b.bat.timingSd * familiar(w).timingSd * Math.pow(pitch.speed / M.refMph, M.sdPow); // familiarity: times him better
    return Math.round(late - early + g.rng.normal(0, sd));
  }

  // A CPU hitter's read of where the pitch will cross, for swing or take. He reads a share of the
  // pitch's movement (Recognition against Deception) and takes the rest for a fastball's, so a slider
  // off the plate or a curve in the dirt can look like a strike; then his judgment (Discipline) adds
  // noise and a lean toward seeing balls as strikes (poor Discipline shows mostly as chasing). Returns
  // the spot he sees { x, z } and edge, its distance from the zone's edge in feet as he judges it
  // (below 0: it looks like a strike).
  function look(g, pitch) {
    const w = who(g), C = T().CPU.swing;
    const u = unread(w, pitch);
    const type = B3.data.PITCH[pitch.type], ff = B3.data.PITCH.FF;
    const mirror = pitch.throws === 'L' ? -1 : 1;
    const hx = mirror * (type.hx + u * (ff.hx - type.hx)), vz = type.vz + u * (ff.vz - type.vz);
    // Only movement beyond the type's average fools him (step 1.4): a below-average pitch looks like what it is.
    // A below-average one fools him less (the error shrinks with the grade).
    const g1 = pitch.grade || 1, gm = Math.max(1, g1), k = C.lookShare * Math.min(1, g1) / 12;
    let x = pitch.x + k * (hx - mirror * type.hx * gm), z = pitch.z + k * (vz - type.vz * gm);
    // A misread draws his eye toward the zone, never away from it (step 1.5 task 4, lookCloser): a pitch he takes for a
    // fastball looks like a strike, so being fooled shows as chasing (MLB 2024: hitters swing at off-speed strikes as
    // often as at fastball strikes, 68.6% and 67.3%, and chase off-speed balls more, 32.3% against 24.8%).
    // Each axis on its own: across the plate and up or down.
    if (C.lookCloser) {
      const Z = B3.data.ZONE, up = (h) => Math.max(Z.bottom - h, h - Z.top);
      if (Math.abs(x) > Math.abs(pitch.x)) x = pitch.x;
      if (up(z) > up(pitch.z)) z = pitch.z;
    }
    // With two strikes he commits sooner, so he judges more roughly (Session 18, CPU.swing.twoSd).
    const sd = g.strikes >= 2 ? Math.hypot(w.b.bat.judgeSd, C.twoSd) : w.b.bat.judgeSd;
    return { x: x, z: z, edge: B3.data.zoneEdge(x, z) - w.b.bat.judgeLean + g.rng.normal(0, sd) };
  }

  B3.pitch = {
    look: look,
    throw: throwPitch,
    call: call,
    resolve: resolve,
    cpuTiming: cpuTiming,
    expect: expect,
    fade: fade,
    flightMs: flightMs,
    who: who
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
