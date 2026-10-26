import { memberTable, memberMonthly, toTSV } from '../stats.js';
import { formatMonthLabel } from '../dates.js';
import { lineChart } from './chart.js';
import { el, chart, copyButton } from './dom.js';

export function renderByMember(container, { groups, data, range }) {
  const { columns, rows } = memberTable(groups, data);
  const headers = ['Member', ...columns, 'Total'];
  const cells = r => [r.name, ...r.counts, r.total];
  const tbody = el('tbody');
  let sorted = rows;

  function toggleMonthly(tr, row) {
    const next = tr.nextSibling;
    if (next && next.classList.contains('tlrsvp-monthly')) return next.remove();
    const points = memberMonthly(row.memberId, groups, data, range).map(m => ({ label: formatMonthLabel(m.month), y: m.count }));
    tr.after(el('tr', { className: 'tlrsvp-monthly' }, el('td', { colSpan: headers.length }, chart(lineChart(points)))));
  }

  function draw() {
    tbody.replaceChildren(...sorted.map(row => {
      const tr = el('tr', {}, ...cells(row).map(c => el('td', { textContent: c })));
      tr.onclick = () => toggleMonthly(tr, row);
      return tr;
    }));
  }

  const headerRow = el('tr', {}, ...headers.map((h, i) => {
    const th = el('th', { textContent: h });
    // Member sorts A-Z; every count column sorts highest first.
    th.onclick = () => {
      sorted = [...rows].sort((a, b) => (i ? cells(b)[i] - cells(a)[i] : a.name.localeCompare(b.name)));
      draw();
    };
    return th;
  }));

  draw();
  container.replaceChildren(
    copyButton(() => toTSV(headers, sorted.map(cells))),
    el('table', { className: 'tlrsvp-table' }, el('thead', {}, headerRow), tbody),
  );
}
