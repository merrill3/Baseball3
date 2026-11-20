// The play script (M1 step 1.2, task 8). Over many seeded plays, every ball in play's timed tracks for
// the ball, the fielders and the runners are continuous and agree with the result: times only go
// forward, nobody moves faster than he can, every runner ends where the play says, the ball is at the
// base at each out, and the fielder is at the ball when he catches or fields it.
'use strict';
const assert = require('assert');
const { loadCore } = require('../lib/load');
const { pair } = require('../lib/testteams');

const MPH = 5280 / 3600;
// Positions are rounded to 0.1 ft and times to 0.01 s, so short steps get a little slack.
const SLACK_FT = 0.35;

// Plays from seeded games where the CPU steals often and always tags up, so the rare paths come up
// (runners going on the pitch, doubled off, thrown out tagging). Each record keeps what the checks
// need: the runners before the play, the inputs of both sides, and the tag-up, if any.
function collect(games, seed) {
  const B3 = loadCore();
  const recs = [];
  const inPlay = B3.ball.inPlay, tagup = B3.ball.tagup;
  B3.ball.inPlay = function (g, c, steal) {
    const play = inPlay(g, c, steal);
    recs.push({
      c: c, play: play, outs: g.outs, bases: g.bases.map((r) => (r ? r.id : null)),
      batter: g.teams[g.half].lineup[g.teams[g.half].spot],
      bat: g.teams[g.half].inp, fld: g.teams[1 - g.half].inp, byPos: Object.assign({ P: g.teams[1 - g.half].pitcher }, g.teams[1 - g.half].byPos),
      going: steal ? steal.map((s) => s.from) : [], tag: null
    });
    return play;
  };
  B3.ball.tagup = function (g, play, from) {
    const ok = tagup(g, play, from);
    const rec = recs[recs.length - 1];
    assert.strictEqual(rec.play, play, 'a tag-up follows its own play');
    rec.tag = { from: from, ok: ok };
    return ok;
  };
  const ctl = {
    steal: (d, g) => (g.rng.chance(0.35) ? { runners: d.runners.slice() } : null),
    tagup: () => ({ go: true })
  };
  for (let n = 0; n < games; n++) {
    const g = B3.game.create(Object.assign(pair(), { type: 'regular', rng: B3.rng.create(seed + ':' + n) }));
    B3.game.play(g, [ctl, ctl]);
  }
  return { B3, recs };
}

// Position on a track at time t: straight lines between points, held before the first and after the last.
function at(track, t) {
  if (t <= track[0][0]) return track[0].slice(1);
  for (let k = 1; k < track.length; k++) {
    const a = track[k - 1], b = track[k];
    if (t <= b[0]) {
      const u = b[0] === a[0] ? 1 : (t - a[0]) / (b[0] - a[0]);
      return a.slice(1).map((v, j) => v + (b[j + 1] - v) * u);
    }
  }
  return track[track.length - 1].slice(1);
}
const d2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const d3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], (a[2] || 0) - (b[2] || 0));

