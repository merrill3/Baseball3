// Pitches, the swing's two errors and contact. Logic file: no DOM.
//
//   B3.pitch.throw(g, { type, x, z })  the pitch as thrown: speed, movement and where it crosses the plate
//                                      (Command's scatter around the target, worse when tired)
//   B3.pitch.call(g, pitch)            a taken pitch: 'C' called strike or 'B' ball (Framing at the edges)
//   B3.pitch.resolve(g, pitch, swing)  { r, ... }: B or C on a take; on a swing S (whiff), F (foul) or
//                                      X (in play, with contact { ev, la, sp })
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
// Coordinates: x in feet from the middle of the plate, seen from the catcher (plus is the first-base
// side), z feet above the ground. Spray in degrees from straightaway center, plus toward right field.
// Every function reads the game but changes nothing except drawing from g.rng.
(function (root) {
  'use strict';
  const B3 = root.B3 = root.B3 || {};

  const MPH = 5280 / 3600; // feet per second in one mph

  function T() { return B3.tune; }
  function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }

  // The players on this pitch: inputs for the batter, pitcher and catcher, and the batter's side.
  function who(g) {
    const bat = g.teams[g.half], fld = g.teams[1 - g.half];
    const b = bat.inp[bat.lineup[bat.spot]], p = fld.inp[fld.pitcher], c = fld.inp[fld.byPos.C];
    const throws = p.throws;
    const bats = b.bats === 'S' ? (throws === 'L' ? 'R' : 'L') : b.bats;
    return { b: b, p: p, c: c, bats: bats, throws: throws, live: fld.live[fld.pitcher] };
  }

  // Fatigue steps: 0 while fresh, rising past Stamina, capped.
  function fatigue(p, live) {
    const P = T().PITCH;
    return clamp((live.pitches - p.pit.stamina) / P.fatigueSpan, 0, P.fatigueMax);
  }

  // Flight time in ms from release to the ideal contact point, for a release speed in mph.
  function flightMs(speed) {
    const P = T().PITCH;
    return 1000 * (P.releaseFt - P.contactFt) / (speed * P.avgSpeedShare * MPH);
  }

  // The fastball this pitcher throws today, mph (what a hitter times by default).
  function fastball(p, f) { return p.pit.velo - T().PITCH.fatigueVelo * f; }

  function throwPitch(g, a) {
    const r = g.rng, P = T().PITCH, w = who(g);
    const type = B3.data.PITCH[a.type];
    const f = fatigue(w.p, w.live);
    const sd = w.p.pit.commandSd * (1 + P.fatigueCommand * f);
    const x = a.x + r.normal(0, sd), z = a.z + r.normal(0, sd);
    const speed = Math.round((fastball(w.p, f) * type.v + r.normal(0, P.speedSd)) * 10) / 10;
    const grade = w.p.pit.grades[a.type] === undefined ? 1 : w.p.pit.grades[a.type];
    const mirror = w.throws === 'L' ? -1 : 1;
    return {
      type: a.type, speed: speed, x: x, z: z, zone: B3.data.inZone(x, z),
      ms: Math.round(flightMs(speed)),
      hx: mirror * type.hx * grade, vz: type.vz * grade, // movement as thrown, inches
      grade: grade, shape: w.p.pit.shapes[a.type] || 0, throws: w.throws, fatigue: f
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

  // The hitter's read of this pitch: recognition against the pitcher's deception, plus the platoon edge.
  function readOf(w) {
    const L = T().PLATOON;
    const opp = w.bats !== w.throws ? 1 : -1;
    return {
      rec: clamp(w.b.bat.recognition - w.p.pit.deception + L.recognition * opp, 0, 0.98),
      contactSd: w.b.bat.contactSd * (1 - L.contactSd * opp)
    };
  }

  // The *where* error's mean and spread for this pitch, in inches (above 0: the bat passes over the ball).
  function expect(g, pitch) {
    const w = who(g), S = T().SWING, kind = T().TYPE[pitch.type];
    const read = readOf(w);
    // He expects a read share of this type's normal movement and the rest of a fastball's. The pitch's
    // real movement against that is the surprise; only its vertical part moves the bat's height.
    const type = B3.data.PITCH[pitch.type], ff = B3.data.PITCH.FF;
    const expected = read.rec * type.vz + (1 - read.rec) * ff.vz;
    const surprise = expected - pitch.vz; // above 0: the ball ends lower than he thought, so the bat is over it
    const mean = kind.surprise * surprise;
    // Spread: Contact, the type's bite (grade makes it bigger), and distance from the middle of the zone.
    const edge = B3.data.zoneEdge(pitch.x, pitch.z);
    const loc = S.edgeSd * Math.max(0, edge + 0.4) + S.chaseSd * Math.max(0, edge);
    const bite = kind.bite * pitch.grade;
    const sd = Math.sqrt(read.contactSd * read.contactSd + bite * bite + loc * loc);
    return { mean: mean, sd: sd, rec: read.rec, bats: w.bats };
  }

  function resolve(g, pitch, swing) {
    if (!swing.swing) return { r: call(g, pitch) };
    const r = g.rng, S = T().SWING, w = who(g);
    const tm = swing.timing;
    const e = expect(g, pitch);
    const off = r.normal(e.mean, e.sd);
    const out = { r: 'S', off: Math.round(off * 100) / 100 };
    // A mistimed swing meets the ball with less of the bat in its path (the arc is off), so it misses more.
    const v = tm / S.missMs;
    const radius = S.radius * Math.max(0, 1 - S.timeRadius * v * v);
    if (Math.abs(tm) > S.missMs || Math.abs(off) > radius) return out; // whiff
    if (Math.abs(off) > radius * S.foulBack) { out.r = 'F'; return out; } // glancing: fouled back
    // Exit speed: bat speed and pitch speed, less for an off-center hit and for bad timing.
    const u = off / (radius * S.foulBack);
    const top = S.collision * pitch.speed * S.plateShare + (1 + S.collision) * w.b.bat.batSpeed;
    // A pitch away from the middle is hit off the end of the bat or jammed: less exit speed (step 1.3).
    const away = Math.max(0, B3.data.zoneEdge(pitch.x, pitch.z) + 0.4);
    const ev = top * (1 - S.offLoss * u * u) * (1 - S.timeLoss * v * v) * (1 - S.locLoss * away) + r.normal(0, S.evSd);
    // Launch angle: over the ball drives it down; high pitches go up. Launch sets the band.
    // The pitch's shape tilts it: a ground-ball shape (above 0) lowers the launch angle (step 1.3: a tilt,
    // not a quality, so it adds no movement for the hitter to misread).
    const la = S.attack + T().TYPE[pitch.type].lift - (pitch.shape || 0) - w.b.bat.launchK * off + S.heightLA * (pitch.z - 2.55) + r.normal(0, w.b.bat.launchSd);
    // Spray: worked out for the pull side (minus), then turned for the batter's side.
    const inside = w.bats === 'R' ? -pitch.x : pitch.x; // feet toward the batter
    const pull = S.pullAt0 + S.sprayPerMs * tm - S.insidePull * inside + r.normal(0, w.b.bat.sprayNoise);
    const sp = w.bats === 'R' ? pull : -pull;
    out.contact = { ev: Math.round(Math.max(20, ev) * 10) / 10, la: Math.round(clamp(la, -80, 89) * 10) / 10, sp: Math.round(sp * 10) / 10 };
    // A ground ball outside the lines is a foul; a ball in the air goes to B3.ball, which may catch it.
    out.r = Math.abs(sp) > S.foulLine && la < 10 ? 'F' : 'X';
    return out;
  }

  // A CPU hitter's *when* error. He times the fastball unless he reads the pitch, so slower pitches he
  // doesn't read make him early; faster pitches make him late and widen his spread (Velocity against Timing).
  function cpuTiming(g, pitch) {
    const w = who(g), M = T().TIMING;
    const read = readOf(w);
    const ff = fastball(w.p, pitch.fatigue);
    const expected = read.rec * pitch.speed + (1 - read.rec) * Math.max(pitch.speed, ff);
    const early = M.readShare * (flightMs(pitch.speed) - flightMs(expected)); // ms early: he swings for a faster pitch
    const late = M.latePerMph * Math.max(0, pitch.speed - w.b.bat.timingTop);
    const sd = w.b.bat.timingSd * Math.max(0.5, 1 + M.sdPer10 * (pitch.speed - M.refMph) / 10);
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
    const rec = readOf(w).rec;
    const type = B3.data.PITCH[pitch.type], ff = B3.data.PITCH.FF;
    const mirror = pitch.throws === 'L' ? -1 : 1;
    const hx = mirror * (rec * type.hx + (1 - rec) * ff.hx), vz = rec * type.vz + (1 - rec) * ff.vz;
    const x = pitch.x + C.lookShare * (hx - pitch.hx) / 12, z = pitch.z + C.lookShare * (vz - pitch.vz) / 12;
    return { x: x, z: z, edge: B3.data.zoneEdge(x, z) - w.b.bat.judgeLean + g.rng.normal(0, w.b.bat.judgeSd) };
  }

  B3.pitch = {
    look: look,
    throw: throwPitch,
    call: call,
    resolve: resolve,
    cpuTiming: cpuTiming,
    expect: expect,
    flightMs: flightMs,
    who: who
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
