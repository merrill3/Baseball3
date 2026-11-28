// The 162-game schedule (M2 step 2.1b, Session 31; DESIGN.md section 5): 2,430 games in series of 2 to 4 games on a
// 186-day calendar with off days and a 4-day All-Star break. Logic file: no DOM.
//
//   B3.schedule.make(seed, teams)    a season's schedule, a pure function of the seed. teams defaults to B3.teams.list
//                                    (any 30 teams in 2 leagues of 3 divisions of 5, each with a rival in the other
//                                    league). Returns { days, breakDays: [the 4 break days],
//                                      games:  [{ id, day, away, home, series, game }]      by day; game is 1-based
//                                      series: [{ id, away, home, days: [...], games, kind }] by first day; kind is
//                                              'division' | 'league' | 'inter' | 'rival' }
//                                    Team ids are the teams' own ids; days are 0-based.
//   B3.schedule.weekday(day)         0 Monday ... 6 Sunday. Day 0, Opening Day, is a Thursday.
//   B3.schedule.MAX_STRETCH          20: no team plays more days in a row than this
//
// The mix is the owner's choice (DESIGN.md section 5): 13 games against each division rival, 7 against four of the other
// ten league teams and 6 against the rest, one 3-game series against each of the 14 non-rivals in the other league and
// 2 + 2 against the natural rival; 81 home games each. Everything else here is Claude's default:
//   - Series: 13 = 4 + 3 at the park of the team with 7 home games and 3 + 3 at the other; 7 = 4 + 3; 6 = 3 + 3.
//   - The four 7-game opponents are two from each other division (two random perfect matchings per pair of divisions),
//     so every team has exactly four.
//   - Who hosts is set so every team has exactly 81 home games with no fix-up step: in each division a random regular
//     tournament (each team has 7 home games against two of its rivals, 6 against the other two); between divisions
//     each team hosts 4 of 7 in one of its 7-game pairs per division and 3 of 7 in the other; in interleague each team
//     hosts 7 of its 14 single series.
//   - The calendar is MLB-like: Opening Day on a Thursday (a Thu-Sun round), then 26 weeks of a Mon-Thu round and a
//     Fri-Sun round; week 16's Mon-Thu (days 109-112, 59% of the way, as in MLB 2024) is the All-Star break: 186 days,
//     52 rounds. Every team plays exactly one series in every round, so every team gets 20 off days (plus the break)
//     and no team starts late. A 4-game series needs a 4-day round; a 3-game series in a 4-day round leaves one off day
//     (Monday or Thursday), a 2-game series one off day on a weekend or two in midweek.
//   - No team plays 4-game series in three 4-day rounds in a row; with the off-day rule below that caps a stretch of
//     game days at 20, and outside the break no team is off more than 3 days running.
// How it is built: the series are packed round by round. Each series has a target round (a pair's series spread evenly
// through the season, a team's interleague series spread through it too); each round is a perfect matching of the 30
// teams, found by a depth-first search that takes the most constrained team first and its best series first (overdue,
// not the same opponent as lately, homestands and road trips of 2-4 series, 4-game series on pace). The last 3 rounds
// are searched together, since a choice there must leave the next rounds fillable (an odd cycle of teams left for the
// last two rounds can't be). When a round can't be filled the search steps back a few rounds and tries again; if that
// keeps failing, make() starts over from a seed derived from the first, so the result still depends only on the seed
// (in 2,000 seeds tried, none needed to; the slowest took about 0.3 s, the median 0.02 s). Then each series' off day
// goes on a day a team changes parks (a travel day) where it can.
(function (root) {
  'use strict';
  const B3 = root.B3 = root.B3 || {};

  const N = 30;
  const WEEKS = 26, BREAK_WEEK = 15;   // 0-based: the 16th week's Mon-Thu is the break
  const MAX_STRETCH = 20;
  const NODE_LIMIT = 3000;             // search steps per round before it counts as stuck
  const END = 3, END_LIMIT = 20000;    // the last 3 rounds are searched together, in up to this many steps
  const STEPS_BACK = 150;              // times an attempt may step back before it starts over
  const ATTEMPTS = 50;

  // Scores for choosing a round's series (Claude's defaults, tuned on the schedules they give over many seeds).
  const W = {
    lateClamp: 12,                // rounds past (or before) a series' target round count up to this
    lastRound: -8, twoRounds: -3, // the same two teams met last round / two rounds ago
    stay: [0, 6, 2, -1.5, -6],   // continuing a homestand or road trip of 1, 2, 3, 4+ series (switching: the negative)
    balance: 0.4,                 // per series of home-road imbalance still to play
    pace4: 4,                     // 4-game series: by how far a team is from running out of room for them
    early4: 0.8,                  // 4-game series aim this far into the season (they only fit the 4-day rounds)
    noise: 1,
    stretch: 0.5, stretchFrom: 14 // placing off days: per day a stretch would run past 14
  };

  // CAP4[n][s]: the most 4-game series a team can still play in n 4-day rounds when it played them in the last s
  // 4-day rounds running (never three in a row).
  const CAP4 = (function () {
    const c = [[0, 0, 0]];
    for (let n = 1; n <= WEEKS + 1; n++) c.push([0, 1, 2].map((s) => Math.max(c[n - 1][0], s < 2 ? 1 + c[n - 1][s + 1] : 0)));
    return c;
  })();

  // The calendar: rounds of 4 days (Thu-Sun on opening, then Mon-Thu) and 3 days (Fri-Sun).
  function calendar() {
    const rounds = [{ start: 0, len: 4 }];
    let breakDays = [];
    for (let w = 0; w < WEEKS; w++) {
      const mon = 4 + 7 * w;
      if (w === BREAK_WEEK) breakDays = [mon, mon + 1, mon + 2, mon + 3];
      else rounds.push({ start: mon, len: 4 });
      rounds.push({ start: mon + 4, len: 3 });
    }
    // left4: how many 4-day rounds there are from this round on.
    let n = 0;
    for (let i = rounds.length - 1; i >= 0; i--) { if (rounds[i].len === 4) n++; rounds[i].left4 = n; }
    return { rounds: rounds, breakDays: breakDays, days: 4 + 7 * WEEKS };
  }

  // The teams as indexes: league, division, rival; checks the shape.
  function structure(teams) {
    if (!Array.isArray(teams) || teams.length !== N) throw new Error('B3.schedule: 30 teams are needed');
    const idx = {}, leagues = [], divs = [];
    teams.forEach((t, i) => {
      if (idx[t.id] !== undefined) throw new Error('B3.schedule: two teams have the id ' + t.id);
      idx[t.id] = i;
    });
    const lg = [], rival = [];
    teams.forEach((t, i) => {
      let L = leagues.indexOf(t.league);
      if (L < 0) { L = leagues.length; leagues.push(t.league); }
      let D = divs.findIndex((d) => d.id === t.division);
      if (D < 0) { D = divs.length; divs.push({ id: t.division, league: L, teams: [] }); }
      if (divs[D].league !== L) throw new Error('B3.schedule: division ' + t.division + ' is in two leagues');
      divs[D].teams.push(i);
      lg[i] = L;
    });
    if (leagues.length !== 2 || divs.length !== 6 || divs.some((d) => d.teams.length !== 5)) {
      throw new Error('B3.schedule: 2 leagues of 3 divisions of 5 teams are needed');
    }
    teams.forEach((t, i) => {
      const r = idx[t.rival];
      if (r === undefined || lg[r] === lg[i] || teams[r].rival !== t.id) {
        throw new Error('B3.schedule: ' + t.id + ' needs a rival in the other league that has it as its rival');
      }
      rival[i] = r;
    });
    return { ids: teams.map((t) => t.id), rival: rival, divs: divs, byLeague: [0, 1].map((L) => divs.filter((d) => d.league === L)) };
  }

  function shuffle(rng, a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = rng.int(i + 1), x = a[i];
      a[i] = a[j]; a[j] = x;
    }
    return a;
  }

  // Every series: { home, away, len, kind, pair, target }; pairs: { a, b, series: [indexes] }.
  function buildSeries(rng, T, R) {
    const S = [], P = [];
    function pair(a, b, kind, hosts, lens, targets) {
      const p = { a: a, b: b, series: [] };
      for (let i = 0; i < hosts.length; i++) {
        p.series.push(S.length);
        S.push({ home: hosts[i], away: hosts[i] === a ? b : a, len: lens[i], kind: kind, pair: P.length,
          target: lens[i] === 4 ? targets[i] * W.early4 : targets[i] });
      }
      P.push(p);
    }
    // k target rounds spread evenly over the season from a random start.
    function spread(k) {
      const u = rng.next(), out = [];
      for (let i = 0; i < k; i++) out.push((u + i) * R / k - 0.5);
      return out;
    }
    // Division: a random regular tournament (team p[i] hosts 7 against p[i+1] and p[i+2]); the parks alternate.
    for (const d of T.divs) {
      const p = shuffle(rng, d.teams.slice());
      for (let i = 0; i < 5; i++) {
        for (let k = 1; k <= 2; k++) {
          const a = p[i], b = p[(i + k) % 5];   // a hosts 4 + 3, b hosts 3 + 3
          const aLens = shuffle(rng, [4, 3]);
          const aFirst = rng.chance(0.5);
          pair(a, b, 'division', aFirst ? [a, b, a, b] : [b, a, b, a],
            aFirst ? [aLens[0], 3, aLens[1], 3] : [3, aLens[0], 3, aLens[1]], spread(4));
        }
      }
    }
    // Same league, other divisions: two disjoint perfect matchings between each pair of divisions are the 7-game pairs;
    // in one the first division's team hosts 4, in the other the second's.
    for (const divs of T.byLeague) {
      for (let x = 0; x < 3; x++) {
        for (let y = x + 1; y < 3; y++) {
          const A = shuffle(rng, divs[x].teams.slice()), B = shuffle(rng, divs[y].teams.slice());
          let q;
          do { q = shuffle(rng, [0, 1, 2, 3, 4]); } while (q.some((v, i) => v === i));
          for (let i = 0; i < 5; i++) {
            for (let j = 0; j < 5; j++) {
              const a = A[i], b = B[j];
              let hosts, lens;
              if (j === i) { hosts = [a, b]; lens = [4, 3]; }
              else if (j === q[i]) { hosts = [b, a]; lens = [4, 3]; }
              else { hosts = [a, b]; lens = [3, 3]; }
              if (rng.chance(0.5)) { hosts.reverse(); lens.reverse(); }
              pair(a, b, 'league', hosts, lens, spread(2));
            }
          }
        }
      }
    }
    // Interleague: the leagues lined up by rival; the offset k = j - i (mod 15) between two teams says who hosts (one
    // league for offsets 1-7, the other for 8-14) and when: each offset is a perfect matching between the leagues, and
    // the 14 offsets get evenly spread target rounds in a random order, so each team's 14 series are spread too.
    const U = shuffle(rng, [].concat(...T.byLeague[0].map((d) => d.teams)));
    const D = U.map((u) => T.rival[u]);
    const flip = rng.chance(0.5);
    const slot = shuffle(rng, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    for (let i = 0; i < 15; i++) {
      for (let j = 0; j < 15; j++) {
        const a = U[i], b = D[j];
        if (i === j) {
          pair(a, b, 'rival', rng.chance(0.5) ? [a, b] : [b, a], [2, 2], spread(2));
        } else {
          const k = (j - i + 15) % 15;
          pair(a, b, 'inter', [((k <= 7) !== flip) ? a : b], [3], [(slot[k - 1] + rng.next()) * R / 14 - 0.5]);
        }
      }
    }
    return { S: S, P: P };
  }

  // The packing state, and a copy of it to step back to.
  function startState(S, P) {
    const st = { rem: P.map((p) => p.series.slice()), four: new Array(N).fill(0), homeLeft: new Array(N).fill(0),
      awayLeft: new Array(N).fill(0), streak: new Array(N).fill(0), lastHome: new Array(N).fill(-1), run: new Array(N).fill(0),
      lastMeet: new Array(P.length).fill(-99), chosen: [] };
    for (const s of S) { if (s.len === 4) { st.four[s.home]++; st.four[s.away]++; } st.homeLeft[s.home]++; st.awayLeft[s.away]++; }
    return st;
  }
  function copyState(st) {
    return { rem: st.rem.map((a) => a.slice()), four: st.four.slice(), homeLeft: st.homeLeft.slice(), awayLeft: st.awayLeft.slice(),
      streak: st.streak.slice(), lastHome: st.lastHome.slice(), run: st.run.slice(), lastMeet: st.lastMeet.slice(),
      chosen: st.chosen.slice() };
  }

  // One round's series: a perfect matching of the teams, or null if the search is stuck.
  function fillRound(rng, S, st, rd, r, R, budget, accept) {
    const left = R - r, after4 = rd.left4 - (rd.len === 4 ? 1 : 0);
    const can4 = [], canOther = [], room = [];
    for (let t = 0; t < N; t++) {
      const f = st.four[t];
      room[t] = CAP4[rd.left4][st.streak[t]];
      if (rd.len === 4) {
        can4[t] = f > 0 && st.streak[t] < 2 && f - 1 <= CAP4[after4][st.streak[t] + 1];
        canOther[t] = f <= CAP4[after4][0] && left > f;
      } else {
        can4[t] = false;
        canOther[t] = f <= room[t];
      }
    }
    function stay(t, home) {
      let v = 0;
      if (st.lastHome[t] >= 0) {
        const k = Math.min(st.run[t], 4);
        v = st.lastHome[t] === home ? W.stay[k] : -W.stay[k];
      }
      return v + W.balance * (home ? st.homeLeft[t] - st.awayLeft[t] : st.awayLeft[t] - st.homeLeft[t]);
    }
    // Each team's options: one series per (pair, home team, length), best first.
    const scored = [];
    for (let pi = 0; pi < st.rem.length; pi++) {
      const seen = [];
      for (const si of st.rem[pi]) {
        const s = S[si], key = s.home * 8 + s.len;
        if (seen.indexOf(key) >= 0) continue;
        seen.push(key);
        if (s.len > rd.len) continue;
        if (s.len === 4 ? !(can4[s.home] && can4[s.away]) : !(canOther[s.home] && canOther[s.away])) continue;
        let sc = Math.max(-W.lateClamp, Math.min(W.lateClamp, r - s.target));
        const gap = r - st.lastMeet[pi];
        if (gap === 1) sc += W.lastRound; else if (gap === 2) sc += W.twoRounds;
        sc += stay(s.home, 1) + stay(s.away, 0);
        if (s.len === 4) sc += W.pace4 * (st.four[s.home] / Math.max(1, room[s.home]) + st.four[s.away] / Math.max(1, room[s.away]));
        scored.push({ si: si, sc: sc + W.noise * rng.next() });
      }
    }
    scored.sort((x, y) => y.sc - x.sc || x.si - y.si);
    const opts = [];
    for (let t = 0; t < N; t++) opts.push([]);
    for (const o of scored) { opts[S[o.si].home].push(o.si); opts[S[o.si].away].push(o.si); }

    // Depth-first: the team with the fewest options first, its best series first. With accept (the endgame), a full
    // matching counts only if accept(it) says the rounds after it can be filled too; budget.nodes counts the steps.
    const order = shuffle(rng, Array.from({ length: N }, (_, i) => i));
    const free = new Uint8Array(N).fill(1), chosen = [];
    function dfs(need) {
      if (need === 0) return accept ? accept(chosen.slice()) : true;
      if (++budget.nodes > budget.limit) return false;
      let best = -1, bestN = 1e9;
      for (const t of order) {
        if (!free[t]) continue;
        let c = 0;
        for (const si of opts[t]) if (free[S[si].home] && free[S[si].away]) c++;
        if (c < bestN) { bestN = c; best = t; if (c <= 1) break; }
      }
      if (bestN === 0) return false;
      for (const si of opts[best]) {
        const s = S[si];
        if (!free[s.home] || !free[s.away]) continue;
        free[s.home] = free[s.away] = 0; chosen.push(si);
        if (dfs(need - 2)) return true;
        free[s.home] = free[s.away] = 1; chosen.pop();
        if (budget.nodes > budget.limit) return false;
      }
      return false;
    }
    return dfs(N) ? chosen : null;
  }

  function applyRound(S, st, rd, r, chosen) {
    const played4 = new Uint8Array(N);
    for (const si of chosen) {
      const s = S[si], list = st.rem[s.pair];
      list.splice(list.indexOf(si), 1);
      st.lastMeet[s.pair] = r;
      if (s.len === 4) { st.four[s.home]--; st.four[s.away]--; played4[s.home] = played4[s.away] = 1; }
      st.homeLeft[s.home]--; st.awayLeft[s.away]--;
      for (const [t, h] of [[s.home, 1], [s.away, 0]]) {
        if (st.lastHome[t] === h) st.run[t]++; else { st.lastHome[t] = h; st.run[t] = 1; }
      }
    }
    if (rd.len === 4) for (let t = 0; t < N; t++) st.streak[t] = played4[t] ? st.streak[t] + 1 : 0;
    st.chosen.push(chosen);
  }

  // Every series' round, or null when this attempt is stuck.
  function pack(rng, S, P, cal) {
    const rounds = cal.rounds, R = rounds.length;
    // The last END rounds are searched together, so a choice is kept only if the rounds after it can still be filled
    // (an odd cycle of teams left for the last two rounds can't be). Returns the finished state or null.
    function endgame(st0, r, budget) {
      if (r === R) return st0;
      let done = null;
      fillRound(rng, S, st0, rounds[r], r, R, budget, (chosen) => {
        const st1 = copyState(st0);
        applyRound(S, st1, rounds[r], r, chosen);
        done = endgame(st1, r + 1, budget);
        return !!done;
      });
      return done;
    }
    const snaps = [];
    let st = startState(S, P), back = 0;
    for (let r = 0; r < R;) {
      snaps[r] = copyState(st);
      if (r === R - END) {
        const done = endgame(st, r, { nodes: 0, limit: END_LIMIT });
        if (done) { st = done; break; }
      } else {
        const chosen = fillRound(rng, S, st, rounds[r], r, R, { nodes: 0, limit: NODE_LIMIT });
        if (chosen) { applyRound(S, st, rounds[r], r, chosen); r++; continue; }
      }
      // Stuck: step back further the more often it happens.
      if (++back > STEPS_BACK) return null;
      r = Math.max(0, r - 1 - (back >> 2));
      st = copyState(snaps[r]);
    }
    const roundOf = new Array(S.length);
    st.chosen.forEach((list, r) => { for (const si of list) roundOf[si] = r; });
    return roundOf;
  }

  // Where each series sits in its round (which days are off), as its first day. An off day goes before the series if
  // a team in it changes parks to get there, after it if one changes parks to leave (a travel day), and where it keeps
  // stretches of game days short (W.stretch). Hard limits: a stretch stays within MAX_STRETCH (an off day after the
  // series only if that keeps it; an off day first always does, given the packing's rule on 4-game series), and no
  // more than 3 off days in a row outside the break.
  function place(rng, S, roundOf, cal) {
    const rounds = cal.rounds, R = rounds.length;
    const byRound = [], park = [], slackOf = [];
    for (let r = 0; r < R; r++) byRound.push([]);
    for (let t = 0; t < N; t++) { park.push(new Array(R)); slackOf.push(new Array(R)); }
    S.forEach((s, i) => {
      const r = roundOf[i];
      byRound[r].push(i);
      park[s.home][r] = park[s.away][r] = s.home;
      slackOf[s.home][r] = slackOf[s.away][r] = rounds[r].len - s.len;
    });
    // ahead[t][r]: game days after round r before t's next round with an off day in it (or the break, or the end).
    const gapAfter = (r) => r + 1 >= R || rounds[r + 1].start !== rounds[r].start + rounds[r].len;
    const ahead = [];
    for (let t = 0; t < N; t++) {
      const a = new Array(R);
      for (let r = R - 1; r >= 0; r--) a[r] = gapAfter(r) || slackOf[t][r + 1] > 0 ? 0 : rounds[r + 1].len + a[r + 1];
      ahead.push(a);
    }
    const runEnd = new Array(N).fill(0), offEnd = new Array(N).fill(0);   // game days / off days running into the round
    const first = new Array(S.length);
    for (let r = 0; r < R; r++) {
      const rd = rounds[r];
      if (r > 0 && gapAfter(r - 1)) { runEnd.fill(0); offEnd.fill(0); } // the break
      for (const si of byRound[r]) {
        const s = S[si], slack = rd.len - s.len, teams = [s.home, s.away];
        let best = -1, bestSc = -1e9;
        for (let o = 0; o <= slack; o++) {
          const tail = slack - o;
          let sc = rng.next() * 0.1, ok = true, longest = 0;
          for (const t of teams) {
            const closed = o > 0 ? runEnd[t] : runEnd[t] + s.len;               // the stretch the first off day ends
            const next = (tail > 0 ? 0 : o > 0 ? s.len : runEnd[t] + s.len) + ahead[t][r];
            if (tail > 0 && closed > MAX_STRETCH) ok = false;
            if (o > 0 && (r > 0 ? offEnd[t] : 0) + o > 3) ok = false;
            if (o > 0 && r > 0 && park[t][r - 1] !== s.home) sc += 1;          // off day before: travel
            if (tail > 0 && r < R - 1 && park[t][r + 1] !== s.home) sc += 1;   // off day after: travel
            if (o > 0 && r === 0) sc -= 0.5;                                   // everyone plays on Opening Day if it can
            longest = Math.max(longest, slack > 0 ? closed : 0, next);
          }
          sc -= W.stretch * Math.max(0, longest - W.stretchFrom);
          if (ok && sc > bestSc) { bestSc = sc; best = o; }
        }
        if (best < 0) best = slack > 0 ? 1 : 0; // not reached: an off day first always keeps both limits
        first[si] = rd.start + best;
        const tail = slack - best;
        for (const t of teams) {
          if (tail > 0) { runEnd[t] = 0; offEnd[t] = tail; }
          else { runEnd[t] = best > 0 ? s.len : runEnd[t] + s.len; offEnd[t] = 0; }
        }
      }
    }
    return first;
  }

  function make(seed, teams) {
    const T = structure(teams || B3.teams.list);
    const cal = calendar();
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      const rng = B3.rng.create(attempt === 0 ? seed : String(seed) + '/schedule ' + attempt);
      const built = buildSeries(rng, T, cal.rounds.length);
      const roundOf = pack(rng, built.S, built.P, cal);
      if (!roundOf) continue;
      const first = place(rng, built.S, roundOf, cal);
      const order = built.S.map((s, i) => i).sort((x, y) => first[x] - first[y] || built.S[x].home - built.S[y].home);
      const series = [], games = [];
      order.forEach((si, id) => {
        const s = built.S[si], days = [];
        for (let g = 0; g < s.len; g++) days.push(first[si] + g);
        series.push({ id: id, away: T.ids[s.away], home: T.ids[s.home], days: days, games: s.len, kind: s.kind });
      });
      for (const s of series) s.days.forEach((d, g) => games.push({ id: 0, day: d, away: s.away, home: s.home, series: s.id, game: g + 1 }));
      games.sort((x, y) => x.day - y.day || x.series - y.series);
      games.forEach((g, i) => { g.id = i; });
      return { days: cal.days, breakDays: cal.breakDays.slice(), games: games, series: series };
    }
    throw new Error('B3.schedule.make: no schedule found for seed ' + seed);
  }

  B3.schedule = {
    make: make,
    weekday: function (day) { return (day + 3) % 7; },
    MAX_STRETCH: MAX_STRETCH,
    W: W
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
