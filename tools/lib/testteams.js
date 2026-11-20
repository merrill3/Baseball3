// Plain test teams for the engine tests (no ratings yet: step 1.3 adds them). Node only.
// Names are labels such as "AWY SS", so nothing can match a real player.
'use strict';

const ORDER = ['CF', 'SS', '1B', 'DH', '3B', 'RF', 'LF', 'C', '2B'];
const STAFF = [
  ['SP', 'SP', ['FF', 'SL', 'CH', 'CU']],
  ['CL', 'CL', ['FF', 'SL', 'FS']],
  ['SU1', 'SU', ['FF', 'SL', 'CH']],
  ['SU2', 'SU', ['SI', 'CH', 'SL']],
  ['MR1', 'MR', ['FF', 'CU', 'CH']],
  ['MR2', 'MR', ['SI', 'SL', 'FC']],
  ['MR3', 'MR', ['FF', 'FC', 'CU', 'CH']],
  ['MR4', 'MR', ['SI', 'SL', 'CH']],
  ['LR', 'LR', ['FF', 'SL', 'CU', 'CH', 'FS']]
];

// A team in the shape B3.game.create takes.
function team(code, name) {
  const players = {}, lineup = [];
  for (const pos of ORDER) {
    const id = code + '-' + pos;
    players[id] = { id: id, name: code + ' ' + pos };
    lineup.push({ id: id, pos: pos });
  }
  const pitchers = [];
  for (const [slot, role, pitches] of STAFF) {
    const id = code + '-' + slot;
    players[id] = { id: id, name: code + ' ' + slot, role: role, pitches: pitches.slice() };
    pitchers.push(id);
  }
  return { id: code, code: code, name: name, players: players, lineup: lineup, pitcher: pitchers[0], bullpen: pitchers.slice(1) };
}

function pair() {
  return { away: team('AWY', 'Away Testers'), home: team('HOM', 'Home Testers') };
}

module.exports = { team, pair };
