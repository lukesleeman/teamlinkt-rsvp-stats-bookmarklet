// A deliberately tiny SVG line chart: y-axis min/max labels, up to 5 x-axis ticks (from each
// point's optional `tick`), one line, and a dot per point with a hover tooltip. Labels are
// escaped because they include TeamLinkt event names.
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export const escapeXml = s => String(s).replace(/[&<>"']/g, c => ESCAPES[c]);

export function lineChart(points, width = 600, height = 160) {
  if (!points.length) return '';
  const pad = 24;
  const max = Math.max(1, ...points.map(p => p.y));
  const x = i => (pad + (points.length < 2 ? 0 : (i * (width - 2 * pad)) / (points.length - 1))).toFixed(1);
  const y = v => (height - pad - (v * (height - 2 * pad)) / max).toFixed(1);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.y)}`).join('');
  const tickIndexes = points.length <= 5 ? points.map((p, i) => i) : [0, 1, 2, 3, 4].map(k => Math.round((k * (points.length - 1)) / 4));
  const ticks = tickIndexes
    .filter(i => points[i].tick != null)
    .map(i => `<text x="${x(i)}" y="${height - 6}" font-size="10" text-anchor="middle">${escapeXml(points[i].tick)}</text>`)
    .join('');
  const dots = points
    .map((p, i) => `<circle cx="${x(i)}" cy="${y(p.y)}" r="3"><title>${escapeXml(p.label)}: ${p.y}</title></circle>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%">` +
    `<text x="2" y="${pad}" font-size="10">${max}</text><text x="2" y="${height - pad}" font-size="10">0</text>${ticks}` +
    `<path d="${path}" fill="none" stroke="#2563eb" stroke-width="2"/><g fill="#2563eb">${dots}</g></svg>`;
}
