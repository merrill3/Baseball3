// Player generation (M2 step 2.1a task 2, Session 27). Logic file: no DOM. The owner's choices it follows are in
// DESIGN.md sections 5, 6 and 10 (ratings 20-99 with 60 an average big-leaguer; ratings independent except Raw Power
// against Contact, stuff against Command and chase-getters leaning Nibbler; stars mostly specialists with real holes;
// handedness; ages and a hidden potential; positions; arsenal sizes; names). Every number in GEN is Claude's default.
//
//   B3.players.context()                  a league's generation state: { seq, used } (the next id number and the
//                                         names in use, so no two players share a name)
//   B3.players.hitter(rng, ctx, opts)     one position player. opts (all optional): pos (his main position, from
//                                         LINEUP_POS; drawn if missing), tier ('regular' | 'bench' | 'reserve'), level
//                                         (points added to his hitting ratings' mean, half to defense and running;
//                                         default by tier), age
//   B3.players.pitcher(rng, ctx, opts)    one pitcher. opts: role ('SP', 'CL', 'SU', 'MR', 'LR'; default 'SP'), tier,
//                                         level (points added to Velocity, Command, Deception and his grades), age
//   B3.players.squad(rng, ctx, opts)      one organization's 40 players: { regulars (9, one per LINEUP_POS), bench (4),
//                                         starters (5), relievers (8: CL, SU, SU, MR x 4, LR; the short relievers' roles
//                                         by their overall, B3.overall, from Session 29), reserves (14: 7
//                                         hitters, 7 pitchers) }. opts.level shifts every player (step 2.1b's balance)
//   B3.players.GEN                        the numbers below (tools may change them for experiments)
// rng is a B3.rng generator; the same seed gives the same players.
//
// A player (the shape B3.game and B3.ratings take; DESIGN.md section 10 lists the ratings):
//   { id, name, first, last, country, age, bats, throws, pos,                     pos 'P' for a pitcher
//     cross?,                                  hitters: a position on the other side (infield or outfield) he can
//                                              also play, about 1 player in 20 (owner's choice, Session 6)
//     role, pitches, arsenal,                  pitchers: role, his pitch types, { type: { grade, shape } }
//     ratings, tendencies, potential: { hidden, shown } }
// potential is in rating points: how far his ratings are headed from here, on average (above 0 for young players, 0 at
// 28-31, below 0 past 31). hidden is the truth that M6's growth function uses; shown is what people see, drawn from it
// once with an error that shrinks with age. Task 3 (the overall) shows it on the overall's scale.
(function (root) {
  'use strict';
  const B3 = root.B3 = root.B3 || {};

  const GEN = {
    // The test population's spread and links (tools/ratingstats.js, Sessions 8-19), so the league is what the ladders
    // were fitted on: 60 + sd x z for every rating.
    sd: 12.2,
    // The hitters' trade-off links (Session 31, owner's choice: MLB-like trade-offs, so strikeout hitters also walk more and hit
    // for more power, and contact hitters hit for less; the pairs and sizes are Claude's defaults, sized on the generated
    // hitters against MLB's 2024-2026 seasons): correlations between the hitting ratings' draws. Pairs not named are 0.
    // Sized on 160 teams of generated hitters (tools/ratingstats.js --part=pop) against MLB's [brackets]: wOBA stars 6.3% / 1.3%
    // [5 / 1] (were 9.8% / 2.2%), wOBA's spread 1.21x MLB's (was 1.49x); K% with BB% +0.19 [+0.17], with ISO +0.25 [+0.32], with
    // wOBA -0.12 [-0.08]; zone contact with ISO -0.39 [-0.39], with exit speed -0.53 [-0.43]; chase with K% +0.09 [-0.03];
    // exit speed with BB% +0.29 [+0.32]. Raw Power against Contact goes from Session 10's -0.3 to -0.5 inside the set.
    hitLinks: { 'contact,rawPower': -0.5, 'contact,discipline': -0.35, 'contact,recognition': -0.4, 'rawPower,discipline': 0.3 },
    stuffCommand: -0.2,  // Command against his stuff, his Velocity and grades together (owner's choice, Session 19; size Claude's)
    // His grades against his Velocity (Session 31, Claude's default under the owner's Session 19 rule, pitchers' traits linked as
    // MLB's go together): a soft-tosser sticks in the majors only with better pitches, which is why MLB's strikeouts rise
    // +0.99 per mph across pitchers but +1.69 for the same pitcher year to year (the engine's per-mph effect since Session 31).
    veloGrades: -0.3,  // sized on the generated starters (160 teams): K% 14.1-30.5 [MLB 15.3-30.0], K% stars 5.8% [5]; at 0, 13.1-32.2 and 9.1%
    aimLean: 0.4,        // chase-getters (Deception and grades) lean Nibbler (Session 19)
    // Good Command leans Nibbler (Session 34, step 2.1e item 1b, owner's choice; the size Claude's default): Nibbler / Balanced /
    // Attacker 9 / 43 / 48% at Command under 45, 23 / 52 / 25% at 55-64, 46 / 45 / 10% at 75 and up (at 0: 29 / 49 / 22%, 25 / 50 / 26%,
    // 22 / 49 / 29%); the mix stays 1 : 2 : 1. It moves walk spread from Aim onto Command (a sharp pitcher's nibbling costs fewer
    // walks) and brings the league's zone % with BB% to -0.62 [MLB -0.52] (was -0.69).
    commandLean: 0.4,
    // Low Discipline leans Aggressive (Session 33, step 2.1d item 7, owner's choice: chases that don't add strikeouts; the size is
    // Claude's default): the correlation between his Discipline's draw and a hidden normal cut at its quartiles (1 : 2 : 1). MLB's
    // free swingers chase and also swing at strikes early, so chasing doesn't raise their strikeouts (chase with K% -0.03).
    // Built and left at 0 (stopped by the realism rule, docs/plan.md step 2.1d item 7): at 0.2 / 0.4 / 0.7 the generated hitters'
    // chase-K% link went 0.20 -> 0.16 / 0.16 / 0.10 [MLB -0.03], while their walks spread past MLB's (1.04x / 1.12x / 1.11x
    // without the sampling noise, was 0.97x) and at 0.7 the chase spread too (95th 41.2 [39.5]). At 0 it picks as before.
    aggLean: 0,
    shapeSd: 0.35,       // a pitch's shape: shapeSd x a normal, rounded to 0.1, within -1 to 1
    shapeOwn: 0.8,       // the share of each shape's variance that is the pitcher's own tilt, shared by his pitches
    // Position leans, in points from 60 (Claude's defaults, Session 27). Raw Power: first basemen, designated hitters and
    // right fielders hit for more power, middle infielders and catchers for less (MLB 2024 ISO by position about .130 at
    // second base to .180 at DH). Speed is a raw sprint (ft/s), so it leans by position too (Savant: catchers about 26,
    // center fielders about 28.5 ft/s). Range, Hands and Arm are graded against his own position (B3.tune.POS), so they
    // don't lean. Each lineup's leans add to 0, and the spread around them is cut so a lineup's spread stays sd.
    posPower: { C: -3, '1B': 4, '2B': -4, '3B': 1, SS: -3, LF: 1, CF: -2, RF: 3, DH: 3 },
    posSpeed: { C: -10, '1B': -7, '2B': 4, '3B': -2, SS: 7, LF: 1, CF: 13, RF: 1, DH: -7 },
    dhDefense: -8,       // a designated hitter by trade is a poor fielder: Range, Hands and Arm this much lower
    // Aging already in the current ratings: Speed and Velocity lose this many points a year past `from` (sprint speed and
    // fastball speed fade from about 30); everyone gets back the league's average loss, so the mean stays 60.
    fade: { from: 30, speed: 1, velocity: 1 },
    relieverVelocity: 5, // relievers throw harder (MLB's relievers about 1 mph above starters; 10 points are 1.5 mph)
    // Stamina (Session 17's scale): starters as the test population; relievers about 25-40 pitches, a long man 45-55.
    stamina: { SP: [60, 12.2, 20, 99], LR: [28, 1.5, 25, 32], RP: [23.5, 1.5, 20, 28] },
    // Arsenal sizes (owner's choice, Session 2: starters 3-6, mostly 4, 6 very rarely; relievers 2-4, mostly 2, 4 very rarely).
    size: { SP: { 3: 22, 4: 48, 5: 26, 6: 4 }, RP: { 2: 55, 3: 37, 4: 8 } },
    // Pitch types: a fastball first (four-seam or sinker), then a breaking or off-speed pitch, then any; weights from
    // MLB's usage (most pitchers throw a slider; starters and left-handers more change-ups).
    primary: { FF: 65, SI: 35 },
    second: { SP: { SL: 12, CU: 5, CH: 7, FS: 0.8 }, RP: { SL: 12, CU: 3.5, CH: 3.5, FS: 1 } },
    rest: { SP: { SL: 8, CU: 5, CH: 7, FS: 0.6, FC: 4.5, FF: 4, SI: 3.5 }, RP: { SL: 6, CU: 4, CH: 3, FS: 1, FC: 4, FF: 3, SI: 3 } },
    lefty: { CH: 1.4 },  // left-handers throw more change-ups
    // Handedness (owner's choice, Session 3; the shares Claude's, about MLB's): batters 58% right, 32% left, 10% switch;
    // pitchers 72% right. Catchers and infielders but first basemen throw right; a left-handed batter throws left 60%.
    bats: { R: 58, L: 32, S: 10 },
    throwsL: { R: 0.03, L: 0.6, S: 0.15 },
    pitcherL: 0.28,
    // Ages (owner's choice, Session 25: about 21-40, a realistic mix). Weights for 21, 22, ... 40: big-leaguers as MLB's
    // (median 28), reserves younger (median 25: prospects on the 40-man roster).
    ages: {
      major: [1, 2.5, 5, 7.5, 9.5, 10.5, 10.5, 10, 9, 8, 7, 5.5, 4.5, 3.5, 2.5, 1.5, 1, 0.6, 0.3, 0.2],
      reserve: [5, 10, 14, 15, 13, 11, 9, 7, 5, 4, 3, 2, 1, 0.6, 0.4, 0, 0, 0, 0, 0]
    },
    // Potential (owner's choice, Session 25: a hidden potential, the shown one drawn from it): points still to gain by his
    // peak, about 1.6 a year under 27 (a 21-year-old about +10, give or take 5), none at 28-31, about 1.2 a year lost past 31.
    potential: { peak: 27, perYear: 1.6, sd: [2, 0.6], decline: 31, fall: 1.2, seen: [3, 2, 1] },
    // Tiers (Claude's defaults; step 2.1b may change them): bench players and reserves are weaker.
    level: { regular: 0, bench: -4, reserve: -7 },
    // Infield and outfield both (owner's choice, Session 6: about 1 in 20, mostly bench utility men).
    // Catchers and designated hitters never cross, so the eligible bench men cross more: about 5% of all hitters.
    cross: { regular: 0.01, bench: 0.22, reserve: 0.05 },
    tendency: [1, 2, 1]  // Patient / Balanced / Aggressive, Ground-ball / Level / Lift, Nibbler / Balanced / Attacker
  };

  const HIT = ['contact', 'timing', 'launch', 'rawPower', 'recognition', 'discipline'];
  const INFIELD = ['1B', '2B', '3B', 'SS'], RIGHT_ONLY = ['C', '2B', '3B', 'SS'];

  function fail(msg) { throw new Error('B3.players: ' + msg); }
  function clip(x) { return Math.round(Math.max(20, Math.min(99, x))); }
  function pickW(rng, table) {
    const keys = Object.keys(table);
    return keys[rng.weighted(keys.map((k) => table[k]))];
  }
  function mean(obj) { const v = Object.values(obj); return v.reduce((a, b) => a + b, 0) / v.length; }
  function varOf(obj) { const m = mean(obj), v = Object.values(obj); return v.reduce((a, b) => a + (b - m) * (b - m), 0) / v.length; }
  // The spread left once a lean takes its share, so the whole stays sd.
  function within(lean) { return Math.sqrt(Math.max(0, GEN.sd * GEN.sd - varOf(lean))); }

  function context() { return { seq: 0, used: {} }; }

  function ageOf(rng, tier, given) {
    if (given !== undefined) {
      if (!(given >= 18 && given <= 45)) fail('age must be 18 to 45, not ' + given);
      return Math.round(given);
    }
    return 21 + rng.weighted(GEN.ages[tier === 'reserve' ? 'reserve' : 'major']);
  }

  // The league's average fade, given back to everyone (so the mean stays 60).
  function fadeOf(age) { return Math.max(0, age - GEN.fade.from); }
  function meanFade() {
    const w = GEN.ages.major;
    let t = 0, n = 0;
    w.forEach((x, i) => { t += x * fadeOf(21 + i); n += x; });
    return t / n;
  }

  function potentialOf(rng, age) {
    const P = GEN.potential;
    let hidden;
    if (age < P.peak) hidden = Math.max(0, rng.normal(P.perYear * (P.peak - age), P.sd[0] + P.sd[1] * (P.peak - age)));
    else if (age <= P.decline) hidden = 0;
    else hidden = -P.fall * (age - P.decline);
    const seenSd = age <= 24 ? P.seen[0] : age < 28 ? P.seen[1] : P.seen[2];
    return { hidden: Math.round(hidden * 10) / 10, shown: Math.round(hidden + rng.normal(0, seenSd)) };
  }

  function identity(rng, ctx) {
    if (!ctx || typeof ctx.seq !== 'number' || !ctx.used) fail('ctx must come from B3.players.context()');
    const n = B3.names.pick(rng, ctx.used);
    ctx.seq++;
    return { id: 'p' + ctx.seq, name: n.first + ' ' + n.last, first: n.first, last: n.last, country: n.country };
  }

  function levelOf(opts) {
    const tier = opts.tier || 'regular';
    if (!Object.prototype.hasOwnProperty.call(GEN.level, tier)) fail('tier must be regular, bench or reserve, not ' + tier);
    return { tier: tier, level: (opts.level !== undefined ? opts.level : 0) + GEN.level[tier] };
  }

  function style(rng, words) { return words[rng.weighted(GEN.tendency)]; }

  // The standard normal's distribution function (Abramowitz and Stegun 7.1.26, error under 2e-7).
  function phi(x) {
    const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
    const e = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429)))) * Math.exp(-x * x / 2);
    return x >= 0 ? 1 - e / 2 : e / 2;
  }
  // Aggressiveness (Session 33): Aggressive when a hidden normal, -aggLean x his Discipline's draw plus the rest, is above its upper
  // quartile, Patient below the lower, from one uniform draw (as the plain 1 : 2 : 1 pick, which this is at aggLean 0).
  const Q = 0.6744897502;
  function aggOf(rng, zd) {
    const a = GEN.aggLean;
    if (!a) return style(rng, ['Patient', 'Balanced', 'Aggressive']);
    const s = Math.sqrt(1 - a * a), lo = phi((-Q + a * zd) / s), hi = 1 - phi((Q + a * zd) / s);
    // The quartile cut is for GEN.tendency's 1 : 2 : 1 mix; at that mix and aggLean 0 it picks exactly as style() does.
    const u = rng.next();
    return u < lo ? 'Patient' : u >= 1 - hi ? 'Aggressive' : 'Balanced';
  }

  // The Cholesky factor of the hitting ratings' correlations (GEN.hitLinks, in HIT's order), kept until the links change.
  let hitKey = null, hitL = null;
  function hitFactor() {
    const key = JSON.stringify(GEN.hitLinks);
    if (key === hitKey) return hitL;
    const n = HIT.length, C = HIT.map((a, i) => HIT.map((b, j) => (i === j ? 1 : 0)));
    for (const pr in GEN.hitLinks) {
      const [a, b] = pr.split(','), i = HIT.indexOf(a), j = HIT.indexOf(b);
      if (i < 0 || j < 0 || i === j) fail('bad hitLinks pair ' + pr);
      C[i][j] = C[j][i] = GEN.hitLinks[pr];
    }
    const L = HIT.map(() => new Array(n).fill(0));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j <= i; j++) {
        let s = C[i][j];
        for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
        if (i === j) { if (s <= 1e-9) fail('hitLinks is not a valid set of correlations'); L[i][j] = Math.sqrt(s); }
        else L[i][j] = s / L[j][j];
      }
    }
    hitKey = key; hitL = L;
    return L;
  }

  function hitter(rng, ctx, opts) {
    opts = opts || {};
    const { tier, level } = levelOf(opts);
    const pos = opts.pos || B3.data.LINEUP_POS[rng.int(8)]; // a drawn position is a fielding one
    if (B3.data.LINEUP_POS.indexOf(pos) < 0) fail('bad position ' + pos);
    const p = identity(rng, ctx);
    p.age = ageOf(rng, tier, opts.age);
    p.pos = pos;
    const bats = pickW(rng, GEN.bats);
    p.bats = bats;
    p.throws = RIGHT_ONLY.indexOf(pos) >= 0 ? 'R' : (rng.next() < GEN.throwsL[bats] ? 'L' : 'R');
    // Hitting: independent normals, Raw Power against Contact, Raw Power's position lean.
    const z0 = HIT.map(() => rng.normal(0, 1)), Lh = hitFactor(), z = {};
    HIT.forEach((k, i) => { let x = 0; for (let j = 0; j <= i; j++) x += Lh[i][j] * z0[j]; z[k] = x; });
    const r = {};
    for (const k of HIT) r[k] = 60 + level + GEN.sd * z[k];
    r.rawPower = 60 + level + GEN.posPower[pos] + within(GEN.posPower) * z.rawPower;
    // Defense and running: graded against his position, so they don't lean (but a designated hitter fields poorly); Speed
    // leans by position and fades with age.
    const half = level / 2, dh = pos === 'DH' ? GEN.dhDefense : 0;
    r.range = 60 + half + dh + GEN.sd * rng.normal(0, 1);
    r.hands = 60 + half + dh + GEN.sd * rng.normal(0, 1);
    r.arm = 60 + half + dh + GEN.sd * rng.normal(0, 1);
    if (pos === 'C') r.framing = 60 + half + GEN.sd * rng.normal(0, 1);
    r.speed = 60 + half + GEN.posSpeed[pos] + GEN.fade.speed * (meanFade() - fadeOf(p.age)) + within(GEN.posSpeed) * rng.normal(0, 1);
    r.baserunning = 60 + half + GEN.sd * rng.normal(0, 1);
    p.ratings = {};
    for (const k in r) p.ratings[k] = clip(r[k]);
    p.tendencies = { aggressiveness: aggOf(rng, z.discipline), swingPath: style(rng, ['Ground-ball', 'Level', 'Lift']) };
    // Infield and outfield both: an infielder can also play left field (center for a middle infielder), an outfielder
    // second or third base.
    if (pos !== 'C' && pos !== 'DH' && rng.next() < GEN.cross[tier]) {
      p.cross = INFIELD.indexOf(pos) >= 0 ? (pos === 'SS' || pos === '2B' ? 'CF' : 'LF') : (rng.next() < 0.5 ? '2B' : '3B');
      if (p.cross === '2B' || p.cross === '3B') p.throws = 'R';
    }
    p.potential = potentialOf(rng, p.age);
    return p;
  }

  function arsenalOf(rng, role, throws) {
    const kind = role === 'SP' ? 'SP' : 'RP';
    const n = +pickW(rng, GEN.size[kind]);
    const list = [pickW(rng, GEN.primary)];
    const weight = (table) => {
      const t = {};
      for (const k in table) if (list.indexOf(k) < 0) t[k] = table[k] * (throws === 'L' && GEN.lefty[k] ? GEN.lefty[k] : 1);
      return t;
    };
    list.push(pickW(rng, weight(GEN.second[kind])));
    while (list.length < n) list.push(pickW(rng, weight(GEN.rest[kind])));
    return list;
  }

  function pitcher(rng, ctx, opts) {
    opts = opts || {};
    const { tier, level } = levelOf(opts);
    const role = opts.role || 'SP';
    if (['SP', 'CL', 'SU', 'MR', 'LR'].indexOf(role) < 0) fail('bad role ' + role);
    const p = identity(rng, ctx);
    p.age = ageOf(rng, tier, opts.age);
    p.pos = 'P';
    p.role = role;
    p.throws = rng.next() < GEN.pitcherL ? 'L' : 'R';
    p.bats = rng.next() < 0.85 ? p.throws : (p.throws === 'L' ? 'R' : 'L');
    p.pitches = arsenalOf(rng, role, p.throws);
    // Velocity, Command, Deception and a grade per pitch: independent normals, Command against the stuff (his Velocity and
    // grades together).
    const keys = ['velocity', 'command', 'deception'].concat(p.pitches.map((t) => 'g:' + t));
    const z = {};
    for (const k of keys) z[k] = rng.normal(0, 1);
    const vg = GEN.veloGrades;
    if (vg) for (const t of p.pitches) z['g:' + t] = vg * z.velocity + Math.sqrt(1 - vg * vg) * z['g:' + t];
    const stuff = keys.filter((k) => k === 'velocity' || k.startsWith('g:'));
    // His stuff as one standard normal: the sum's spread allows for the grades leaning against Velocity (veloGrades).
    const m = stuff.length - 1;
    const zs = stuff.reduce((t, k) => t + z[k], 0) / Math.sqrt(1 + m + 2 * m * vg + m * (m - 1) * vg * vg);
    z.command = GEN.stuffCommand * zs + Math.sqrt(1 - GEN.stuffCommand * GEN.stuffCommand) * z.command;
    const rp = role !== 'SP';
    const v = {};
    for (const k of keys) v[k] = clip(60 + level + GEN.sd * z[k]);
    v.velocity = clip(60 + level + (rp ? GEN.relieverVelocity : 0) + GEN.fade.velocity * (meanFade() - fadeOf(p.age)) + GEN.sd * z.velocity);
    const st = GEN.stamina[role === 'SP' ? 'SP' : role === 'LR' ? 'LR' : 'RP'];
    p.ratings = { velocity: v.velocity, command: v.command, deception: v.deception,
      stamina: Math.round(Math.max(st[2], Math.min(st[3], rng.normal(st[0], st[1])))) };
    // Shapes: his own tilt shared by his pitches, plus each pitch's own.
    const own = rng.normal(0, 1);
    p.arsenal = {};
    for (const t of p.pitches) {
      const zz = Math.sqrt(GEN.shapeOwn) * own + Math.sqrt(1 - GEN.shapeOwn) * rng.normal(0, 1);
      p.arsenal[t] = { grade: v['g:' + t], shape: Math.round(Math.max(-1, Math.min(1, GEN.shapeSd * zz)) * 10) / 10 };
    }
    // Aim: pitchers whose stuff gets chases (Deception and grades) lean Nibbler, and from Session 34 (step 2.1e item 1b, owner's
    // choice) so do pitchers with good Command; cut at the quartiles (1 : 2 : 1). The noise's share allows for Command leaning
    // against the grades (stuffCommand), so the lean stays a standard normal.
    const zc = [(v.deception - 60 - level) / GEN.sd].concat(p.pitches.map((t) => (v['g:' + t] - 60 - level) / GEN.sd));
    const chase = zc.reduce((a, b) => a + b, 0) / Math.sqrt(zc.length);
    const la = GEN.aimLean, lc = GEN.commandLean || 0;
    // rho: the chase-getters' lean with his Command's draw (each grade's with his stuff, x stuffCommand, over the chase sum's size).
    const rho = m * GEN.stuffCommand * (1 + vg + (m - 1) * vg * vg) / (Math.sqrt(1 + m + 2 * m * vg + m * (m - 1) * vg * vg) * Math.sqrt(m + 1));
    const lean = la * chase + lc * (v.command - 60 - level) / GEN.sd;
    const za = -lean + Math.sqrt(Math.max(0, 1 - la * la - lc * lc - 2 * la * lc * rho)) * rng.normal(0, 1);
    p.tendencies = { aim: za < -0.674 ? 'Nibbler' : za > 0.674 ? 'Attacker' : 'Balanced' };
    p.potential = potentialOf(rng, p.age);
    return p;
  }

  const BENCH = ['C', 'SS', '2B', 'CF'];
  const RESERVE_POS = ['C', 'SS', '2B', '3B', '1B', 'CF', 'RF'];
  const PEN = ['CL', 'SU', 'SU', 'MR', 'MR', 'MR', 'MR', 'LR'];
  const RESERVE_ROLES = ['SP', 'SP', 'SP', 'MR', 'MR', 'MR', 'LR'];

  function squad(rng, ctx, opts) {
    const level = (opts && opts.level) || 0;
    const out = { regulars: [], bench: [], starters: [], relievers: [], reserves: [] };
    for (const pos of B3.data.LINEUP_POS) out.regulars.push(hitter(rng, ctx, { pos: pos, level: level }));
    for (const pos of BENCH) out.bench.push(hitter(rng, ctx, { pos: pos, tier: 'bench', level: level }));
    for (let i = 0; i < 5; i++) out.starters.push(pitcher(rng, ctx, { role: 'SP', level: level }));
    for (const role of PEN) out.relievers.push(pitcher(rng, ctx, { role: role, level: level }));
    // Session 29 (the overall, task 3): the short relievers' roles go by quality, the best overall the closer, the next two
    // the setup men (the roles don't change how a reliever is drawn, so the draws are as before).
    if (B3.overall && B3.overall.WORTH && B3.overall.BASE) {
      const pen = out.relievers.slice(0, PEN.length - 1).map((p, i) => ({ p: p, o: B3.overall.of(p), i: i }));
      pen.sort((a, b) => b.o - a.o || a.i - b.i);
      pen.forEach((x, i) => { x.p.role = PEN[i]; out.relievers[i] = x.p; });
    }
    for (const pos of RESERVE_POS) out.reserves.push(hitter(rng, ctx, { pos: pos, tier: 'reserve', level: level }));
    for (const role of RESERVE_ROLES) out.reserves.push(pitcher(rng, ctx, { role: role, tier: 'reserve', level: level }));
    return out;
  }

  B3.players = { GEN: GEN, context: context, hitter: hitter, pitcher: pitcher, squad: squad };
})(typeof globalThis !== 'undefined' ? globalThis : this);
