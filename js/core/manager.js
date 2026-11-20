// CPU choices at every decision point. Logic file: no DOM.
// Step 1.3 (task 10): the swing, pitch and pitching-change choices read the players' inputs from their
// ratings (B3.ratings); their numbers are B3.tune.CPU. Steals and tag-ups keep step 1.1's placeholder
// logic until step 1.4 maps Speed and Baserunning. Each function gets the decision (g.pending) and the
// game, and returns an answer for B3.game.answer.
(function (root) {
  'use strict';
  const B3 = root.B3 = root.B3 || {};

  function role(team, id) { return team.players[id].role || ''; }
  function C() { return B3.tune.CPU; }

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

  // Fatigue steps for a pitcher this game: 0 until his Stamina's pitches, then one per fatigueSpan.
  function fatigue(team, id) {
    return (team.live[id].pitches - team.inp[id].pit.stamina) / B3.tune.PITCH.fatigueSpan;
  }

  // Is the pitcher done? Starters go until tired or hit hard; relievers by role, outs and Stamina.
  function done(g, team, id) {
    const P = C().pull, live = team.live[id], f = fatigue(team, id);
    const newInning = g.outs === 0 && !g.bases[0] && !g.bases[1] && !g.bases[2];
    if (team.used[0] === id) {
      if (f >= P.starter || (g.inning >= 7 && f >= P.late)) return true;
      return live.runs >= P.starterRuns || (live.runs >= P.starterRuns - 1 && f >= -25 / B3.tune.PITCH.fatigueSpan);
    }
    if (f >= P.reliever || live.runs >= P.relieverRuns) return true;
    if (P.oneInning.indexOf(role(team, id)) >= 0) return newInning && live.outs >= 3;
    if (role(team, id) === 'MR') return live.outs >= P.middleOuts || (newInning && live.outs >= 3 && f >= -0.6);
    return false;
  }

  function fast(type) { return type === 'FF' || type === 'SI' || type === 'FC'; }

  const cpu = {
    // Changes only between batters: when the pitcher is tired or hit hard, and the closer for a save spot.
    change: function (d, g) {
      if (g.balls || g.strikes || !d.bullpen.length) return null;
      const team = g.teams[d.side];
      const lead = g.score[d.side] - g.score[1 - d.side];
      const saveSpot = g.inning >= 9 && lead >= 1 && lead <= 3 && g.outs === 0 && !g.bases[0] && !g.bases[1] && !g.bases[2];
      let out = done(g, team, d.pitcher);
      if (saveSpot && role(team, d.pitcher) !== 'CL' && team.bullpen.some((id) => role(team, id) === 'CL')) out = true;
      if (!out) return null;
      return { pitcher: pickReliever(g, team, lead) };
    },

    // Rare steals of second, rarer of third.
    steal: function (d, g) {
      if (g.outs === 2 && g.rng.chance(0.5)) return null;
      if (d.runners.indexOf(2) >= 0 && !g.bases[0] && g.rng.chance(0.004)) return { runners: [2] };
      if (d.runners.indexOf(1) >= 0 && !g.bases[1] && g.rng.chance(0.016)) return { runners: [1] };
      return null;
    },

    // The type: by its usual share and its grade; fastballs when behind, the put-away pitch with two
    // strikes. The target: in the zone by a chance set by the count and Aim (a nibbler works the
    // corners, an attacker the middle), else just off the plate (low for pitches that sink or break).
    pitch: function (d, g) {
      const P = C().pitch, r = g.rng, Z = B3.data.ZONE;
      const pit = g.teams[d.side].inp[d.pitcher].pit;
      const step = B3.tune.RATE.grade.step;
      const w = d.pitches.map((t) => {
        const m = pit.grades[t] === undefined ? 1 : pit.grades[t];
        let x = (P.use[t] || 1) * Math.exp(P.gradeUse * (m - 1) / step);
        if (fast(t) && d.balls - d.strikes >= 2) x *= P.behind;
        if (d.strikes === 2 && t === pit.putAway) x *= P.putAway;
        return x;
      });
      const type = d.pitches[r.weighted(w)];
      const aim = pit.aim || 0;
      const away = B3.pitch.who(g).bats === 'L' ? -1 : 1; // the side of the plate away from the batter
      const low = r.chance(P.low[type]);
      if (r.chance(P.zone[d.balls][d.strikes] + P.aimZone * aim)) {
        const inset = P.inset[aim + 1];
        const side = r.chance(0.55) ? away : -away;
        const x = side * (Z.halfWidth - r.range(inset[0], inset[1]));
        const dz = r.range(inset[0], inset[1]);
        return { type: type, x: x, z: low ? Z.bottom + dz : Z.top - dz };
      }
      const off = r.range(P.chase[0], P.chase[1]);
      if (low) return { type: type, x: away * r.range(-0.3, Z.halfWidth), z: Z.bottom - off };
      if (r.chance(0.5)) return { type: type, x: r.range(-0.5, 0.5), z: Z.top + off };
      return { type: type, x: away * (Z.halfWidth + off), z: r.range(Z.bottom + 0.2, Z.top - 0.2) };
    },

    // Swing or take: unless he is taking all the way, he swings when the pitch looks to cross inside his line for the count
    // (B3.pitch.look: Recognition, Deception, Discipline), moved out by Aggressiveness. The timing is
    // his own *when* error from the physics (B3.pitch.cpuTiming).
    swing: function (d, g) {
      const S = C().swing;
      const bat = g.teams[d.side].inp[d.batter].bat;
      const k = Math.min(d.strikes, 2), agg = bat.aggressiveness || 0;
      // Early in the count he sometimes takes whatever comes (to see a pitch, or sitting on one); an
      // aggressive hitter less often, a patient one more.
      if (g.rng.chance(S.take[d.balls][k] * (1 - S.aggTake * agg))) return { swing: false };
      // Aggressiveness moves his line out (Patient: in) in step with his lean toward seeing balls as
      // strikes (Discipline): an undisciplined aggressive hitter chases a lot more, a disciplined one
      // mostly skips the blind takes. So Aggressive pays off with good Discipline, and Patient is the
      // safer style for poor Discipline (owner's choice).
      const line = S.line[d.balls][k] + agg * S.agg[k] * bat.judgeLean / B3.tune.BAT.judgeLean;
      if (B3.pitch.look(g, g.pitch).edge >= line) return { swing: false };
      return { swing: true, timing: B3.pitch.cpuTiming(g, g.pitch) };
    },

    // Tag from third on a catch in the outfield; sometimes from second on a deep fly (placeholder
    // depths until step 1.4; dist is null when unknown).
    tagup: function (d, g) {
      if (d.code === 'PO') return { go: false };
      const deep = (ft) => d.dist === null || d.dist === undefined || d.dist >= ft;
      if (d.from === 3) return { go: deep(260) };
      if (d.from === 2) return { go: d.code === 'FO' && deep(330) && g.rng.chance(0.5) };
      return { go: false };
    }
  };

  B3.manager = { cpu: cpu, fatigue: fatigue, done: done };
})(typeof globalThis !== 'undefined' ? globalThis : this);
