// Date helpers. Event times are naive local strings ('YYYY-MM-DDTHH:MM'), so these work on
// the strings directly or through UTC Dates, and never let the browser's time zone shift a day.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pad = n => String(n).padStart(2, '0');
const parts = s => s.match(/\d+/g).map(Number);

export const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const isoMinute = d => `${isoDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

export function addMonths(day, n) {
  const [y, m, d] = parts(day);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return `${target.getUTCFullYear()}-${pad(target.getUTCMonth() + 1)}-${pad(Math.min(d, lastDay))}`;
}

export function monthsBetween(from, to) {
  const months = [];
  let [y, m] = parts(from);
  const end = to.slice(0, 7);
  for (let month = `${y}-${pad(m)}`; month <= end; month = `${y}-${pad(m)}`) {
    months.push(month);
    if (++m > 12) { m = 1; y++; }
  }
  return months;
}

export function formatDateLabel(start) {
  const [y, m, d] = parts(start);
  return `${DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MONTHS[m - 1]} ${y}`;
}

// '2026-10-08T18:00' -> '8 Oct'
export function formatShortDate(start) {
  const [, m, d] = parts(start);
  return `${d} ${MONTHS[m - 1]}`;
}

export function formatMonthLabel(month) {
  const [y, m] = parts(month);
  return `${MONTHS[m - 1]} ${y}`;
}

export const presetRange = (months, today) => ({ from: addMonths(today, -months), to: today });
