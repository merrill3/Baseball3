// Builds tools/lib/real.js from the downloads that tools/realdata.js lists (step 1.5). Node only.
// Each stat gets its spread over the 2024-2026 player-seasons that pass the minimums (hitters 250+ plate
// appearances, pitchers 250+ batters faced; other minimums as noted), pooled: min, p1, p5, p25, p50, p75,
// p95, p99, max, mean. Per-unit slopes are least-squares fits across player-seasons (y per unit of x),
// with the year-to-year version where it is cleaner (a pitcher's change in velocity against his change in
// strikeouts). No player names are kept.
'use strict';
const fs = require('fs');
const path = require('path');

function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  const head = rows.shift() || [];
  return rows.map((r) => { const o = {}; head.forEach((h, i) => { o[h] = r[i]; }); return o; });
}

// One Baseball-Reference table (by its id) as rows of { data-stat: text }; tables hidden in comments count.
function brefTable(html, id) {
  html = html.replace(/<!--|-->/g, '');
  const i = html.indexOf('id="' + id + '"');
  if (i < 0) return [];
  const j = html.indexOf('</table>', i);
  const body = html.slice(i, j);
  const rows = [];
  const re = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  let m;
  while ((m = re.exec(body))) {
    const o = {};
    const cre = /<t[hd][^>]*data-stat="([^"]+)"[^>]*>([\s\S]*?)<\/t[hd]>/g;
    let c;
    while ((c = cre.exec(m[1]))) o[c[1]] = c[2].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
    if (Object.keys(o).length > 2) rows.push(o);
  }
  return rows;
}

function num(v) {
  if (v === undefined || v === null) return NaN;
  const s = String(v).trim().replace('%', '').replace(/,/g, '');
  return s === '' ? NaN : Number(s);
}

function quant(sorted, p) {
  if (!sorted.length) return NaN;
  const x = p * (sorted.length - 1), i = Math.floor(x), f = x - i;
  return i + 1 < sorted.length ? sorted[i] + f * (sorted[i + 1] - sorted[i]) : sorted[i];
}

function r3(x) { return Number.isFinite(x) ? Math.round(x * 1000) / 1000 : null; }

function spread(xs) {
  const v = xs.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return null;
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const out = { n: v.length, mean: r3(mean) };
  for (const [k, p] of [['min', 0], ['p1', 0.01], ['p5', 0.05], ['p25', 0.25], ['p50', 0.5], ['p75', 0.75], ['p95', 0.95], ['p99', 0.99], ['max', 1]]) out[k] = r3(quant(v, p));
  return out;
}

// y = a + b x by least squares, with b's standard error and r.
function fit(pairs) {
  const p = pairs.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  const n = p.length;
  if (n < 10) return null;
  let sx = 0, sy = 0;
  for (const [x, y] of p) { sx += x; sy += y; }
  const mx = sx / n, my = sy / n;
  let sxx = 0, sxy = 0, syy = 0;
  for (const [x, y] of p) { sxx += (x - mx) * (x - mx); sxy += (x - mx) * (y - my); syy += (y - my) * (y - my); }
  const b = sxy / sxx, a = my - b * mx;
  const res = Math.max(0, syy - b * sxy) / Math.max(1, n - 2);
  return { n: n, per: r3(b), se: r3(Math.sqrt(res / sxx)), r: r3(sxy / Math.sqrt(sxx * syy)), at: r3(mx), mean: r3(my) };
}

