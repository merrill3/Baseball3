// Plain test teams for the engine tests (no ratings yet: step 1.3 adds them, and every rating hook
// has its placeholder value). Node only. Names are labels such as "AWY SS", so nothing can match a real
// player. Hands are a fixed mix: 5 right-handed batters, 3 left, 1 switch; 6 right-handed pitchers, 3 left.
'use strict';

const ORDER = [['CF', 'L'], ['SS', 'R'], ['1B', 'L'], ['DH', 'R'], ['3B', 'R'], ['RF', 'S'], ['LF', 'R'], ['C', 'R'], ['2B', 'L']];
const STAFF = [
  ['SP', 'SP', 'R', ['FF', 'SL', 'CH', 'CU']],
  ['CL', 'CL', 'R', ['FF', 'SL', 'FS']],
  ['SU1', 'SU', 'L', ['FF', 'SL', 'CH']],
  ['SU2', 'SU', 'R', ['SI', 'CH', 'SL']],
  ['MR1', 'MR', 'L', ['FF', 'CU', 'CH']],
  ['MR2', 'MR', 'R', ['SI', 'SL', 'FC']],
  ['MR3', 'MR', 'R', ['FF', 'FC', 'CU', 'CH']],
  ['MR4', 'MR', 'L', ['SI', 'SL', 'CH']],
  ['LR', 'LR', 'R', ['FF', 'SL', 'CU', 'CH', 'FS']]
];

// A team in the shape B3.game.create takes.
function team(code, name) {
  const players = {}, lineup = [];
  for (const [pos, bats] of ORDER) {
    const id = code + '-' + pos;
    players[id] = { id: id, name: code + ' ' + pos, bats: bats, throws: bats === 'L' ? 'L' : 'R' };
    lineup.push({ id: id, pos: pos });
  }
  const pitchers = [];
  for (const [slot, role, throws, pitches] of STAFF) {
    const id = code + '-' + slot;
    players[id] = { id: id, name: code + ' ' + slot, role: role, bats: throws, throws: throws, pitches: pitches.slice() };
    pitchers.push(id);
  }
  return { id: code, code: code, name: name, players: players, lineup: lineup, pitcher: pitchers[0], bullpen: pitchers.slice(1) };
}

function pair() {
  return { away: team('AWY', 'Away Testers'), home: team('HOM', 'Home Testers') };
}

module.exports = { team, pair };
