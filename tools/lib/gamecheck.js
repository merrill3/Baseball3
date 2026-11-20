// Checks a finished game against the rules, reading its log on its own (not trusting the engine's
// counters). Returns { problems: [text], seen: {scenario: count} }. Node only.
'use strict';

function check(g) {
  const problems = [];
  const seen = {};
  const bad = (msg) => problems.push(msg);
  const saw = (k) => { seen[k] = (seen[k] || 0) + 1; };
  const R = g.rules, N = R.innings;
  const log = g.log;

  if (!g.over || !g.result) bad('the game is not over');
  const ends = log.filter((e) => e.e === 'end');
  if (ends.length !== 1 || log[log.length - 1].e !== 'end') bad('the log must end with exactly one end event');

  // Walk the log half by half.
  const score = [0, 0];
  const spot = [0, 0]; // next batter index per team
  const pitcher = [g.teams[0].used[0], g.teams[1].used[0]];
  const usedSeq = [[pitcher[0]], [pitcher[1]]];
  const live = {}; // pitcher id -> { pitches, outs, runs }
  const L = (id) => (live[id] = live[id] || { pitches: 0, outs: 0, runs: 0 });
  const halves = [];
  let cur = null;
  let balls = 0, strikes = 0;
  const startHalf = (e) => {
    cur = { i: e.i, h: e.h, outs: 0, runs: 0, events: 0, placed: null, firstBatter: null, scoreBefore: score.slice() };
    balls = 0; strikes = 0;
  };

  for (let k = 0; k < log.length; k++) {
    const e = log[k];
    if (e.e === 'end') break;
    if (!cur) startHalf(e);
    if (e.i !== cur.i || e.h !== cur.h) bad('event ' + k + ' is in inning ' + e.i + '.' + e.h + ' before half ' + cur.i + '.' + cur.h + ' closed');
    const bt = e.h, ft = 1 - e.h;
    cur.events++;
    switch (e.e) {
      case 'placed':
        if (cur.events !== 1) bad('a placed runner after the half began');
        cur.placed = e;
        break;
      case 'sub':
        if (e.side !== ft) bad('a pitching change by the batting team');
        if (e.out !== pitcher[ft]) bad('sub removes ' + e.out + ', not the pitcher ' + pitcher[ft]);
        if (usedSeq[ft].indexOf(e.in) >= 0) bad('pitcher ' + e.in + ' returns after leaving');
        pitcher[ft] = e.in;
        usedSeq[ft].push(e.in);
        saw('pitching change');
        break;
      case 'pitch': {
        if (e.p !== pitcher[ft]) bad('pitch by ' + e.p + ', but ' + pitcher[ft] + ' is pitching');
        const due = g.teams[bt].lineup[spot[bt]];
        if (e.b !== due) bad('pitch to ' + e.b + ', but ' + due + ' is due up');
        if (e.c !== balls + '-' + strikes) bad('pitch count ' + e.c + ', expected ' + balls + '-' + strikes);
        L(e.p).pitches++;
        if (e.r === 'B') balls++;
        else if (e.r === 'C' || e.r === 'S') strikes++;
        else if (e.r === 'F') { if (strikes < 2) strikes++; }
        if (balls > 4 || strikes > 3) bad('count went past 4 balls or 3 strikes');
        break;
      }
      case 'pa': {
        const due = g.teams[bt].lineup[spot[bt]];
        if (e.b !== due) bad('PA by ' + e.b + ', but ' + due + ' was due up');
        if (cur.firstBatter === null) cur.firstBatter = spot[bt];
        const last = log[k - 1];
        if (!last || last.e !== 'pitch' || last.b !== e.b) bad('a PA that does not follow its last pitch');
        else {
          if (e.res === 'BB' && !(last.r === 'B' && balls === 4)) bad('a walk without ball four');
          if (e.res === 'K' && !((last.r === 'C' || last.r === 'S') && strikes === 3)) bad('a strikeout without strike three');
          if (e.res !== 'BB' && e.res !== 'K' && last.r !== 'X') bad('a ball-in-play result after a pitch not in play');
          if ((e.res === 'BB') !== (balls === 4) || (e.res === 'K') !== (strikes === 3)) bad('count and result disagree');
        }
        spot[bt] = (spot[bt] + 1) % 9;
        balls = 0; strikes = 0;
        cur.outs += e.out;
        L(e.p).outs += e.out;
        if (cur.outs !== e.o) bad('PA says ' + e.o + ' outs after, the log adds to ' + cur.outs);
        for (const s of e.sc) {
          score[bt]++; cur.runs++;
          L(s.p).runs++;
          if (usedSeq[ft].indexOf(s.p) < 0) bad('a run charged to ' + s.p + ', who has not pitched');
        }
        const onBase = e.bs.filter((x) => x !== null);
        if (new Set(onBase).size !== onBase.length) bad('a runner on two bases');
        for (const id of onBase) if (g.teams[bt].lineup.indexOf(id) < 0) bad('runner ' + id + ' is not on the batting team');
        if (e.res === 'DP') saw('double play');
        if (e.res === 'SF') saw('sac fly');
        if (e.res === 'FC') saw("fielder's choice");
        if (e.res === 'E') saw('reached on error');
        if (e.res === 'HR') saw('home run');
        if (e.tag) saw(e.tag.ok ? 'tag-up safe' : 'tag-up out');
        if (e.res === 'DP' && e.o === 3) saw('inning-ending double play');
        break;
      }
      case 'sb':
        if (e.p !== pitcher[ft]) bad('stolen base charged to the wrong pitcher');
        saw('stolen base');
        break;
      case 'cs':
        cur.outs++;
        L(e.p).outs++;
        if (e.o !== cur.outs) bad('caught stealing says ' + e.o + ' outs, the log adds to ' + cur.outs);
        saw('caught stealing');
        if (cur.outs === 3) saw('caught stealing ends the inning');
        break;
      case 'adv':
        saw('double steal, lead runner out');
        break;
      case 'half': {
        if (e.runs !== cur.runs) bad('half ' + e.i + '.' + e.h + ' says ' + e.runs + ' runs, the log adds to ' + cur.runs);
        if (e.outs !== cur.outs) bad('half ' + e.i + '.' + e.h + ' says ' + e.outs + ' outs, the log adds to ' + cur.outs);
        cur.lob = e.lob;
        halves.push(cur);
        cur = null;
        break;
      }
      default:
        bad('unknown event ' + e.e);
    }
  }
  if (cur) bad('the last half never closed');

  // Halves come in order: 1 top, 1 bottom, 2 top, ...
  halves.forEach((h, n) => {
    const i = Math.floor(n / 2) + 1, hh = n % 2;
    if (h.i !== i || h.h !== hh) bad('half ' + n + ' is ' + h.i + '.' + h.h + ', expected ' + i + '.' + hh);
  });
  const res = g.result || {};
  const last = halves[halves.length - 1];
  if (!last) return { problems: problems.concat('no halves'), seen: seen };

  // Score, line score.
  for (const t of [0, 1]) {
    if (score[t] !== g.score[t]) bad('team ' + t + ': the log has ' + score[t] + ' runs, the score ' + g.score[t]);
    const line = g.line[t].reduce((a, b) => a + b, 0);
    if (line !== g.score[t]) bad('team ' + t + ': the line score adds to ' + line);
    if (g.line[t].length !== halves.filter((h) => h.h === t).length) bad('team ' + t + ': the line score has the wrong number of innings');
  }
  if (res.score && (res.score[0] !== g.score[0] || res.score[1] !== g.score[1])) bad('the result score differs from the game score');

  // Every half has 3 outs except a final half that ends early (walk-off, or the mercy rule while home bats).
  halves.forEach((h, n) => {
    const isLast = n === halves.length - 1;
    const early = isLast && h.h === 1 && (res.reason === 'walkoff' || res.reason === 'mercy');
    if (early ? h.outs > 3 : h.outs !== 3) bad('half ' + h.i + '.' + h.h + ' has ' + h.outs + ' outs');
  });

  // How it ended.
  const s = g.score;
  const lastScore = (h) => h.scoreBefore.map((x, t) => x + (t === h.h ? h.runs : 0));
  if (R.type !== 'quick' && res.winner === null) bad('a league game ended in a tie');
  if (res.winner !== (s[0] > s[1] ? 0 : s[1] > s[0] ? 1 : null)) bad('the winner does not match the score');
  if (res.reason === 'final') {
    if (last.i < N) bad('a final before inning ' + N);
    if (s[0] === s[1]) bad('a final in a tie');
    if (last.h === 0 && !(s[1] > s[0])) bad('the game ended after a top half without home ahead');
    if (last.h === 1 && last.scoreBefore[1] > last.scoreBefore[0]) bad('home batted in the last inning while ahead');
    if (last.h === 0) saw('home skips the last bottom half');
  }
  // In innings N and later, home never bats while already ahead, and nobody bats once a team won.
  for (const h of halves) {
    if (h.i >= N && h.h === 1 && h.scoreBefore[1] > h.scoreBefore[0]) bad('home batted in inning ' + h.i + ' while ahead');
    if (h !== last) {
      const after = lastScore(h);
      if (h.i >= N && h.h === 1 && after[0] !== after[1]) bad('the game went on after a decided inning ' + h.i);
      if (h.i >= N && h.h === 0 && after[1] > after[0]) bad('home batted after leading after the top of ' + h.i);
    }
  }
  if (res.reason === 'walkoff') {
    if (last.h !== 1 || last.i < N) bad('a walk-off outside the bottom of inning ' + N + ' or later');
    if (!(last.scoreBefore[1] <= last.scoreBefore[0] && s[1] > s[0])) bad('a walk-off where home did not take the lead');
    const lastPA = [...log].reverse().find((e) => e.e === 'pa');
    if (lastPA.res !== 'HR' && s[1] - s[0] !== 1) bad('a walk-off without a home run won by more than 1');
    if (lastPA.res === 'HR' && s[1] - s[0] > 4) bad('a walk-off home run won by more than 4');
    saw('walk-off');
    if (lastPA.res === 'HR') saw('walk-off home run');
    if (lastPA.res === 'BB') saw('walk-off walk');
  }
  if (res.reason === 'tie') {
    if (R.type !== 'quick') bad('a tie in a ' + R.type + ' game');
    if (s[0] !== s[1]) bad('a tie with different scores');
    if (last.i !== R.lastInning || last.h !== 1) bad('a tie that did not end after inning ' + R.lastInning);
    saw('tie');
  }
  if (R.lastInning !== null && last.i > R.lastInning) bad('the game went past inning ' + R.lastInning);
  if (res.reason === 'mercy') {
    if (!R.mercy) bad('the mercy rule in a game without it');
    else {
      const lead = Math.abs(s[0] - s[1]);
      const trailing = s[0] > s[1] ? 1 : 0;
      const done = halves.filter((h) => h.h === trailing && (h.outs === 3 || h !== last)).length;
      if (lead < R.mercy.runs) bad('the mercy rule with a lead of ' + lead);
      if (done < R.mercy.innings) bad('the mercy rule before the trailing team batted ' + R.mercy.innings + ' times');
    }
    saw('mercy rule');
  }
  if (['final', 'walkoff', 'mercy', 'tie'].indexOf(res.reason) < 0) bad('unknown end reason ' + res.reason);

  // Extra innings: a runner on second to start each extra half where the rules say so, nowhere else.
  for (const h of halves) {
    const extra = h.i > N;
    if (extra && R.placedRunner) {
      if (!h.placed) bad('no runner on second to start ' + h.i + '.' + h.h);
      else {
        if (h.placed.base !== 2) bad('the placed runner is not on second');
        const lineup = g.teams[h.h].lineup;
        // He is the batter before this half's leadoff hitter.
        const lead = h.firstBatter === null ? null : h.firstBatter;
        if (lead !== null && h.placed.r !== lineup[(lead + 8) % 9]) bad('the wrong placed runner in ' + h.i + '.' + h.h);
      }
      saw('extra innings, runner on second');
    } else if (h.placed) {
      bad('a placed runner in ' + h.i + '.' + h.h + ' (' + R.type + ')');
    }
    if (extra && !R.placedRunner) saw('extra innings, no runner on second');
  }

  // The engine's own counters agree with the log.
  for (const t of [0, 1]) {
    const used = g.teams[t].used;
    if (used.join() !== usedSeq[t].join()) bad('team ' + t + ': pitchers used ' + used.join() + ', the log says ' + usedSeq[t].join());
    for (const id of used) {
      const a = g.teams[t].live[id], b = L(id);
      if (a.pitches !== b.pitches || a.outs !== b.outs || a.runs !== b.runs) bad('pitcher ' + id + ': live counters differ from the log');
    }
  }
  return { problems: problems, seen: seen };
}

module.exports = { check };