// Problems with one play's script, as strings.
function problems(B3, rec) {
  const out = [];
  const bad = (m) => out.push(m);
  const S = rec.play.script, play = rec.play;
  const BALL = B3.tune.BALL, POS = B3.tune.POS, F = B3.data.FIELD;
  const base = (n) => F.bases[n % 4];
  if (!S) { bad('no script'); return out; }
  // Times only go forward, and nothing moves faster than it can.
  const steps = (name, track, top) => {
    for (let k = 1; k < track.length; k++) {
      const a = track[k - 1], b = track[k], dt = b[0] - a[0];
      if (dt < 0) { bad(name + ': time goes back at ' + b[0]); continue; }
      const d = name === 'ball' ? d3(a.slice(1), b.slice(1)) : d2(a.slice(1), b.slice(1));
      if (d > top * dt + SLACK_FT) bad(name + ': ' + d.toFixed(1) + ' ft in ' + dt.toFixed(2) + ' s at ' + a[0] + ' (top ' + top.toFixed(1) + ' ft/s)');
    }
    if (track[track.length - 1][0] > S.t + 1e-9) bad(name + ': a point after the script ends');
  };
  let arm = 0;
  for (const pos in S.fielders) {
    const inp = rec.fld[rec.byPos[pos]];
    arm = Math.max(arm, typeof inp.fld.arm === 'number' ? inp.fld.arm : POS[pos][1]);
    steps(pos, S.fielders[pos], inp.run.speed * inp.fld.route);
  }
  steps('ball', S.ball, Math.max(rec.c.ev, arm) * MPH);
  for (let k = 1; k < S.events.length; k++) if (S.events[k].t < S.events[k - 1].t) bad('events out of order');
  // Every runner and the batter has one track, and it ends where the play says.
  const want = {};
  if (!play.foul) {
    want[rec.batter] = { from: 0, end: play.batter };
    rec.bases.forEach((id, i) => { if (id) want[id] = { from: i + 1, end: play.runners[i] }; });
    if (rec.tag) want[rec.bases[rec.tag.from - 1]].end = rec.tag.ok ? rec.tag.from + 1 : 0;
  } else {
    rec.bases.forEach((id, i) => { if (id) want[id] = { from: i + 1, end: null }; });
  }
  const seen = {};
  for (const tr of S.runners) {
    if (seen[tr.id]) bad('two tracks for ' + tr.id);
    seen[tr.id] = true;
    const w = want[tr.id];
    if (!w) { bad('a track for ' + tr.id + ', who is not in the play'); continue; }
    if (tr.from !== w.from) bad(tr.id + ' starts from ' + tr.from + ', not ' + w.from);
    if (tr.end !== w.end) bad(tr.id + ' ends on ' + tr.end + ', the play says ' + w.end);
    steps('runner ' + tr.id, tr.path, rec.bat[tr.id].run.speed);
    const first = tr.path[0].slice(1), last = tr.path[tr.path.length - 1].slice(1);
    if (w.from === 0 && d2(first, base(0)) > 0.5) bad('the batter starts away from home');
    if (w.from > 0 && d2(first, base(w.from)) > 90) bad(tr.id + ' starts far from his base');
    if (tr.end >= 1 && d2(last, base(tr.end)) > 0.5) bad(tr.id + ' ends ' + d2(last, base(tr.end)).toFixed(1) + ' ft from base ' + tr.end);
    if (tr.end === 4 && !S.events.some((e) => e.e === 'score' && e.id === tr.id)) bad(tr.id + ' scores with no score event');
  }
  for (const id in want) if (!seen[id]) bad('no track for ' + id);
  // The ball is at the base at each out; each runner put out is near that base, short of it.
  for (const e of S.events) {
    if (e.e === 'out') {
      const b = at(S.ball, e.t);
      if (d2(b, base(e.base)) > 3) bad('out at base ' + e.base + ' at ' + e.t + ' with the ball ' + d2(b, base(e.base)).toFixed(1) + ' ft away');
      if (!Object.keys(S.fielders).some((pos) => d2(at(S.fielders[pos], e.t), base(e.base)) < 1)) bad('out at base ' + e.base + ' at ' + e.t + ' with no fielder on the bag');
      const tr = S.runners.find((r) => r.id === e.id);
      if (!tr) { bad('an out for ' + e.id + ', who has no track'); continue; }
      if (tr.end !== 0) bad('an out event for ' + e.id + ', who ends on base ' + tr.end);
      // He is on the base path next to that base (going to it, or back to it), not on it.
      const p = at(tr.path, e.t);
      const onPath = (a, b) => { const L = d2(a, b), u = Math.max(0, Math.min(1, ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / (L * L))); return d2(p, [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]) < 1.5; };
      if (!onPath(base(e.base - 1), base(e.base)) && !onPath(base(e.base), base(e.base + 1))) bad(e.id + ' is off the base path when he is out at base ' + e.base);
      if (d2(p, base(e.base)) < 0.5) bad(e.id + ' is on base ' + e.base + ' when he is out');
    }
    if (e.e === 'catch' || e.e === 'field') {
      const b = at(S.ball, e.t), f = at(S.fielders[e.pos], e.t);
      const reach = BALL.glove + (e.dive ? BALL.diveReach : 0) + 0.6;
      if (d2(b, f) > reach) bad(e.pos + ' ' + e.e + 'es the ball ' + d2(b, f).toFixed(1) + ' ft away at ' + e.t + (e.dive ? ' (diving)' : ''));
      if (e.e === 'catch' && b[2] > BALL.wallReach + 0.1) bad('a catch ' + b[2].toFixed(1) + ' ft up');
    }
  }
  const outs = S.runners.filter((r) => r.end === 0).length;
  if (S.events.filter((e) => e.e === 'out').length > outs) bad('more out events than runners put out');
  return out;
}

module.exports = function (t) {
  t.test('every play script is continuous and agrees with its result (300 games, frequent steals and tag-ups)', () => {
    const { B3, recs } = collect(300, 'script');
    const fails = [];
    const kinds = {};
    for (const rec of recs) {
      const p = problems(B3, rec);
      const k = rec.play.foul ? 'foul' : rec.play.code + (rec.going.length ? ' (going)' : '') + (rec.tag ? ' (tag ' + (rec.tag.ok ? 'safe' : 'out') + ')' : '');
      kinds[k] = (kinds[k] || 0) + 1;
      if (p.length) fails.push(k + ': ' + p.slice(0, 3).join('; '));
    }
    // The rare paths came up.
    for (const k of ['DP', 'FC', 'E', 'HR', '3B', 'LO (going)', 'FO (tag safe)', 'FO (tag out)', '1B (going)', 'foul']) {
      assert.ok(kinds[k] > 0, 'never saw ' + k + ': ' + JSON.stringify(kinds));
    }
    assert.ok(recs.length > 10000, 'plays: ' + recs.length);
    assert.ok(fails.length === 0, fails.length + ' of ' + recs.length + ' scripts have problems, e.g.\n      ' + fails.slice(0, 4).join('\n      '));
  });

  t.test('the checks catch a broken script', () => {
    const { B3, recs } = collect(4, 'broken');
    const rec = recs.find((r) => !r.play.foul && r.play.script.runners.length >= 2 && r.play.code === '1B');
    assert.deepStrictEqual(problems(B3, rec), []);
    const S = rec.play.script;
    const keep = JSON.stringify(S);
    S.runners[0].end = S.runners[0].end === 1 ? 2 : 1;
    assert.ok(problems(B3, rec).some((m) => /ends on/.test(m)), 'a wrong end base');
    Object.assign(S, JSON.parse(keep));
    const tr = S.runners[0].path;
    tr.push([tr[tr.length - 1][0] + 0.1, 300, 300]);
    assert.ok(problems(B3, rec).some((m) => /ft in/.test(m)), 'a runner too fast');
    Object.assign(S, JSON.parse(keep));
    S.ball.splice(1, 0, [S.ball[S.ball.length - 1][0] + 1, 0, 0, 3]);
    assert.ok(problems(B3, rec).some((m) => /time goes back/.test(m)), 'time going back');
  });
};
