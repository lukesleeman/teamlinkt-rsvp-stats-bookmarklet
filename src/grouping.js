// Groups TeamLinkt events into "kinds" by cleaned name, then splits a name into
// weekday + time slots when it runs at several regular times. Leftover one-off
// events either join a regular group (same kind, or standing in for a session
// that didn't run that day) or land in "Other".
import { levenshteinDistance } from './levenshtein.js';

export const CONFIG = {
  nameSimilarity: 0.9,    // fuzzy-merge cleaned names at or above this similarity
  slotToleranceMins: 60,  // start times within this of a slot's anchor join that slot
  minSlotEvents: 3,       // a weekday/time slot needs this many events to stand alone
  minGroupEvents: 3,      // a name needs this many events, otherwise it's a one-off
};

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function isCancelled(name) {
  return /\bcancel+ed\b/i.test(name);
}

export function cleanName(name) {
  return name
    .replace(/\[?\bcancel+ed\b\]?/gi, '')
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '')
    .split(/:| - /)[0]
    .replace(/\.{2,}$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function nameKey(cleaned) {
  return cleaned
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .map(w => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w))
    .join(' ');
}

function similarity(a, b) {
  const max = Math.max(a.length, b.length);
  return max === 0 ? 1 : (max - levenshteinDistance(a, b)) / max;
}

function parseStart(start) {
  const [y, mo, d, h, mi] = start.match(/\d+/g).map(Number);
  return { weekday: new Date(Date.UTC(y, mo - 1, d)).getUTCDay(), minutes: h * 60 + mi };
}

function formatTime(minutes) {
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')}${h < 12 ? 'am' : 'pm'}`;
}

function mostCommon(values) {
  const counts = new Map();
  values.forEach(v => counts.set(v, (counts.get(v) || 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

const day = ev => ev.start.slice(0, 10);

// Cluster events by fuzzy-matched name key. Returns [{ label, events }].
function clusterByName(events) {
  const clusters = [];
  events.forEach(ev => {
    const cleaned = cleanName(ev.name);
    const key = nameKey(cleaned);
    let cluster = clusters.find(c => c.keys.some(k => similarity(k, key) >= CONFIG.nameSimilarity));
    if (!cluster) {
      cluster = { keys: [], events: [], cleanedNames: [] };
      clusters.push(cluster);
    }
    if (!cluster.keys.includes(key)) cluster.keys.push(key);
    cluster.events.push(ev);
    cluster.cleanedNames.push(cleaned);
  });
  return clusters.map(c => ({ label: mostCommon(c.cleanedNames), events: c.events }));
}

// Split one name cluster into weekday/time slots.
function splitIntoSlots(events) {
  const byDay = new Map();
  events.forEach(ev => {
    const { weekday, minutes } = parseStart(ev.start);
    if (!byDay.has(weekday)) byDay.set(weekday, []);
    byDay.get(weekday).push({ ev, minutes });
  });

  const slots = [];
  [...byDay.entries()].sort((a, b) => a[0] - b[0]).forEach(([weekday, items]) => {
    // Anchor slots on the most common start times first, so drift attaches to the usual time.
    const remaining = [...items];
    while (remaining.length) {
      const anchor = mostCommon(remaining.map(i => i.minutes));
      const members = remaining.filter(i => Math.abs(i.minutes - anchor) <= CONFIG.slotToleranceMins);
      members.forEach(m => remaining.splice(remaining.indexOf(m), 1));
      slots.push({ weekday, minutes: anchor, events: members.map(m => m.ev) });
    }
  });
  return slots;
}

function lastWord(name) {
  const words = nameKey(cleanName(name)).replace(/\b\d+\b/g, '').trim().split(' ');
  return words[words.length - 1];
}

// A one-off joins a group whose name ends in the same word ("Dragon Boat Camp 1" -> "Training Camp"),
// as long as only one group name ends in that word.
function findSameKindHost(ev, groups) {
  const word = lastWord(ev.name);
  const matches = groups.filter(g => lastWord(g.baseLabel) === word);
  if (new Set(matches.map(g => g.baseLabel)).size !== 1) return null;
  // When the name is split into weekday/time slots, pick the slot this event fits.
  return matches.length === 1 ? matches[0] : findStandInHost(ev, matches);
}

// A one-off "stands in" for a regular group if it is at the same location, weekday and
// roughly the same time as that group's usual slot, on a date the group has no event.
function findStandInHost(ev, groups) {
  if (/meeting/i.test(ev.type)) return null;
  const { weekday, minutes } = parseStart(ev.start);
  const date = day(ev);
  const candidates = groups.map(g => {
    const usual = g.events.map(e => ({ ...parseStart(e.start), location: e.location }));
    const sameSlot = usual.filter(u => u.weekday === weekday && u.location === ev.location &&
      Math.abs(u.minutes - minutes) <= CONFIG.slotToleranceMins);
    const isRegularSlot = sameSlot.length >= CONFIG.minSlotEvents && sameSlot.length >= usual.length / 2;
    const ranThatDay = g.events.some(e => day(e) === date);
    const dates = g.events.map(day).sort();
    const withinRun = date >= dates[0] && date <= dates[dates.length - 1];
    return isRegularSlot && !ranThatDay && withinRun ? { g, slotSize: sameSlot.length } : null;
  }).filter(Boolean);
  // Several sessions may fit; the most established one (most events in that slot) wins.
  candidates.sort((a, b) => b.slotSize - a.slotSize);
  return candidates.length ? candidates[0].g : null;
}

export function groupEvents(allEvents) {
  const events = allEvents.filter(ev => !isCancelled(ev.name));
  const groups = [];
  const oneOffs = [];
  const addGroup = (label, baseLabel, groupEvents) =>
    groups.push({ label, baseLabel, events: groupEvents, standIns: [] });

  clusterByName(events).forEach(cluster => {
    if (cluster.events.length < CONFIG.minGroupEvents) {
      oneOffs.push(...cluster.events);
      return;
    }
    const slots = splitIntoSlots(cluster.events);
    const big = slots.filter(s => s.events.length >= CONFIG.minSlotEvents);

    if (big.length <= 1) {
      addGroup(cluster.label, cluster.label, cluster.events);
      return;
    }
    big.forEach(s => addGroup(`${cluster.label} – ${DAYS[s.weekday]} ${formatTime(s.minutes)}`, cluster.label, s.events));
    const leftovers = slots.filter(s => s.events.length < CONFIG.minSlotEvents).flatMap(s => s.events);
    if (leftovers.length >= CONFIG.minGroupEvents) {
      addGroup(`${cluster.label} – other times`, cluster.label, leftovers);
    } else {
      oneOffs.push(...leftovers);
    }
  });

  const other = oneOffs.filter(ev => {
    const host = findSameKindHost(ev, groups) || findStandInHost(ev, groups);
    if (!host) return true;
    host.events.push(ev);
    host.standIns.push(ev);
    return false;
  });

  if (other.length) addGroup('Other', null, other);
  return { groups, cancelled: allEvents.length - events.length };
}
