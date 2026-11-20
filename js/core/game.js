// Game state and rules, played pitch by pitch through decision points. Logic file: no DOM.
//
// One engine for every game type (owner's choice). The engine stops at each choice and waits for an
// answer; in a simulated game the CPU (B3.manager.cpu) answers all of them, and in a game you play the
// UI answers your side's. The game is plain data plus its B3.rng, so it repeats exactly from a seed.
//
//   const g = B3.game.create({ type, innings, away, home, rng });
//   g.pending                   the decision waiting for an answer (null once g.over)
//   B3.game.answer(g, answer)   applies it and moves on to the next decision
//   B3.game.play(g, [awayController, homeController])   answers everything; a missing controller,
//                               or a missing kind in one, falls back to B3.manager.cpu
//   B3.game.sim(opts)           create + play with the CPU on both sides
//
// Decisions (pending.kind, who answers, the answer):
//   change  fielding side, before every pitch     null, or { pitcher: id } from pending.bullpen
//   steal   batting side, before a pitch, only    null, or { runners: [base, ...] } from pending.runners
//           when a runner can go                  (1 = the runner on first; he can go only if second is
//                                                 open or its runner goes too)
//   pitch   fielding side                         { type, x, z }: a type from pending.pitches; the target
//                                                 in feet (B3.data.ZONE)
//   swing   batting side, with the pitch thrown   { swing: false }, or { swing: true, timing: ms }
//                                                 (ms from perfect timing: below 0 early, above 0 late)
//   tagup   batting side, after a catch, for      { go: true } or { go: false }
//           the lead runner (pending.dist: how deep the catch was, in feet)
//
// Bases are an array [first, second, third] of runners { id, resp, earned } (resp: the pitcher charged
// if he scores). Pitches and swings go through B3.pitch; balls in play, steals and tag-ups through
// B3.ball (step 1.2). After each ball in play, g.lastPlay holds its play script (not in the log).
(function (root) {
  'use strict';
  const B3 = root.B3 = root.B3 || {};

  // Extra innings and the mercy rule by game type (DESIGN.md section 2).
  const TYPES = {
    regular: { placedRunner: true, maxExtras: null, mercy: false },
    spring: { placedRunner: true, maxExtras: null, mercy: false },
    postseason: { placedRunner: false, maxExtras: null, mercy: false },
    quick: { placedRunner: false, maxExtras: 3, mercy: true } // no runner on second: Claude's default
  };
  const MERCY = { runs: 10, innings: 7, gameInnings: 9 };
  const MAX_INNINGS = 60; // a guard against a rules bug, never reached in play

  function fail(msg) { throw new Error('B3.game: ' + msg); }

  function rulesFor(type, innings) {
    const t = TYPES[type];
    if (!t) fail('unknown game type "' + type + '" (regular, spring, postseason or quick)');
    let n = 9;
    if (type === 'quick') {
      n = innings === undefined ? 9 : innings;
      if (n !== 1 && n !== 3 && n !== 9) fail('a Quick Game has 1, 3 or 9 innings');
    } else if (innings !== undefined && innings !== 9) {
      fail('league games have 9 innings');
    }
    return {
      type: type,
      innings: n,
      placedRunner: t.placedRunner,
      lastInning: t.maxExtras === null ? null : n + t.maxExtras, // tied after this inning: a tie
      mercy: t.mercy && n === MERCY.gameInnings ? { runs: MERCY.runs, innings: MERCY.innings } : null
    };
  }

  function has(obj, key) { return Object.prototype.hasOwnProperty.call(obj, key); }

  function checkHands(p, id, label) {
    const H = B3.data.HANDS;
    if (p.bats !== undefined && H.bats.indexOf(p.bats) < 0) fail(label + ': ' + id + ' bats ' + p.bats + ' (R, L or S)');
    if (p.throws !== undefined && H.throws.indexOf(p.throws) < 0) fail(label + ': ' + id + ' throws ' + p.throws + ' (R or L)');
  }

  function checkPitcher(players, id, label) {
    if (!has(players, id)) fail(label + ': pitcher ' + id + ' is not in players');
    const p = players[id].pitches;
    if (!Array.isArray(p) || p.length === 0 || !p.every((c) => has(B3.data.PITCH, c))) {
      fail(label + ': pitcher ' + id + ' needs a list of pitch types from B3.data.PITCHES');
    }
  }

  // A team as the engine keeps it. Input: { id, name, players: {id: {name, bats?, throws?, pitches?,
  // role?, sim?}} (bats R, L or S and throws R or L, both R if missing; sim overrides the rating hooks),
  // lineup: [{ id, pos }] x 9 in batting order, pitcher: id (the starter), bullpen: [id] }.
  function makeSide(t, label) {
    if (!t || typeof t !== 'object' || !t.players || !Array.isArray(t.lineup)) fail(label + ': a team needs players and a lineup');
    if (t.lineup.length !== 9) fail(label + ': the lineup needs 9 players');
    const lineup = [], pos = {}, byPos = {};
    for (const slot of t.lineup) {
      if (!slot || !has(t.players, slot.id)) fail(label + ': lineup player ' + (slot && slot.id) + ' is not in players');
      if (has(pos, slot.id)) fail(label + ': ' + slot.id + ' is in the lineup twice');
      if (B3.data.LINEUP_POS.indexOf(slot.pos) < 0) fail(label + ': bad lineup position ' + slot.pos);
      if (has(byPos, slot.pos)) fail(label + ': two players at ' + slot.pos);
      lineup.push(slot.id); pos[slot.id] = slot.pos; byPos[slot.pos] = slot.id;
    }
    checkPitcher(t.players, t.pitcher, label);
    if (has(pos, t.pitcher)) fail(label + ': the pitcher is in the lineup (the designated hitter bats for him)');
    const bullpen = Array.isArray(t.bullpen) ? t.bullpen.slice() : [];
    const seen = {};
    for (const id of bullpen) {
      checkPitcher(t.players, id, label);
      if (id === t.pitcher || has(pos, id) || has(seen, id)) fail(label + ': bullpen pitcher ' + id + ' is listed twice');
      seen[id] = true;
    }
    const live = {};
    live[t.pitcher] = newLive();
    // The physics inputs (rating hooks) for everyone who can play: the lineup and the staff.
    const inp = {};
    for (const id of lineup.concat([t.pitcher], bullpen)) {
      checkHands(t.players[id], id, label);
      inp[id] = B3.tune.inputs(t.players[id]);
    }
    return {
      id: t.id, name: t.name || t.id, code: t.code || t.id,
      players: t.players,
      lineup: lineup, pos: pos, byPos: byPos,
      spot: 0, // index in lineup of the batter due up
      pitcher: t.pitcher, used: [t.pitcher], bullpen: bullpen,
      live: live, // per pitcher this game: { pitches, outs, runs, bf }, for in-game choices
      inp: inp // per player: B3.tune.inputs (bats, throws, bat, pit, fld)
    };
  }

  function newLive() { return { pitches: 0, outs: 0, runs: 0, bf: 0 }; }

  function bat(g) { return g.teams[g.half]; }
  function fld(g) { return g.teams[1 - g.half]; }
  function batterId(g) { const b = bat(g); return b.lineup[b.spot]; }

  // Every log event starts with the inning (i) and half (h: 0 top, 1 bottom).
  function emit(g, e) {
    const out = { i: g.inning, h: g.half };
    for (const k in e) out[k] = e[k];
    g.log.push(out);
    return out;
  }

  function create(opts) {
    opts = opts || {};
    if (!B3.rng.is(opts.rng)) fail('create needs opts.rng, made by B3.rng.create (there is no default generator)');
    const rules = rulesFor(opts.type || 'regular', opts.innings);
    const g = {
      rules: rules,
      teams: [makeSide(opts.away, 'away'), makeSide(opts.home, 'home')],
      inning: 1, half: 0, outs: 0, balls: 0, strikes: 0,
      bases: [null, null, null],
      score: [0, 0],
      line: [[], []], // runs by inning, per team
      halfRuns: 0,
      walkoff: false,
      log: [],
      over: false, result: null,
      pending: null,
      steal: null, // runners going on this pitch: [{ from: base index, runner }]
      pitch: null, // the pitch thrown, waiting on the swing decision
      play: null, // a caught ball waiting on the tag-up decision
      lastPlay: null, // the last ball in play: { i, h, b, res, script } (the script is for the field view)
      rng: opts.rng
    };
    if (g.teams[0].id === g.teams[1].id) fail('the two teams need different ids');
    startHalf(g);
    askChange(g);
    return g;
  }

  function startHalf(g) {
    g.outs = 0; g.balls = 0; g.strikes = 0; g.halfRuns = 0;
    g.bases = [null, null, null];
    if (g.rules.placedRunner && g.inning > g.rules.innings) {
      // The runner on second is the batter before this inning's leadoff hitter. His run is unearned.
      const b = bat(g);
      const id = b.lineup[(b.spot + 8) % 9];
      g.bases[1] = { id: id, resp: fld(g).pitcher, earned: false };
      emit(g, { e: 'placed', r: id, base: 2 });
    }
  }

  // ---- Decisions ----

  function askChange(g) {
    const f = fld(g);
    g.pending = { kind: 'change', side: 1 - g.half, pitcher: f.pitcher, bullpen: f.bullpen.slice() };
  }

  function stealOptions(g) {
    const b = g.bases, out = [];
    if (b[0] && (!b[1] || !b[2])) out.push(1); // second open, or its runner can go too
    if (b[1] && !b[2]) out.push(2); // no steal of home (Claude's default)
    return out;
  }

  function askStealOrPitch(g) {
    const runners = stealOptions(g);
    if (runners.length) g.pending = { kind: 'steal', side: g.half, runners: runners };
    else askPitch(g);
  }

  function askPitch(g) {
    const f = fld(g);
    g.pending = {
      kind: 'pitch', side: 1 - g.half, pitcher: f.pitcher, batter: batterId(g),
      pitches: f.players[f.pitcher].pitches.slice(), balls: g.balls, strikes: g.strikes
    };
  }

  function askSwing(g) {
    const p = g.pitch;
    g.pending = {
      kind: 'swing', side: g.half, batter: batterId(g), balls: g.balls, strikes: g.strikes,
      pitch: { type: p.type, speed: p.speed, x: p.x, z: p.z, zone: p.zone, ms: p.ms }
    };
  }

  function isObj(a) { return a !== null && typeof a === 'object'; }

  function answer(g, a) {
    const d = g.pending;
    if (!d) fail('answer: no decision is waiting (the game is over)');
    switch (d.kind) {
      case 'change': {
        let id = null;
        if (a !== null && a !== undefined) {
          if (!isObj(a)) fail('change: answer null or { pitcher: id }');
          if (a.pitcher !== undefined && a.pitcher !== null) {
            if (d.bullpen.indexOf(a.pitcher) < 0) fail('change: ' + a.pitcher + ' is not an available reliever');
            id = a.pitcher;
          }
        }
        g.pending = null;
        if (id !== null) bringIn(g, id);
        askStealOrPitch(g);
        break;
      }
      case 'steal': {
        let bases = [];
        if (a !== null && a !== undefined) {
          if (!isObj(a) || !Array.isArray(a.runners)) fail('steal: answer null or { runners: [base, ...] }');
          bases = a.runners;
        }
        for (const base of bases) if (d.runners.indexOf(base) < 0) fail('steal: no runner can go from base ' + base);
        if (bases.indexOf(1) >= 0 && g.bases[1] && bases.indexOf(2) < 0) fail('steal: the runner on first can go only if the runner on second goes too');
        g.pending = null;
        g.steal = bases.length ? bases.map((base) => ({ from: base - 1, runner: g.bases[base - 1] })) : null;
        askPitch(g);
        break;
      }
      case 'pitch': {
        if (!isObj(a) || d.pitches.indexOf(a.type) < 0) fail('pitch: the type must be one of ' + d.pitches.join(', '));
        if (!Number.isFinite(a.x) || !Number.isFinite(a.z)) fail('pitch: the target needs numbers x and z');
        g.pending = null;
        g.pitch = B3.pitch.throw(g, a);
        askSwing(g);
        break;
      }
      case 'swing': {
        if (!isObj(a) || typeof a.swing !== 'boolean') fail('swing: answer { swing: false } or { swing: true, timing: ms }');
        if (a.swing && !Number.isFinite(a.timing)) fail('swing: a swing needs a timing in ms');
        g.pending = null;
        const out = B3.pitch.resolve(g, g.pitch, a);
        if (out.r === 'X') {
          const play = B3.ball.inPlay(g, out.contact, g.steal);
          if (play.foul) { out.r = 'F'; g.lastPlay = { i: g.inning, h: g.half, b: batterId(g), res: 'F', script: play.script }; }
          else out.play = play;
        }
        pitchDone(g, a, out);
        if (!g.pending) settle(g);
        break;
      }
      case 'tagup': {
        if (!isObj(a) || typeof a.go !== 'boolean') fail('tagup: answer { go: true } or { go: false }');
        g.pending = null;
        const play = g.play;
        g.play = null;
        const tag = a.go ? { from: d.from - 1, ok: B3.ball.tagup(g, play, d.from) } : null;
        finishPlay(g, play, tag);
        settle(g);
        break;
      }
      default:
        fail('answer: unknown decision ' + d.kind);
    }
    if (!g.over && !g.pending) askChange(g);
    return g.pending;
  }

  function bringIn(g, id) {
    const f = fld(g);
    f.bullpen.splice(f.bullpen.indexOf(id), 1);
    emit(g, { e: 'sub', side: 1 - g.half, out: f.pitcher, in: id });
    f.pitcher = id;
    f.used.push(id);
    f.live[id] = newLive();
  }

  // ---- Pitches ----

  function round2(x) { return Math.round(x * 100) / 100; }

  function pitchDone(g, a, out) {
    const f = fld(g), p = g.pitch;
    f.live[f.pitcher].pitches++;
    const ev = { e: 'pitch', p: f.pitcher, b: batterId(g), t: p.type, v: p.speed, x: round2(p.x), z: round2(p.z), c: g.balls + '-' + g.strikes, r: out.r };
    if (a.swing) ev.tm = a.timing;
    if (out.r === 'X' && out.contact) { ev.ev = out.contact.ev; ev.la = out.contact.la; ev.sp = out.contact.sp; }
    emit(g, ev);
    g.pitch = null;
    const steal = g.steal;
    g.steal = null;
    switch (out.r) {
      case 'B': // ball
        g.balls++;
        if (g.balls === 4) walk(g, steal, p); else runSteal(g, steal, p);
        break;
      case 'C': // called strike
      case 'S': // swinging strike
        g.strikes++;
        if (g.strikes === 3) strikeout(g); // no dropped third strike (Claude's default)
        runSteal(g, steal, p);
        break;
      case 'F': // foul: runners go back
        if (g.strikes < 2) g.strikes++;
        break;
      case 'X': // in play (runners who were stealing got their jump in B3.ball)
        inPlay(g, out.play);
        break;
      default:
        fail('the pitch result must be B, C, S, F or X, not ' + out.r);
    }
  }

  function newPA(g, res) {
    const f = fld(g);
    return { e: 'pa', b: batterId(g), p: f.pitcher, res: res, out: 0, rbi: 0, sc: [] };
  }

  // Ends a plate appearance: logs it, moves the lineup on, resets the count.
  function finishPA(g, pa) {
    const b = bat(g), f = fld(g);
    pa.o = g.outs;
    pa.bs = g.bases.map((r) => (r ? r.id : null));
    emit(g, pa);
    f.live[pa.p].bf++;
    b.spot = (b.spot + 1) % 9;
    g.balls = 0; g.strikes = 0;
  }

  function addOuts(g, n) {
    g.outs += n;
    const f = fld(g);
    f.live[f.pitcher].outs += n;
  }

  function scoreRun(g, pa, runner) {
    g.score[g.half]++;
    g.halfRuns++;
    pa.sc.push({ r: runner.id, p: runner.resp, er: runner.earned ? 1 : 0 });
    fld(g).live[runner.resp].runs++;
    if (g.half === 1 && g.inning >= g.rules.innings && g.score[1] > g.score[0]) g.walkoff = true;
  }

  function strikeout(g) {
    const pa = newPA(g, 'K');
    pa.out = 1;
    addOuts(g, 1);
    finishPA(g, pa);
  }

  function walk(g, steal, pitch) {
    const pa = newPA(g, 'BB');
    const b = g.bases;
    if (b[0]) {
      if (b[1]) {
        if (b[2]) { scoreRun(g, pa, b[2]); pa.rbi++; }
        b[2] = b[1];
      }
      b[1] = b[0];
    }
    b[0] = { id: pa.b, resp: pa.p, earned: true };
    finishPA(g, pa);
    runSteal(g, steal, pitch); // a runner who wasn't forced can still be thrown out
  }

  // Steals of the runners still on the base they left. In a double steal the catcher throws to the lead
  // runner; if he is out, the trailing runner moves up without a stolen base (the scoring rule).
  function runSteal(g, steal, pitch) {
    if (!steal || g.outs >= 3 || g.walkoff || g.over) return;
    const going = steal.filter((s) => g.bases[s.from] === s.runner).sort((a, b) => b.from - a.from);
    if (!going.length) return;
    const f = fld(g), lead = going[0];
    const safe = B3.ball.steal(g, lead.from + 1, pitch);
    if (safe) {
      for (const s of going) {
        g.bases[s.from] = null;
        g.bases[s.from + 1] = s.runner;
        emit(g, { e: 'sb', r: s.runner.id, from: s.from + 1, p: f.pitcher });
      }
    } else {
      g.bases[lead.from] = null;
      addOuts(g, 1);
      emit(g, { e: 'cs', r: lead.runner.id, from: lead.from + 1, p: f.pitcher, o: g.outs });
      if (g.outs < 3) {
        for (const s of going.slice(1)) {
          g.bases[s.from] = null;
          g.bases[s.from + 1] = s.runner;
          emit(g, { e: 'adv', r: s.runner.id, from: s.from + 1, to: s.from + 2 });
        }
      }
    }
  }

  // ---- Balls in play ----
  // A play from the resolver: { code, bb, fielder, caught, batter, runners, runsCount? }
  //   code     1B 2B 3B HR (hits), GO FO LO PO (outs: ground, fly, line, pop), DP (grounded into a double
  //            play), FC (fielder's choice), E (reached on an error, charged to fielder)
  //   batter   where the batter ends: 0 out, 1-3 a base, 4 scored
  //   runners  [first, second, third]: where each runner on base ends (same numbers), null for no runner
  //   caught   caught in the air, so the lead runner may tag up
  //   runsCount  only for plays that end the inning: true when the runs scored before the third out

  const HITS = { '1B': 1, '2B': 2, '3B': 3, HR: 4 };
  const CODES = ['1B', '2B', '3B', 'HR', 'GO', 'FO', 'LO', 'PO', 'DP', 'FC', 'E'];

  function checkPlay(g, play) {
    if (!isObj(play) || CODES.indexOf(play.code) < 0) fail('bad play code ' + (play && play.code));
    if (!Array.isArray(play.runners) || play.runners.length !== 3) fail('a play needs runners [first, second, third]');
    const ok = (d) => Number.isInteger(d) && d >= 0 && d <= 4;
    if (!ok(play.batter)) fail('bad batter destination ' + play.batter);
    let outs = play.batter === 0 ? 1 : 0;
    const safe = play.batter === 0 ? [] : [{ from: 0, to: play.batter }]; // runners who end safe or score
    for (let i = 0; i < 3; i++) {
      const d = play.runners[i];
      if ((d === null) !== (g.bases[i] === null)) fail('the play moves a runner who is not on base ' + (i + 1) + ', or misses one');
      if (d === null) continue;
      if (!ok(d) || (d !== 0 && d < i + 1)) fail('bad destination ' + d + ' for the runner on base ' + (i + 1));
      if (d === 0) outs++; else safe.push({ from: i + 1, to: d });
    }
    // Runners keep their order: one behind another ends behind him, unless both score.
    for (const a of safe) {
      for (const b of safe) {
        if (a.from < b.from && !(a.to === 4 && b.to === 4) && a.to >= b.to) fail('a runner passes or meets the runner ahead of him');
      }
    }
    if (g.outs + outs > 3) fail('the play makes more than 3 outs');
    const reached = play.batter >= 1;
    if (HITS[play.code] && !reached) fail(play.code + ' needs the batter safe');
    if (play.code === 'HR' && play.batter !== 4) fail('a home run scores the batter');
    if (['GO', 'FO', 'LO', 'PO'].indexOf(play.code) >= 0 && reached) fail(play.code + ' needs the batter out');
    if (play.code === 'DP' && outs < 2) fail('a double play needs 2 outs');
    if (play.code === 'FC' && (!reached || outs < 1)) fail('a fielder\'s choice needs the batter safe and a runner out');
    if (play.code === 'E' && !reached) fail('an error play needs the batter safe');
    return outs;
  }

  function inPlay(g, play) {
    const outs = checkPlay(g, play);
    if (play.caught && g.outs + outs < 3) {
      let lead = -1;
      for (let i = 2; i >= 0; i--) if (g.bases[i] && play.runners[i] === i + 1) { lead = i; break; }
      if (lead >= 0) {
        g.play = play;
        g.pending = { kind: 'tagup', side: g.half, runner: g.bases[lead].id, from: lead + 1, code: play.code, fielder: play.fielder,
          dist: play.meta ? play.meta.dist : null }; // dist: feet from home plate where the ball was caught
        return;
      }
    }
    finishPlay(g, play, null);
  }

  function finishPlay(g, play, tag) {
    const pa = newPA(g, play.code);
    pa.bb = play.bb;
    pa.fl = play.fielder;
    const before = g.bases.slice();
    const dest = play.runners.slice();
    if (tag) {
      dest[tag.from] = tag.ok ? tag.from + 2 : 0;
      pa.tag = { r: before[tag.from].id, from: tag.from + 1, ok: tag.ok ? 1 : 0 };
    }
    let outs = play.batter === 0 ? 1 : 0;
    for (let i = 0; i < 3; i++) if (dest[i] === 0) outs++;
    const runsCount = g.outs + outs < 3 || play.runsCount === true;
    // The batter-runner. On a fielder's choice he takes over the charge of the runner put out.
    let br = null;
    if (play.batter > 0) {
      br = { id: pa.b, resp: pa.p, earned: play.code !== 'E' };
      if (play.code === 'FC') {
        for (let i = 0; i < 3; i++) if (before[i] && dest[i] === 0) { br.resp = before[i].resp; break; }
      }
    }
    pa.out = outs;
    addOuts(g, outs);
    g.bases = [null, null, null];
    // Runs, lead runner first. On a walk-off only the runs needed to win count, unless it's a home run.
    let winFrom = null; // the base the winning run started from (0 for the batter)
    const scorers = [];
    for (let i = 2; i >= 0; i--) if (before[i] && dest[i] === 4) scorers.push({ runner: before[i], from: i + 1 });
    if (br && play.batter === 4) scorers.push({ runner: br, from: 0 });
    if (runsCount) {
      for (const s of scorers) {
        if (g.walkoff && play.code !== 'HR') break;
        scoreRun(g, pa, s.runner);
        if (g.walkoff && winFrom === null) winFrom = s.from;
      }
    }
    // RBI on every run except on a double play or an error (Claude's default for errors).
    if (play.code !== 'DP' && play.code !== 'E') pa.rbi = pa.sc.length;
    // Sac fly: a runner tags from third and scores on a fly or a line drive to the outfield.
    if (tag && tag.ok && tag.from === 2 && runsCount &&
        (play.code === 'FO' || (play.code === 'LO' && B3.data.OUTFIELD.indexOf(play.fielder) >= 0))) pa.res = 'SF';
    // A walk-off hit counts only as many bases as the winning runner moved (the scoring rule).
    if (g.walkoff && winFrom !== null && HITS[play.code] && play.code !== 'HR') {
      const bases = Math.min(HITS[play.code], 4 - winFrom);
      pa.res = ['', '1B', '2B', '3B'][bases];
    }
    if (!g.walkoff) {
      for (let i = 0; i < 3; i++) if (before[i] && dest[i] >= 1 && dest[i] <= 3) g.bases[dest[i] - 1] = before[i];
      if (br && play.batter <= 3) g.bases[play.batter - 1] = br;
    }
    finishPA(g, pa);
    g.lastPlay = { i: pa.i, h: pa.h, b: pa.b, res: pa.res, script: play.script || null };
  }

  // ---- Innings and the end of the game ----

  function settle(g) {
    if (g.over) return;
    if (g.walkoff) return endGame(g, 'walkoff', true);
    const m = g.rules.mercy;
    if (m && g.half === 1 && g.inning >= m.innings && g.score[1] - g.score[0] >= m.runs) return endGame(g, 'mercy', true);
    if (g.outs >= 3) endHalf(g);
  }

  function closeHalf(g) {
    let lob = 0;
    for (const r of g.bases) if (r) lob++;
    emit(g, { e: 'half', runs: g.halfRuns, outs: g.outs, lob: lob });
    g.line[g.half].push(g.halfRuns);
  }

  // The mercy rule: a 10-run lead once the trailing team has batted 7 times (Claude's reading).
  function mercyAfterHalf(g) {
    const m = g.rules.mercy;
    if (!m) return false;
    const awayDone = g.inning, homeDone = g.half === 0 ? g.inning - 1 : g.inning;
    const lead = g.score[0] - g.score[1];
    if (lead >= m.runs) return homeDone >= m.innings;
    if (-lead >= m.runs) return awayDone >= m.innings;
    return false;
  }

  function endHalf(g) {
    closeHalf(g);
    const s = g.score, r = g.rules, i = g.inning;
    if (g.half === 0) {
      if (i >= r.innings && s[1] > s[0]) return endGame(g, 'final', false); // home doesn't need to bat
      if (mercyAfterHalf(g)) return endGame(g, 'mercy', false);
      g.half = 1;
    } else {
      if (i >= r.innings && s[0] !== s[1]) return endGame(g, 'final', false);
      if (mercyAfterHalf(g)) return endGame(g, 'mercy', false);
      if (r.lastInning !== null && i >= r.lastInning) return endGame(g, 'tie', false);
      g.inning++;
      g.half = 0;
      if (g.inning > MAX_INNINGS) fail('the game passed ' + MAX_INNINGS + ' innings');
    }
    startHalf(g);
  }

  function endGame(g, reason, closeOpenHalf) {
    if (closeOpenHalf) closeHalf(g);
    g.over = true;
    g.pending = null; g.pitch = null; g.play = null; g.steal = null;
    const s = g.score;
    g.result = { winner: s[0] > s[1] ? 0 : s[1] > s[0] ? 1 : null, reason: reason, score: s.slice(), innings: g.inning };
    emit(g, { e: 'end', reason: reason, score: s.slice() });
  }

  // ---- Playing a whole game ----

  function play(g, controllers) {
    controllers = controllers || [];
    const cpu = B3.manager.cpu;
    let guard = 0;
    while (!g.over) {
      const d = g.pending;
      const c = controllers[d.side];
      const fn = c && typeof c[d.kind] === 'function' ? c : cpu;
      answer(g, fn[d.kind](d, g));
      if (++guard > 200000) fail('play: the game did not end');
    }
    return g;
  }

  B3.game = {
    TYPES: Object.keys(TYPES),
    rules: rulesFor,
    create: create,
    answer: answer,
    play: play,
    sim: function (opts) { return play(create(opts)); },
    batter: batterId
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
