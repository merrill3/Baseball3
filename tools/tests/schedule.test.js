// The schedule (M2 step 2.1b, Session 31): B3.schedule.make. For seeds 1-20: the owner's mix (13 games against each
// division rival, 7 against four of the other ten league teams and 6 against the rest, one 3-game series against each
// interleague non-rival, 2 + 2 against the natural rival), 162 games and 81 at home for everyone, series of 2-4 games
// on consecutive days at one park, no team twice on a day, a 183-188-day calendar with a 4-day break 55-60% of the way
// and no games in it, stretches of games within MAX_STRETCH (20), no more than 3 off days running outside the break,
// homestands and road trips mostly 2-4 series long; the same seed gives the same schedule, another seed another; each
// make() takes well under a second.
'use strict';
const assert = require('assert');
const { loadCore } = require('../lib/load');

const SEEDS = 20;

let BUILT = null;
function built() {
  if (BUILT) return BUILT;
  const B3 = loadCore();
  const list = [], ms = [];
  for (let seed = 1; seed <= SEEDS; seed++) {
    const t0 = Date.now();
    list.push(B3.schedule.make(seed));
    ms.push(Date.now() - t0);
  }
  BUILT = { B3: B3, list: list, ms: ms };
  return BUILT;
}

const key = (a, b) => (a < b ? a + ' ' + b : b + ' ' + a);

// Each team's day-by-day calendar: the game it plays on each day, or null.
function calendars(B3, sch) {
  const cal = {};
  for (const t of B3.teams.list) cal[t.id] = new Array(sch.days).fill(null);
  for (const g of sch.games) {
    for (const id of [g.away, g.home]) {
      assert.ok(!cal[id][g.day], id + ' plays twice on day ' + g.day);
      cal[id][g.day] = g;
    }
  }
  return cal;
}

