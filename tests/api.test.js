import {
  TeamLinktError, parseEventDate, parseEventRow, parseAvailabilityRows, fetchPastEvents, fetchAvailability,
} from '../src/api.js';
import { eventRow, noonRow, midnightRow, availabilityRows, weirdStatusRow } from './fixtures/cells.js';

const respond = text => jest.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(text) });

describe('cell parsing', () => {
  test('parses an event row', () => {
    expect(parseEventRow(eventRow)).toEqual({
      id: '13930893', start: '2026-10-27T18:00', name: 'Dragon Boat Training', type: 'Training', location: 'Docklands',
    });
  });

  test('parses 12 pm and 12 am correctly', () => {
    expect(parseEventRow(noonRow).start).toBe('2026-10-31T12:00');
    expect(parseEventRow(midnightRow).start).toBe('2026-10-31T00:30');
  });

  test('an event with a TBD time starts at midnight', () => {
    expect(parseEventDate('Sun January 29 2023, TBD')).toBe('2023-01-29T00:00');
  });

  test('rejects unparseable dates', () => {
    expect(() => parseEventDate('garbage')).toThrow(expect.objectContaining({ kind: 'parse', endpoint: 'getEvents' }));
  });

  test('parses availability rows, skipping headers and reading dropdowns', () => {
    const rows = parseAvailabilityRows(availabilityRows);
    expect(rows.map(r => r.id)).toEqual(['101', '102', '103', '104', '105']);
    expect(rows.map(r => r.status)).toEqual(['G', 'G', 'M', 'N', 'R']);
    expect(rows[0].name).toBe('Alex Smith 💉💉');
    expect(rows[1].name).toBe('Sam Lee');
  });

  test('a dropdown with no selected option reads as its first option', () => {
    const row = { ...availabilityRows[2], 3: availabilityRows[2][3].replace(' selected', '') };
    expect(parseAvailabilityRows([row])[0].status).toBe('R');
  });

  test('unknown status class is a parse error', () => {
    expect(() => parseAvailabilityRows([weirdStatusRow]))
      .toThrow(expect.objectContaining({ kind: 'parse', endpoint: 'getEventAvailability' }));
  });
});

describe('fetching', () => {
  afterEach(() => { delete global.fetch; });

  test('fetchPastEvents posts the past-events query and parses rows', async () => {
    global.fetch = respond(JSON.stringify({ data: [eventRow] }));
    const { events, skipped } = await fetchPastEvents('52263');
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe('13930893');
    expect(skipped).toBe(0);

    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toBe('/schedules/getEvents');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('same-origin');
    expect(init.headers['X-Requested-With']).toBe('XMLHttpRequest');
    expect(init.body).toBeInstanceOf(URLSearchParams);
    expect(init.body.get('team_id')).toBe('52263');
    expect(init.body.get('status')).toBe('past');
    expect(init.body.get('length')).toBe('2000');
  });

  test('fetchPastEvents skips rows it cannot read instead of failing', async () => {
    const allDay = { ...eventRow, 0: '<a href="#">Sat June 5 2021, All Day</a>' };
    const noLink = { ...eventRow, 6: '' };
    global.fetch = respond(JSON.stringify({ data: [eventRow, allDay, noLink] }));
    const { events, skipped } = await fetchPastEvents('52263');
    expect(events.map(e => e.id)).toEqual(['13930893']);
    expect(skipped).toBe(2);
  });

  test('fetchAvailability posts the event id', async () => {
    global.fetch = respond(JSON.stringify({ data: availabilityRows }));
    expect(await fetchAvailability('52263', '13930893')).toHaveLength(5);
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toBe('/events/getEventAvailability');
    expect(init.body.get('event_id')).toBe('13930893');
    expect(init.body.get('length')).toBe('500');
  });

  test('a non-JSON response means the session expired', async () => {
    global.fetch = respond('<html>login</html>');
    await expect(fetchAvailability('52263', '1')).rejects.toMatchObject({ kind: 'session', endpoint: 'getEventAvailability' });
  });

  test('a rejected fetch is a network error', async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(fetchAvailability('52263', '1')).rejects.toMatchObject({ kind: 'network' });
  });

  test('a non-OK response is a network error', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, text: () => Promise.resolve('') });
    const error = await fetchPastEvents('52263').catch(e => e);
    expect(error).toBeInstanceOf(TeamLinktError);
    expect(error).toMatchObject({ kind: 'network', endpoint: 'getEvents' });
  });
});
