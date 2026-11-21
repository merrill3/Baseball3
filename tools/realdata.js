// Real MLB data for step 1.5 (ratings measured against real stats; DESIGN.md sections 7 and 10).
// Usage:
//   node tools/realdata.js --urls DIR        prints "file<TAB>url" lines for every source, for curl:
//       node tools/realdata.js --urls DIR | while IFS=$'\t' read f u; do
//         [ -s "$f" ] || { curl -s -A Mozilla/5.0 -o "$f" "$u"; sleep 3; }; done
//   node tools/realdata.js --build DIR       reads the downloads in DIR and writes tools/lib/real.js
// Sources: Baseball Savant (Statcast leaderboards and grouped searches) and Baseball-Reference, seasons
// 2024-2026 (Claude's default, confirmed by the owner in Session 8). The downloads are third-party data:
// they stay outside the repo (keep DIR in a scratch folder); only the summary in tools/lib/real.js is kept.
// It runs no game code and needs no network itself (curl does the fetching).
'use strict';
const fs = require('fs');
const path = require('path');

const YEARS = [2024, 2025, 2026];
const SAV = 'https://baseballsavant.mlb.com';
const BREF = 'https://www.baseball-reference.com';
const MOVE_TYPES = ['FF', 'SI', 'FC', 'SL', 'ST', 'CU', 'KC', 'SV', 'CH', 'FS'];
const OFFSPEED = 'SL%7CST%7CSV%7CCU%7CKC%7CCS%7CCH%7CFS%7CFO%7CSC%7C';

function custom(year, type, min, sel) {
  return `${SAV}/leaderboard/custom?year=${year}&type=${type}&filter=&min=${min}&selections=${sel.join(',')}` +
    '&chart=false&x=pa&y=pa&r=no&chartType=beeswarm&sort=xwoba&sortDir=desc&csv=true';
}
// A Statcast search grouped by player (one row per player: pitches, swings, whiffs, exit speed, bat speed ...).
function search(year, who, extra) {
  return `${SAV}/statcast_search/csv?all=true&hfGT=R%7C&hfSea=${year}%7C&player_type=${who}` + extra +
    '&group_by=name&min_pitches=0&min_results=0&min_pas=0&sort_col=pitches&player_event_sort=api_p_release_speed&sort_order=desc';
}

const BAT_SEL = ['pa', 'k_percent', 'bb_percent', 'batting_avg', 'slg_percent', 'on_base_percent', 'isolated_power',
  'babip', 'b_home_run', 'exit_velocity_avg', 'launch_angle_avg', 'sweet_spot_percent', 'barrel_batted_rate',
  'hard_hit_percent', 'z_swing_percent', 'oz_swing_percent', 'iz_contact_percent', 'oz_contact_percent',
  'whiff_percent', 'swing_percent', 'pull_percent', 'straightaway_percent', 'opposite_percent',
  'groundballs_percent', 'flyballs_percent', 'linedrives_percent', 'popups_percent', 'f_strike_percent',
  'avg_best_speed', 'avg_hyper_speed', 'xwoba', 'woba'];
const PIT_SEL = ['pa', 'k_percent', 'bb_percent', 'p_era', 'batting_avg', 'slg_percent', 'on_base_percent',
  'exit_velocity_avg', 'hard_hit_percent', 'barrel_batted_rate', 'groundballs_percent', 'flyballs_percent',
  'oz_swing_percent', 'z_swing_percent', 'whiff_percent', 'iz_contact_percent', 'edge_percent',
  'meatball_percent', 'in_zone_percent', 'ff_avg_speed', 'fastball_avg_speed', 'p_game', 'p_formatted_ip',
  'p_starting_p', 'n_ff_formatted', 'p_home_run', 'xwoba', 'woba'];

