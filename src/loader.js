// Brings the local cache up to date: fetches the past event list, then RSVPs for any event in
// the last 12 months that isn't cached yet. Past events never change, so cached ones are final.
import * as teamlinkt from './api.js';
import { isCancelled } from './grouping.js';
import { isoDate, isoMinute, addMonths } from './dates.js';
import { load, save, prune } from './store.js';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function withRetries(fn, retries, delayMs) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (e.kind !== 'network' || attempt >= retries) throw e;
      await wait(delayMs);
    }
  }
}

export async function syncTeam(teamId, {
  now = new Date(), onProgress = () => {}, api = teamlinkt, concurrency = 6, retries = 2, retryDelayMs = 1000,
} = {}) {
  const data = load(teamId);
  const today = isoDate(now);
  const nowMinute = isoMinute(now);
  const earliest = addMonths(today, -12);

  const events = (await api.fetchPastEvents(teamId)).filter(e =>
    !isCancelled(e.name) && e.start < nowMinute && e.start.slice(0, 10) >= earliest);
  const todo = events.filter(e => !data.rsvps[e.id]);

  let saveFailed = false;
  let failed = 0;
  let done = 0;
  let next = 0;
  let aborted = null;
  const persist = () => { if (!save(teamId, data)) saveFailed = true; };

  onProgress(0, todo.length);

  async function worker() {
    while (!aborted && next < todo.length) {
      const event = todo[next++];
      try {
        const rows = await withRetries(() => api.fetchAvailability(teamId, event.id), retries, retryDelayMs);
        if (aborted) return;
        const statuses = {};
        rows.forEach(r => { data.members[r.id] = r.name; statuses[r.id] = r.status; });
        data.rsvps[event.id] = { start: event.start, statuses };
        persist();
      } catch (e) {
        if (e.kind !== 'network') { aborted = e; return; }
        failed++;
      }
      onProgress(++done, todo.length);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, todo.length) }, worker));
  if (aborted) throw aborted;

  prune(data, addMonths(today, -13));
  persist();
  return { events, data, failed, saveFailed };
}
