// The chart page for tools/ratingstats.js --html=file (step 1.5; owner's choice, Session 8): one
// self-contained HTML page, no scripts and no network beyond Google Fonts (it reads fine without them).
// page(data, value, info) returns the HTML: data is ratingstats' JSON, value is calibrate.js --json (or null).
'use strict';

const GROUPS = [
  ['Hitting', ['contact', 'timing', 'launch', 'rawPower', 'recognition', 'discipline']],
  ['Pitching', ['velocity', 'command', 'deception', 'grades', 'stamina']],
  ['Running and defense', ['speed', 'arm']]
];
const NAMES = { contact: 'Contact', timing: 'Timing', launch: 'Launch', rawPower: 'Raw Power', recognition: 'Recognition',
  discipline: 'Discipline', velocity: 'Velocity', command: 'Command', deception: 'Deception', grades: 'Pitch grades',
  stamina: 'Stamina', speed: 'Speed', arm: 'Arm', range: 'Range', hands: 'Hands', framing: 'Framing', baserunning: 'Baserunning' };
const STAT = {
  zContact: 'Zone contact %', whiff: 'Whiff % (per swing)', whiff95: 'Whiff % against 95+ mph', sweet: 'Sweet-spot % (8–32°)',
  pu: 'Pop-up %', batSpeed: 'Bat speed (mph)', maxEV: 'Max exit speed (mph, per 400 batted balls)', ev50: 'Hardest-half exit speed (mph)',
  offWhiff: 'Whiff % on breaking and off-speed', offChaseMinusFb: 'Off-speed chase minus fastball chase', zMinusO: 'Zone swing % minus chase %',
  chase: 'Chase %', fbSpeed: 'Fastball speed (mph)', edge: 'Edge % (shadow zone)', meatball: 'Meatball %', whiffSL: 'Slider whiff %',
  whiffCH: 'Change-up whiff %', whiffCU: 'Curveball whiff %', sprint: 'Sprint speed (ft/s)', hpTo1b: 'Home to first (s)',
  armRF: 'Arm strength in right field (mph)', armSS: 'Arm strength at shortstop (mph)', staminaPitches: 'Pitches before fatigue'
};
const LEVELS = [20, 30, 40, 50, 60, 70, 80, 90, 99];

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function f(x, d) { return Number.isFinite(x) ? x.toFixed(d) : '–'; }
function digits(lo, hi) { const r = Math.abs(hi - lo); return r < 0.5 ? 3 : r < 5 ? 2 : r < 50 ? 1 : 0; }

function niceTicks(lo, hi, n) {
  const span = hi - lo || 1, raw = span / n, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || 10 * mag;
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Math.round(v / step) * step);
  return out;
}

// How close the engine is to the real ladder: the largest gap from 30 to 90, as a share of the real
// 5th-95th percentile range.
function closeness(eng, tgt) {
  if (!tgt) return null;
  const span = Math.abs(tgt[80] - tgt[40]) || 1;
  let worst = 0;
  for (const L of [30, 40, 50, 60, 70, 80, 90]) {
    const e = eng[LEVELS.indexOf(L)];
    if (Number.isFinite(e) && Number.isFinite(tgt[L])) worst = Math.max(worst, Math.abs(e - tgt[L]) / span);
  }
  return worst;
}
function verdict(c) {
  if (c === null) return ['none', 'no real target'];
  return c <= 0.15 ? ['ok', 'on the ladder'] : c <= 0.35 ? ['near', 'near the ladder'] : ['off', 'off the ladder'];
}