function sources(dir) {
  const out = [];
  const add = (file, url) => out.push([path.join(dir, file), url]);
  for (const y of YEARS) {
    add(`bat_${y}.csv`, custom(y, 'batter', 250, BAT_SEL));
    add(`pit_${y}.csv`, custom(y, 'pitcher', 50, PIT_SEL)); // min is in innings here; kept: 250+ batters faced
    add(`battrack_${y}.csv`, `${SAV}/leaderboard/bat-tracking?attackZone=&batSide=&contactType=&count=&dateStart=&dateEnd=` +
      `&gameType=Regular&isHardHit=&minSwings=300&minGroupSwings=1&pitchHand=&pitchType=&seasonStart=${y}&seasonEnd=${y}&team=&type=batter&csv=true`);
    add(`sprint_${y}.csv`, `${SAV}/leaderboard/sprint_speed?min_season=${y}&max_season=${y}&position=&team=&min=10&csv=true`);
    add(`arm_${y}.csv`, `${SAV}/leaderboard/arm-strength?type=player&year=${y}&minThrows=50&pos=&team=&csv=true`);
    add(`oaa_${y}.csv`, `${SAV}/leaderboard/outs_above_average?type=Fielder&startYear=${y}&endYear=${y}&split=no&team=&range=year&min=q&pos=&roles=&viz=hide&csv=true`);
    add(`frame_${y}.csv`, `${SAV}/leaderboard/catcher-framing?type=catcher&seasonStart=${y}&seasonEnd=${y}&team=&min=q&sortColumn=rv_tot&sortDirection=desc&csv=true`);
    add(`pop_${y}.csv`, `${SAV}/leaderboard/poptime?year=${y}&team=&min2b=5&min3b=0&csv=true`);
    add(`arsenal_${y}.csv`, `${SAV}/leaderboard/pitch-arsenal-stats?type=pitcher&pitchType=&year=${y}&team=&min=50&csv=true`);
    for (const t of MOVE_TYPES) {
      add(`move_${t}_${y}.csv`, `${SAV}/leaderboard/pitch-movement?year=${y}&team=&min=50&pitch_type=${t}&hand=&x=pitcher_break_x_hidden&z=pitcher_break_z_induced&csv=true`);
    }
    add(`ev_bat_${y}.csv`, `${SAV}/leaderboard/statcast?type=batter&year=${y}&position=&team=&min=100&csv=true`);
    add(`ev_pit_${y}.csv`, `${SAV}/leaderboard/statcast?type=pitcher&year=${y}&position=&team=&min=100&csv=true`);
    add(`ofjump_${y}.csv`, `${SAV}/leaderboard/outfield_jump?year=${y}&min=q&csv=true`);
    add(`swingtake_${y}.csv`, `${SAV}/leaderboard/swing-take?year=${y}&group=Batter&type=All&sub_type=null&min=q&csv=true`);
    add(`brv_${y}.csv`, `${SAV}/leaderboard/baserunning-run-value?game_type=Regular&n=q&season_end=${y}&season_start=${y}&split=no&team=&type=Batter&with_team_only=1&csv=true`);
    // Grouped searches: batters against 95+ mph (Timing), against breaking and off-speed pitches (Recognition),
    // and chasing them (outside the zone, zones 11-14); every batter's whole season (the same columns).
    add(`s_all_${y}.csv`, search(y, 'batter', ''));
    add(`s_95_${y}.csv`, search(y, 'batter', '&metric_1=api_p_release_speed&metric_1_gt=95&metric_1_lt='));
    add(`s_off_${y}.csv`, search(y, 'batter', `&hfPT=${OFFSPEED}`));
    add(`s_offout_${y}.csv`, search(y, 'batter', `&hfPT=${OFFSPEED}&hfZ=11%7C12%7C13%7C14%7C`));
    add(`s_fbout_${y}.csv`, search(y, 'batter', '&hfPT=FF%7CSI%7CFC%7C&hfZ=11%7C12%7C13%7C14%7C'));
    // Baseball-Reference: players' extra bases, starters' workloads, league fielding and pitches.
    add(`bref_baserun_${y}.html`, `${BREF}/leagues/majors/${y}-baserunning-batting.shtml`);
    add(`bref_starter_${y}.html`, `${BREF}/leagues/majors/${y}-starter-pitching.shtml`);
    add(`bref_pitches_${y}.html`, `${BREF}/leagues/majors/${y}-pitches-batting.shtml`);
  }
  add('bref_bat.html', `${BREF}/leagues/majors/bat.shtml`);
  add('bref_field.html', `${BREF}/leagues/majors/field.shtml`);
  return out;
}

function main() {
  const [mode, dir] = process.argv.slice(2);
  if (mode === '--urls' && dir) {
    for (const [f, u] of sources(dir)) process.stdout.write(f + '\t' + u + '\n');
    return;
  }
  if (mode === '--build' && dir) return require('./lib/realbuild')(dir, sources(dir));
  process.stderr.write('usage: node tools/realdata.js --urls DIR | --build DIR\n');
  process.exit(1);
}

if (require.main === module) main();
module.exports = { sources, YEARS };
