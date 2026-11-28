// The league (M2 step 2.1b, Session 31): the 30 teams (B3.teams), the parks in the engine (B3.ball.flight with a park), and
// a new league (B3.league: organizations, the starting balance, roles by profile, the team overall, a game's team). How
// the parks play is tools/parks.js's job, and how the league's seasons go tools/leaguecheck.js's.
'use strict';
const assert = require('assert');
const { loadCore } = require('../lib/load');

const same = (a, b, msg) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b), msg);
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || '') + ': ' + a + ' is not within ' + tol + ' of ' + b);
// Real MLB nicknames, which no team may use (the names rule).
const MLB = ['Yankees', 'Mets', 'Red Sox', 'Orioles', 'Rays', 'Blue Jays', 'Guardians', 'Tigers', 'Royals', 'Twins', 'White Sox', 'Cubs',
  'Astros', 'Rangers', 'Angels', 'Athletics', 'Mariners', 'Dodgers', 'Giants', 'Padres', 'Rockies', 'Diamondbacks', 'Braves',
  'Marlins', 'Phillies', 'Nationals', 'Pirates', 'Reds', 'Brewers', 'Cardinals', 'Expos'];

let LEAGUE = null;
function league() { if (!LEAGUE) { const B3 = loadCore(); LEAGUE = { B3: B3, L: B3.league.create(1) }; } return LEAGUE; }

