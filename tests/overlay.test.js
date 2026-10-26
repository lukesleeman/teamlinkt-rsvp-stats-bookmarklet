import { openOverlay } from '../src/ui/overlay.js';
import { TeamLinktError } from '../src/api.js';
import { copyText, downloadFile } from '../src/ui/copy.js';

jest.mock('../src/ui/copy.js');

const now = new Date(2026, 9, 26);
const ev = (id, start, name) => ({ id, start, name, type: 'Training', location: 'Docklands' });
const EVENTS = [
  ev('t1', '2026-10-06T18:00', 'Dragon Boat Training'),
  ev('t2', '2026-10-13T18:00', 'Dragon Boat Training'),
  ev('t3', '2026-10-20T18:00', 'Dragon Boat Training'),
  ev('p1', '2026-10-10T12:00', '<b>Party</b> & Co'),
];
const going = ids => Object.fromEntries(ids.map(id => [id, 'G']));
const DATA = {
  version: 1,
  members: { m1: 'Amy', m2: 'Zed <i>Kim</i>' },
  rsvps: {
    t1: { start: '2026-10-06T18:00', statuses: going(['m1', 'm2']) },
    t2: { start: '2026-10-13T18:00', statuses: going(['m1', 'm2']) },
    t3: { start: '2026-10-20T18:00', statuses: going(['m1', 'm2']) },
    p1: { start: '2026-10-10T12:00', statuses: { m1: 'R', m2: 'G' } },
  },
};

function deferredSync() {
  const sync = jest.fn((teamId, { onProgress }) => new Promise((resolve, reject) => {
    sync.onProgress = onProgress;
    sync.resolve = resolve;
    sync.reject = reject;
  }));
  return sync;
}

async function openLoaded() {
  const sync = deferredSync();
  const root = openOverlay({ teamId: '52263', teamName: 'Sea Dragons', sync, now });
  sync.resolve({ events: EVENTS, data: DATA, failed: 0, saveFailed: false });
  await flush();
  return root;
}