function chart(own) {
  const W = 320, H = 176, L = 44, R = 12, T = 12, B = 30;
  const eng = own.values, tgt = own.target;
  const ys = eng.concat(tgt ? LEVELS.map((l) => tgt[l]) : []).filter(Number.isFinite);
  if (!ys.length) return '';
  let lo = Math.min.apply(null, ys), hi = Math.max.apply(null, ys);
  const pad = (hi - lo) * 0.08 || 1;
  lo -= pad; hi += pad;
  const ticks = niceTicks(lo, hi, 4);
  lo = Math.min(lo, ticks[0]); hi = Math.max(hi, ticks[ticks.length - 1]);
  const x = (r) => L + (r - 20) / 79 * (W - L - R), y = (v) => T + (hi - v) / (hi - lo) * (H - T - B);
  const d = digits(ticks[0], ticks[ticks.length - 1]);
  const td = ticks.length > 1 ? digits(0, ticks[1] - ticks[0]) : d;
  const parts = [`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(STAT[own.engine] || own.engine)} by rating, engine against the real ladder">`];
  for (const t of ticks) parts.push(`<line class="grid" x1="${L}" x2="${W - R}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}"/><text class="tick" x="${L - 6}" y="${(y(t) + 3.5).toFixed(1)}" text-anchor="end">${f(t, Math.min(td, 3))}</text>`);
  for (const r of [20, 40, 60, 80, 99]) parts.push(`<text class="tick" x="${x(r).toFixed(1)}" y="${H - 10}" text-anchor="middle">${r}</text>`);
  parts.push(`<line class="axis" x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}"/>`);
  const path = (vals) => vals.map((v, i) => Number.isFinite(v) ? (i ? 'L' : 'M') + x(LEVELS[i]).toFixed(1) + ' ' + y(v).toFixed(1) : '').join(' ').replace(/^ L/, 'M');
  if (tgt) {
    const tv = LEVELS.map((l) => tgt[l]);
    parts.push(`<path class="real" d="${path(tv)}"/>`);
    tv.forEach((v, i) => { if (Number.isFinite(v)) parts.push(`<circle class="realdot" cx="${x(LEVELS[i]).toFixed(1)}" cy="${y(v).toFixed(1)}" r="2.6"><title>real at ${LEVELS[i]}: ${f(v, d)}</title></circle>`); });
  }
  parts.push(`<path class="eng" d="${path(eng)}"/>`);
  eng.forEach((v, i) => { if (Number.isFinite(v)) parts.push(`<circle class="engdot" cx="${x(LEVELS[i]).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3"><title>engine at ${LEVELS[i]}: ${f(v, d)}</title></circle>`); });
  parts.push('</svg>');
  return parts.join('');
}

function card(k, own, games) {
  const c = closeness(own.values, own.target), [cls, word] = verdict(c);
  const d = digits(Math.min.apply(null, own.values.filter(Number.isFinite)), Math.max.apply(null, own.values.filter(Number.isFinite)));
  const row = (lab, vals) => `<tr><th scope="row">${lab}</th>${vals.map((v) => `<td>${f(v, d)}</td>`).join('')}</tr>`;
  return `<article class="card">
  <header><h4>${esc(STAT[own.engine] || own.engine)}</h4><span class="pill ${cls}">${word}</span></header>
  <p class="src">${own.target ? 'Real: <code>' + esc(own.real) + '</code>' + (own.sign < 0 ? ' · mirrored (a higher rating means a lower value)' : '') : 'No real stat yet'}</p>
  <div class="chartbox">${chart(own)}</div>
  <div class="tablebox"><table class="nums"><thead><tr><th scope="col">Rating</th>${LEVELS.map((l) => `<th scope="col">${l}</th>`).join('')}</tr></thead>
  <tbody>${row('Engine', own.values)}${own.target ? row('Real', LEVELS.map((l) => own.target[l])) : ''}</tbody></table></div>
</article>`;
}

function units(data, real) {
  const rows = [];
  for (const k in data.ratings) {
    const R = data.ratings[k];
    for (const u of R.units || []) {
      const rs = real.slope[u.real];
      rows.push(`<tr><th scope="row">${esc(NAMES[k] || k)}</th><td>${esc(u.label)}</td><td>${f(u.engine, 3)}</td><td>${rs ? f(rs.per, 3) + ' <span class="se">± ' + f(rs.se, 3) + '</span>' : '–'}</td><td class="left"><code>${esc(u.real)}</code></td></tr>`);
    }
  }
  if (!rows.length) return '';
  return `<section><h2>Each unit's effect</h2><p class="lede">Layer 2: what one unit of a rating's own stat does downstream, between ratings 50 and 70, against the real slope across player-seasons (<code>dvelo</code>: the same pitcher from one season to the next).</p>
<div class="tablebox"><table class="nums"><thead><tr><th scope="col">Rating</th><th scope="col" class="left">Per unit</th><th scope="col">Engine</th><th scope="col">Real</th><th scope="col" class="left">Real source</th></tr></thead><tbody>${rows.join('')}</tbody></table></div></section>`;
}

