import { groupSummary, turnout, leaderboard, toTSV } from '../stats.js';
import { formatDateLabel, formatShortDate } from '../dates.js';
import { lineChart } from './chart.js';
import { el, table, chart, copyButton } from './dom.js';

const HEADERS = ['#', 'Member', 'Sessions', '% of sessions'];

export function renderByEventType(container, { groups, data }) {
  const list = el('div', { className: 'tlrsvp-groups' });
  const detail = el('div', { className: 'tlrsvp-detail' });

  function show(group, button) {
    list.querySelectorAll('.tlrsvp-active').forEach(b => b.classList.remove('tlrsvp-active'));
    button.classList.add('tlrsvp-active');
    const s = groupSummary(group, data);
    const board = leaderboard(group, data);
    const rows = board.map((r, i) => [i + 1, r.name, r.sessions, `${r.pct}%`]);
    // The strip (one dot per session, filled if attended) is on screen only; Copy keeps the numbers.
    const shown = rows.map((r, i) => [...r, board[i].attendance.map(a => (a ? '●' : '○')).join('')]);
    const points = turnout(group, data).map(t => ({ label: `${formatDateLabel(t.start)} · ${t.name}`, y: t.count, tick: formatShortDate(t.start) }));
    detail.replaceChildren(
      el('p', { textContent: `${s.events} events · average ${s.average} · highest ${s.highest} · lowest ${s.lowest}` }),
      el('p', { className: 'tlrsvp-caption', textContent: 'Going + Maybe per session' }),
      chart(lineChart(points)),
      copyButton(() => toTSV(HEADERS, rows)),
      table([...HEADERS, 'Attendance'], shown),
    );
  }

  groups.forEach(group => {
    const button = el('button', { className: 'tlrsvp-group', textContent: `${group.label} (${group.events.length})` });
    button.onclick = () => show(group, button);
    list.append(button);
  });
  container.replaceChildren(el('div', { className: 'tlrsvp-split' }, list, detail));
  if (groups.length) show(groups[0], list.firstChild);
}