const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];
const click = el => el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
const bodyText = () => $('.tlrsvp-body').textContent;
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe('overlay', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
  });

  test('shows loading progress then the event type tab', async () => {
    const sync = deferredSync();
    openOverlay({ teamId: '52263', teamName: 'Sea Dragons', sync, now });
    expect(sync).toHaveBeenCalledWith('52263', expect.any(Object));
    expect(bodyText()).toContain('Loading your data…');
    sync.onProgress(1, 3);
    expect(bodyText()).toContain('1 / 3 events');

    sync.resolve({ events: EVENTS, data: DATA, failed: 0, saveFailed: false });
    await flush();
    const groups = $$('button.tlrsvp-group');
    expect(groups.map(b => b.textContent)).toEqual(['Dragon Boat Training (3)', 'Other (1)']);
    expect($$('.tlrsvp-body table.tlrsvp-table tbody tr')).toHaveLength(2);
    expect(bodyText()).toContain('3 events · average 2 · highest 2 · lowest 2');
    expect($('.tlrsvp-header').textContent).toContain('RSVP Stats · Sea Dragons');
  });

  test('names render as text, not HTML', async () => {
    await openLoaded();
    click($$('button.tlrsvp-group')[1]);
    expect($('#tlrsvp-overlay b')).toBeNull();
    expect($('#tlrsvp-overlay i')).toBeNull();
    expect(bodyText()).toContain('Zed <i>Kim</i>');
  });

  test('copy puts TSV on the clipboard', async () => {
    copyText.mockResolvedValue(true);
    await openLoaded();
    click($('.tlrsvp-copy'));
    expect(copyText.mock.calls[0][0].startsWith('#\tMember\tSessions\t% of sessions\n1\t')).toBe(true);
    await flush();
    expect($('.tlrsvp-copy').textContent).toBe('Copied!');
  });

  test('by member tab sorts by a clicked column', async () => {
    await openLoaded();
    click($$('button.tlrsvp-tab')[1]);
    const headers = () => $$('.tlrsvp-body th');
    const firstCell = () => $('.tlrsvp-body tbody tr td').textContent;
    expect(headers().map(h => h.textContent)).toEqual(['Member', 'Dragon Boat Training', 'Other', 'Total']);
    click(headers()[0]);
    expect(firstCell()).toBe('Amy');
    click(headers()[3]);
    expect(firstCell()).toBe('Zed <i>Kim</i>');
  });

  test('clicking a member shows their monthly chart', async () => {
    await openLoaded();
    click($$('button.tlrsvp-tab')[1]);
    click($('.tlrsvp-body tbody tr'));
    expect($$('tr.tlrsvp-monthly svg')).toHaveLength(1);
    click($('.tlrsvp-body tbody tr'));
    expect($$('tr.tlrsvp-monthly')).toHaveLength(0);
  });

  test('custom range with no events shows a message', async () => {
    await openLoaded();
    expect($$('.tlrsvp-preset.tlrsvp-active').map(b => b.textContent)).toEqual(['12 months']);
    $('.tlrsvp-from').value = '2026-01-01';
    $('.tlrsvp-to').value = '2026-01-02';
    $('.tlrsvp-to').dispatchEvent(new Event('change'));
    expect(bodyText()).toBe('No events in this range.');
    expect($$('.tlrsvp-preset.tlrsvp-active')).toHaveLength(0);
  });

  test('presets fill the date inputs', async () => {
    await openLoaded();
    click($$('.tlrsvp-preset')[0]);
    expect($('.tlrsvp-from').value).toBe('2026-07-26');
    expect($('.tlrsvp-to').value).toBe('2026-10-26');
    expect($('.tlrsvp-from').min).toBe('2025-10-26');
  });

  test('export downloads CSV named after team and range', async () => {
    await openLoaded();
    click($('.tlrsvp-export'));
    expect(downloadFile).toHaveBeenCalledTimes(1);
    const [name, csv] = downloadFile.mock.calls[0];
    expect(name).toBe('Sea Dragons RSVPs 2025-10-26 to 2026-10-26.csv');
    expect(csv.startsWith('﻿event_id,date,')).toBe(true);
  });

  test('session error shows the expired banner', async () => {
    const sync = deferredSync();
    openOverlay({ teamId: '52263', teamName: 'Sea Dragons', sync, now });
    sync.reject(new TeamLinktError('session', 'getEvents'));
    await flush();
    expect($('.tlrsvp-banner').textContent).toBe('Your TeamLinkt session has expired. Log in and try again.');
  });

  test('failed events and save problems show banners', async () => {
    const sync = deferredSync();
    openOverlay({ teamId: '52263', teamName: 'Sea Dragons', sync, now });
    sync.resolve({ events: EVENTS, data: DATA, failed: 3, saveFailed: true });
    await flush();
    expect($$('.tlrsvp-banner').map(b => b.textContent)).toEqual([
      "3 events couldn't be loaded and will be retried next time.",
      "Couldn't save data, so the next run will be slow.",
    ]);
  });

  test('clicking the bookmarklet again replaces the overlay', () => {
    openOverlay({ teamId: '52263', teamName: 'Sea Dragons', sync: deferredSync(), now });
    openOverlay({ teamId: '52263', teamName: 'Sea Dragons', sync: deferredSync(), now });
    expect($$('#tlrsvp-overlay')).toHaveLength(1);
  });

  test('close button and backdrop close the overlay', () => {
    const root = openOverlay({ teamId: '52263', teamName: 'Sea Dragons', sync: deferredSync(), now });
    click($('.tlrsvp-modal'));
    expect($('#tlrsvp-overlay')).not.toBeNull();
    click(root);
    expect($('#tlrsvp-overlay')).toBeNull();
    openOverlay({ teamId: '52263', teamName: 'Sea Dragons', sync: deferredSync(), now });
    click($('.tlrsvp-close'));
    expect($('#tlrsvp-overlay')).toBeNull();
  });
});
