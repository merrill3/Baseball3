// CPU choices at every decision point. Logic file: no DOM.
// Step 1.1: simple placeholder logic, enough to play sensible games. Step 1.3 replaces the pitch and
// swing choices with rating-based ones and tunes the pitching changes. Each function gets the
// decision (g.pending) and the game, and returns an answer for B3.game.answer.
(function (root) {
  'use strict';
  const B3 = root.B3 = root.B3 || {};

  function role(team, id) { return team.players[id].role || ''; }

  // The reliever to bring in: the closer for a save spot, setup men late in close games, else middle relief.
  function pickReliever(g, team, lead) {
    const pen = team.bullpen;
    const find = (roles) => pen.find((id) => roles.indexOf(role(team, id)) >= 0);
    let id;
    if (g.inning >= 9 && lead >= 1 && lead <= 3) id = find(['CL']);
    if (!id && g.inning >= 7 && lead >= 0 && lead <= 3) id = find(['SU']);
    if (!id) id = find(['MR', 'LR']);
    return id || pen.find((x) => role(team, x) !== 'CL') || pen[0];
  }

  const cpu = {
    // Changes only between batters. Starters go about 100 pitches; relievers an inning or two.
    change: function (d, g) {
      if (g.balls || g.strikes || !d.bullpen.length) return null;
      const team = g.teams[d.side];
      const live = team.live[d.pitcher];
      const lead = g.score[d.side] - g.score[1 - d.side];
      const starter = team.used[0] === d.pitcher;
      const saveSpot = g.inning >= 9 && lead >= 1 && lead <= 3 && g.outs === 0 && !g.bases[0] && !g.bases[1] && !g.bases[2];
      let tired;
      if (starter) tired = live.pitches >= 100 || live.runs >= 6 || (g.inning >= 7 && live.pitches >= 90);
      else tired = live.pitches >= 30 || live.outs >= 6 || live.runs >= 3;
      if (saveSpot && role(team, d.pitcher) !== 'CL' && team.bullpen.some((id) => role(team, id) === 'CL')) tired = true;
      if (!tired) return null;
      return { pitcher: pickReliever(g, team, lead) };
    },

    // Rare steals of second, rarer of third.
    steal: function (d, g) {
      if (g.outs === 2 && g.rng.chance(0.5)) return null;
      if (d.runners.indexOf(2) >= 0 && !g.bases[0] && g.rng.chance(0.004)) return { runners: [2] };
      if (d.runners.indexOf(1) >= 0 && !g.bases[1] && g.rng.chance(0.016)) return { runners: [1] };
      return null;
    },

    // The first listed pitch most often; about 60% aimed in the zone, more when behind in the count.
    pitch: function (d, g) {
      const r = g.rng;
      const w = d.pitches.map((_, i) => (i === 0 ? 3 : 1.5 / i));
      const type = d.pitches[r.weighted(w)];
      const Z = B3.data.ZONE;
      const inZone = r.chance(d.balls === 3 ? 0.8 : d.strikes === 2 ? 0.45 : 0.6);
      if (inZone) return { type: type, x: r.range(-0.6, 0.6), z: r.range(Z.bottom + 0.25, Z.top - 0.25) };
      const side = r.chance(0.5) ? -1 : 1;
      if (r.chance(0.5)) return { type: type, x: side * r.range(Z.halfWidth + 0.1, Z.halfWidth + 0.8), z: r.range(Z.bottom, Z.top) };
      return { type: type, x: r.range(-0.8, 0.8), z: r.chance(0.7) ? r.range(Z.bottom - 0.9, Z.bottom - 0.1) : r.range(Z.top + 0.1, Z.top + 0.7) };
    },

    // Swings at most strikes and some balls; protects with two strikes; takes on 3-0. The timing is the
    // hitter's own *when* error from the physics (B3.pitch.cpuTiming).
    swing: function (d, g) {
      const r = g.rng;
      let p = d.pitch.zone ? 0.68 : 0.3;
      if (d.strikes === 2) p += 0.15;
      if (d.balls === 3 && d.strikes === 0) p *= 0.3;
      if (!r.chance(p)) return { swing: false };
      return { swing: true, timing: B3.pitch.cpuTiming(g, g.pitch) };
    },

    // Tag from third on a catch in the outfield; sometimes from second on a deep fly (placeholder
    // depths until step 1.3; dist is null when unknown).
    tagup: function (d, g) {
      if (d.code === 'PO') return { go: false };
      const deep = (ft) => d.dist === null || d.dist === undefined || d.dist >= ft;
      if (d.from === 3) return { go: deep(260) };
      if (d.from === 2) return { go: d.code === 'FO' && deep(330) && g.rng.chance(0.5) };
      return { go: false };
    }
  };

  B3.manager = { cpu: cpu };
})(typeof globalThis !== 'undefined' ? globalThis : this);
