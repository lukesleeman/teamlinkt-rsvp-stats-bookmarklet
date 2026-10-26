// The only module that knows TeamLinkt's endpoints and the HTML inside their DataTables cells.

export class TeamLinktError extends Error {
  constructor(kind, endpoint, message) {
    super(message || `TeamLinkt ${endpoint}: ${kind} error`);
    this.kind = kind;         // 'session' | 'parse' | 'network'
    this.endpoint = endpoint;
  }
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const STATUS_CLASSES = { going: 'G', maybe: 'M', not_going: 'N', default: 'R' };
const STATUS_VALUES = { accepted: 'G', tentative: 'M', declined: 'N', needs_action: 'R' };
const pad = n => String(n).padStart(2, '0');

const cell = html => new DOMParser().parseFromString(String(html || ''), 'text/html').body;
const text = html => cell(html).textContent.replace(/\s+/g, ' ').trim();

// 'Tue October 27 2026, 6:00 pm' -> '2026-10-27T18:00'
export function parseEventDate(value) {
  const m = value.match(/([a-z]+) (\d{1,2}) (\d{4}), (\d{1,2}):(\d{2}) ([ap]m)/i);
  const month = m && MONTHS.indexOf(m[1].toLowerCase());
  if (!m || month < 0) throw new TeamLinktError('parse', 'getEvents', `Unrecognised event date: ${value}`);
  const hours = (Number(m[4]) % 12) + (m[6].toLowerCase() === 'pm' ? 12 : 0);
  return `${m[3]}-${pad(month + 1)}-${pad(m[2])}T${pad(hours)}:${m[5]}`;
}

export function parseEventRow(row) {
  const id = String(row[6] || '').match(/\/events\/view\/(\d+)/);
  if (!id) throw new TeamLinktError('parse', 'getEvents', 'Event row has no event link');
  return { id: id[1], start: parseEventDate(text(row[0])), name: text(row[1]), type: text(row[2]), location: text(row[3]) };
}

function parseStatus(html) {
  const el = cell(html);
  const selected = el.querySelector('select option[selected]');
  if (selected) return STATUS_VALUES[selected.value];
  const label = el.querySelector('.status_label');
  const cls = label && [...label.classList].find(c => c.startsWith('status_label_'));
  return cls && STATUS_CLASSES[cls.slice('status_label_'.length)];
}

export function parseAvailabilityRows(rows) {
  return rows.filter(r => !/<h4/i.test(r[1] || '')).map(r => {
    const link = cell(r[1]).querySelector('a[href*="/players/view/"]');
    const id = link && link.getAttribute('href').match(/\/players\/view\/(\d+)/);
    const status = parseStatus(r[3]);
    if (!id || !status) throw new TeamLinktError('parse', 'getEventAvailability', 'Unrecognised RSVP row');
    return { id: id[1], name: link.textContent.replace(/\s+/g, ' ').trim(), status };
  });
}

async function postForm(url, endpoint, data) {
  let res, body;
  try {
    res = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
      body: new URLSearchParams(data),
    });
  } catch (e) {
    throw new TeamLinktError('network', endpoint, e.message);
  }
  if (!res.ok) throw new TeamLinktError('network', endpoint, `HTTP ${res.status}`);
  try {
    body = JSON.parse(await res.text());
  } catch (e) {
    body = null;
  }
  if (!body || !Array.isArray(body.data)) throw new TeamLinktError('session', endpoint);
  return body.data;
}

export async function fetchPastEvents(teamId) {
  const rows = await postForm('/schedules/getEvents', 'getEvents', {
    team_id: teamId, status: 'past', draw: 1, start: 0, length: 2000, 'order[0][column]': 0, 'order[0][dir]': 'desc',
  });
  return rows.map(parseEventRow);
}

export async function fetchAvailability(teamId, eventId) {
  const rows = await postForm('/events/getEventAvailability', 'getEventAvailability', {
    team_id: teamId, event_id: eventId, draw: 1, start: 0, length: 500,
  });
  return parseAvailabilityRows(rows);
}
