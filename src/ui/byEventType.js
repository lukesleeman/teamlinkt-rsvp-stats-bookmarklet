import { groupSummary, turnout, leaderboard, toTSV } from '../stats.js';
import { formatDateLabel } from '../dates.js';
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
    const rows = leaderboard(group, data).map((r, i) => [i + 1, r.name, r.sessions, `${r.pct}%`]);
    const points = turnout(group, data).map(t => ({ label: `${formatDateLabel(t.start)} · ${t.name}`, y: t.count }));
    detail.replaceChildren(
      el('p', { textContent: `${s.events} events · average ${s.average} · highest ${s.highest} · lowest ${s.lowest}` }),
      chart(lineChart(points)),
      copyButton(() => toTSV(HEADERS, rows)),
      table(HEADERS, rows),
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
