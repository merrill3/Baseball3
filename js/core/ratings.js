// Ratings into the physics' inputs (the rating hooks). Logic file: no DOM.
//
//   B3.ratings.inputs(player)     the player's physics inputs: B3.tune.inputs with his ratings mapped in
//   B3.ratings.hooks(player)      just the mapped part, { bat, pit, fld, run } (for tests and tools)
//   B3.ratings.effective(player)  each rating after the top-end curve and the combination cap
//   B3.ratings.curve(r)           one rating through the top-end curve, alone (no cap)
//   B3.ratings.steps(k, points)   steps from 60 for rating k at these points (its table in RATE.steps)
//   B3.ratings.stamina(r)         pitches before fatigue for a Stamina rating
//
// A player can carry (every part optional; anything missing is average, 60):
//   ratings     { contact, timing, launch, rawPower, recognition, discipline,    hitting,
//                 velocity, command, deception, stamina,                           pitching,
//                 range, hands, arm, framing, speed, baserunning }                 defense and running
//                                                                                  (DESIGN.md section 10), 20-99
//   arsenal     { FF: { grade, shape }, ... }   a grade (20-99) and a shape (-1 fly-ball tilt to +1
//                                               ground-ball tilt) for each of his pitch types
//   tendencies  { aggressiveness: Patient | Balanced | Aggressive, aim: Nibbler | Balanced | Attacker,
//                 swingPath: Ground-ball | Level | Lift (Session 11) }
// Each rating sets the inputs for its one job and nothing else; the scales are B3.tune.RATE. Range and
// Arm are graded against the fielder's position: at 60 he has his position's first step and arm
// (B3.tune.POS); Range multiplies the first step (fld.first) and Arm adds mph (fld.armPlus). Framing
// matters only for a catcher. Speed sets run.speed, which is also his speed to a ball in the field.
(function (root) {
  'use strict';
  const B3 = root.B3 = root.B3 || {};

  const HIT = ['contact', 'timing', 'launch', 'rawPower', 'recognition', 'discipline'];
  const PIT = ['velocity', 'command', 'deception'];
  const DEF = ['range', 'hands', 'arm', 'framing', 'speed', 'baserunning'];
  const ALL = HIT.concat(PIT, ['stamina'], DEF);

  function R() { return B3.tune.RATE; }
  function fail(msg) { throw new Error('B3.ratings: ' + msg); }
  function has(o, k) { return o && Object.prototype.hasOwnProperty.call(o, k); }

  function check(r, what) {
    if (typeof r !== 'number' || !Number.isFinite(r) || r < 20 || r > 99) fail(what + ' must be a number from 20 to 99, not ' + r);
    return r;
  }

  // The steep extra past `from`, in rating points.
  function extra(r) {
    const t = R().top;
    return r > t.from ? t.k * (r - t.from) * (r - t.from) : 0;
  }

  function curve(r) { return r + extra(r); }

  // One group's ratings after the curve, with the combination cap: the biggest extra counts in full,
  // the others at top.others, and all of them together add at most top.cap points.
  function capped(items) {
    const t = R().top;
    const ex = items.map((it) => ({ it: it, x: extra(it.r) }));
    let best = -1;
    ex.forEach((e, i) => { if (e.x > 0 && (best < 0 || e.x > ex[best].x)) best = i; });
    let total = 0;
    ex.forEach((e, i) => { e.x = i === best ? e.x : e.x * t.others; total += e.x; });
    const scale = total > t.cap ? t.cap / total : 1;
    const out = {};
    for (const e of ex) out[e.it.k] = e.it.r + e.x * scale;
    return out;
  }

  function ratingOf(player, k) {
    const rt = player.ratings || {};
    return has(rt, k) ? check(rt[k], (player.id || 'player') + ' ' + k) : 60;
  }

  function gradeOf(player, type) {
    const a = player.arsenal || {};
    if (!has(a, type)) return 60;
    return has(a[type], 'grade') ? check(a[type].grade, (player.id || 'player') + ' ' + type + ' grade') : 60;
  }

  // Every rating after the curve and the cap: { contact, ..., stamina, range, ..., grades: { type: points } }.
  // Three groups share a cap each: hitting; pitching with the pitch grades; defense and running.
  function effective(player) {
    const pitches = Array.isArray(player.pitches) ? player.pitches : [];
    const hit = capped(HIT.map((k) => ({ k: k, r: ratingOf(player, k) })));
    // The put-away pitch (his best grade as rated) comes first, so on a tie it keeps the full extra.
    const raw = {};
    for (const type of pitches) raw[type] = gradeOf(player, type);
    const pa = pitches.length ? putAway(pitches, raw) : null;
    const order = pa ? [pa].concat(pitches.filter((t) => t !== pa)) : [];
    const pit = capped(order.map((type) => ({ k: 'grade:' + type, r: raw[type] }))
      .concat(PIT.map((k) => ({ k: k, r: ratingOf(player, k) }))));
    const def = capped(DEF.map((k) => ({ k: k, r: ratingOf(player, k) })));
    const out = { grades: {} };
    for (const k of HIT) out[k] = hit[k];
    for (const k of PIT) out[k] = pit[k];
    for (const k of DEF) out[k] = def[k];
    for (const type of pitches) out.grades[type] = pit['grade:' + type];
    out.stamina = curve(ratingOf(player, 'stamina')); // outside the cap: Stamina is outside the equal-value rule
    out.putAway = pa;
    return out;
  }

  function u(points) { return (points - 60) / 10; }

  // Steps from 60 for a rating's points (after the curve), from its table in RATE.steps (step 1.4: set by
  // calibration so that +10 points are worth the same runs everywhere, tools/calibrate.js --part=fit);
  // straight lines between the table's rows and past its ends. Without a table: tens of points from 60.
  function steps(k, points) {
    const t = R().steps && R().steps[k];
    if (!t || t.length < 2) return u(points);
    let i = 1;
    while (i < t.length - 1 && points > t[i][0]) i++;
    const a = t[i - 1], b = t[i];
    if (points === b[0]) return b[1];
    return a[1] + (b[1] - a[1]) * (points - a[0]) / (b[0] - a[0]);
  }

  function hook(base, rule, points) {
    const x = rule[3] === 'tens' ? u(points) : steps(rule[0], points);
    if (rule[1] === 'mul') return base * Math.pow(rule[2], x);
    if (rule[1] === 'up') return 1 - (1 - base) * Math.pow(rule[2], x); // a share that nears 1, never reaching it
    return base + rule[2] * x;
  }

  // Pitches before fatigue for a Stamina rating (after the curve), along RATE.stamina's lines.
  function stamina(points) {
    const s = R().stamina;
    if (points <= s[0][0]) return s[0][1];
    for (let i = 1; i < s.length; i++) {
      if (points <= s[i][0] || i === s.length - 1) {
        const a = s[i - 1], b = s[i];
        return a[1] + (b[1] - a[1]) * (points - a[0]) / (b[0] - a[0]);
      }
    }
    return s[s.length - 1][1];
  }

  function tendency(player, k) {
    const td = player.tendencies || {};
    if (!has(td, k)) return 0;
    const map = R().tendency[k];
    if (!has(map, td[k])) fail((player.id || 'player') + ' ' + k + ' must be one of ' + Object.keys(map).join(', ') + ', not ' + td[k]);
    return map[td[k]];
  }

  // The inputs his ratings set: { bat, pit, fld, run }, in the hooks' own names and units.
  function hooks(player) {
    const T = B3.tune, rate = R(), e = effective(player);
    const bat = {}, pit = {}, fld = {}, run = {};
    for (const k in rate.bat) bat[k] = hook(T.BAT[k], rate.bat[k], e[rate.bat[k][0]]);
    for (const k in rate.pit) pit[k] = hook(T.PIT[k], rate.pit[k], e[rate.pit[k][0]]);
    for (const k in rate.fld) fld[k] = hook(T.FLD[k], rate.fld[k], e[rate.fld[k][0]]);
    for (const k in rate.run) run[k] = hook(T.RUN[k], rate.run[k], e[rate.run[k][0]]);
    bat.aggressiveness = tendency(player, 'aggressiveness');
    bat.swingPath = tendency(player, 'swingPath');
    pit.aim = tendency(player, 'aim');
    if (has(player.ratings, 'stamina')) pit.stamina = stamina(e.stamina);
    // The arsenal: a movement multiplier and extra drop per type, and the put-away pitch.
    const pitches = Array.isArray(player.pitches) ? player.pitches : [];
    if (pitches.length) {
      pit.grades = {}; pit.shapes = {};
      const arsenal = player.arsenal || {};
      for (const type of pitches) {
        pit.grades[type] = Math.max(rate.grade.min, 1 + rate.grade.step * steps('grade', e.grades[type]));
        const shape = has(arsenal, type) && has(arsenal[type], 'shape') ? arsenal[type].shape : 0;
        if (typeof shape !== 'number' || !(shape >= -1 && shape <= 1)) fail((player.id || 'player') + ' ' + type + ' shape must be from -1 to 1, not ' + shape);
        pit.shapes[type] = rate.shape * shape;
      }
      pit.putAway = e.putAway; // chosen from the grades as rated (before the curve and the cap)
    }
    return { bat: bat, pit: pit, fld: fld, run: run };
  }

  // The put-away pitch: his best-graded type. On a tie, the type that misses the most bats in MLB (B3.tune.TYPE's miss;
  // step 1.5 task 4: it was the type's bite, which tuning moves).
  function putAway(pitches, grades) {
    const TYPE = B3.tune.TYPE;
    let best = null;
    for (const type of pitches) {
      if (best === null || grades[type] > grades[best] || (grades[type] === grades[best] && TYPE[type].miss > TYPE[best].miss)) best = type;
    }
    return best;
  }

  function inputs(player) { return B3.tune.inputs(player, hooks(player)); }

  B3.ratings = {
    HIT: HIT, PIT: PIT, DEF: DEF, ALL: ALL,
    inputs: inputs,
    hooks: hooks,
    effective: effective,
    curve: curve,
    steps: steps,
    stamina: stamina,
    putAway: putAway
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