function popRow(r, d) {
  const all = r.engine.concat(r.target).filter(Number.isFinite);
  if (!all.length) return '';
  let lo = Math.min.apply(null, all), hi = Math.max.apply(null, all);
  const pad = (hi - lo) * 0.06 || 1; lo -= pad; hi += pad;
  const W = 300, x = (v) => 6 + (v - lo) / (hi - lo) * (W - 12);
  const bar = (q, yy, cls) => Number.isFinite(q[0]) ? `<line class="${cls} thin" x1="${x(q[0]).toFixed(1)}" x2="${x(q[4]).toFixed(1)}" y1="${yy}" y2="${yy}"/><line class="${cls} thick" x1="${x(q[1]).toFixed(1)}" x2="${x(q[3]).toFixed(1)}" y1="${yy}" y2="${yy}"/><line class="${cls} med" x1="${x(q[2]).toFixed(1)}" x2="${x(q[2]).toFixed(1)}" y1="${yy - 6}" y2="${yy + 6}"/>` : '';
  return `<tr><th scope="row">${esc(r.label)}</th><td class="viz"><svg viewBox="0 0 ${W} 34" role="img" aria-label="${esc(r.label)}: engine and real spreads">${bar(r.target, 10, 'realbar')}${bar(r.engine, 24, 'engbar')}</svg></td>
<td>${f(r.engine[0], d)}–${f(r.engine[4], d)} <span class="se">(${f(r.engine[2], d)})</span></td><td>${f(r.target[0], d)}–${f(r.target[4], d)} <span class="se">(${f(r.target[2], d)})</span></td></tr>`;
}

