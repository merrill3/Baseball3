// Balls in play, steals and tag-ups: the ball's flight, fielders, throws and runners. Logic file: no DOM.
//
//   B3.ball.inPlay(g, contact, steal)  a play for B3.game (shape in game.js "Balls in play") plus
//                                      script, or { foul: true, script } for a foul nobody caught.
//                                      contact is { ev, la, sp } from B3.pitch; steal lists the runners
//                                      who were going on the pitch ([{ from, runner }] or null).
//   B3.ball.steal(g, from, pitch)      true if the runner stealing from base `from` (1 or 2) is safe
//   B3.ball.stealOdds(g, from)         his chance before the pitch, for the CPU's choice (step 1.4)
//   B3.ball.tagup(g, play, from)       true if the runner tagging from `from` is safe; adds to the script
//   B3.ball.tagupOdds(g, play, from, err)  his chance (err: his judgment's error, s), for the CPU (step 1.4)
//   B3.ball.flight(contact)            the ball's path: { pts: [[t, x, y, z]], land, hr, wall, stop }
//
// Every rating hook it uses is an input from B3.ratings.inputs (B3.tune.inputs): fielders' Range (react, route), Hands
// (hands, release), Arm (arm) and catchers' arm and release on steals; runners' Speed (speed) and
// Baserunning (read, jump, judge). Times are seconds from contact; positions are
// feet on the field (B3.data.FIELD: home at 0, 0; y toward center; x toward first base).
//
// The play script (for the field view in M4): timed positions for the ball, every fielder and every
// runner, plus events, all from the same times that decide the play:
//   { t, ball: [[t, x, y, z]], fielders: { pos: [[t, x, y]] }, runners: [{ id, from, end, path: [[t, x, y]] }],
//     events: [{ t, e, pos?, id?, base?, dive? }] }
// Between two points everything moves in a straight line, and a track holds its last point until the
// script's end t. Runners' `from` is 0 for the batter, `end` is the base they end on (4 scored) or 0 (out);
// on an uncaught foul, `end` is null. Events: contact, catch, field (dive: true on a diving catch or
// stop), throw (pos, base), out (id, base), safe, score, error, wall, land, hr, foul. What
// tools/tests/script.test.js checks on every play: times only go forward; nobody runs faster than his
// top speed and the ball never beats its exit speed or the thrower's arm; every runner ends where the
// play says (after a tag-up too); at each out the ball and a fielder are on that base and the runner is
// on the base path short of it; at each catch or stop the fielder is within his glove's reach of the
// ball (plus BALL.diveReach on a dive).
(function (root) {
  'use strict';
  const B3 = root.B3 = root.B3 || {};

  const MPH = 5280 / 3600, G = 32.174, D2R = Math.PI / 180;

  function T() { return B3.tune; }
  function dist(a, b) { const x = a[0] - b[0], y = a[1] - b[1]; return Math.sqrt(x * x + y * y); }
  function len(x, y) { return Math.sqrt(x * x + y * y); }
  function lerp(a, b, u) { return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]; }
  function base(n) { return B3.data.FIELD.bases[n % 4]; } // 1 first, 2 second, 3 third, 0 or 4 home
  function r2(x) { return Math.round(x * 100) / 100; }
  function r1(x) { return Math.round(x * 10) / 10; }
  function logistic(x) { return 1 / (1 + Math.exp(-x)); }
  function isNum(x) { return typeof x === 'number'; }

  // Seconds to cover d feet, reaching top speed v at the accel rate, starting at speed v0.
  function runTime(d, v, v0) {
    if (d <= 0) return 0;
    const a = T().BALL.accel;
    v0 = Math.min(v0 || 0, v);
    const dAcc = (v * v - v0 * v0) / (2 * a);
    if (d <= dAcc) return (Math.sqrt(v0 * v0 + 2 * a * d) - v0) / a;
    return (v - v0) / a + (d - dAcc) / v;
  }

  // Feet covered in t seconds, starting at speed v0 (the inverse of runTime).
  function runDist(t, v, v0) {
    if (t <= 0) return 0;
    const a = T().BALL.accel;
    v0 = Math.min(v0 || 0, v);
    const tA = (v - v0) / a;
    return t <= tA ? v0 * t + a * t * t / 2 : (v * v - v0 * v0) / (2 * a) + v * (t - tA);
  }

  // Seconds for a throw of d feet at arm mph. Long throws arc, bounce or go through a cutoff man, so
  // their average speed falls smoothly from throwShort (up to 100 ft) to throwLong (300 ft and more).
  function throwTime(d, arm) {
    const B = T().BALL;
    const u = Math.min(1, Math.max(0, (d - 100) / 200));
    return 0.05 + d / (arm * MPH * (B.throwShort + (B.throwLong - B.throwShort) * u));
  }

  // ---- The ball's flight ----

  // Integrates the batted ball in the air (drag, backspin lift) and through its bounces; once it rolls,
  // it slows at a steady rate (worked out exactly). It travels along its spray direction (no sideways
  // curve), stops at the wall, and is kept every BALL.sample seconds as [t, x, y, z, r] (r: feet from
  // home plate; raw numbers, which the script rounds).
  function flight(c) {
    const B = T().BALL, F = B3.data.FIELD;
    const v = c.ev * MPH, la = c.la * D2R, dir = c.sp * D2R;
    const ux = Math.sin(dir), uy = Math.cos(dir);
    let fair = Math.abs(c.sp) <= 45; // and it must come down in front of home plate (step 1.4: a pop-up
                                     // straight up drifts back on its backspin and can land behind it)
    const fence = B3.data.fenceAt(c.sp);
    const lift = c.la > 0 ? B.lift * Math.min(1, c.la / B.liftFull) : 0; // backspin grows with launch angle
    let vr = v * Math.cos(la), vh = v * Math.sin(la), r = 0, h = B.startHeight, t = 0;
    let land = null, hr = null, wall = null, stop = null;
    const pts = [[0, 0, 0, h, 0]];
    const dt = B.dt, every = B.sample;
    let next = every;
    const keep = () => pts.push([t, r * ux, r * uy, h, Math.abs(r)]);
    // In the air and bouncing.
    while (t < B.maxTime) {
      const s = Math.sqrt(vr * vr + vh * vh);
      const up = land ? 0 : lift; // spin's lift counts only before the first bounce
      vr += (-B.drag * s * vr - up * s * vh) * dt;
      vh += (-B.drag * s * vh + up * s * vr - G) * dt;
      r += vr * dt; h += vh * dt; t += dt;
      if (fair && !hr && !wall && r >= fence) {
        if (h > F.wall && !land) hr = { t: t, h: h };
        else { wall = { t: t, h: h }; r = fence; vr = -Math.abs(vr) * B.wallBack; vh = Math.min(vh, 0); }
      }
      if (h <= 0) {
        h = 0;
        if (!land) { land = { t: t, r: r, x: r * ux, y: r * uy }; if (r < 0) fair = false; }
        if (hr || !fair) { keep(); break; } // out of play
        vh = -vh * B.bounceUp; vr *= B.bounceOn;
        if (vh < B.rolling) break; // it rolls from here
      }
      if (t >= next - 1e-9) { keep(); next += every; }
    }
    if (fair && !hr) {
      // Rolling: speed falls at rollDecel until it stops (or reaches the wall and dies there).
      const a = B.rollDecel, v0 = Math.abs(vr), sign = vr < 0 ? -1 : 1;
      const tStop = v0 / a, r0 = r, t0 = t;
      const at = (tt) => r0 + sign * (v0 * tt - a * tt * tt / 2);
      let end = tStop, rEnd = at(tStop);
      if (!wall && sign > 0 && rEnd > fence) {
        // It rolls to the wall: stopped there (a rolling ball barely comes off it).
        end = (v0 - Math.sqrt(Math.max(0, v0 * v0 - 2 * a * (fence - r0)))) / a;
        rEnd = fence;
        wall = { t: t0 + end, h: 0 };
      }
      while (next < t0 + end) { const rr = at(next - t0); pts.push([next, rr * ux, rr * uy, 0, Math.abs(rr)]); next += every; }
      t = t0 + end; r = rEnd; h = 0;
      stop = { t: t, r: r };
      keep();
    }
    return { pts: pts, land: land, hr: hr, wall: wall, stop: stop, fair: fair, fence: fence, ux: ux, uy: uy };
  }

  // ---- The players on this play ----

  // The fielders, where they stand for this batter (shaded toward his pull side), and their inputs.
  function defense(g, bats) {
    const f = g.teams[1 - g.half], F = B3.data.FIELD, POS = T().POS;
    const pull = bats === 'L' ? 1 : -1; // right-handed batters pull to left field (minus spray)
    const out = {};
    for (const pos of B3.data.FIELDERS) {
      const id = pos === 'P' ? f.pitcher : f.byPos[pos];
      const inp = f.inp[id];
      let at = F.pos[pos];
      if (pos !== 'P' && pos !== 'C') {
        const d = (B3.data.OUTFIELD.indexOf(pos) >= 0 ? F.shade.outfield : F.shade.infield) * pull;
        const r = len(at[0], at[1]), a = Math.atan2(at[0], at[1]) / D2R + d;
        at = B3.data.polar(r, a);
      }
      const P = POS[pos];
      out[pos] = {
        pos: pos, id: id, at: at,
        react: (isNum(inp.fld.react) ? inp.fld.react : P[0]) * (isNum(inp.fld.first) ? inp.fld.first : 1),
        speed: inp.run.speed * inp.fld.route,
        arm: (isNum(inp.fld.arm) ? inp.fld.arm : P[1]) + (isNum(inp.fld.armPlus) ? inp.fld.armPlus : 0),
        xfer: Math.max(0.2, P[2] - inp.fld.release),
        release: inp.fld.release,
        hands: inp.fld.hands
      };
    }
    return out;
  }

  // Seconds for a fielder to get the ball at a point: he runs until it is within his glove's reach.
  function reachT(fd, pt) { return fd.react + runTime(dist(fd.at, pt) - T().BALL.glove, fd.speed, 0); }

  // Where he stands when he gets it: on his line to the ball, a glove's reach short of it.
  function reachPt(fd, pt) {
    const d = dist(fd.at, pt), g = T().BALL.glove;
    return d <= g ? fd.at : lerp(fd.at, pt, (d - g) / d);
  }

  // Feet a fielder is still short of a glove's reach from pt at time t (0 if he is there): a dive
  // covers up to BALL.diveReach more.
  function diveGap(fd, pt, t) {
    return Math.max(0, dist(fd.at, pt) - T().BALL.glove - runDist(t - fd.react, fd.speed, 0));
  }

  // The script: the fielder runs to the ball at pt and has it at time t. On a dive he hasn't got there
  // by t: he is as far as he could run, and the dive reaches the rest.
  function fieldAt(S, fd, pt, t) {
    const d = dist(fd.at, pt);
    const run = Math.min(Math.max(0, d - T().BALL.glove), runDist(t - fd.react, fd.speed, 0));
    const q = d > 0 ? lerp(fd.at, pt, run / d) : fd.at;
    S.fielder(fd.pos, Math.min(t, reachT(fd, pt)), q);
    S.fielder(fd.pos, t, q);
    return q;
  }

  // The script: a fielder covering base b is on the bag at time t.
  function coverAt(S, cv, b, t) {
    S.fielder(cv.fd.pos, cv.t, base(b));
    if (t !== undefined) S.fielder(cv.fd.pos, t, base(b));
  }

  // The batter and the runners at contact. Runners who were stealing are already on their way.
  function offense(g, steal, pitch) {
    const B = T().BALL, bt = g.teams[g.half];
    const id = bt.lineup[bt.spot];
    const w = B3.pitch.who(g);
    const out = [];
    for (let i = 0; i < 3; i++) {
      const rn = g.bases[i];
      if (!rn) { out.push(null); continue; }
      const inp = bt.inp[rn.id].run;
      const going = !!(steal && steal.some((s) => s.from === i && s.runner === rn));
      let s0 = B.lead[i], v0 = 0;
      if (going) {
        // He broke with the pitcher's first move: by contact he is well down the line at full speed.
        const tRun = T().STEAL.delivery + (pitch ? pitch.ms / 1000 : 0.4) - inp.jump;
        s0 = Math.min(80, B.lead[i] + T().STEAL.secondLead[Math.min(i, 1)] + runDist(tRun, inp.speed));
        v0 = inp.speed;
      }
      out.push({ from: i + 1, id: rn.id, run: inp, going: going, s0: s0, v0: v0 });
    }
    const inp = bt.inp[id].run;
    const batter = { from: 0, id: id, run: inp, going: false, s0: 0, v0: 0, box: B.batterBox - (w.bats === 'L' ? B.lefty : 0) };
    return { runners: out, batter: batter };
  }

  // Seconds for a runner who starts at time t0 (at s feet past his base, moving at v0) to reach base b.
  function arrive(rn, b, t0, s, v0) {
    const B = T().BALL;
    const d = (b - rn.from) * 90 - s;
    return t0 + runTime(d, rn.run.speed, v0) + Math.max(0, b - rn.from - 1) * B.turn;
  }

  // A point s feet past base n toward the next one.
  function pathPt(n, s) {
    const k = Math.floor(s / 90), u = (s - 90 * k) / 90;
    return lerp(base(n + k), base(n + k + 1), u);
  }

  // ---- The play script ----

  function Script(fielders) {
    this.ball = [[0, 0, 0, T().BALL.startHeight]];
    this.fielders = {};
    for (const pos in fielders) this.fielders[pos] = [[0, r1(fielders[pos].at[0]), r1(fielders[pos].at[1])]];
    this.runners = [];
    this.events = [{ t: 0, e: 'contact' }];
    this.t = 0;
  }
  Script.prototype = {
    // Adds a point to a track, keeping time in order.
    put: function (track, t, p) {
      const last = track[track.length - 1];
      t = r2(Math.max(t, last[0]));
      const q = [t, r1(p[0]), r1(p[1])];
      if (p.length > 2) q.push(r1(p[2]));
      if (last[0] === t && last[1] === q[1] && last[2] === q[2]) return;
      track.push(q);
      if (t > this.t) this.t = t;
    },
    fielder: function (pos, t, p) { this.put(this.fielders[pos], t, p); },
    ballAt: function (t, p, z) { this.put(this.ball, t, [p[0], p[1], z || 0]); },
    flight: function (path, until) {
      for (const p of path.pts) {
        if (p[0] > until + 1e-9) break;
        this.put(this.ball, p[0], [p[1], p[2], p[3]]);
      }
    },
    // The ball travels from its last point to p, arriving at time t (a throw or a carry).
    throwTo: function (t, p, z) { this.put(this.ball, t, [p[0], p[1], z || 4]); },
    event: function (t, e, extra) {
      const ev = { t: r2(t), e: e };
      for (const k in extra) ev[k] = extra[k];
      this.events.push(ev);
      if (ev.t > this.t) this.t = ev.t;
    },
    runner: function (rn, start) {
      const tr = { id: rn.id, from: rn.from, end: null, path: [[0, r1(start[0]), r1(start[1])]] };
      this.runners.push(tr);
      return tr;
    },
    done: function () {
      this.events.sort((a, b) => a.t - b.t);
      return { t: r2(this.t), ball: this.ball, fielders: this.fielders, runners: this.runners, events: this.events };
    }
  };

  // A runner's track: from his start (s feet past his base, moving at v0, from time t0) to each base he
  // reaches, ending on base endBase, or put out on the way to base out.base at time out.t.
  function runTrack(S, rn, t0, times, endBase, out, s, v0) {
    s = s === undefined ? rn.s0 : s;
    v0 = v0 === undefined ? rn.v0 : v0;
    const begin = rn.from === 0 ? base(0) : pathPt(rn.from, rn.s0);
    const tr = S.runner(rn, begin);
    if (s !== rn.s0) S.put(tr.path, t0, pathPt(rn.from, s));
    else S.put(tr.path, t0, begin);
    let lastT = t0, lastS = s;
    for (let b = rn.from + 1; b <= endBase; b++) {
      lastT = times(b); lastS = (b - rn.from) * 90;
      S.put(tr.path, lastT, base(b));
    }
    if (!out && endBase === rn.from && s > 0.5) {
      // He holds: back to his bag.
      S.put(tr.path, t0 + 0.3 + s / (0.8 * rn.run.speed), base(rn.from));
    }
    if (out) {
      // Where he is when the tag or force is made (never past the base).
      const cap = (out.base - rn.from) * 90 - 1.5;
      const moved = lastT === t0 ? runDist(out.t - t0, rn.run.speed, v0) : rn.run.speed * Math.max(0, out.t - lastT);
      S.put(tr.path, out.t, pathPt(rn.from, Math.max(lastS, Math.min(cap, lastS + moved))));
      tr.end = 0;
    } else {
      tr.end = endBase;
    }
    if (tr.end === 4 && endBase > rn.from) S.event(times(4), 'score', { id: rn.id });
    return tr;
  }

  // ---- Catching a ball in the air ----

  // Can a ball at this point be caught in foul ground?
  function foulCatchable(x, y) {
    const B = T().BALL;
    const r = len(x, y);
    if (y < 0) return r <= B.backstop;
    const off = Math.abs(Math.atan2(x, y)) / D2R - 45; // degrees past the line
    return off <= 0 || (r * Math.sin(off * D2R) <= B.foulRoom && r <= 330);
  }

  // The fielder with the best chance at the ball before it lands: { fd, margin, k } or null.
  function bestCatch(path, D, foul) {
    const B = T().BALL;
    const landT = path.land ? path.land.t : Infinity;
    let best = null;
    for (const pos in D) {
      const fd = D[pos];
      let m = -Infinity, at = -1, first = -1;
      for (let k = 1; k < path.pts.length; k++) {
        const p = path.pts[k];
        if (p[0] > landT + 1e-9) break;
        const r = p[4];
        const reach = path.fair && r > path.fence - 6 ? B.wallReach : B.reach;
        if (p[3] > reach) continue;
        if (path.fair && r > path.fence + 1) continue; // over the wall
        if (foul && !foulCatchable(p[1], p[2])) continue;
        const mk = p[0] - reachT(fd, [p[1], p[2]]);
        if (mk < 0 && diveGap(fd, [p[1], p[2]], p[0]) > B.diveReach) continue; // out of reach, even diving
        if (mk >= 0 && first < 0) first = k;
        if (mk > m) { m = mk; at = k; }
      }
      if (at < 0) continue;
      const pref = (B3.data.OUTFIELD.indexOf(pos) >= 0 ? 0.3 : 0) - (pos === 'P' ? 0.4 : 0) - (pos === 'C' ? 0.2 : 0);
      const cand = { fd: fd, margin: m, k: first >= 0 ? first : at, score: Math.min(m, 1.5) + pref };
      if (!best || cand.score > best.score) best = cand;
    }
    return best;
  }

  // ---- Fielding the ball once it is on the ground ----

  // The first fielder to the ball after it lands (or as it rolls): { fd, t, p, k }. A fielder who
  // dove and missed, or tried to catch it, loses time (penalty).
  function firstToBall(path, D, penalty, minR) {
    const B = T().BALL;
    const startT = path.land ? path.land.t : 0;
    let best = null;
    for (const pos in D) {
      const fd = D[pos];
      const extra = penalty[pos] || 0;
      for (let k = 1; k < path.pts.length; k++) {
        const p = path.pts[k];
        if (p[0] < startT - 1e-9 || p[3] > B.fieldHeight) continue;
        if (minR && p[4] < minR) continue;
        const need = reachT(fd, [p[1], p[2]]) + extra;
        if (need <= p[0]) {
          if (!best || p[0] < best.t) best = { fd: fd, t: p[0], p: [p[1], p[2]], k: k };
          break;
        }
      }
    }
    if (!best) {
      // Nobody beat the ball to a point: whoever gets to where it stopped first.
      const p = path.pts[path.pts.length - 1];
      for (const pos in D) {
        const fd = D[pos], t = Math.max(p[0], reachT(fd, [p[1], p[2]]) + (penalty[pos] || 0));
        if (!best || t < best.t) best = { fd: fd, t: t, p: [p[1], p[2]], k: path.pts.length - 1 };
      }
    }
    return best;
  }

  // A grounder an infielder can get to before it leaves the infield: { fd, t, p, k, dive } or null.
  function infieldStop(g, path, D) {
    const B = T().BALL;
    let best = null, near = null;
    for (const pos of ['P', 'C', '1B', '2B', '3B', 'SS']) {
      const fd = D[pos];
      for (let k = 1; k < path.pts.length; k++) {
        const p = path.pts[k];
        const r = p[4];
        if (r > B.infield + 45) break;
        if (p[3] > B.fieldHeight) continue;
        if (pos === 'C' && r > 40) break;
        const mk = p[0] - reachT(fd, [p[1], p[2]]);
        if (mk >= 0) {
          if (!best || p[0] < best.t) best = { fd: fd, t: p[0], p: [p[1], p[2]], k: k, dive: false };
          break;
        }
        if (pos !== 'C' && pos !== 'P' && (!near || mk > near.m) && diveGap(fd, [p[1], p[2]], p[0]) <= B.diveReach) {
          near = { fd: fd, t: p[0], p: [p[1], p[2]], k: k, m: mk, dive: true };
        }
      }
    }
    if (best) return best;
    // A diving stop on a ball just out of reach.
    if (near && near.m > -0.35 && g.rng.chance(logistic((near.m + 0.12) / 0.06))) return near;
    return null;
  }

  // ---- Plays ----

  function bbType(la) { return la < 10 ? 'ground' : la < 25 ? 'line' : la <= 50 ? 'fly' : 'popup'; }

  // A close play at a base: true if the runner is safe. margin is ball time (+ tag) minus runner time.
  function safeBy(g, margin) { return g.rng.chance(logistic(margin / T().BALL.playSd)); }

  // Seconds for a fielder to get to base b (on the bag: no glove's reach).
  function toBase(fd, b) { return fd.react + runTime(dist(fd.at, base(b)), fd.speed, 0); }

  // The fielder who takes a throw at a base, and when he can be there.
  function cover(D, b, busy) {
    const order = { 1: ['1B', '2B', 'P'], 2: ['SS', '2B'], 3: ['3B', 'SS'], 4: ['C', 'P'] }[b];
    for (const pos of order) {
      if (busy.indexOf(pos) >= 0) continue;
      const fd = D[pos];
      return { fd: fd, t: toBase(fd, b) - fd.react * 0.5 }; // he moves as soon as he sees the play
    }
    return { fd: D.P, t: toBase(D.P, b) };
  }

  function forcedOn(g) {
    const b = g.bases;
    return [!!b[0], !!(b[0] && b[1]), !!(b[0] && b[1] && b[2])];
  }

  // The result of a play: runners' end bases and the batter's.
  function result(code, bb, fd, caught, batter, runners, extra) {
    const p = { code: code, bb: bb, fielder: fd.pos, caught: caught, batter: batter, runners: runners };
    for (const k in extra) p[k] = extra[k];
    return p;
  }

  // A home run: everyone scores at a trot.
  function homeRun(g, c, path, D, off, S) {
    const B = T().BALL;
    S.flight(path, Infinity);
    S.event(path.hr.t, 'hr');
    const runners = [], trot = 22;
    for (let i = 0; i < 3; i++) {
      const rn = off.runners[i];
      if (!rn) { runners.push(null); continue; }
      runners.push(4);
      const t0 = B.batterBox + 0.5;
      runTrack(S, rn, t0, (b) => t0 + ((b - rn.from) * 90 - rn.s0) / trot, 4, null);
    }
    const bt = off.batter, t0 = bt.box;
    runTrack(S, bt, t0, (b) => t0 + b * 90 / trot, 4, null);
    const fd = c.sp < -15 ? D.LF : c.sp > 15 ? D.RF : D.CF;
    return result('HR', bbType(c.la), fd, false, 4, runners, {});
  }

  // A ball caught in the air. Runners who were going must get back (they can be doubled off).
  function caughtBall(g, c, path, D, off, S, best) {
    const B = T().BALL, E = T().ERR;
    const fd = best.fd, p = path.pts[best.k];
    const tc = p[0], at = [p[1], p[2]];
    const hard = best.margin < 0.35;
    S.flight(path, tc);
    fieldAt(S, fd, at, tc);
    const bb = bbType(c.la);
    // A dropped routine fly is an error: the batter reaches, runners move up.
    if (!hard && g.rng.chance(E.fly * fd.hands)) {
      S.event(tc, 'error', { pos: fd.pos });
      return droppedBall(g, c, path, D, off, S, fd, tc, at, bb);
    }
    S.event(tc, 'catch', best.margin < 0 ? { pos: fd.pos, dive: true } : { pos: fd.pos });
    const code = bb === 'popup' ? 'PO' : bb === 'line' || bb === 'ground' ? 'LO' : 'FO';
    const runners = [], back = [null, null, null];
    let outs = g.outs + 1;
    let free = { t: tc, at: at, pos: fd.pos }; // who has the ball, where and since when (the next throw, a tag-up)
    for (let i = 2; i >= 0; i--) {
      const rn = off.runners[i];
      if (!rn) { runners[i] = null; continue; }
      if (!rn.going) {
        runners[i] = i + 1;
        back[i] = 0;
        const tr = runTrack(S, rn, 0, null, rn.from, null);
        S.put(tr.path, Math.max(tc, 0.3 + rn.s0 / (0.8 * rn.run.speed)), base(rn.from)); // back to the bag to tag
        continue;
      }
      // He sees the catch, stops and turns back.
      const sAt = Math.min(rn.s0 + rn.run.speed * Math.max(0, tc - rn.run.read), 88);
      const tBack = tc + 0.3 + runTime(sAt, rn.run.speed, 0);
      back[i] = tBack;
      const tr = S.runner(rn, pathPt(rn.from, rn.s0));
      S.put(tr.path, tc, pathPt(rn.from, sAt));
      if (outs < 3) {
        const thrower = D[free.pos], tRel = free.t + thrower.xfer;
        const cv = cover(D, rn.from, [fd.pos, free.pos]);
        const tBall = Math.max(tRel + throwTime(dist(free.at, base(rn.from)), thrower.arm), cv.t);
        if (tBall < tBack + 0.6 && !safeBy(g, tBall + B.tag - tBack)) {
          runners[i] = 0;
          outs++;
          const sOut = Math.max(1.5, sAt - runDist(tBall + B.tag - tc - 0.3, rn.run.speed, 0));
          S.put(tr.path, tc + 0.3, pathPt(rn.from, sAt));
          S.put(tr.path, tBall + B.tag, pathPt(rn.from, Math.min(sAt, sOut)));
          tr.end = 0;
          S.ballAt(tRel, free.at, 6);
          S.event(tRel, 'throw', { pos: thrower.pos, base: rn.from });
          S.throwTo(tBall, base(rn.from));
          coverAt(S, cv, rn.from, tBall + B.tag);
          S.event(tBall + B.tag, 'out', { id: rn.id, base: rn.from });
          free = { t: tBall + B.tag, at: base(rn.from), pos: cv.fd.pos };
          continue;
        }
      }
      runners[i] = i + 1;
      S.put(tr.path, tc + 0.3, pathPt(rn.from, sAt));
      S.put(tr.path, tBack, base(rn.from));
      tr.end = rn.from;
    }
    // The batter runs toward first until the catch, then he's out.
    const bt = off.batter, tb = S.runner(bt, base(0));
    S.put(tb.path, bt.box, base(0));
    S.put(tb.path, tc, pathPt(0, Math.min(85, runDist(tc - bt.box, bt.run.speed, 0))));
    tb.end = 0;
    return result(code, bb, fd, true, 0, runners, {
      meta: { catchT: r2(tc), catchAt: at, fielder: fd.pos, back: back, dist: Math.round(len(at[0], at[1])), free: free }
    });
  }

  // An error on a ball in the air: the batter reaches, runners move up a base (two from second or
  // third on a ball dropped in the outfield).
  function droppedBall(g, c, path, D, off, S, fd, tc, at, bb) {
    const outfield = B3.data.OUTFIELD.indexOf(fd.pos) >= 0;
    const bExtra = outfield && g.rng.chance(0.35) ? 2 : 1;
    const runners = [];
    const taken = {};
    let last = 5;
    for (let i = 2; i >= 0; i--) {
      const rn = off.runners[i];
      if (!rn) { runners[i] = null; continue; }
      let to = Math.min(4, i + 1 + (outfield && i >= 1 ? 2 : 1));
      if (to < 4 && to >= last) to = last - 1;
      runners[i] = to; last = to; taken[to] = true;
      const t0 = rn.going ? 0 : tc;
      runTrack(S, rn, t0, (b) => arrive(rn, b, t0, rn.s0, rn.v0), to, null);
    }
    let bTo = bExtra;
    while (bTo > 1 && (taken[bTo] || bTo >= last)) bTo--;
    const bt = off.batter;
    runTrack(S, bt, bt.box, (b) => arrive(bt, b, bt.box, 0, 0), bTo, null);
    S.ballAt(tc + 1, at, 1);
    return result('E', bb, fd, false, bTo, runners, {});
  }

  // A ground ball an infielder fields: throws to first, force plays, double plays, infield hits.
  function groundBall(g, c, path, D, off, S, stop) {
    const B = T().BALL, E = T().ERR;
    const fd = stop.fd, T0 = stop.t, P0 = stop.p;
    const bb = bbType(c.la);
    S.flight(path, T0);
    const Q0 = fieldAt(S, fd, P0, T0); // where he stands when he has it
    S.event(T0, 'field', stop.dive ? { pos: fd.pos, dive: true } : { pos: fd.pos });
    const forced = forcedOn(g);
    const R = off.runners, bt = off.batter;
    const tb = arrive(bt, 1, bt.box, 0, 0); // batter to first
    // A fumble: everyone safe, a base each.
    if (g.rng.chance(E.ground * fd.hands * (stop.dive ? E.hard : 1))) {
      S.event(T0, 'error', { pos: fd.pos });
      return errorPlay(g, c, D, off, S, fd, T0 + 1, P0, bb, 1);
    }
    const up = T0 + (stop.dive ? B.diveLoss : 0); // on his feet with the ball
    const ready = up + fd.xfer;
    // When the ball can be at base b: thrown, or carried if he is close to the bag (he runs it there).
    const carries = (b) => dist(P0, base(b)) < 22;
    const ballAt = (b) => (carries(b) ? up + runTime(dist(Q0, base(b)), fd.speed, 0) : Math.max(ready + throwTime(dist(P0, base(b)), fd.arm), cover(D, b, [fd.pos]).t));
    // Runners: forced runners go on contact; the rest go only if they can beat a throw.
    const tGo = (rn) => (rn.going ? 0 : rn.run.read);
    const runT = (rn, b) => arrive(rn, b, tGo(rn), rn.s0, rn.v0);
    const twoOut = g.outs === 2;
    const plan = [null, null, null]; // each runner's base if the play goes to first
    for (let i = 2; i >= 0; i--) {
      const rn = R[i];
      if (!rn) continue;
      if (forced[i] || twoOut || rn.going) { plan[i] = Math.min(4, i + 2); continue; }
      // Not forced: he goes if he thinks he beats a throw to his next base.
      const est = ballAt(i + 2) + B.tag - runT(rn, i + 2) + g.rng.normal(0, rn.run.judge);
      const ahead = plan[i + 1];
      const open = i === 2 || ahead === null || ahead > i + 2 || ahead === 4;
      plan[i] = open && est > B.dare ? i + 2 : i + 1;
    }
    // The defense's choice: the lead forced runner (or a runner breaking for home) if it's a sure out,
    // with a relay to first for two; else the batter at first; with two outs, the easiest out.
    const options = [];
    for (let i = 2; i >= 0; i--) {
      const rn = R[i];
      if (!rn || plan[i] !== i + 2) continue;
      const b = i + 2;
      const tBall = ballAt(b);
      const tag = forced[i] ? 0 : B.tag;
      options.push({ i: i, b: b, rn: rn, tBall: tBall, margin: runT(rn, b) - (tBall + tag), force: forced[i] });
    }
    const t1 = ballAt(1);
    const first = { i: -1, b: 1, rn: bt, tBall: t1, margin: tb - t1, force: true };
    let choice = first;
    if (twoOut) {
      for (const o of options) if (o.force && o.margin > choice.margin) choice = o;
    } else {
      for (const o of options) if (o.margin > 0.12 && (choice === first || o.b > choice.b)) choice = o;
    }
    // A wild throw: the out isn't made and everyone moves up.
    const throwD = dist(P0, base(choice.b));
    if (!carries(choice.b) && g.rng.chance(E.throw * fd.hands * throwD / 100 * (stop.dive ? E.hard : 1))) {
      S.event(ready, 'throw', { pos: fd.pos, base: choice.b });
      S.ballAt(ready, P0, 4);
      coverAt(S, cover(D, choice.b, [fd.pos]), choice.b, choice.tBall);
      S.event(choice.tBall, 'error', { pos: fd.pos });
      return errorPlay(g, c, D, off, S, fd, choice.tBall, base(choice.b), bb, 1);
    }
    const runners = [null, null, null];
    let outs = 0, batterTo = 1, outAt = null;
    const outsList = [];
    if (carries(choice.b)) {
      S.ballAt(up, P0, 3);
      S.throwTo(choice.tBall, base(choice.b), 3);
      S.fielder(fd.pos, choice.tBall, base(choice.b));
    } else {
      S.event(ready, 'throw', { pos: fd.pos, base: choice.b });
      S.ballAt(ready, P0, 4);
      S.throwTo(choice.tBall, base(choice.b));
      coverAt(S, cover(D, choice.b, [fd.pos]), choice.b, choice.tBall);
    }
    const firstOut = !safeBy(g, -choice.margin);
    let relay = null;
    if (firstOut) {
      outs++;
      outsList.push({ who: choice.i, b: choice.b, t: choice.tBall + (choice.force ? 0 : B.tag) });
      // A relay to first for a double play (or a triple-play-free second out).
      if (choice !== first && g.outs + 1 < 3) {
        const piv = carries(choice.b) ? fd : cover(D, choice.b, [fd.pos]).fd;
        const release = choice.tBall + Math.max(0.2, B.pivot - piv.release);
        const cv1 = cover(D, 1, [fd.pos, piv.pos]);
        const t1b = Math.max(release + throwTime(dist(base(choice.b), base(1)), piv.arm), cv1.t);
        relay = { t: t1b, release: release, piv: piv, cv1: cv1 };
        if (tb > t1b - 0.25 && !safeBy(g, t1b - tb)) {
          outs++;
          outsList.push({ who: -1, b: 1, t: t1b });
          batterTo = 0;
        }
      } else if (choice === first) {
        batterTo = 0;
      }
    }
    // Where everyone ends.
    for (let i = 2; i >= 0; i--) {
      if (!R[i]) continue;
      runners[i] = plan[i];
      if (firstOut && choice.i === i) runners[i] = 0;
    }
    if (choice === first && !firstOut) batterTo = 1; // an infield hit
    // Code.
    let code;
    const runnerOut = runners.some((x) => x === 0);
    if (batterTo === 0 && runnerOut) code = 'DP';
    else if (batterTo === 0) code = 'GO';
    else if (runnerOut) code = 'FC';
    else code = '1B';
    // The third out on a force or on the batter: no runs count (game.js applies it). Runs never count
    // on these plays, so runsCount stays unset.
    // Script: the throw(s), the runners.
    if (relay) {
      S.fielder(relay.piv.pos, relay.release, base(choice.b));
      S.ballAt(relay.release, base(choice.b), 4);
      S.event(relay.release, 'throw', { pos: relay.piv.pos, base: 1 });
      S.throwTo(relay.t, base(1));
      coverAt(S, relay.cv1, 1, relay.t);
    }
    for (const o of outsList) S.event(o.t, 'out', { id: o.who < 0 ? bt.id : R[o.who].id, base: o.b });
    for (let i = 2; i >= 0; i--) {
      const rn = R[i];
      if (!rn) continue;
      const o = outsList.find((x) => x.who === i);
      runTrack(S, rn, tGo(rn), (b) => runT(rn, b), o ? o.b - 1 : runners[i], o ? { base: o.b, t: o.t } : null);
    }
    const bo = outsList.find((x) => x.who === -1);
    runTrack(S, bt, bt.box, (b) => arrive(bt, b, bt.box, 0, 0), bo ? 0 : batterTo, bo ? { base: 1, t: bo.t } : null);
    if (code === '1B') S.event(tb, 'safe', { id: bt.id, base: 1 });
    return result(code, bb, fd, false, batterTo, runners, {});
  }

  // An error: the batter is safe at first (or second), and runners move up `extra` bases past where they
  // were.
  function errorPlay(g, c, D, off, S, fd, t, at, bb, extra) {
    const runners = [null, null, null];
    let last = 5;
    for (let i = 2; i >= 0; i--) {
      const rn = off.runners[i];
      if (!rn) continue;
      let to = Math.min(4, i + 1 + extra);
      if (to < 4 && to >= last) to = last - 1;
      runners[i] = to; last = to;
      const t0 = rn.going ? 0 : rn.run.read;
      runTrack(S, rn, t0, (b) => arrive(rn, b, t0, rn.s0, rn.v0), to, null);
    }
    let bTo = g.rng.chance(0.25) ? 2 : 1;
    if (bTo >= last) bTo = 1;
    const bt = off.batter;
    runTrack(S, bt, bt.box, (b) => arrive(bt, b, bt.box, 0, 0), bTo, null);
    S.ballAt(t + 0.8, [at[0] + 15, at[1] + 10], 0);
    return result('E', bb, fd, false, bTo, runners, {});
  }

  // A hit to the outfield (or a ball that drops in): runners take what the throw allows.
  function hit(g, c, path, D, off, S, got, inAir) {
    const B = T().BALL;
    const fd = got.fd, tp = got.t, pp = got.p;
    const bb = bbType(c.la);
    S.flight(path, tp);
    fieldAt(S, fd, pp, tp);
    S.event(tp, 'field', { pos: fd.pos });
    if (path.wall && path.wall.t < tp) S.event(path.wall.t, 'wall');
    const ready = tp + B.gather + fd.xfer;
    S.ballAt(ready, pp, 5);
    const tBall = (b) => Math.max(ready + throwTime(dist(pp, base(b)), fd.arm), cover(D, b, [fd.pos]).t);
    const R = off.runners, bt = off.batter;
    const twoOut = g.outs === 2;
    const landT = path.land ? path.land.t : 0;
    // When each runner really starts: with two outs on contact; on a ball in the air that might be
    // caught, from halfway once he reads that it drops (Baserunning); on a ground ball, after his read.
    const start = (rn) => {
      if (rn.going) return { t: 0, s: rn.s0, v: rn.v0 };
      if (twoOut) return { t: rn.run.read, s: rn.s0, v: 0 };
      if (inAir) return { t: landT + rn.run.read * B.dropRead, s: Math.max(rn.s0, B.halfway * 90), v: rn.run.speed * 0.4 };
      return { t: rn.run.read, s: rn.s0, v: 0 };
    };
    const forced = forcedOn(g);
    const plans = [];
    let aheadEnd = 5;
    for (let i = 2; i >= 0; i--) {
      const rn = R[i];
      if (!rn) { plans[i] = null; continue; }
      const st = start(rn);
      const at = (b) => arrive(rn, b, st.t, st.s, st.v);
      let to = forced[i] ? i + 2 : i + 1;
      // He keeps going while he judges he'll make the next base with his margin to spare.
      while (to < 4) {
        const nb = to + 1;
        if (nb >= aheadEnd && nb < 4) break;
        const est = tBall(nb) + B.tag - at(nb) + g.rng.normal(0, rn.run.judge);
        if (est > B.dare) to = nb; else break;
      }
      if (to < 4 && to >= aheadEnd) to = aheadEnd - 1;
      plans[i] = { rn: rn, to: to, at: at, st: st };
      aheadEnd = to;
    }
    // The batter-runner (never thrown out trying to stretch it: Claude's default for M1).
    const bAt = (b) => arrive(bt, b, bt.box, 0, 0);
    let bTo = 1;
    while (bTo < 4) {
      const nb = bTo + 1;
      if (nb >= aheadEnd && nb < 4) break;
      const margin = tBall(nb) + B.tag - bAt(nb);
      if (margin > B.dare * 0.5 && margin + g.rng.normal(0, bt.run.judge) > B.dare) bTo = nb; else break;
    }
    // The throw: to the runner with the closest play, if there is one.
    let target = null;
    for (let i = 2; i >= 0; i--) {
      const pl = plans[i];
      if (!pl) continue;
      const free = forced[i] ? i + 2 : i + 1;
      if (pl.to <= free && pl.to < 4) continue;
      const m = tBall(pl.to) + B.tag - pl.at(pl.to);
      if (m < 0.4 && (!target || m < target.m)) target = { i: i, pl: pl, m: m };
    }
    const runners = [null, null, null];
    let outT = null, outIdx = -1;
    if (target) {
      const tb = tBall(target.pl.to);
      S.event(ready, 'throw', { pos: fd.pos, base: target.pl.to });
      S.throwTo(tb, base(target.pl.to));
      coverAt(S, cover(D, target.pl.to, [fd.pos]), target.pl.to, tb + B.tag);
      if (!safeBy(g, target.m) && g.outs < 3) { outIdx = target.i; outT = tb + B.tag; }
      // The batter takes an extra base on a throw home or to third, if it is open.
      if (target.pl.to >= 3 && bTo < 3) {
        const nb = bTo + 1;
        const blocked = plans.some((pl, j) => pl && j !== outIdx && pl.to === nb);
        if (!blocked && nb < target.pl.to && bAt(nb) < tb + 0.7) bTo = nb;
      }
    } else {
      S.throwTo(ready + throwTime(dist(pp, base(2)) * 0.7, fd.arm), lerp(pp, base(2), 0.7), 5);
    }
    let runsCount;
    for (let i = 2; i >= 0; i--) {
      const pl = plans[i];
      if (!pl) continue;
      runners[i] = i === outIdx ? 0 : pl.to;
      if (i === outIdx) {
        runTrack(S, pl.rn, pl.st.t, pl.at, pl.to - 1, { base: pl.to, t: outT }, pl.st.s, pl.st.v);
        S.event(outT, 'out', { id: pl.rn.id, base: pl.to });
      } else {
        runTrack(S, pl.rn, pl.st.t, pl.at, pl.to, null, pl.st.s, pl.st.v);
      }
    }
    if (outIdx >= 0 && g.outs + 1 === 3) {
      // A timing play: runs that crossed before the tag count.
      runsCount = plans.every((pl, j) => !pl || j === outIdx || pl.to !== 4 || pl.at(4) < outT);
    }
    runTrack(S, bt, bt.box, bAt, bTo, null);
    const code = ['', '1B', '2B', '3B', 'HR'][bTo];
    const extra = {};
    if (runsCount !== undefined) extra.runsCount = runsCount;
    // An inside-the-park home run is still a home run, so every runner scores.
    return result(code, bb, fd, false, bTo, runners, extra);
  }

  // ---- Entry points ----

  function inPlay(g, contact, steal) {
    const B = T().BALL;
    const pitch = g.pitch;
    const w = B3.pitch.who(g);
    const D = defense(g, w.bats);
    const off = offense(g, steal, pitch);
    const path = flight(contact);
    const S = new Script(D);
    if (!path.fair) {
      // A foul: caught in foul ground for an out, or dead.
      const best = path.land ? bestCatch(path, D, true) : null;
      if (best && best.margin > -0.3 && g.rng.chance(logistic((best.margin - T().BALL.catchAt) / T().BALL.catchSd))) {
        const play = caughtBall(g, contact, path, D, off, S, best);
        play.script = S.done();
        return play;
      }
      S.flight(path, path.land ? path.land.t : Infinity);
      S.event(path.land ? path.land.t : 0, 'foul');
      for (let i = 0; i < 3; i++) if (off.runners[i]) S.runner(off.runners[i], pathPt(i + 1, off.runners[i].s0));
      return { foul: true, script: S.done() };
    }
    if (path.hr) {
      // A leap at the wall can take one back.
      const rob = bestCatch(path, D, false);
      if (rob && rob.margin > 0 && path.pts[rob.k][4] > path.fence - 6 && g.rng.chance(0.35)) {
        const play = caughtBall(g, contact, path, D, off, S, rob);
        play.script = S.done();
        return play;
      }
      const play = homeRun(g, contact, path, D, off, S);
      play.script = S.done();
      return play;
    }
    const inAir = !path.land || path.land.r > 40 || contact.la >= 10;
    const penalty = {};
    if (inAir) {
      const best = bestCatch(path, D, false);
      if (best && best.margin > -0.4) {
        const p = best.margin >= 0.35 ? 1 : logistic((best.margin - B.catchAt) / B.catchSd);
        if (g.rng.chance(p)) {
          const play = caughtBall(g, contact, path, D, off, S, best);
          play.script = S.done();
          return play;
        }
        penalty[best.fd.pos] = best.margin < 0 ? B.getUp : 0.3; // he dove or reached and missed
        if (path.wall) S.event(path.wall.t, 'wall');
      }
    }
    const ground = !path.land || path.land.r < 110 || contact.la < 10;
    if (ground) {
      const stop = infieldStop(g, path, D);
      if (stop && !penalty[stop.fd.pos]) {
        const play = groundBall(g, contact, path, D, off, S, stop);
        play.script = S.done();
        return play;
      }
    }
    if (path.land) S.event(path.land.t, 'land');
    const got = firstToBall(path, D, penalty, ground ? B.infield : 0);
    const play = hit(g, contact, path, D, off, S, got, inAir && !ground);
    play.script = S.done();
    return play;
  }

  // A steal: the runner's jump and speed against the delivery, the pitch's flight and the catcher's
  // release and arm (Arm plus Hands' quick release). margin is the ball's time (plus the tag) minus the
  // runner's, in seconds, for a pitch of `ms` flight time.
  function stealMargin(g, from, ms) {
    const B = T().BALL, ST = T().STEAL;
    const rn = g.bases[from - 1];
    const run = g.teams[g.half].inp[rn.id].run;
    const D = defense(g, 'R');
    const c = D.C;
    const lead = B.lead[from - 1] + ST.secondLead[from - 1];
    const tRun = run.jump + runTime(90 - lead, run.speed, 0);
    const cv = cover(D, from + 1, ['C']);
    const tBall = Math.max(ST.delivery + ms / 1000 + c.xfer + throwTime(dist(c.at, base(from + 1)), c.arm), cv.t);
    return tBall + B.tag - tRun;
  }

  function steal(g, from, pitch) {
    const B = T().BALL, ST = T().STEAL;
    const m = stealMargin(g, from, pitch ? pitch.ms : 400);
    return g.rng.chance(logistic((m + g.rng.normal(0, ST.sd)) / B.playSd));
  }

  // The chance a steal from `from` is safe, as the runner sees it before the pitch: an average pitch
  // from this pitcher (93% of his fastball's speed), with the play's noise folded in. For the CPU's choice.
  function stealOdds(g, from) {
    const B = T().BALL, ST = T().STEAL;
    const p = g.teams[1 - g.half].inp[g.teams[1 - g.half].pitcher].pit;
    const m = stealMargin(g, from, B3.pitch.flightMs(p.velo * 0.93));
    return logistic(m / Math.sqrt(B.playSd * B.playSd + (ST.sd / 1.7) * (ST.sd / 1.7)));
  }

  // A tag-up after a catch: the runner leaves when the ball is caught (or when he is back on the bag).
  // The throw comes from whoever has the ball once the catch play is over (meta.free).
  function tagTimes(g, play, from) {
    const m = play.meta;
    const rn = g.bases[from - 1];
    const run = g.teams[g.half].inp[rn.id].run;
    const D = defense(g, 'R');
    const free = m.free || { t: m.catchT, at: m.catchAt, pos: m.fielder };
    const fd = D[free.pos];
    const leave = Math.max(m.catchT, m.back[from - 1] || 0) + run.read * 0.5;
    const tRun = leave + runTime(90, run.speed, 0);
    const cv = cover(D, from + 1, [m.fielder, free.pos]);
    const tRel = free.t + fd.xfer;
    const tBall = Math.max(tRel + throwTime(dist(free.at, base(from + 1)), fd.arm), cv.t);
    return { rn: rn, run: run, free: free, fd: fd, leave: leave, tRun: tRun, cv: cv, tRel: tRel, tBall: tBall };
  }

  // The chance a tag-up from `from` is safe, as the runner judges it: `err` seconds (his own error) added
  // to the margin. For the CPU's choice.
  function tagupOdds(g, play, from, err) {
    const t = tagTimes(g, play, from);
    return logistic((t.tBall + T().BALL.tag - t.tRun + (err || 0)) / T().BALL.playSd);
  }

  function tagup(g, play, from) {
    const B = T().BALL;
    const { rn, run, free, fd, leave, tRun, cv, tRel, tBall } = tagTimes(g, play, from);
    const safe = safeBy(g, tBall + B.tag - tRun);
    // The script: the runner leaves the bag, the throw comes in, the cover man waits on the bag.
    const S = play.script;
    if (S) {
      const push = (track, t, p, z) => {
        const q = [r2(Math.max(t, track[track.length - 1][0])), r1(p[0]), r1(p[1])];
        if (z !== undefined) q.push(r1(z));
        track.push(q);
        if (q[0] > S.t) S.t = q[0];
      };
      const tr = S.runners.find((r) => r.id === rn.id);
      const end = safe ? tRun : tBall + B.tag;
      const p = safe ? base(from + 1) : pathPt(from, Math.min(88.5, runDist(end - leave, run.speed, 0)));
      if (tr) {
        push(tr.path, leave, base(from));
        push(tr.path, end, p);
        tr.end = safe ? from + 1 : 0;
      }
      push(S.ball, tRel, free.at, 6);
      push(S.ball, tBall, base(from + 1), 4);
      const ft = S.fielders[cv.fd.pos];
      push(ft, cv.t, base(from + 1));
      push(ft, tBall + B.tag, base(from + 1));
      S.events.push({ t: r2(tRel), e: 'throw', pos: fd.pos, base: from + 1 });
      S.events.push({ t: r2(end), e: safe ? (from + 1 === 4 ? 'score' : 'safe') : 'out', id: rn.id, base: from + 1 });
      S.events.sort((a, b) => a.t - b.t);
      S.t = r2(Math.max(S.t, end, tBall + B.tag));
    }
    return safe;
  }

  B3.ball = {
    inPlay: inPlay,
    steal: steal,
    stealOdds: stealOdds,
    tagup: tagup,
    tagupOdds: tagupOdds,
    flight: flight,
    runTime: runTime,
    throwTime: throwTime
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