module.exports = function build(dir, sources) {
  const YEARS = [2024, 2025, 2026];
  const read = (f) => {
    const p = path.join(dir, f);
    if (!fs.existsSync(p) || fs.statSync(p).size < 100) return null;
    return parseCSV(fs.readFileSync(p, 'utf8'));
  };
  const missing = [];
  const rowsOf = (prefix) => {
    const all = [];
    for (const y of YEARS) {
      const r = read(prefix + '_' + y + '.csv');
      if (!r) { missing.push(prefix + '_' + y); continue; }
      for (const row of r) { row.__year = y; all.push(row); }
    }
    return all;
  };
  const pct = {}, slope = {}, notes = {};
  const put = (name, rows, col, keep, scale) => {
    const xs = rows.filter(keep || (() => true)).map((r) => num(typeof col === 'function' ? col(r) : r[col]) * (scale || 1));
    const s = spread(xs);
    if (s) pct[name] = s; else missing.push(name);
  };

  // Hitters (custom leaderboard, 250+ PA).
  const bat = rowsOf('bat');
  const B = (k, col, scale) => put('bat.' + k, bat, col || k, null, scale);
  for (const k of ['k_percent', 'bb_percent', 'batting_avg', 'on_base_percent', 'slg_percent', 'isolated_power', 'babip',
    'exit_velocity_avg', 'launch_angle_avg', 'sweet_spot_percent', 'barrel_batted_rate', 'hard_hit_percent', 'z_swing_percent',
    'oz_swing_percent', 'iz_contact_percent', 'oz_contact_percent', 'whiff_percent', 'swing_percent', 'pull_percent',
    'straightaway_percent', 'opposite_percent', 'groundballs_percent', 'flyballs_percent', 'linedrives_percent', 'popups_percent',
    'f_strike_percent', 'avg_best_speed', 'avg_hyper_speed', 'xwoba', 'woba']) B(k);
  put('bat.zswing_minus_chase', bat, (r) => num(r.z_swing_percent) - num(r.oz_swing_percent));
  put('bat.hr_per_pa', bat, (r) => 100 * num(r.b_home_run) / num(r.pa));

  // Hitters' exit-speed leaderboard (100+ batted balls): max and the hardest half.
  const evb = rowsOf('ev_bat');
  for (const k of ['max_hit_speed', 'avg_hit_speed', 'ev50', 'ev95percent', 'brl_percent', 'avg_distance', 'max_distance', 'fbld', 'gb']) put('evbat.' + k, evb, k);

  // Bat tracking (300+ competitive swings).
  const bt = rowsOf('battrack');
  for (const k of ['avg_bat_speed', 'swing_length']) put('track.' + k, bt, k);
  for (const k of ['hard_swing_rate', 'squared_up_per_bat_contact', 'squared_up_per_swing', 'blast_per_bat_contact', 'blast_per_swing', 'whiff_per_swing']) put('track.' + k, bt, k, null, 100);

  // Grouped searches: per batter, swings and whiffs against 95+ mph, breaking and off-speed, chases.
  const rate = (prefix, a, b, min, scale) => {
    const rows = rowsOf(prefix).filter((r) => num(r[b]) >= min);
    return rows.map((r) => (scale || 100) * num(r[a]) / num(r[b]));
  };
  const s95 = rowsOf('s_95').filter((r) => num(r.swings) >= 60);
  put('vs95.whiff_per_swing', s95, (r) => 100 * num(r.whiffs) / num(r.swings));
  put('vs95.launch_speed', s95, 'launch_speed');
  put('vs95.xwoba', s95, 'xwoba');
  const sall = rowsOf('s_all').filter((r) => num(r.pa) >= 250);
  put('all.whiff_per_swing', sall, (r) => 100 * num(r.whiffs) / num(r.swings));
  put('all.bat_speed', sall, 'bat_speed');
  const soff = rowsOf('s_off').filter((r) => num(r.swings) >= 100);
  put('off.whiff_per_swing', soff, (r) => 100 * num(r.whiffs) / num(r.swings));
  const soffo = rowsOf('s_offout').filter((r) => num(r.pitches) >= 150);
  put('off.chase', soffo, (r) => 100 * num(r.swings) / num(r.pitches));
  const sfbo = rowsOf('s_fbout').filter((r) => num(r.pitches) >= 150);
  put('fb.chase', sfbo, (r) => 100 * num(r.swings) / num(r.pitches));
  // Recognition's own stat against the hitter's fastball chase: off-speed chase minus fastball chase.
  {
    const fb = {};
    for (const r of sfbo) fb[r.player_id + ':' + r.__year] = 100 * num(r.swings) / num(r.pitches);
    put('off.chase_minus_fb', soffo, (r) => 100 * num(r.swings) / num(r.pitches) - fb[r.player_id + ':' + r.__year]);
  }

  // Swing/take run value (qualified hitters), per 100 pitches seen.
  const st = rowsOf('swingtake');
  put('swingtake.runs_all', st, 'runs_all');
  put('swingtake.runs_per100', st, (r) => 100 * num(r.runs_all) / num(r.pitches));

  // Pitchers (custom leaderboard, 250+ batters faced).
  const pit = rowsOf('pit').filter((r) => num(r.pa) >= 250);
  for (const k of ['k_percent', 'bb_percent', 'p_era', 'batting_avg', 'slg_percent', 'on_base_percent', 'exit_velocity_avg',
    'hard_hit_percent', 'barrel_batted_rate', 'groundballs_percent', 'flyballs_percent', 'oz_swing_percent', 'z_swing_percent',
    'whiff_percent', 'iz_contact_percent', 'edge_percent', 'meatball_percent', 'in_zone_percent', 'ff_avg_speed',
    'fastball_avg_speed', 'xwoba', 'woba']) put('pit.' + k, pit, k);
  put('pit.hr_per_pa', pit, (r) => 100 * num(r.p_home_run) / num(r.pa));
  const starters = pit.filter((r) => num(r.p_starting_p) >= 10);
  put('sp.ip_per_start', starters, (r) => { const ip = num(r.p_formatted_ip), w = Math.floor(ip); return (w + Math.round((ip - w) * 10) / 3) / num(r.p_game); });
  const evp = rowsOf('ev_pit');
  for (const k of ['max_hit_speed', 'avg_hit_speed', 'ev95percent', 'brl_percent']) put('evpit.' + k, evp, k);

  // Pitch types: whiff %, run value per 100, hard-hit % (arsenal, 50+ PA ending on the pitch), and
  // movement against the type's average at its speed (inches; movement leaderboard, 50+ pitches).
  const ars = rowsOf('arsenal');
  const TYPES = ['FF', 'SI', 'FC', 'SL', 'ST', 'CU', 'KC', 'SV', 'CH', 'FS'];
  const move = {};
  for (const t of TYPES) {
    const m = rowsOf('move_' + t);
    if (!m.length) continue;
    for (const r of m) move[t + ':' + r.pitcher_id + ':' + r.__year] = r;
    put('move.' + t + '.speed', m, 'avg_speed');
    put('move.' + t + '.diff_z', m, 'diff_z');
    put('move.' + t + '.diff_x', m, 'diff_x');
    put('move.' + t + '.pitches', m, 'pitches_thrown');
    const a = ars.filter((r) => r.pitch_type === t);
    put('type.' + t + '.whiff', a, 'whiff_percent');
    put('type.' + t + '.rv100', a, 'run_value_per_100');
    put('type.' + t + '.hard_hit', a, 'hard_hit_percent');
    put('type.' + t + '.usage', a, 'pitch_usage');
    // Per inch of movement beyond the type's average (both directions together, as total extra break).
    const joined = a.map((r) => [r, move[t + ':' + r.player_id + ':' + r.__year]]).filter(([, m2]) => m2);
    const extra = (m2) => Math.hypot(num(m2.diff_z), num(m2.diff_x));
    slope['whiff.per_inch.' + t] = fit(joined.map(([r, m2]) => [extra(m2), num(r.whiff_percent)]));
    slope['rv100.per_inch.' + t] = fit(joined.map(([r, m2]) => [extra(m2), num(r.run_value_per_100)]));
    slope['whiff.per_mph.' + t] = fit(joined.map(([r, m2]) => [num(m2.avg_speed), num(r.whiff_percent)]));
    slope['rv100.per_mph.' + t] = fit(joined.map(([r, m2]) => [num(m2.avg_speed), num(r.run_value_per_100)]));
  }

  // Velocity per mph, across pitchers (250+ BF) and year to year (the same pitcher in back-to-back seasons).
  const fbv = (r) => num(r.ff_avg_speed) || num(r.fastball_avg_speed);
  for (const k of ['k_percent', 'bb_percent', 'whiff_percent', 'exit_velocity_avg', 'hard_hit_percent', 'xwoba', 'p_era', 'oz_swing_percent', 'groundballs_percent']) {
    slope['velo.' + k] = fit(pit.map((r) => [fbv(r), num(r[k])]));
    const by = {};
    for (const r of pit) by[r.player_id + ':' + r.__year] = r;
    const d = [];
    for (const r of pit) {
      const prev = by[r.player_id + ':' + (r.__year - 1)];
      if (prev) d.push([fbv(r) - fbv(prev), num(r[k]) - num(prev[k])]);
    }
    slope['dvelo.' + k] = fit(d);
  }

  // Bat speed per mph, across hitters (bat tracking joined to the exit-speed and custom leaderboards).
  {
    const ev = {}, cu = {};
    for (const r of evb) ev[r.player_id + ':' + r.__year] = r;
    for (const r of bat) cu[r.player_id + ':' + r.__year] = r;
    const j = bt.map((r) => [num(r.avg_bat_speed), ev[r.id + ':' + r.__year], cu[r.id + ':' + r.__year], r]);
    for (const k of ['max_hit_speed', 'avg_hit_speed', 'ev50', 'ev95percent', 'brl_percent']) slope['batspeed.' + k] = fit(j.filter((x) => x[1]).map((x) => [x[0], num(x[1][k])]));
    for (const k of ['k_percent', 'isolated_power', 'iz_contact_percent', 'whiff_percent', 'xwoba', 'hard_hit_percent', 'barrel_batted_rate']) slope['batspeed.' + k] = fit(j.filter((x) => x[2]).map((x) => [x[0], num(x[2][k])]));
    slope['batspeed.squared_up_per_bat_contact'] = fit(j.map((x) => [x[0], 100 * num(x[3].squared_up_per_bat_contact)]));
    // Squared-up rate (Contact and Timing's realized share) against average exit speed, at bat speed.
    slope['squared.avg_hit_speed'] = fit(j.filter((x) => x[1]).map((x) => [100 * num(x[3].squared_up_per_bat_contact), num(x[1].avg_hit_speed)]));
  }

  // Running: sprint speed (10+ competitive runs) and home to first; per ft/s against baserunning runs.
  const spd = rowsOf('sprint');
  put('run.sprint_speed', spd, 'sprint_speed');
  put('run.hp_to_1b', spd.filter((r) => num(r.hp_to_1b) > 0), 'hp_to_1b');
  const brv = rowsOf('brv');
  put('run.runner_runs_tot', brv, 'runner_runs_tot');
  put('run.runner_runs_XB', brv, 'runner_runs_XB');
  put('run.runner_runs_SBX', brv, 'runner_runs_SBX');
  {
    const s = {};
    for (const r of spd) s[r.player_id + ':' + r.__year] = num(r.sprint_speed);
    slope['sprint.runner_runs_XB'] = fit(brv.map((r) => [s[r.player_id + ':' + r.__year], num(r.runner_runs_XB)]));
    slope['sprint.runner_runs_tot'] = fit(brv.map((r) => [s[r.player_id + ':' + r.__year], num(r.runner_runs_tot)]));
    const cu = {};
    for (const r of bat) cu[r.player_id + ':' + r.__year] = r;
    slope['sprint.babip'] = fit(spd.filter((r) => cu[r.player_id + ':' + r.__year]).map((r) => [num(r.sprint_speed), num(cu[r.player_id + ':' + r.__year].babip)]));
  }

  // Fielding: arm strength by position (throws at that position), outs above average, jumps, catchers.
  const arm = rowsOf('arm');
  for (const pos of ['1b', '2b', '3b', 'ss', 'lf', 'cf', 'rf']) put('arm.' + pos, arm.filter((r) => num(r['total_throws_' + pos]) >= 50 && num(r['arm_' + pos]) > 0), 'arm_' + pos);
  const oaa = rowsOf('oaa');
  put('oaa.outs_above_average', oaa, 'outs_above_average');
  for (const pos of ['SS', '2B', '3B', '1B', 'LF', 'CF', 'RF']) {
    put('oaa.' + pos, oaa.filter((r) => r.primary_pos_formatted === pos), 'outs_above_average');
    put('oaa.' + pos + '.success_added', oaa.filter((r) => r.primary_pos_formatted === pos), (r) => num(r.actual_success_rate_formatted) - num(r.adj_estimated_success_rate_formatted));
  }
  const jump = rowsOf('ofjump');
  for (const k of ['rel_league_bootup_distance', 'rel_league_reaction_distance', 'rel_league_burst_distance', 'rel_league_routing_distance', 'f_bootup_distance']) put('jump.' + k, jump, k);
  const fr = rowsOf('frame');
  put('frame.rv_tot', fr, 'rv_tot');
  put('frame.strike_rate', fr, 'pct_tot', null, 100);
  put('frame.rv_per_1000', fr, (r) => 1000 * num(r.rv_tot) / num(r.pitches));
  const pop = rowsOf('pop');
  put('catch.pop_2b', pop.filter((r) => num(r.pop_2b_sba_count) >= 5), 'pop_2b_sba');
  put('catch.exchange', pop, 'exchange_2b_3b_sba');
  put('catch.arm', pop, 'maxeff_arm_2b_3b_sba');

  // Baseball-Reference: players' extra bases taken and steals, starters' pitches, league rates by year.
  const bref = (f, id) => {
    const p = path.join(dir, f);
    return fs.existsSync(p) ? brefTable(fs.readFileSync(p, 'utf8'), id) : (missing.push(f), []);
  };
  const league = {};
  for (const y of YEARS) {
    const br = bref('bref_baserun_' + y + '.html', 'players_baserunning_batting').map((r) => Object.assign(r, { __year: y }));
    (pct.__br = pct.__br || []).push(...br);
    const st = bref('bref_starter_' + y + '.html', 'players_starter_pitching').map((r) => Object.assign(r, { __year: y }));
    (pct.__st = pct.__st || []).push(...st);
    const lg = (rows) => rows.find((r) => /League Average/i.test(r.team_name || '')) || {};
    const tb = lg(bref('bref_baserun_' + y + '.html', 'teams_baserunning_batting'));
    const ts = lg(bref('bref_starter_' + y + '.html', 'teams_starter_pitching'));
    const tp = lg(bref('bref_pitches_' + y + '.html', 'teams_pitches_batting'));
    league[y] = { xbt: num(tb.extra_bases_taken_perc), sbPct: num(tb.stolen_base_perc), ipPerStart: num(ts.innings_per_start),
      pitchesPerStart: num(ts.pitches_per_start), pitchesPerPa: num(tp.pitches_per_pa), contactPct: num(tp.contact_perc),
      firstPitchSwing: num(tp.first_pitch_swings_perc) };
  }
  const opp = (r) => num(r.on_first_single) + num(r.on_second_single) + num(r.on_first_double);
  put('br.xbt', pct.__br.filter((r) => opp(r) >= 25), 'extra_bases_taken_perc');
  put('br.sb_perc', pct.__br.filter((r) => num(r.SB) + num(r.CS) >= 10), 'stolen_base_perc');
  put('br.outs_on_base_per_opp', pct.__br.filter((r) => opp(r) >= 25), (r) => 100 * num(r.outs_on_base) / opp(r));
  put('sp.pitches_per_start', pct.__st.filter((r) => num(r.GS) >= 10), 'pitches_per_start');
  put('sp.innings_per_start', pct.__st.filter((r) => num(r.GS) >= 10), 'innings_per_start');
  delete pct.__br; delete pct.__st;
  {
    const p2 = path.join(dir, 'bref_field.html');
    const rows = fs.existsSync(p2) ? brefTable(fs.readFileSync(p2, 'utf8'), 'teams_standard_fielding') : [];
    for (const y of YEARS) {
      const r = rows.find((x) => x.year_ID === String(y));
      // The first table is per team-game (the second holds totals).
      if (r) Object.assign(league[y], { errorsPerTeamGame: num(r.E_def), dpPerTeamGame: num(r.DP_def), fieldingPct: num(r.fielding_perc) });
    }
    const p3 = path.join(dir, 'bref_bat.html');
    const bat2 = fs.existsSync(p3) ? brefTable(fs.readFileSync(p3, 'utf8'), 'teams_standard_batting') : [];
    for (const y of [2019, 2023].concat(YEARS)) {
      const r = bat2.find((x) => x.year_ID === String(y));
      if (!r) continue;
      const pa = num(r.PA);
      league[y] = Object.assign(league[y] || {}, { runs: num(r.R), hits: num(r.H), doubles: num(r['2B']), triples: num(r['3B']), hr: num(r.HR),
        sb: num(r.SB), cs: num(r.CS), avg: num(r.batting_avg), obp: num(r.onbase_perc), slg: num(r.slugging_perc), pa: pa,
        k: 100 * num(r.SO) / pa, bb: 100 * num(r.BB) / pa });
    }
  }

  const { BB_TYPES, EV_BANDS, SPRAY } = require('../realdata');
  const out = {
    built: new Date().toISOString().slice(0, 10),
    seasons: YEARS,
    minimums: 'hitters 250+ PA; pitchers 250+ batters faced; bat tracking 300+ competitive swings; exit-speed leaderboards 100+ batted balls; sprint 10+ competitive runs; arm 50+ throws at the position; OAA, framing, swing/take, baserunning: Savant qualified; pop time 5+ steal attempts; pitch types 50+ PA (arsenal) and 50+ pitches (movement)',
    sources: 'Baseball Savant (baseballsavant.mlb.com) leaderboards and grouped Statcast searches; Baseball-Reference (www.baseball-reference.com). URLs: node tools/realdata.js --urls DIR',
    note: 'Spreads are over player-seasons pooled across the seasons; slopes are least-squares fits across player-seasons (per = y per unit of x; dvelo = the same pitcher year to year).',
    missing: missing,
    league: league,
    pct: pct,
    slope: slope,
    notes: notes,
    batted: batted(dir, BB_TYPES, EV_BANDS, SPRAY, missing)
  };
  write(out);
  console.log('wrote tools/lib/real.js: ' + Object.keys(pct).length + ' spreads, ' + Object.keys(slope).length + ' slopes; missing: ' + (missing.join(', ') || 'none'));
};