function population(pop) {
  if (!pop) return '';
  const block = (kind, title) => {
    const p = pop[kind];
    if (!p) return '';
    const rows = p.rows.map((r) => popRow(r, digits(Math.min.apply(null, r.target), Math.max.apply(null, r.target)))).join('');
    return `<h3>${title} <span class="count">${p.n} test player-seasons</span></h3><div class="tablebox"><table class="pop"><thead><tr><th scope="col">Stat</th><th scope="col"><span class="key real">Real</span> <span class="key eng">Engine</span></th><th scope="col">Engine 5th–95th (median)</th><th scope="col">Real 5th–95th (median)</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  };
  return `<section><h2>Population check</h2><p class="lede">Layer 3: test players with mixed ratings (about 60 ± 12 per standard deviation, mildly correlated), each a 500-PA or 500-batter season against average teams. Thin bar: 5th to 95th percentile; thick bar: 25th to 75th; tick: median. Real: 2024–2026 regulars (250+ PA or batters faced).</p>
${block('hitter', 'Hitters')}${block('pitcher', 'Pitchers')}</section>`;
}

function valueTable(value, kind, title) {
  if (!value) return '';
  const rows = value.value.filter((r) => r.kind === kind);
  if (!rows.length) return '';
  const lo = value.target * (1 - value.band), hi = value.target * (1 + value.band);
  const head = rows[0].from.map((L) => `<th scope="col">${L}→${L + 10}</th>`).join('');
  const body = rows.map((r) => `<tr><th scope="row">${esc(NAMES[r.k] || r.k)}</th>${r.steps.map((s, i) => {
    const checked = i % 2 === 0, inside = s.v >= lo && s.v <= hi;
    return `<td class="${checked ? (inside ? 'in' : 'out') : 'mid'}">${f(s.v, 2)}<span class="se"> ±${f(s.se, 2)}</span></td>`;
  }).join('')}</tr>`).join('');
  return `<h3>${title}</h3><div class="tablebox"><table class="nums value"><thead><tr><th scope="col">Rating</th>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function page(data, value, info) {
  const groups = GROUPS.map(([title, keys]) => {
    const cards = [];
    for (const k of keys) {
      const R = data.ratings[k];
      if (!R) continue;
      for (const own of R.own) cards.push({ k: k, html: card(k, own, data.games) });
    }
    if (!cards.length) return '';
    let html = `<section><h2>${title}</h2>`, last = null;
    for (const c of cards) {
      if (c.k !== last) { if (last) html += '</div>'; html += `<h3>${esc(NAMES[c.k] || c.k)} <span class="count">${data.ratings[c.k].direct ? 'read from the rating hooks' : data.games + ' games per level'}</span></h3><div class="cards">`; last = c.k; }
      html += c.html;
    }
    return html + '</div></section>';
  }).join('');
  const counts = { ok: 0, near: 0, off: 0 };
  for (const k in data.ratings) for (const own of data.ratings[k].own) { const v = verdict(closeness(own.values, own.target))[0]; if (counts[v] !== undefined) counts[v]++; }
  return `<title>Rating Ladder Check</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&family=Space+Grotesk:wght@500;600&display=swap">
<style>
/* Layout: a field report. Summary strip, then one section per rating group; each rating's own stats as
   small charts (engine solid, real ladder dashed), then the per-unit, population and equal-value tables. */
:root {
  --bg: #f3f5f1; --surface: #ffffff; --fg: #18201b; --muted: #5a675f; --line: #d6ddd6;
  --engine: #1f5fbf; --real: #2f7d4f; --ok: #2f7d4f; --near: #a16207; --off: #b42318;
  --ok-bg: #e3f1e8; --near-bg: #fbf0d9; --off-bg: #fbe4e1;
  --display: "Space Grotesk", "IBM Plex Sans", system-ui, sans-serif;
  --body: "IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
  --mono: "IBM Plex Mono", ui-monospace, "SFMono-Regular", Menlo, monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg: #111613; --surface: #18201b; --fg: #e4ebe6; --muted: #98a59d; --line: #2b352f;
  --engine: #79a7f5; --real: #5cc08a; --ok: #5cc08a; --near: #e0b04a; --off: #f2877a;
  --ok-bg: #173323; --near-bg: #3a2e12; --off-bg: #3d1b17; color-scheme: dark } }
:root[data-theme="dark"] {
  --bg: #111613; --surface: #18201b; --fg: #e4ebe6; --muted: #98a59d; --line: #2b352f;
  --engine: #79a7f5; --real: #5cc08a; --ok: #5cc08a; --near: #e0b04a; --off: #f2877a;
  --ok-bg: #173323; --near-bg: #3a2e12; --off-bg: #3d1b17; color-scheme: dark }
body { background: var(--bg); color: var(--fg); font: 15px/1.55 var(--body); }
.wrap { max-width: 1180px; margin: 0 auto; padding-block: 28px 56px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); display: grid; gap: 36px; }
h1, h2, h3, h4 { font-family: var(--display); text-wrap: balance; margin: 0; }
h1 { font-size: 2rem; font-weight: 600; letter-spacing: -0.01em; }
h2 { font-size: 1.4rem; font-weight: 600; padding-bottom: 6px; border-bottom: 1px solid var(--line); }
h3 { font-size: 1.05rem; font-weight: 600; margin: 22px 0 10px; display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; }
h4 { font-size: 0.95rem; font-weight: 600; }
section { display: grid; gap: 6px; min-width: 0; }
.lede { color: var(--muted); max-width: 72ch; margin: 4px 0 0; }
.eyebrow { font: 500 0.75rem var(--mono); letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
.head { display: grid; gap: 10px; }
.summary { display: flex; flex-wrap: wrap; gap: 8px 18px; align-items: center; color: var(--muted); font-size: 0.9rem; }
.legend { display: inline-flex; gap: 14px; align-items: center; }
.key { display: inline-flex; align-items: center; gap: 6px; font-size: 0.85rem; color: var(--muted); }
.key::before { content: ""; width: 18px; height: 0; border-top: 2.5px solid var(--engine); }
.key.real::before { border-top: 2px dashed var(--real); }
.count { font: 400 0.8rem var(--mono); color: var(--muted); }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 330px), 1fr)); gap: 14px; }
.card { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 14px; display: grid; gap: 8px; min-width: 0; align-content: start; }
.card header { display: flex; justify-content: space-between; gap: 10px; align-items: start; }
.src { margin: 0; color: var(--muted); font-size: 0.8rem; }
code { font-family: var(--mono); font-size: 0.78rem; }
.pill { font: 500 0.72rem var(--mono); padding: 2px 8px; border-radius: 999px; white-space: nowrap; }
.pill.ok { color: var(--ok); background: var(--ok-bg); } .pill.near { color: var(--near); background: var(--near-bg); }
.pill.off { color: var(--off); background: var(--off-bg); } .pill.none { color: var(--muted); border: 1px solid var(--line); }
.chartbox svg { width: 100%; height: auto; display: block; }
svg .grid { stroke: var(--line); stroke-width: 1; }
svg .axis { stroke: var(--muted); stroke-width: 1; }
svg .tick { fill: var(--muted); font: 10px var(--mono); }
svg .eng { fill: none; stroke: var(--engine); stroke-width: 2.5; }
svg .real { fill: none; stroke: var(--real); stroke-width: 2; stroke-dasharray: 5 4; }
svg .engdot { fill: var(--engine); } svg .realdot { fill: var(--surface); stroke: var(--real); stroke-width: 1.5; }
.tablebox { overflow-x: auto; min-width: 0; }
table { border-collapse: collapse; width: 100%; font-size: 0.82rem; }
th, td { padding: 4px 6px; border-bottom: 1px solid var(--line); text-align: right; white-space: nowrap; }
th:first-child { text-align: left; }
thead th { font-weight: 500; color: var(--muted); }
.nums td { font-family: var(--mono); font-variant-numeric: tabular-nums; }
td.left, th.left { text-align: left; }
.se { color: var(--muted); font-size: 0.85em; }
.card table { font-size: 0.7rem; } .card th, .card td { padding: 3px 3px; }
.value td.in { background: var(--ok-bg); } .value td.out { background: var(--off-bg); } .value td.mid { color: var(--muted); }
.pop td { font-family: var(--mono); font-variant-numeric: tabular-nums; }
.pop td.viz { width: 46%; min-width: 220px; }
.pop svg { width: 100%; height: 34px; display: block; }
.pop .thin { stroke-width: 2; } .pop .thick { stroke-width: 6; stroke-linecap: round; } .pop .med { stroke-width: 2.5; }
.realbar { stroke: var(--real); } .engbar { stroke: var(--engine); }
.pop .key.eng::before { border-top: 2.5px solid var(--engine); }
.note { color: var(--muted); font-size: 0.85rem; max-width: 80ch; }
</style>
<div class="wrap">
<header class="head">
  <span class="eyebrow">Diamond Dash · M1 step 1.5 · ${esc(info.date)}</span>
  <h1>Rating Ladder Check</h1>
  <p class="lede">Each rating moved from 20 to 99 for a whole lineup or staff, everyone else at 60, against the real ladder from 2024–2026 player-seasons: 20 is the worst, 40 the 5th percentile, 60 the median, 80 the 95th, 99 the best (owner's choice, Session 8). Engine: ${esc(info.engine)}.</p>
  <div class="summary"><span class="legend"><span class="key eng">Engine</span><span class="key real">Real ladder</span></span>
  <span><span class="pill ok">on the ladder</span> ${counts.ok}</span><span><span class="pill near">near</span> ${counts.near}</span><span><span class="pill off">off</span> ${counts.off}</span>
  <span>Largest gap from 30 to 90 as a share of the real 5th–95th range: on ≤ 15%, near ≤ 35%.</span></div>
</header>
${groups}
${units(data, info.real)}
${population(data.pop)}
${value ? `<section><h2>Equal value</h2><p class="lede">Runs per team-game for +10 points, for a whole lineup or staff (pitchers: runs saved), by paired replays (<code>calibrate.js --part=value</code>, ${esc(value.date)}). The checked steps are 40→50, 60→70 and 80→90; green is inside ${f(value.target * (1 - value.band), 2)}–${f(value.target * (1 + value.band), 2)}. A report, not a gate: realism wins where they clash (owner's choice, Session 8).</p>
${valueTable(value, 'hitter', 'Hitting')}${valueTable(value, 'pitcher', 'Pitching')}</section>` : ''}
<p class="note">Sources: Baseball Savant and Baseball-Reference, 2024–2026, summarized in <code>tools/lib/real.js</code> (no player names). Measured by <code>node tools/ratingstats.js</code>; the numbers change with every engine change.</p>
</div>
`;
}

module.exports = { page };
