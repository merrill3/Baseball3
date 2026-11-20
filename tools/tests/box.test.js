// Box score and play log (M1 step 1.1, task 5): the box, built from the log, matches the game.
'use strict';
const assert = require('assert');
const { loadCore } = require('../lib/load');
const { pair } = require('../lib/testteams');
const gametest = require('../gametest');

const sum = (arr, k) => arr.reduce((a, x) => a + x[k], 0);

function checkBox(B3, g) {
  const box = B3.box.build(g);
  const bad = [];
  const want = (ok, msg) => { if (!ok) bad.push(msg); };
  const pas = g.log.filter((e) => e.e === 'pa');
  const halves = g.log.filter((e) => e.e === 'half');
  for (const side of [0, 1]) {
    const t = box.teams[side], opp = box.teams[1 - side];
    const mine = pas.filter((e) => e.h === side);
    // Runs.
    want(t.R === g.score[side], side + ': R ' + t.R + ' vs score ' + g.score[side]);
    want(sum(t.batting, 'R') === t.R, side + ': batters\' runs');
    want(sum(opp.pitching, 'R') === t.R, side + ': runs charged to the other pitchers');
    want(JSON.stringify(box.line[side]) === JSON.stringify(g.line[side]), side + ': line score');
    // Hits.
    const hits = mine.filter((e) => ['1B', '2B', '3B', 'HR'].indexOf(e.res) >= 0).length;
    want(t.H === hits && sum(t.batting, 'H') === hits && sum(opp.pitching, 'H') === hits, side + ': hits');
    want(opp.E === pas.filter((e) => e.h === side && e.res === 'E').length, side + ': errors');
    // Outs as innings pitched: the other team's pitchers got every out this team made.
    const outsMade = halves.filter((e) => e.h === side).reduce((a, e) => a + e.outs, 0);
    want(sum(opp.pitching, 'outs') === outsMade, side + ': pitchers\' outs ' + sum(opp.pitching, 'outs') + ' vs outs made ' + outsMade);
    for (const p of t.pitching) {
      const live = g.teams[side].live[p.id];
      want(p.outs === live.outs && p.P === live.pitches && p.BF === live.bf && p.R === live.runs, side + ': pitcher ' + p.id + ' vs the game\'s counters');
      want(p.IP === B3.box.ip(p.outs) && p.ER <= p.R && p.S <= p.P, side + ': pitcher ' + p.id + ' IP, ER or strikes');
    }
    // Plate appearances: as the sum of their outcomes, and as AB + BB + SF.
    want(t.PA === mine.length && sum(t.batting, 'PA') === mine.length && sum(opp.pitching, 'BF') === mine.length, side + ': PA count');
    for (const b of t.batting) {
      const singles = b.H - b['2B'] - b['3B'] - b.HR;
      const outcomes = singles + b['2B'] + b['3B'] + b.HR + b.BB + b.K + b.OUT + b.GIDP + b.FC + b.ROE + b.SF;
      want(b.PA === outcomes, b.id + ': PA ' + b.PA + ' vs outcomes ' + outcomes);
      want(b.PA === b.AB + b.BB + b.SF, b.id + ': PA vs AB + BB + SF');
      want(b.AB === b.H + b.K + b.OUT + b.GIDP + b.FC + b.ROE, b.id + ': AB vs its outcomes');
      want(singles >= 0, b.id + ': negative singles');
    }
    want(t.LOB === halves.filter((e) => e.h === side).reduce((a, e) => a + e.lob, 0), side + ': LOB');
    want(sum(t.batting, 'SB') === g.log.filter((e) => e.e === 'sb' && e.h === side).length, side + ': SB');
    want(sum(t.batting, 'RBI') === mine.reduce((a, e) => a + e.rbi, 0), side + ': RBI');
  }
  return { box: box, problems: bad };
}

module.exports = function (t) {
  t.test('innings pitched as text', () => {
    const B3 = loadCore();
    assert.deepStrictEqual([0, 1, 2, 3, 20, 27, 31].map(B3.box.ip), ['0.0', '0.1', '0.2', '1.0', '6.2', '9.0', '10.1']);
  });

  t.test('box totals match the game over 600 games of every type', () => {
    const B3 = loadCore();
    let n = 0;
    for (let i = 0; i < 600; i++) {
      const m = gametest.MIX[i % gametest.MIX.length];
      const g = B3.game.sim(Object.assign(pair(), m, { rng: B3.rng.create('box:' + i) }));
      const c = checkBox(B3, g);
      assert.deepStrictEqual(c.problems, [], 'game ' + i + ' (' + m.type + ')');
      n++;
    }
    assert.strictEqual(n, 600);
  });

  t.test('planted mistakes in the log show up in the box checks', () => {
    const B3 = loadCore();
    const g = B3.game.sim(Object.assign(pair(), { rng: B3.rng.create('box plant') }));
    assert.deepStrictEqual(checkBox(B3, g).problems, []);
    const log = JSON.stringify(g.log);
    const plants = [
      (l) => l.splice(l.findIndex((e) => e.e === 'pitch'), 1), // a pitch goes missing
      (l) => { l.find((e) => e.e === 'pa' && e.out === 1).out = 0; }, // an out goes missing
      (l) => { const pa = l.find((e) => e.e === 'pa' && e.sc.length); pa.sc.pop(); } // a run goes missing
    ]; // (a strikeout logged as a walk is the rules checker's to catch: gamecheck.js)
    plants.forEach((plant, n) => {
      g.log = JSON.parse(log);
      plant(g.log);
      assert.ok(checkBox(B3, g).problems.length > 0, 'plant ' + n + ' was not caught');
    });
  });

  t.test('the printed box score and play-by-play cover the whole game', () => {
    const B3 = loadCore();
    for (const m of gametest.MIX) {
      const g = B3.game.sim(Object.assign(pair(), m, { rng: B3.rng.create('print ' + m.type + m.innings) }));
      const text = B3.box.text(g);
      assert.ok(text.startsWith('Away Testers ' + g.score[0] + ', Home Testers ' + g.score[1]), text.split('\n')[0]);
      assert.ok(/pitching/.test(text) && /LOB: \d+/.test(text));
      const plays = B3.box.plays(g);
      const pas = g.log.filter((e) => e.e === 'pa').length;
      assert.ok(plays.length > pas, 'every PA has a line');
      assert.ok(/^(Final|Tie)/.test(plays[plays.length - 1]), plays[plays.length - 1]);
      assert.ok(plays[plays.length - 1].indexOf('AWY ' + g.score[0] + ', HOM ' + g.score[1]) >= 0);
      assert.ok(!/undefined|NaN/.test(text + plays.join('\n')), 'undefined or NaN in the text');
    }
  });
};
