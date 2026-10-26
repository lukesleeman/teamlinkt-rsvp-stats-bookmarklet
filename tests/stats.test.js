import {
  attended, filterGroups, groupSummary, turnout, leaderboard, memberTable, memberMonthly,
  rawRows, RAW_HEADERS, toTSV, toCSV,
} from '../src/stats.js';

const ev = (id, date) => ({ id, start: `${date}T18:00`, name: `Event ${id}`, type: 'Training', location: 'Docklands' });

const groupA = {
  label: 'A', baseLabel: 'A', standIns: [],
  events: [ev('a1', '2026-08-01'), ev('a2', '2026-08-08'), ev('a3', '2026-08-15'), ev('a4', '2026-09-05')],
};
const other = { label: 'Other', baseLabel: null, standIns: [], events: [ev('o1', '2026-08-02')] };
const groups = [other, groupA];

const rsvp = (date, statuses) => ({ start: `${date}T18:00`, statuses });
const data = {
  version: 1,
  members: { m1: 'Zoe', m2: 'Amy', m3: 'Bob <b>' },
  rsvps: {
    a1: rsvp('2026-08-01', { m1: 'G', m2: 'M', m3: 'N' }),
    a2: rsvp('2026-08-08', { m1: 'G', m2: 'R' }),
    a4: rsvp('2026-09-05', { m1: 'G', m2: 'G', m3: 'G' }),
    o1: rsvp('2026-08-02', { m2: 'G' }),
  },
};
const fullRange = { from: '2026-01-01', to: '2026-12-31' };

describe('stats', () => {
  test('attended counts Going and Maybe only', () => {
    expect(['G', 'M', 'N', 'R'].map(attended)).toEqual([true, true, false, false]);
  });

  test('filterGroups applies an inclusive range and keeps Other last', () => {
    expect(filterGroups(groups, fullRange).map(g => g.label)).toEqual(['A', 'Other']);
    const filtered = filterGroups(groups, { from: '2026-08-08', to: '2026-09-05' });
    expect(filtered.map(g => g.label)).toEqual(['A']);
    expect(filtered[0].events.map(e => e.id)).toEqual(['a2', 'a3', 'a4']);
  });

  test('summary and turnout ignore events with no RSVPs', () => {
    expect(groupSummary(groupA, data)).toEqual({ events: 3, average: 2, highest: 3, lowest: 1 });
    expect(turnout(groupA, data).map(t => t.count)).toEqual([2, 1, 3]);
    expect(turnout(groupA, data)[0]).toEqual({ start: '2026-08-01T18:00', name: 'Event a1', count: 2 });
    expect(groupSummary({ ...groupA, events: [ev('a3', '2026-08-15')] }, data))
      .toEqual({ events: 0, average: 0, highest: 0, lowest: 0 });
  });

  test('leaderboard counts Going and Maybe, with percentages of loaded events', () => {
    expect(leaderboard(groupA, data)).toEqual([
      { memberId: 'm1', name: 'Zoe', sessions: 3, pct: 100, attendance: [true, true, true] },
      { memberId: 'm2', name: 'Amy', sessions: 2, pct: 67, attendance: [true, false, true] },
      { memberId: 'm3', name: 'Bob <b>', sessions: 1, pct: 33, attendance: [false, false, true] },
    ]);
  });

  test('memberTable treats missing statuses as not attended', () => {
    const table = memberTable(filterGroups(groups, fullRange), data);
    expect(table.columns).toEqual(['A', 'Other']);
    expect(table.rows).toEqual([
      { memberId: 'm2', name: 'Amy', counts: [2, 1], total: 3 },
      { memberId: 'm1', name: 'Zoe', counts: [3, 0], total: 3 },
      { memberId: 'm3', name: 'Bob <b>', counts: [1, 0], total: 1 },
    ]);
  });

  test('memberMonthly fills empty months', () => {
    expect(memberMonthly('m1', groups, data, { from: '2026-07-01', to: '2026-09-30' })).toEqual([
      { month: '2026-07', count: 0 },
      { month: '2026-08', count: 2 },
      { month: '2026-09', count: 1 },
    ]);
  });

  test('rawRows lists every stored status', () => {
    const rows = rawRows(filterGroups(groups, fullRange), data);
    expect(rows).toHaveLength(9);
    expect(rows[0]).toEqual(['a1', '2026-08-01', '18:00', 'Event a1', 'A', 'Docklands', 'Training', 'm2', 'Amy', 'Maybe']);
    expect(rows.map(r => r[0])).toEqual(['a1', 'a1', 'a1', 'o1', 'a2', 'a2', 'a4', 'a4', 'a4']);
    expect(rows.find(r => r[0] === 'a2' && r[7] === 'm2')[9]).toBe('No Response');
    expect(rows.find(r => r[0] === 'a1' && r[7] === 'm3')[9]).toBe('Not Going');
  });

  test('empty range produces empty stats and header-only exports', () => {
    const empty = filterGroups(groups, { from: '2027-01-01', to: '2027-01-31' });
    expect(empty).toEqual([]);
    expect(memberTable(empty, data).rows).toEqual([]);
    expect(toCSV(RAW_HEADERS, rawRows(empty, data))).toBe('﻿' + RAW_HEADERS.join(',') + '\r\n');
  });

  test('toTSV replaces tabs and newlines', () => {
    expect(toTSV(['a'], [['x\ty\nz']])).toBe('a\nx y z');
    expect(toTSV(['#', 'n'], [[1, 'b']])).toBe('#\tn\n1\tb');
  });

  test('toCSV quotes commas, quotes and newlines', () => {
    expect(toCSV(['a', 'b'], [['1,2', 'say "hi"\nok']])).toBe('﻿a,b\r\n"1,2","say ""hi""\nok"\r\n');
  });
});