module.exports = (t) => {
  t.test('teams: 2 leagues of 3 divisions of 5, unique ids and names, mutual rivals in the other league, invented nicknames', () => {
    const B3 = loadCore(), T = B3.teams;
    assert.strictEqual(T.list.length, 30);
    same(T.LEAGUES.map((l) => l.name), ['United League', 'Diamond League']);
    for (const l of T.LEAGUES) {
      same(l.divisions.map((d) => d.name), ['East', 'Central', 'West']);
      for (const d of l.divisions) assert.strictEqual(d.teams.length, 5);
    }
    assert.strictEqual(new Set(T.list.map((x) => x.id)).size, 30);
    assert.strictEqual(new Set(T.list.map((x) => x.full)).size, 30);
    assert.strictEqual(new Set(T.list.map((x) => x.park.name)).size, 30);
    for (const x of T.list) {
      const r = T.byId(x.rival);
      assert.ok(r && r.rival === x.id && r.league !== x.league, x.id + ' rival');
      assert.ok(x.colors.length === 2 && x.colors.every((c) => /^#[0-9A-F]{6}$/.test(c)), x.id + ' colors');
      assert.ok(MLB.indexOf(x.name) < 0, x.name + ' is a real MLB nickname');
      assert.ok(x.metro > 0 && typeof x.home === 'string', x.id + ' market');
    }
  });

  t.test('parks: fences from line to line, mild variety except the odd five, real elevations', () => {
    const B3 = loadCore();
    let odd = 0;
    for (const x of B3.teams.list) {
      const p = x.park, f = p.fence;
      assert.strictEqual(f[0][0], -45); assert.strictEqual(f[f.length - 1][0], 45);
      for (let i = 1; i < f.length; i++) assert.ok(f[i][0] > f[i - 1][0], x.id + ' fence in order');
      assert.ok(p.elevation >= 0 && p.elevation < 6000, x.id + ' elevation');
      if (p.odd) { odd++; continue; }
      const at = (sp) => B3.data.fenceAt(sp, p);
      for (const sp of [-45, 45]) assert.ok(at(sp) >= 320 && at(sp) <= 345, x.id + ' line ' + at(sp));
      assert.ok(at(0) >= 395 && at(0) <= 410, x.id + ' center ' + at(0));
      assert.ok(typeof p.wall === 'number' && p.wall >= 6 && p.wall <= 14, x.id + ' wall');
    }
    assert.strictEqual(odd, 5);
    assert.ok(B3.teams.park('NM').elevation > 5000, 'the thin-air park');
  });

  t.test('the engine with a park: no park is the standard park; walls, fences and thin air change where a ball ends', () => {
    const B3 = loadCore();
    const std = { fence: [[-45, 330], [-25, 375], [0, 400], [25, 375], [45, 330]], wall: 8, elevation: B3.tune.BALL.air.ref };
    for (const c of [{ ev: 104, la: 27, sp: 10 }, { ev: 95, la: 15, sp: -30 }, { ev: 88, la: 5, sp: 20 }]) {
      same(B3.ball.flight(c, std), B3.ball.flight(c), 'a standard park as a park plays as no park');
    }
    // The Corner Lot: a short right field behind a 30-ft wall. A line drive that clears 8 ft at 330 hits that wall.
    const lot = B3.teams.park('NYB');
    assert.ok(B3.data.wallAt(40, lot) >= 25 && B3.data.fenceAt(40, lot) < 320);
    let found = false;
    for (let ev = 95; ev <= 112 && !found; ev++) {
      const c = { ev: ev, la: 17, sp: 40 };
      const a = B3.ball.flight(c), b = B3.ball.flight(c, lot);
      if (a.hr && !b.hr && b.wall) found = true;
    }
    assert.ok(found, 'a home run in the standard park off the tall wall');
    // Thin air: the same fly ball carries farther in New Mexico.
    const c = { ev: 100, la: 28, sp: 0 };
    const deep = { fence: [[-45, 600], [45, 600]], wall: 8 };
    const sea = B3.ball.flight(c, Object.assign({}, deep, { elevation: 0 })), nm = B3.ball.flight(c, Object.assign({}, deep, { elevation: 5310 }));
    assert.ok(nm.land.r > sea.land.r + 3, 'thin air carries: ' + nm.land.r.toFixed(1) + ' against ' + sea.land.r.toFixed(1));
    // A game takes the home park.
    const L = B3.league.create(2, { schedule: false });
    const g = B3.game.create({ away: B3.league.gameTeam(L.teams[0], 0), home: B3.league.gameTeam(L.teams[1], 0), park: L.teams[1].park, rng: B3.rng.create('p') });
    assert.strictEqual(g.park, L.teams[1].park);
  });

  t.test('a new league: 30 organizations of 40, unique players, the schedule', () => {
    const { L } = league();
    assert.strictEqual(L.teams.length, 30);
    const ids = new Set(), names = new Set();
    for (const t of L.teams) {
      const o = t.org;
      same([o.regulars.length, o.bench.length, o.starters.length, o.relievers.length, o.reserves.length], [9, 4, 5, 8, 14], t.id);
      for (const k of ['regulars', 'bench', 'starters', 'relievers', 'reserves']) for (const p of o[k]) { ids.add(p.id); names.add(p.name); }
      assert.ok(o.starters.every((p) => p.role === 'SP'), t.id + ' rotation');
      same(o.relievers.map((p) => p.role).slice(0, 7), ['CL', 'SU', 'SU', 'MR', 'MR', 'MR', 'MR'], t.id + ' pen');
      assert.strictEqual(o.relievers[7].role, 'LR');
    }
    assert.strictEqual(ids.size, 1200);
    assert.strictEqual(names.size, 1200);
    assert.strictEqual(L.schedule.games.length, 2430);
  });

  t.test('the starting balance: a few teams expected near 95-100 wins and a few near 60-65; the team overall', () => {
    const { B3, L } = league();
    const ex = L.teams.map((t) => t.expected).sort((a, b) => b - a);
    near(ex.reduce((a, b) => a + b, 0) / 30, 81, 0.5, 'mean');
    assert.ok(ex[0] >= 97 && ex[0] <= 103 && ex[2] >= 92, 'the top: ' + ex.slice(0, 3));
    assert.ok(ex[29] >= 59 && ex[29] <= 65 && ex[27] <= 70, 'the bottom: ' + ex.slice(27));
    for (const t of L.teams) {
      near(t.expected, t.target, 1, t.id + ' on target');
      assert.strictEqual(t.overall, B3.league.teamOverall(t.expected));
    }
    assert.strictEqual(B3.league.teamOverall(81), 50);
    assert.ok(B3.league.teamOverall(100) >= 72 && B3.league.teamOverall(62) <= 28);
  });

  t.test('roles by profile: the rotation is the best five starters, ace first; a game\'s team is one the engine takes', () => {
    const { B3, L } = league();
    for (const t of L.teams) {
      const sp = t.org.starters.map((p) => B3.overall.of(p, { role: 'SP' }));
      for (let i = 1; i < 5; i++) assert.ok(sp[i - 1] >= sp[i], t.id + ' ace first');
      const left = t.org.reserves.filter((p) => p.pitches && p.role === 'SP').map((p) => B3.overall.of(p, { role: 'SP' }));
      for (const x of left) assert.ok(x <= sp[4] + B3.league.BALANCE.swapGap, t.id + ' a better starter left in the reserves');
    }
    const g = B3.game.sim({ away: B3.league.gameTeam(L.teams[0], 3), home: B3.league.gameTeam(L.teams[1], 4), park: L.teams[1].park, type: 'regular', rng: B3.rng.create('lg') });
    assert.ok(g.over);
    assert.strictEqual(B3.league.gameTeam(L.teams[0], 7).pitcher, L.teams[0].org.starters[2].id, 'the rotation in turn');
    // The same seed gives the same league.
    const again = B3.league.create(1, { schedule: false });
    same(again.teams.map((t) => t.expected), L.teams.map((t) => t.expected));
  });
};