function write(out) {
  fs.writeFileSync(path.join(__dirname, 'real.js'), '// Real MLB targets for step 1.5, built by `node tools/realdata.js --build DIR` (tools/lib/realbuild.js).\n' +
    '// Generated: do not edit by hand. No player names.\n\'use strict\';\nmodule.exports = ' + JSON.stringify(out, null, 1) + ';\n');
}

// League batted balls (step 1.5 task 3): the grouped searches by batting team summed into league rows.
//   types[year][type] = { n, share, avg, slg, hr (home runs per batted ball), ev, la }
//   grid[type][band]  = { n, share (of all 2024 batted balls), avg, slg, hr }, bands like '95-100' (mph)
function batted(dir, types, bands, spray, missing) {
  const sum = (f) => {
    const p = path.join(dir, f);
    if (!fs.existsSync(p) || fs.statSync(p).size < 100) { if (missing) missing.push(f); return null; }
    const s = { n: 0, ab: 0, h: 0, tb: 0, hr: 0, ev: 0, la: 0 };
    for (const r of parseCSV(fs.readFileSync(p, 'utf8'))) {
      const n = num(r.bip) || num(r.pitches) || 0;
      s.n += n; s.ab += num(r.abs) || 0; s.h += num(r.hits) || 0; s.hr += num(r.hrs) || 0;
      s.tb += (num(r.singles) || 0) + 2 * (num(r.doubles) || 0) + 3 * (num(r.triples) || 0) + 4 * (num(r.hrs) || 0);
      if (Number.isFinite(num(r.launch_speed))) s.ev += n * num(r.launch_speed);
      if (Number.isFinite(num(r.launch_angle))) s.la += n * num(r.launch_angle);
    }
    return s;
  };
  const row = (s, total) => ({ n: s.n, share: r3(s.n / total), avg: r3(s.h / s.ab), slg: r3(s.tb / s.ab), hr: r3(s.hr / s.n), ev: r3(s.ev / s.n), la: r3(s.la / s.n) });
  const out = { types: {}, grid: {}, note: 'Statcast regular season, batted balls by Savant type (ground ball under 10 degrees, line drive 10-25, fly ball 25-50, pop-up over 50); hr is home runs per batted ball; grid shares are of all 2024 batted balls (bands overlap at their edges by a few balls).' };
  for (const y of [2024, 2025, 2026]) {
    const s = {};
    for (const t of types) s[t] = sum(`bbt_${t}_${y}.csv`);
    if (types.some((t) => !s[t])) continue;
    const total = types.reduce((a, t) => a + s[t].n, 0);
    out.types[y] = {};
    for (const t of types) out.types[y][t] = row(s[t], total);
  }
  const cells = {};
  let total = 0;
  for (const t of types) for (const [lo, hi] of bands) { const c = sum(`grid_${t}_${lo}_${hi}.csv`); if (c) { cells[t + ':' + lo + '-' + hi] = c; total += c.n; } }
  for (const t of types) {
    out.grid[t] = {};
    for (const [lo, hi] of bands) { const c = cells[t + ':' + lo + '-' + hi]; if (c) { const r = row(c, total); delete r.ev; delete r.la; out.grid[t][lo + '-' + hi] = r; } }
  }
  // spray[type][direction] = { n, share (of that type's 2024 batted balls), avg, slg, hr, ev, la }
  out.spray = {};
  for (const t of types) {
    const c = {};
    for (const d of spray || []) c[d] = sum(`spray_${t}_${d}.csv`);
    if ((spray || []).some((d) => !c[d])) continue;
    const n = spray.reduce((a, d) => a + c[d].n, 0);
    out.spray[t] = {};
    for (const d of spray) out.spray[t][d.toLowerCase()] = row(c[d], n);
  }
  return out;
}

// Only the batted-ball tables, kept with the rest of the current real.js (node tools/realdata.js --batted DIR).
function battedOnly(dir, types, bands, spray) {
  const file = path.join(__dirname, 'real.js');
  delete require.cache[require.resolve(file)];
  const out = Object.assign({}, require(file));
  out.batted = batted(dir, types, bands, spray, null);
  write(out);
  console.log('wrote tools/lib/real.js: batted-ball tables for ' + Object.keys(out.batted.types).join(', ') + ' and the 2024 grid');
}

module.exports.parseCSV = parseCSV;
module.exports.battedOnly = battedOnly;
