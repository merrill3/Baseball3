// Box score and play-by-play, built from a game's log alone. Logic file: no DOM.
//   B3.box.build(g)   { line, teams: [away, home], result }; each team has R, H, E, LOB, PA, errors
//                     (ids of the fielders charged), batting (one line per lineup player: PA AB R H 2B
//                     3B HR RBI BB K SB CS SF GIDP FC ROE OUT, where OUT is outs in play) and pitching
//                     (in order of appearance: outs IP BF P S H R ER BB K HR)
//   B3.box.text(g)    a printable box score
//   B3.box.plays(g)   the play-by-play, one line per event
//   B3.box.ip(outs)   innings pitched as text: 20 outs is "6.2"
(function (root) {
  'use strict';
  const B3 = root.B3 = root.B3 || {};

  const HIT = { '1B': 1, '2B': 2, '3B': 3, HR: 4 };
  const OUT_IN_PLAY = { GO: 1, FO: 1, LO: 1, PO: 1 };
  const BAT_KEYS = ['PA', 'AB', 'R', 'H', '2B', '3B', 'HR', 'RBI', 'BB', 'K', 'SB', 'CS', 'SF', 'GIDP', 'FC', 'ROE', 'OUT'];
  const PIT_KEYS = ['outs', 'BF', 'P', 'S', 'H', 'R', 'ER', 'BB', 'K', 'HR'];

  function ip(outs) { return Math.floor(outs / 3) + '.' + (outs % 3); }

  function zero(keys, extra) {
    const o = extra || {};
    for (const k of keys) o[k] = 0;
    return o;
  }

  function name(g, id) {
    for (const t of g.teams) if (t.players[id]) return t.players[id].name || id;
    return id;
  }

  function build(g) {
    const teams = g.teams.map((t) => {
      const batting = t.lineup.map((id) => zero(BAT_KEYS, { id: id, name: name(g, id), pos: t.pos[id] }));
      const pitching = t.used.map((id) => zero(PIT_KEYS, { id: id, name: name(g, id) }));
      return { id: t.id, name: t.name, code: t.code, R: 0, H: 0, E: 0, LOB: 0, PA: 0, errors: [], batting: batting, pitching: pitching };
    });
    const bat = {}, pit = {};
    teams.forEach((t, side) => {
      for (const b of t.batting) bat[b.id] = b;
      for (const p of t.pitching) pit[p.id] = p;
      t.side = side;
    });
    const line = [[], []];
    for (const e of g.log) {
      const off = teams[e.h], def = teams[1 - e.h];
      switch (e.e) {
        case 'pitch': {
          const p = pit[e.p];
          p.P++;
          if (e.r !== 'B') p.S++;
          break;
        }
        case 'pa': {
          const b = bat[e.b], p = pit[e.p];
          b.PA++; off.PA++; p.BF++;
          p.outs += e.out;
          b.RBI += e.rbi;
          if (HIT[e.res]) {
            b.AB++; b.H++; off.H++; p.H++;
            if (e.res !== '1B') b[e.res]++;
            if (e.res === 'HR') p.HR++;
          } else if (e.res === 'BB') { b.BB++; p.BB++; }
          else if (e.res === 'K') { b.AB++; b.K++; p.K++; }
          else if (OUT_IN_PLAY[e.res]) { b.AB++; b.OUT++; }
          else if (e.res === 'DP') { b.AB++; b.GIDP++; }
          else if (e.res === 'FC') { b.AB++; b.FC++; }
          else if (e.res === 'E') { b.AB++; b.ROE++; def.E++; def.errors.push(e.fl === 'P' ? e.p : g.teams[1 - e.h].byPos[e.fl]); }
          else if (e.res === 'SF') b.SF++;
          for (const s of e.sc) {
            bat[s.r].R++; off.R++;
            pit[s.p].R++;
            if (s.er) pit[s.p].ER++;
          }
          break;
        }
        case 'sb': bat[e.r].SB++; break;
        case 'cs': bat[e.r].CS++; pit[e.p].outs++; break;
        case 'half': line[e.h][e.i - 1] = e.runs; off.LOB += e.lob; break;
        default: break; // placed, sub, adv, end
      }
    }
    for (const t of teams) for (const p of t.pitching) p.IP = ip(p.outs);
    return { line: line, teams: teams, result: g.result };
  }

  // ---- Text ----

  function ordinal(n) {
    const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' })[n % 10] || 'th';
    return n + s;
  }
  const pad = (x, n) => String(x).padStart(n);
  const padR = (x, n) => String(x).padEnd(n);

  function endText(g) {
    const r = g.result;
    if (!r) return 'In progress';
    const extra = r.innings !== g.rules.innings ? ' in ' + r.innings + ' innings' : '';
    return { final: 'Final' + extra, walkoff: 'Final' + extra + ', walk-off', mercy: 'Final after ' + r.innings + ' innings, mercy rule', tie: 'Tie after ' + r.innings + ' innings' }[r.reason];
  }

  function text(g) {
    const box = build(g);
    const T = box.teams;
    const out = [];
    out.push(T[0].name + ' ' + T[0].R + ', ' + T[1].name + ' ' + T[1].R + ' (' + endText(g) + ')');
    out.push('');
    const n = Math.max(box.line[0].length, box.line[1].length);
    let head = padR('', 6);
    for (let i = 1; i <= n; i++) head += pad(i, 3);
    out.push(head + '    R  H  E');
    for (const t of T) {
      let row = padR(t.code, 6);
      for (let i = 0; i < n; i++) row += pad(box.line[t.side][i] === undefined ? 'X' : box.line[t.side][i], 3);
      out.push(row + '  ' + pad(t.R, 3) + pad(t.H, 3) + pad(t.E, 3));
    }
    for (const t of T) {
      out.push('');
      out.push(padR(t.name, 22) + '   PA  AB   R   H RBI  BB   K');
      const tot = zero(['PA', 'AB', 'R', 'H', 'RBI', 'BB', 'K']);
      for (const b of t.batting) {
        out.push(padR(b.name, 14) + padR(b.pos, 8) + ['PA', 'AB', 'R', 'H', 'RBI', 'BB', 'K'].map((k) => { tot[k] += b[k]; return pad(b[k], 4); }).join(''));
      }
      out.push(padR('Totals', 22) + ['PA', 'AB', 'R', 'H', 'RBI', 'BB', 'K'].map((k) => pad(tot[k], 4)).join(''));
      const notes = [];
      for (const k of ['2B', '3B', 'HR', 'SF', 'GIDP', 'SB', 'CS']) {
        const who = t.batting.filter((b) => b[k]).map((b) => b.name + (b[k] > 1 ? ' ' + b[k] : ''));
        if (who.length) notes.push(k + ': ' + who.join(', '));
      }
      if (t.errors.length) notes.push('E: ' + t.errors.map((id) => name(g, id)).join(', '));
      notes.push('LOB: ' + t.LOB);
      out.push(notes.join('. ') + '.');
    }
    for (const t of T) {
      out.push('');
      out.push(padR(t.name + ' pitching', 22) + '   IP   H   R  ER  BB   K  HR    P-S');
      for (const p of t.pitching) {
        out.push(padR(p.name, 22) + pad(p.IP, 5) + ['H', 'R', 'ER', 'BB', 'K', 'HR'].map((k) => pad(p[k], 4)).join('') + pad(p.P + '-' + p.S, 7));
      }
    }
    return out.join('\n');
  }

  const FIELD = { LF: 'left', CF: 'center', RF: 'right' };
  const BASE = { 1: 'first', 2: 'second', 3: 'third', 4: 'home' };

  function list(names) {
    return names.length < 2 ? names.join('') : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
  }

  function paText(g, e, lastPitch) {
    const who = name(g, e.b);
    const pos = B3.data.POS_NAME[e.fl] || e.fl;
    const dir = FIELD[e.fl] || pos;
    let s;
    switch (e.res) {
      case '1B': s = 'singles to ' + dir; break;
      case '2B': s = 'doubles to ' + dir; break;
      case '3B': s = 'triples to ' + dir; break;
      case 'HR': s = 'homers to ' + dir + (e.sc.length === 4 ? ' (grand slam)' : ''); break;
      case 'BB': s = 'walks'; break;
      case 'K': s = 'strikes out ' + (lastPitch && lastPitch.r === 'C' ? 'looking' : 'swinging'); break;
      case 'GO': s = 'grounds out to ' + pos; break;
      case 'FO': s = 'flies out to ' + pos; break;
      case 'LO': s = 'lines out to ' + pos; break;
      case 'PO': s = 'pops out to ' + pos; break;
      case 'DP': s = 'grounds into a double play, ' + pos; break;
      case 'FC': s = 'reaches on a fielder\'s choice, ' + pos; break;
      case 'E': s = 'reaches on an error by the ' + pos; break;
      case 'SF': s = 'hits a sacrifice fly to ' + pos; break;
      default: s = e.res;
    }
    let line = who + ' ' + s + '.';
    if (e.tag && !e.tag.ok) line += ' ' + name(g, e.tag.r) + ' is thrown out tagging from ' + BASE[e.tag.from] + '.';
    else if (e.tag && e.tag.ok && e.tag.from < 3) line += ' ' + name(g, e.tag.r) + ' tags up and takes ' + BASE[e.tag.from + 1] + '.';
    const runners = e.sc.filter((x) => !(e.res === 'HR' && x.r === e.b));
    if (runners.length) line += ' ' + list(runners.map((x) => name(g, x.r))) + (runners.length > 1 ? ' score.' : ' scores.');
    if (e.rbi && e.res !== 'HR') line += ' (' + e.rbi + ' RBI)';
    return line;
  }

  function plays(g) {
    const out = [];
    let cur = null, lastPitch = null;
    const score = [0, 0];
    const T = g.teams;
    for (const e of g.log) {
      if (e.e === 'end') {
        out.push(endText(g) + ': ' + T[0].code + ' ' + e.score[0] + ', ' + T[1].code + ' ' + e.score[1] + '.');
        break;
      }
      const key = e.i + '.' + e.h;
      if (key !== cur) {
        cur = key;
        out.push((e.h === 0 ? 'Top' : 'Bottom') + ' of the ' + ordinal(e.i) + ' (' + T[e.h].name + ' batting)');
      }
      switch (e.e) {
        case 'pitch': lastPitch = e; break;
        case 'pa':
          score[e.h] += e.sc.length;
          out.push('  ' + paText(g, e, lastPitch) + (e.sc.length ? ' ' + T[0].code + ' ' + score[0] + ', ' + T[1].code + ' ' + score[1] + '.' : ''));
          break;
        case 'placed': out.push('  ' + name(g, e.r) + ' starts the inning on second base.'); break;
        case 'sub': out.push('  Pitching change: ' + name(g, e.in) + ' replaces ' + name(g, e.out) + '.'); break;
        case 'sb': out.push('  ' + name(g, e.r) + ' steals ' + BASE[e.from + 1] + '.'); break;
        case 'cs': out.push('  ' + name(g, e.r) + ' is caught stealing ' + BASE[e.from + 1] + '.'); break;
        case 'adv': out.push('  ' + name(g, e.r) + ' takes ' + BASE[e.to] + ' on the throw.'); break;
        case 'half':
          out.push('  ' + e.runs + (e.runs === 1 ? ' run' : ' runs') + ', ' + e.lob + ' left on base.');
          break;
        default: break;
      }
    }
    return out;
  }

  B3.box = { build: build, text: text, plays: plays, ip: ip };
})(typeof globalThis !== 'undefined' ? globalThis : this);
