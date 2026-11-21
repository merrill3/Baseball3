// Test teams for the engine tests and tools. Node only. Names are labels such as "AWY SS", so nothing can
// match a real player. Hands are a fixed mix: 5 right-handed batters, 3 left, 1 switch; 6 right-handed
// pitchers, 3 left.
//   team(code, name), pair()      plain teams: no ratings, so every rating hook has its placeholder
//                                 value (an average big-leaguer). The unit tests use these.
//   average(code, name)           the same players with every rating written out at 60 (average grades,
//                                 Balanced tendencies; defense and running from step 1.4, Framing for
//                                 the catcher): tools/worth.js and tools/lib/value.js move one rating from here
//   rated(code, name, rng)        players with ratings drawn with a league-like spread (step 1.3)
//   ratedPair(rng)                two rated teams; rng is a B3.rng generator used only for the draws
// The spread is Claude's default for testing (each rating about 60 +- 10, independent); M2's player
// generation (specialist stars, mild correlation) replaces it.
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
const HIT = ['contact', 'timing', 'launch', 'rawPower', 'recognition', 'discipline'];
const PIT = ['velocity', 'command', 'deception'];
// Defense and running (step 1.4): every hitter has them; Framing only catchers.
const DEF = ['range', 'hands', 'arm', 'speed', 'baserunning'];
// Stamina ratings that give the placeholder pitches by role (B3.tune.STAMINA: SP 92, LR 50, others 28).
const STAMINA = { SP: 60, LR: 42.2, other: 30 };

// A team in the shape B3.game.create takes. fill(player, kind) adds ratings ('hitter' or 'pitcher').
function team(code, name, fill) {
  const players = {}, lineup = [];
  for (const [pos, bats] of ORDER) {
    const id = code + '-' + pos;
    players[id] = { id: id, name: code + ' ' + pos, bats: bats, throws: bats === 'L' ? 'L' : 'R' };
    if (fill) fill(players[id], 'hitter');
    lineup.push({ id: id, pos: pos });
  }
  const pitchers = [];
  for (const [slot, role, throws, pitches] of STAFF) {
    const id = code + '-' + slot;
    players[id] = { id: id, name: code + ' ' + slot, role: role, bats: throws, throws: throws, pitches: pitches.slice() };
    if (fill) fill(players[id], 'pitcher');
    pitchers.push(id);
  }
  return { id: code, code: code, name: name, players: players, lineup: lineup, pitcher: pitchers[0], bullpen: pitchers.slice(1) };
}

function pair() {
  return { away: team('AWY', 'Away Testers'), home: team('HOM', 'Home Testers') };
}

function average(code, name) {
  return team(code, name, (p, kind) => {
    p.ratings = {};
    if (kind === 'hitter') {
      for (const k of HIT.concat(DEF)) p.ratings[k] = 60;
      if (p.id.endsWith('-C')) p.ratings.framing = 60;
      p.tendencies = { aggressiveness: 'Balanced', swingPath: 'Level' };
    } else {
      for (const k of PIT) p.ratings[k] = 60;
      p.ratings.stamina = STAMINA[p.role] || STAMINA.other;
      p.arsenal = {};
      for (const type of p.pitches) p.arsenal[type] = { grade: 60, shape: 0 };
      p.tendencies = { aim: 'Balanced' };
    }
  });
}

function averagePair() {
  return { away: average('AWY', 'Away Testers'), home: average('HOM', 'Home Testers') };
}

function rated(code, name, rng) {
  const draw = (mean, sd) => Math.round(Math.min(99, Math.max(20, rng.normal(mean, sd))));
  const style = (words) => words[rng.weighted([1, 2, 1])];
  return team(code, name, (p, kind) => {
    p.ratings = {};
    if (kind === 'hitter') {
      for (const k of HIT.concat(DEF)) p.ratings[k] = draw(60, 10);
      if (p.id.endsWith('-C')) p.ratings.framing = draw(60, 10);
      p.tendencies = { aggressiveness: style(['Patient', 'Balanced', 'Aggressive']), swingPath: style(['Ground-ball', 'Level', 'Lift']) };
    } else {
      const reliever = p.role !== 'SP';
      p.ratings.velocity = draw(reliever ? 63 : 60, 10);
      p.ratings.command = draw(60, 10);
      p.ratings.deception = draw(60, 10);
      p.ratings.stamina = p.role === 'SP' ? draw(62, 6) : p.role === 'LR' ? draw(45, 5) : draw(30, 4);
      p.arsenal = {};
      for (const type of p.pitches) {
        p.arsenal[type] = { grade: draw(60, 10), shape: Math.round(Math.max(-1, Math.min(1, rng.normal(0, 0.4))) * 10) / 10 };
      }
      p.tendencies = { aim: style(['Nibbler', 'Balanced', 'Attacker']) };
    }
  });
}

function ratedPair(rng) {
  return { away: rated('AWY', 'Away Testers', rng), home: rated('HOM', 'Home Testers', rng) };
}

module.exports = { team, pair, average, averagePair, rated, ratedPair, HIT, PIT, DEF, STAMINA };
