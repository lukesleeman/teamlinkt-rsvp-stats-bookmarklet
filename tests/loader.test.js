import { syncTeam } from '../src/loader.js';
import { TeamLinktError } from '../src/api.js';

const now = new Date(2026, 9, 26, 12, 0);
const ev = (id, start, name = 'Training') => ({ id, start, name, type: 'Training', location: 'Docklands' });
const EVENTS = [
  ev('e1', '2026-10-20T18:00'),
  ev('e2', '2026-10-21T18:00', 'CANCELED Training'),
  ev('e3', '2026-10-27T18:00'),
  ev('e4', '2025-09-01T09:00'),
  ev('e5', '2026-10-22T18:00'),
];
const ROWS = [{ id: '101', name: 'Alex Smith', status: 'G' }, { id: '102', name: 'Sam Lee', status: 'R' }];

function fakeApi(events = EVENTS, availability = () => Promise.resolve(ROWS)) {
  return {
    fetchPastEvents: jest.fn().mockResolvedValue(events),
    fetchAvailability: jest.fn((teamId, eventId) => availability(eventId)),
  };
}

const sync = (api, extra = {}) => syncTeam('52263', { now, api, retryDelayMs: 0, ...extra });

describe('syncTeam', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    localStorage.clear();
  });

  test('fetches RSVPs only for past, uncancelled events in the last 12 months', async () => {
    const api = fakeApi();
    const result = await sync(api);
    expect(api.fetchAvailability.mock.calls.map(c => c[1]).sort()).toEqual(['e1', 'e5']);
    expect(result.events.map(e => e.id).sort()).toEqual(['e1', 'e5']);
    expect(result.data.rsvps.e1).toEqual({ start: '2026-10-20T18:00', statuses: { 101: 'G', 102: 'R' } });
    expect(result.data.members).toEqual({ 101: 'Alex Smith', 102: 'Sam Lee' });
    expect(result).toMatchObject({ failed: 0, saveFailed: false });
  });

  test('second run reuses the cache', async () => {
    await sync(fakeApi());
    const api = fakeApi();
    const onProgress = jest.fn();
    const result = await sync(api, { onProgress });
    expect(api.fetchAvailability).not.toHaveBeenCalled();
    expect(onProgress.mock.calls[0]).toEqual([0, 0]);
    expect(Object.keys(result.data.rsvps).sort()).toEqual(['e1', 'e5']);
  });

  test('reports progress after each event', async () => {
    const onProgress = jest.fn();
    await sync(fakeApi(), { onProgress });
    expect(onProgress.mock.calls).toEqual([[0, 2], [1, 2], [2, 2]]);
  });

  test('retries network errors then counts the event as failed', async () => {
    const api = fakeApi(EVENTS, id =>
      id === 'e5' ? Promise.reject(new TeamLinktError('network', 'getEventAvailability')) : Promise.resolve(ROWS));
    const result = await sync(api);
    expect(api.fetchAvailability.mock.calls.filter(c => c[1] === 'e5')).toHaveLength(3);
    expect(result.failed).toBe(1);
    expect(result.data.rsvps.e5).toBeUndefined();
    expect(result.data.rsvps.e1).toBeDefined();
  });

  test('session error aborts the sync', async () => {
    const api = fakeApi(EVENTS, () => Promise.reject(new TeamLinktError('session', 'getEventAvailability')));
    await expect(sync(api)).rejects.toMatchObject({ kind: 'session' });
  });

  test('keeps working in memory when saving fails', async () => {
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceeded'); });
    const result = await sync(fakeApi());
    expect(result.saveFailed).toBe(true);
    expect(Object.keys(result.data.rsvps).sort()).toEqual(['e1', 'e5']);
  });

  test('never runs more than the concurrency limit at once', async () => {
    const events = Array.from({ length: 10 }, (_, i) => ev(`p${i}`, `2026-10-${String(i + 10).padStart(2, '0')}T18:00`));
    let inFlight = 0;
    let highest = 0;
    const api = fakeApi(events, () => {
      inFlight++;
      highest = Math.max(highest, inFlight);
      return new Promise(resolve => setTimeout(() => { inFlight--; resolve(ROWS); }, 1));
    });
    const result = await sync(api);
    expect(highest).toBe(6);
    expect(Object.keys(result.data.rsvps)).toHaveLength(10);
  });

  test('prunes stored RSVPs older than 13 months', async () => {
    localStorage.setItem('tl-rsvp:v1:52263', JSON.stringify({
      version: 1, members: {}, rsvps: { ancient: { start: '2025-09-01T09:00', statuses: {} } },
    }));
    const result = await sync(fakeApi());
    expect(result.data.rsvps.ancient).toBeUndefined();
  });
});
