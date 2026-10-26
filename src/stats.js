// Pure stats over grouped events and the stored RSVPs. An event only counts once its RSVPs
// are stored, so events that failed to load never drag averages or percentages down.
import { monthsBetween } from './dates.js';

const STATUS_WORDS = { G: 'Going', M: 'Maybe', N: 'Not Going', R: 'No Response' };

export const RAW_HEADERS = ['event_id', 'date', 'time', 'event', 'group', 'location', 'type', 'member_id', 'member', 'status'];

export const attended = status => status === 'G' || status === 'M';

const day = ev => ev.start.slice(0, 10);
const byName = (a, b) => a.name.localeCompare(b.name);
const memberName = (data, id) => data.members[id] || id;

const otherLast = (a, b) => (a.label === 'Other') - (b.label === 'Other');

// Keeps the given group order (see sortByTurnout), with Other always last.
export function filterGroups(groups, range) {
  return groups
    .map(g => ({ ...g, events: g.events.filter(e => day(e) >= range.from && day(e) <= range.to) }))
    .filter(g => g.events.length)
    .sort(otherLast);
}

export const loadedEvents = (group, data) =>
  group.events.filter(e => data.rsvps[e.id]).sort((a, b) => (a.start < b.start ? -1 : a.start > b.start));

const attendees = (ev, data) =>
  Object.keys(data.rsvps[ev.id].statuses).filter(id => attended(data.rsvps[ev.id].statuses[id]));

export const turnout = (group, data) =>
  loadedEvents(group, data).map(e => ({ start: e.start, name: e.name, count: attendees(e, data).length }));

// Orders groups by total turnout (Going + Maybe summed over every loaded event), so the sessions
// most people come to are listed first. Other always goes last.
export function sortByTurnout(groups, data) {
  const total = g => turnout(g, data).reduce((sum, t) => sum + t.count, 0);
  const totals = new Map(groups.map(g => [g, total(g)]));
  return [...groups].sort((a, b) => otherLast(a, b) || totals.get(b) - totals.get(a));
}

export function groupSummary(group, data) {
  const counts = turnout(group, data).map(t => t.count);
  if (!counts.length) return { events: 0, average: 0, highest: 0, lowest: 0 };
  return {
    events: counts.length,
    average: Math.round(counts.reduce((a, b) => a + b, 0) / counts.length),
    highest: Math.max(...counts),
    lowest: Math.min(...counts),
  };
}

export function leaderboard(group, data) {
  const events = loadedEvents(group, data);
  const sessions = {};
  events.forEach(e => attendees(e, data).forEach(id => { sessions[id] = (sessions[id] || 0) + 1; }));
  // attendance: one boolean per loaded event, in date order.
  return Object.keys(sessions)
    .map(id => ({
      memberId: id,
      name: memberName(data, id),
      sessions: sessions[id],
      pct: Math.round(100 * sessions[id] / events.length),
      attendance: events.map(e => attended(data.rsvps[e.id].statuses[id])),
    }))
    .sort((a, b) => b.sessions - a.sessions || byName(a, b));
}

export function memberTable(groups, data) {
  const rows = {};
  groups.forEach((g, col) => loadedEvents(g, data).forEach(e => {
    const statuses = data.rsvps[e.id].statuses;
    Object.keys(statuses).forEach(id => {
      const row = rows[id] || (rows[id] = { memberId: id, name: memberName(data, id), counts: groups.map(() => 0), total: 0 });
      if (attended(statuses[id])) { row.counts[col]++; row.total++; }
    });
  }));
  return {
    columns: groups.map(g => g.label),
    rows: Object.values(rows).sort((a, b) => b.total - a.total || byName(a, b)),
  };
}

export function memberMonthly(memberId, groups, data, range) {
  const counts = {};
  groups.forEach(g => loadedEvents(g, data).forEach(e => {
    if (day(e) >= range.from && day(e) <= range.to && attended(data.rsvps[e.id].statuses[memberId])) {
      counts[e.start.slice(0, 7)] = (counts[e.start.slice(0, 7)] || 0) + 1;
    }
  }));
  return monthsBetween(range.from, range.to).map(month => ({ month, count: counts[month] || 0 }));
}

export function rawRows(groups, data) {
  const events = groups.flatMap(g => loadedEvents(g, data).map(e => ({ e, group: g.label })));
  events.sort((a, b) => (a.e.start < b.e.start ? -1 : a.e.start > b.e.start));
  return events.flatMap(({ e, group }) => {
    const statuses = data.rsvps[e.id].statuses;
    return Object.keys(statuses)
      .map(id => ({ id, name: memberName(data, id) }))
      .sort(byName)
      .map(m => [e.id, day(e), e.start.slice(11, 16), e.name, group, e.location, e.type, m.id, m.name, STATUS_WORDS[statuses[m.id]]]);
  });
}

export function toTSV(headers, rows) {
  return [headers, ...rows].map(r => r.map(v => String(v).replace(/[\t\r\n]/g, ' ')).join('\t')).join('\n');
}

export function toCSV(headers, rows) {
  const cell = v => (/[",\r\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return '﻿' + [headers, ...rows].map(r => r.map(cell).join(',') + '\r\n').join('');
}