module.exports = function (t) {
  t.test('the owner\'s mix: 2,430 games, 162 and 81 at home each, the pairs\' counts and home splits', () => {
    const { B3, list } = built();
    const team = {};
    for (const x of B3.teams.list) team[x.id] = x;
    for (const sch of list) {
      assert.strictEqual(sch.games.length, 2430);
      const games = {}, home = {}, pair = {};
      for (const g of sch.games) {
        games[g.away] = (games[g.away] || 0) + 1; games[g.home] = (games[g.home] || 0) + 1;
        home[g.home] = (home[g.home] || 0) + 1;
        const k = key(g.away, g.home);
        pair[k] = pair[k] || { n: 0, home: {} };
        pair[k].n++; pair[k].home[g.home] = (pair[k].home[g.home] || 0) + 1;
      }
      for (const x of B3.teams.list) {
        assert.strictEqual(games[x.id], 162, x.id + ' games');
        assert.strictEqual(home[x.id], 81, x.id + ' home games');
        let sevens = 0;
        for (const y of B3.teams.list) {
          if (y.id === x.id) continue;
          const p = pair[key(x.id, y.id)];
          assert.ok(p, x.id + ' never plays ' + y.id);
          const h = [p.home[x.id] || 0, p.home[y.id] || 0].sort((a, b) => a - b).join('/');
          if (y.division === x.division) {
            assert.strictEqual(p.n, 13, x.id + ' v ' + y.id); assert.strictEqual(h, '6/7');
          } else if (y.league === x.league) {
            assert.ok(p.n === 7 || p.n === 6, x.id + ' v ' + y.id + ': ' + p.n);
            assert.strictEqual(h, p.n === 7 ? '3/4' : '3/3');
            if (p.n === 7) sevens++;
          } else if (y.id === x.rival) {
            assert.strictEqual(p.n, 4, x.id + ' v rival ' + y.id); assert.strictEqual(h, '2/2');
          } else {
            assert.strictEqual(p.n, 3, x.id + ' v ' + y.id); assert.ok(h === '0/3', 'one series at one park');
          }
        }
        assert.strictEqual(sevens, 4, x.id + ' 7-game opponents');
        assert.strictEqual(team[x.rival].rival, x.id);
      }
    }
  });

  t.test('series: 2-4 games on consecutive days at one park, numbered, with the right kind', () => {
    const { B3, list } = built();
    const team = {};
    for (const x of B3.teams.list) team[x.id] = x;
    const lens = { 2: 0, 3: 0, 4: 0 };
    for (const sch of list) {
      assert.strictEqual(sch.series.length, 780);
      sch.series.forEach((s, i) => {
        assert.strictEqual(s.id, i);
        assert.ok(s.games >= 2 && s.games <= 4, 'series of ' + s.games);
        assert.strictEqual(s.days.length, s.games);
        s.days.forEach((d, j) => { if (j) assert.strictEqual(d, s.days[j - 1] + 1, 'days in a row'); });
        if (i) assert.ok(s.days[0] >= sch.series[i - 1].days[0], 'series by first day');
        const a = team[s.away], h = team[s.home];
        const kind = a.division === h.division ? 'division' : a.league === h.league ? 'league' : a.rival === h.id ? 'rival' : 'inter';
        assert.strictEqual(s.kind, kind);
        if (kind === 'rival') assert.strictEqual(s.games, 2);
        if (kind === 'inter') assert.strictEqual(s.games, 3);
        lens[s.games]++;
      });
      const seen = sch.series.map(() => []);
      sch.games.forEach((g, i) => {
        assert.strictEqual(g.id, i);
        if (i) assert.ok(g.day >= sch.games[i - 1].day, 'games by day');
        const s = sch.series[g.series];
        assert.ok(s.away === g.away && s.home === g.home, 'a game\'s teams are its series\'');
        assert.strictEqual(g.day, s.days[g.game - 1]);
        seen[g.series].push(g.game);
      });
      seen.forEach((nums, i) => assert.deepStrictEqual(nums, Array.from({ length: sch.series[i].games }, (_, j) => j + 1)));
    }
    // 13 = 4 + 3 + 3 + 3 and 7 = 4 + 3: 120 series of 4, 630 of 3 and the 30 rival series of 2 per season.
    assert.deepStrictEqual(lens, { 2: 30 * SEEDS, 3: 630 * SEEDS, 4: 120 * SEEDS });
  });

  t.test('the calendar: 183-188 days, a 4-day break 55-60% of the way, no team twice on a day', () => {
    const { B3, list } = built();
    assert.strictEqual(B3.schedule.weekday(0), 3, 'Opening Day is a Thursday');
    for (const sch of list) {
      assert.ok(sch.days >= 183 && sch.days <= 188, 'days ' + sch.days);
      const b = sch.breakDays;
      assert.strictEqual(b.length, 4);
      b.forEach((d, i) => { if (i) assert.strictEqual(d, b[i - 1] + 1); });
      const mid = (b[0] + b[3] + 1) / 2 / sch.days;
      assert.ok(mid >= 0.55 && mid <= 0.6, 'the break is ' + mid + ' of the way');
      const played = new Set(sch.games.map((g) => g.day));
      for (const d of b) assert.ok(!played.has(d), 'a game on break day ' + d);
      for (const g of sch.games) assert.ok(g.day >= 0 && g.day < sch.days);
      calendars(B3, sch); // throws on a team playing twice on a day
    }
  });

  t.test('off days: stretches within 20 days, no more than 3 off in a row outside the break, 18-25 each', () => {
    const { B3, list } = built();
    assert.strictEqual(B3.schedule.MAX_STRETCH, 20);
    for (const sch of list) {
      const cal = calendars(B3, sch), brk = new Set(sch.breakDays);
      for (const id in cal) {
        let run = 0, off = 0, offDays = 0, first = -1;
        for (let d = 0; d < sch.days; d++) {
          if (cal[id][d]) {
            if (first < 0) first = d;
            run++; off = 0;
            assert.ok(run <= B3.schedule.MAX_STRETCH, id + ' plays ' + run + ' days running to day ' + d);
          } else if (brk.has(d)) {
            run = 0; off = 0;
          } else {
            run = 0; off++; offDays++;
            assert.ok(off <= 3, id + ' is off ' + off + ' days running to day ' + d);
          }
        }
        assert.ok(first <= 7, id + ' starts on day ' + first);
        assert.ok(offDays >= 18 && offDays <= 25, id + ' has ' + offDays + ' off days');
      }
    }
  });

  t.test('homestands and road trips are mostly 2-4 series long', () => {
    const { B3, list } = built();
    let stands = 0, short = 0, long = 0;
    for (const sch of list) {
      for (const x of B3.teams.list) {
        const mine = sch.series.filter((s) => s.home === x.id || s.away === x.id);
        assert.strictEqual(mine.length, 52);
        let at = null, n = 0;
        const close = () => { stands++; if (n === 1) short++; if (n > 4) long++; };
        for (const s of mine) {
          const h = s.home === x.id;
          if (h === at) n++; else { if (at !== null) close(); at = h; n = 1; }
        }
        close();
      }
    }
    // Measured over seeds 1-20: about 17% one series, 82% 2-4, 1-2% longer.
    assert.ok(short / stands < 0.25, 'one-series stands ' + short / stands);
    assert.ok(long / stands < 0.05, 'stands past 4 series ' + long / stands);
  });

  t.test('the same seed gives the same schedule; another seed another; each make() well under a second', () => {
    const { B3, list, ms } = built();
    assert.deepStrictEqual(B3.schedule.make(1), list[0]);
    assert.strictEqual(JSON.stringify(loadCore().schedule.make('3')), JSON.stringify(list[2]), 'a fresh load, the seed as text');
    assert.notDeepStrictEqual(list[0].series, list[1].series);
    assert.notDeepStrictEqual(B3.schedule.make('a').games, B3.schedule.make('b').games);
    assert.ok(Math.max(...ms) < 1000, 'slowest make() ' + Math.max(...ms) + ' ms');
  });

  t.test('other teams can be given; a league of the wrong shape is refused', () => {
    const { B3 } = built();
    const renamed = B3.teams.list.map((x) => Object.assign({}, x, { id: 'T' + x.id, rival: 'T' + x.rival }));
    const sch = B3.schedule.make(5, renamed);
    assert.strictEqual(sch.games.length, 2430);
    assert.ok(sch.games.every((g) => g.home[0] === 'T' && g.away[0] === 'T'));
    assert.throws(() => B3.schedule.make(1, B3.teams.list.slice(1)));
    const noRival = B3.teams.list.map((x, i) => (i ? x : Object.assign({}, x, { rival: x.id })));
    assert.throws(() => B3.schedule.make(1, noRival));
    const sixDivision = B3.teams.list.map((x, i) => (i ? x : Object.assign({}, x, { division: B3.teams.list[5].division })));
    assert.throws(() => B3.schedule.make(1, sixDivision));
  });
};
