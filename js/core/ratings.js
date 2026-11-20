// Ratings into the physics' inputs (the rating hooks). Logic file: no DOM.
//
//   B3.ratings.inputs(player)     the player's physics inputs: B3.tune.inputs with his ratings mapped in
//   B3.ratings.hooks(player)      just the mapped part, { bat, pit } (for tests and tools)
//   B3.ratings.effective(player)  each rating after the top-end curve and the combination cap
//   B3.ratings.curve(r)           one rating through the top-end curve, alone (no cap)
//   B3.ratings.stamina(r)         pitches before fatigue for a Stamina rating
//
// A player can carry (every part optional; anything missing is average, 60):
//   ratings     { contact, timing, launch, rawPower, recognition, discipline,    hitting (DESIGN.md
//                 velocity, command, deception, stamina }                          section 10), 20-99
//   arsenal     { FF: { grade, shape }, ... }   a grade (20-99) and a shape (-1 fly-ball tilt to +1
//                                               ground-ball tilt) for each of his pitch types
//   tendencies  { aggressiveness: Patient | Balanced | Aggressive, aim: Nibbler | Balanced | Attacker }
// Each rating sets the inputs for its one job and nothing else; the scales are B3.tune.RATE. The
// defense and running ratings (Range, Hands, Arm, Framing, Speed, Baserunning) are mapped in step 1.4;
// until then those inputs keep their placeholders.
(function (root) {
  'use strict';
  const B3 = root.B3 = root.B3 || {};

  const HIT = ['contact', 'timing', 'launch', 'rawPower', 'recognition', 'discipline'];
  const PIT = ['velocity', 'command', 'deception'];
  const ALL = HIT.concat(PIT, ['stamina']);

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

  // Every rating after the curve and the cap: { contact, ..., stamina, grades: { type: points } }.
  function effective(player) {
    const pitches = Array.isArray(player.pitches) ? player.pitches : [];
    const hit = capped(HIT.map((k) => ({ k: k, r: ratingOf(player, k) })));
    const pit = capped(PIT.map((k) => ({ k: k, r: ratingOf(player, k) }))
      .concat(pitches.map((type) => ({ k: 'grade:' + type, r: gradeOf(player, type) }))));
    const out = { grades: {} };
    for (const k of HIT) out[k] = hit[k];
    for (const k of PIT) out[k] = pit[k];
    for (const type of pitches) out.grades[type] = pit['grade:' + type];
    out.stamina = curve(ratingOf(player, 'stamina')); // outside the cap: Stamina is outside the equal-value rule
    return out;
  }

  function u(points) { return (points - 60) / 10; }

  function hook(base, rule, points) {
    return rule[1] === 'mul' ? base * Math.pow(rule[2], u(points)) : base + rule[2] * u(points);
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

  // The inputs his ratings set: { bat, pit }, in the hooks' own names and units.
  function hooks(player) {
    const T = B3.tune, rate = R(), e = effective(player);
    const bat = {}, pit = {};
    for (const k in rate.bat) bat[k] = hook(T.BAT[k], rate.bat[k], e[rate.bat[k][0]]);
    for (const k in rate.pit) pit[k] = hook(T.PIT[k], rate.pit[k], e[rate.pit[k][0]]);
    bat.aggressiveness = tendency(player, 'aggressiveness');
    pit.aim = tendency(player, 'aim');
    if (has(player.ratings, 'stamina')) pit.stamina = stamina(e.stamina);
    // The arsenal: a movement multiplier and extra drop per type, and the put-away pitch.
    const pitches = Array.isArray(player.pitches) ? player.pitches : [];
    if (pitches.length) {
      pit.grades = {}; pit.shapes = {};
      const arsenal = player.arsenal || {};
      for (const type of pitches) {
        pit.grades[type] = Math.max(rate.grade.min, 1 + rate.grade.step * u(e.grades[type]));
        const shape = has(arsenal, type) && has(arsenal[type], 'shape') ? arsenal[type].shape : 0;
        if (typeof shape !== 'number' || !(shape >= -1 && shape <= 1)) fail((player.id || 'player') + ' ' + type + ' shape must be from -1 to 1, not ' + shape);
        pit.shapes[type] = rate.shape * shape;
      }
      pit.putAway = putAway(pitches, e.grades);
    }
    return { bat: bat, pit: pit };
  }

  // The put-away pitch: his best-graded type. On a tie, the type that misses the most bats (B3.tune.TYPE's bite).
  function putAway(pitches, grades) {
    const TYPE = B3.tune.TYPE;
    let best = null;
    for (const type of pitches) {
      if (best === null || grades[type] > grades[best] || (grades[type] === grades[best] && TYPE[type].bite > TYPE[best].bite)) best = type;
    }
    return best;
  }

  function inputs(player) { return B3.tune.inputs(player, hooks(player)); }

  B3.ratings = {
    HIT: HIT, PIT: PIT, ALL: ALL,
    inputs: inputs,
    hooks: hooks,
    effective: effective,
    curve: curve,
    stamina: stamina,
    putAway: putAway
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
