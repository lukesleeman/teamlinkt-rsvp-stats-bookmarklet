// The overlay shell: header with range controls, tabs, banners, and the loading state.
import { syncTeam } from '../loader.js';
import { clear } from '../store.js';
import { groupEvents } from '../grouping.js';
import { filterGroups, rawRows, RAW_HEADERS, toCSV } from '../stats.js';
import { presetRange, addMonths, isoDate } from '../dates.js';
import { downloadFile } from './copy.js';
import { el } from './dom.js';
import { renderByEventType } from './byEventType.js';
import { renderByMember } from './byMember.js';

const unreadableText = endpoint => `Couldn't read RSVPs from TeamLinkt (${endpoint}). The bookmarklet may need updating.`;

function errorText(e) {
  if (e.kind === 'session') return 'Your TeamLinkt session has expired. Log in and try again.';
  if (e.kind === 'parse') return unreadableText(e.endpoint);
  return e.message;
}

export function openOverlay({ teamId, teamName, sync = syncTeam, now = new Date() }) {
  const existing = document.getElementById('tlrsvp-overlay');
  if (existing) existing.remove();

  const today = isoDate(now);
  let range = presetRange(12, today);
  let tab = 0;
  let result = null;
  let groups = null;
  let runs = 0;

  const button = (className, textContent, onclick) => el('button', { className, textContent, onclick });
  const dateInput = className => el('input', { type: 'date', className, min: addMonths(today, -12), max: today });
  const from = dateInput('tlrsvp-from');
  const to = dateInput('tlrsvp-to');
  const body = el('div', { className: 'tlrsvp-body' });
  const banners = el('div', { className: 'tlrsvp-banners' });
  const banner = text => banners.append(el('div', { className: 'tlrsvp-banner', textContent: text }));

  const presets = [3, 6, 12].map(n => button('tlrsvp-preset', `${n} months`, e => setPreset(presetRange(n, today), e.target)));
  const tabs = ['By event type', 'By member'].map((label, i) => button('tlrsvp-tab', label, () => { tab = i; render(); }));

  function setRange(next, activePreset) {
    range = next;
    presets.forEach(p => p.classList.toggle('tlrsvp-active', p === activePreset));
    render();
  }

  function setPreset(next, button) {
    from.value = next.from;
    to.value = next.to;
    setRange(next, button);
  }

  // Chrome fires change while a date is half typed (year 0002...), so never write back into the
  // inputs here: swap and clamp only the range that gets applied.
  from.onchange = to.onchange = () => {
    if (!from.value || !to.value) return;
    const clamp = d => (d < from.min ? from.min : d > from.max ? from.max : d);
    const [a, b] = [from.value, to.value].sort().map(clamp);
    setRange({ from: a, to: b });
  };

  function render() {
    tabs.forEach((t, i) => t.classList.toggle('tlrsvp-active', i === tab));
    if (!groups) return;
    const filtered = filterGroups(groups, range);
    if (!filtered.length) return body.replaceChildren('No events in this range.');
    (tab ? renderByMember : renderByEventType)(body, { groups: filtered, data: result.data, range });
  }

  function exportCsv() {
    if (!groups) return;
    const rows = rawRows(filterGroups(groups, range), result.data);
    downloadFile(`${teamName} RSVPs ${range.from} to ${range.to}.csv`, toCSV(RAW_HEADERS, rows));
  }

  function start() {
    const run = ++runs;
    groups = null;
    banners.replaceChildren();
    const status = el('p', { textContent: 'Loading your data…' });
    const progress = el('progress', { className: 'tlrsvp-progress' });
    body.replaceChildren(status, progress);

    const onProgress = (done, total) => {
      status.textContent = `Loading your data… ${done} / ${total} events`;
      progress.max = total || 1;
      progress.value = done;
    };
    sync(teamId, { onProgress }).then(r => {
      if (run !== runs) return;
      result = r;
      groups = groupEvents(r.events).groups;
      if (r.failed) banner(`${r.failed} events couldn't be loaded and will be retried next time.`);
      if (r.saveFailed) banner("Couldn't save data, so the next run will be slow.");
      Object.keys(r.unreadable || {}).forEach(endpoint => banner(unreadableText(endpoint)));
      render();
    }, e => {
      if (run !== runs) return;
      body.replaceChildren();
      banner(errorText(e));
    });
  }

  const overlay = el('div', { id: 'tlrsvp-overlay', className: 'tlrsvp-overlay' },
    el('div', { className: 'tlrsvp-modal' },
      el('div', { className: 'tlrsvp-header' },
        el('h2', { textContent: `RSVP Stats · ${teamName}` }),
        ...presets, from, '–', to,
        button('tlrsvp-export', '⬇ Export CSV', exportCsv),
        button('tlrsvp-reload', '⟳ Reload', () => { clear(teamId); start(); }),
        button('tlrsvp-close', '✕', () => overlay.remove())),
      el('div', { className: 'tlrsvp-tabs' }, ...tabs),
      banners,
      body));
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };

  document.body.append(overlay);
  setPreset(range, presets[2]);
  start();
  return overlay;
}
