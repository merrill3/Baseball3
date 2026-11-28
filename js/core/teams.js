// The league's 30 teams (M2 step 2.1b, Session 31; DESIGN.md section 6): leagues, divisions, names, codes, colors,
// home cities, market sizes, natural rivals and ballparks. Data only. Logic file: no DOM.
//
// The league, the cities, the staying nicknames, the rivals, the five odd parks and altitude by elevation are the
// owner's choices (Session 31); the new nicknames, codes, colors and home cities were Claude's drafts, confirmed in the
// owner's summary. Park names and the sizes of the other 25 parks are Claude's defaults (DESIGN.md section 6).
//
//   B3.teams.LEAGUES                 [{ id, name, divisions: [{ id, name, teams: [ids] }] }]
//   B3.teams.list                    every team: { id, city, name, full, league, division, colors, home, metro,
//                                    rival, park }
//   B3.teams.byId(id)                one team
//   B3.teams.park(id)                its park: { name, fence: [[spray, ft], ...], wall: ft or [[spray, ft], ...],
//                                    elevation (ft), odd (its shape, for the odd five), note }
// Spray is degrees from center field, plus toward right field (B3.data's convention): -45 is the left-field line.
// metro: the home city's metro population in millions (about 2023; census areas for Montreal and Toronto); the two
// teams in New York, Chicago and Los Angeles share theirs (used from M7, budgets).
(function (root) {
  'use strict';
  const B3 = root.B3 = root.B3 || {};

  // Five points: the left-field line, left-center (25 degrees), center, right-center, the right-field line.
  function five(l, lc, c, rc, r) { return [[-45, l], [-25, lc], [0, c], [25, rc], [45, r]]; }

  // [id, city, nickname, home, metro, elevation, colors, rival, park]
  const ROWS = {
    'United League': {
      East: [
        ['NYB', 'New York', 'Bodegas', 'New York', 19.5, 30, ['#1F6F43', '#D9822B'], 'NYC',
          { name: 'The Corner Lot', odd: 'squeezed into a city block: a short right field behind a very tall wall',
            fence: [[-45, 335], [-25, 382], [0, 405], [20, 375], [30, 330], [45, 305]], wall: [[-45, 8], [10, 8], [20, 30], [45, 30]] }],
        ['ORL', 'Orlando', 'Swans', 'Orlando', 2.8, 100, ['#2E7F86', '#E8752C'], 'LV', { name: 'Lakeshore Park', fence: five(330, 380, 405, 375, 325), wall: 9 }],
        ['ATL', 'Atlanta', 'Peaches', 'Atlanta', 6.3, 1050, ['#F4A261', '#A0442B'], 'VA', { name: 'Red Clay Field', fence: five(332, 380, 400, 378, 330), wall: 9 }],
        ['PHI', 'Philadelphia', 'Jawns', 'Philadelphia', 6.2, 40, ['#8A5A2B', '#D9A520'], 'PA', { name: 'Rowhouse Park', fence: five(328, 372, 398, 372, 328), wall: 8 }],
        ['NSH', 'Nashville', 'Pickers', 'Nashville', 2.1, 550, ['#C1661C', '#2E4A6B'], 'AUS', { name: 'Sunburst Field', fence: five(330, 375, 402, 375, 330), wall: 8 }]
      ],
      Central: [
        ['CHE', 'Chicago', 'Els', 'Chicago', 9.3, 600, ['#9EA3A8', '#1E5C8C'], 'CHD',
          { name: 'Loop Field', odd: 'the elevated tracks cut a notch into right-center: a deep pocket beside a short right-field line',
            fence: [[-45, 340], [-25, 372], [0, 400], [12, 404], [16, 418], [26, 414], [30, 372], [45, 318]], wall: 10 }],
        ['DET', 'Detroit', 'Mittens', 'Detroit', 4.3, 600, ['#5A6470', '#A8322D'], 'TOR', { name: 'Foundry Field', fence: five(333, 380, 404, 380, 330), wall: 9 }],
        ['IND', 'Indianapolis', 'Pit Crew', 'Indianapolis', 2.1, 720, ['#232323', '#E8682A'], 'OKC', { name: 'Pit Lane Park', fence: five(330, 375, 400, 375, 330), wall: 10 }],
        ['MI', 'Michigan', 'Cherries', 'Grand Rapids', 1.1, 610, ['#9E1B32', '#2E5339'], 'OH', { name: 'Blossom Field', fence: five(332, 378, 402, 378, 332), wall: 8 }],
        ['WI', 'Wisconsin', 'Curds', 'Milwaukee', 1.6, 620, ['#E89B2F', '#3D6FA5'], 'DAK', { name: 'Creamery Park', fence: five(327, 372, 400, 372, 327), wall: 8 }]
      ],
      West: [
        ['LA4', 'Los Angeles', '405s', 'Los Angeles', 12.8, 300, ['#006B3F', '#8E4F8C'], 'LAT', { name: 'Cloverleaf Park', fence: five(330, 377, 402, 377, 330), wall: 8 }],
        ['SF', 'San Francisco', 'Sourdoughs', 'San Francisco', 4.6, 50, ['#C0362C', '#B8BEC2'], 'SD', { name: 'Fogline Park', fence: five(335, 380, 400, 375, 325), wall: 11 }],
        ['PHX', 'Phoenix', 'Gilas', 'Phoenix', 5.1, 1090, ['#E07B39', '#231F20'], 'NM', { name: 'Saguaro Field', fence: five(330, 378, 405, 378, 330), wall: 8 }],
        ['SEA', 'Seattle', 'Freeze', 'Seattle', 4.0, 50, ['#5E6A71', '#1D4D3A'], 'SLC', { name: 'Drizzle Field', fence: five(330, 378, 402, 378, 327), wall: 8 }],
        ['MTL', 'Montreal', 'Poutine', 'Montreal', 4.3, 100, ['#1F4E9C', '#7A4A23'], 'BOS', { name: 'Parc du Vieux-Port', fence: five(330, 375, 400, 375, 330), wall: 10 }]
      ]
    },
    'Diamond League': {
      East: [
        ['NYC', 'New York', 'Cabbies', 'New York', 19.5, 30, ['#F2B705', '#2B2B2B'], 'NYB', { name: 'Medallion Park', fence: five(328, 372, 400, 372, 325), wall: 8 }],
        ['TOR', 'Toronto', 'Raccoons', 'Toronto', 6.7, 300, ['#7A7F84', '#2D5F8B'], 'DET',
          { name: 'The Ravine', odd: 'a triangle: straight walls from each foul pole to a deep point in dead center, so the alleys are short',
            // straight lines in space from 345 ft at each pole to 440 ft in center (the distances along each ray)
            fence: [[-45, 345], [-40, 343], [-35, 344], [-30, 347], [-25, 353], [-20, 362], [-15, 375], [-10, 391], [-5, 413], [0, 440], [5, 413], [10, 391], [15, 375], [20, 362], [25, 353], [30, 347], [35, 344], [40, 343], [45, 345]], wall: 12 }],
        ['BOS', 'Boston', 'Wicked', 'Boston', 4.9, 20, ['#8B2F23', '#6F7378'], 'MTL', { name: 'Brickworks Park', fence: five(325, 377, 402, 377, 332), wall: 10 }],
        ['VA', 'Virginia', 'Hams', 'Richmond', 1.3, 150, ['#8C2F22', '#4A6FA5'], 'ATL', { name: 'Smokehouse Field', fence: five(335, 378, 400, 378, 335), wall: 8 }],
        ['PA', 'Pennsylvania', 'Yinzers', 'Pittsburgh', 2.4, 730, ['#4A4A48', '#B23A2E'], 'PHI',
          { name: 'Incline Field', odd: 'built into a hillside: a deep center field up a grassy incline',
            fence: [[-45, 330], [-25, 378], [-8, 412], [0, 420], [8, 412], [25, 378], [45, 325]], wall: 8 }]
      ],
      Central: [
        ['CHD', 'Chicago', 'Deep Dish', 'Chicago', 9.3, 600, ['#C98A2B', '#B5302A'], 'CHE', { name: 'The Oven', fence: five(330, 372, 400, 372, 330), wall: 10 }],
        ['AUS', 'Austin', 'Bats', 'Austin', 2.5, 490, ['#4B3A6B', '#D8CBB0'], 'NSH', { name: 'Congress Bridge Field', fence: five(330, 376, 402, 376, 330), wall: 9 }],
        ['OH', 'Ohio', 'Coasters', 'Columbus', 2.2, 760, ['#C8352E', '#6D7378'], 'MI', { name: 'Lift Hill Field', fence: five(330, 375, 400, 375, 330), wall: 8 }],
        ['OKC', 'Oklahoma City', 'Twisters', 'Oklahoma City', 1.5, 1200, ['#5B6470', '#A4472C'], 'IND', { name: 'Red Dirt Park', fence: five(330, 376, 400, 376, 330), wall: 9 }],
        ['DAK', 'Dakota', 'Pheasants', 'Sioux Falls', 0.3, 1470, ['#A45A2A', '#D6B65A'], 'WI',
          { name: 'The Prairie', odd: 'the biggest outfield behind a low wall: the triples park', fence: five(340, 392, 425, 392, 340), wall: 6 }]
      ],
      West: [
        ['LAT', 'Los Angeles', 'Taco Trucks', 'Los Angeles', 12.8, 300, ['#B83A2B', '#7DB84A'], 'LA4', { name: 'Sunset Lot', fence: five(328, 372, 398, 372, 328), wall: 9 }],
        ['SD', 'San Diego', 'Sea Lions', 'San Diego', 3.3, 60, ['#1B7BAA', '#3B5323'], 'SF', { name: 'Harbor Cove Park', fence: five(332, 378, 402, 378, 330), wall: 8 }],
        ['SLC', 'Salt Lake', 'Powder', 'Salt Lake City', 1.3, 4230, ['#EEEDE8', '#3E5C8A'], 'SEA', { name: 'Wasatch Field', fence: five(332, 377, 402, 377, 332), wall: 9 }],
        ['LV', 'Las Vegas', 'Locals', 'Las Vegas', 2.3, 2030, ['#FF3EA5', '#1A1A2E'], 'ORL', { name: 'Off-Strip Park', fence: five(330, 375, 400, 375, 330), wall: 9 }],
        ['NM', 'New Mexico', 'Chiles', 'Albuquerque', 0.9, 5310, ['#4C7A2C', '#30A3A0'], 'PHX', { name: 'Mesa Field', fence: five(332, 377, 403, 377, 332), wall: 8 }]
      ]
    }
  };

  const LEAGUES = [], list = [], by = {};
  for (const lname in ROWS) {
    const lid = lname === 'United League' ? 'UL' : 'DL';
    const L = { id: lid, name: lname, divisions: [] };
    for (const dname in ROWS[lname]) {
      const D = { id: lid + '-' + dname, name: dname, teams: [] };
      for (const r of ROWS[lname][dname]) {
        const park = Object.assign({ elevation: r[5] }, r[8]);
        const t = { id: r[0], city: r[1], name: r[2], full: r[1] + ' ' + r[2], league: lid, division: D.id, home: r[3], metro: r[4],
          colors: r[6], rival: r[7], park: park };
        list.push(t); by[t.id] = t; D.teams.push(t.id);
      }
      L.divisions.push(D);
    }
    LEAGUES.push(L);
  }

  B3.teams = {
    LEAGUES: LEAGUES,
    list: list,
    byId: function (id) { return by[id] || null; },
    park: function (id) { return by[id] ? by[id].park : null; }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
