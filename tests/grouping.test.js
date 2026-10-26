import { groupEvents, cleanName, nameKey, isCancelled } from '../src/grouping.js';
import fixture from './fixtures/events-12mo.json';

const byLabel = groups => Object.fromEntries(groups.map(g => [g.label, g]));
const names = events => events.map(e => e.name).sort();

let nextId = 1;
const ev = (name, start, location, type = 'Training') => ({ id: `t${nextId++}`, name, start, location, type });

describe('groupEvents on the Sea Dragons fixture', () => {
  const { groups, cancelled } = groupEvents(fixture);
  const groupsByLabel = byLabel(groups);

  test('groups the Sea Dragons fixture as agreed', () => {
    expect(cancelled).toBe(22);
    const counts = Object.fromEntries(groups.map(g => [g.label, g.events.length]));
    expect(counts).toEqual({
      'Pango Gym – Wed 6:00pm': 48,
      'Dragon Boat Training – Tue 6:00pm': 46,
      'Dragon Boat Training – Sat 9:30am': 45,
      'Pango Gym – Sun 9:00am': 43,
      'Dragon Boat Training – Thu 6:00pm': 21,
      'Foundation Class': 21,
      'Pilates session with Yalin': 9,
      'Penang Crew': 9,
      'Training Camp': 5,
      'Other': 10,
    });
  });

  test('records stand-ins on the right groups', () => {
    expect(names(groupsByLabel['Dragon Boat Training – Sat 9:30am'].standIns)).toEqual(
      ['River Run', 'River Run And Dragon Boat Training', 'Open Day', 'Open day', '🎄Christmas Paddle🎄'].sort()
    );
    expect(names(groupsByLabel['Foundation Class'].standIns)).toEqual(['Foundation Session']);
    expect(names(groupsByLabel['Training Camp'].standIns)).toEqual(['Dragon Boat Camp 1']);

    const other = groupsByLabel['Other'];
    expect(other.baseLabel).toBeNull();
    expect(names(other.events)).toEqual(expect.arrayContaining(['AGM 2026/27', 'Team Lunch With Alex J']));
    groups.forEach(g => expect(Array.isArray(g.standIns)).toBe(true));
  });
});

describe('name helpers', () => {
  test('cleanName strips emoji, cancel markers and sub-names', () => {
    expect(cleanName('🎄Christmas Paddle🎄')).toBe('Christmas Paddle');
    expect(cleanName('[CANCELLED] Pango Gym - Sunday')).toBe('Pango Gym');
    expect(cleanName('Dragon Boat Training: She-Dragons And Mongrels Bo...')).toBe('Dragon Boat Training');
    expect(cleanName('Labour Day-foundation Session')).toBe('Labour Day-foundation Session');
  });

  test('nameKey lowercases and singularises', () => {
    expect(nameKey('Pilates Session With Yalin')).toBe(nameKey('Pilates session with Yalin'));
    expect(nameKey('Wednesdays')).toBe('wednesday');
  });

  test('isCancelled matches both spellings', () => {
    expect(isCancelled('CANCELED Penang Crew')).toBe(true);
    expect(isCancelled('[CANCELLED] Pango Gym - Sunday')).toBe(true);
    expect(isCancelled('Penang Crew')).toBe(false);
  });
});

describe('stand-in rules', () => {
  test('meetings never stand in', () => {
    const events = ['2026-01-03', '2026-01-10', '2026-01-17', '2026-01-31']
      .map(d => ev('Dragon Boat Training', `${d}T09:30`, 'Docklands'))
      .concat(ev('AGM', '2026-01-24T09:30', 'Docklands', 'Meeting'));
    const groups = byLabel(groupEvents(events).groups);
    expect(names(groups['Other'].events)).toEqual(['AGM']);
    expect(groups['Dragon Boat Training'].standIns).toEqual([]);
  });

  test('a stand-in goes to the busiest matching slot', () => {
    const big = ['2026-01-03', '2026-01-10', '2026-01-17', '2026-01-31', '2026-02-07']
      .map(d => ev('Big Session', `${d}T09:30`, 'Dock'));
    const small = ['2026-01-03', '2026-01-10', '2026-01-31']
      .map(d => ev('Small Session', `${d}T08:45`, 'Dock'));
    const openDay = ev('Open Day', '2026-01-24T09:00', 'Dock', 'Social Event');
    const groups = byLabel(groupEvents([...small, ...big, openDay]).groups);
    expect(names(groups['Big Session'].standIns)).toEqual(['Open Day']);
    expect(groups['Small Session'].standIns).toEqual([]);
    expect(groups['Other']).toBeUndefined();
  });
});
