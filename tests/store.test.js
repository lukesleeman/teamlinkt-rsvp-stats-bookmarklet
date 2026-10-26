import { storageKey, emptyStore, load, save, clear, prune } from '../src/store.js';

describe('store', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    localStorage.clear();
  });

  test('round-trips data under a versioned per-team key', () => {
    const data = { version: 1, members: { m1: 'Amy' }, rsvps: { e1: { start: '2026-10-20T18:00', statuses: { m1: 'G' } } } };
    expect(storageKey('52263')).toBe('tl-rsvp:v1:52263');
    expect(save('52263', data)).toBe(true);
    expect(JSON.parse(localStorage.getItem('tl-rsvp:v1:52263'))).toEqual(data);
    expect(load('52263')).toEqual(data);
  });

  test('missing, corrupt or old-version data loads as empty', () => {
    expect(load('1')).toEqual(emptyStore());
    localStorage.setItem(storageKey('2'), 'not json');
    expect(load('2')).toEqual(emptyStore());
    localStorage.setItem(storageKey('3'), '{"version":0}');
    expect(load('3')).toEqual(emptyStore());
  });

  test('prune drops RSVPs older than the cutoff', () => {
    const data = emptyStore();
    data.rsvps.old = { start: '2025-09-25T18:00', statuses: {} };
    data.rsvps.keep = { start: '2025-09-26T09:00', statuses: {} };
    expect(prune(data, '2025-09-26')).toBe(data);
    expect(Object.keys(data.rsvps)).toEqual(['keep']);
  });

  test('storage failures are reported, not thrown', () => {
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceeded'); });
    expect(save('52263', emptyStore())).toBe(false);
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('SecurityError'); });
    expect(load('52263')).toEqual(emptyStore());
  });

  test('clear removes the team key', () => {
    save('52263', emptyStore());
    clear('52263');
    expect(localStorage.getItem(storageKey('52263'))).toBeNull();
  });
});
