// Per-team localStorage cache of past-event RSVPs. Bump the version in the key to drop
// data saved in an older format.
const VERSION = 1;

export const storageKey = teamId => `tl-rsvp:v${VERSION}:${teamId}`;

export const emptyStore = () => ({ version: VERSION, members: {}, rsvps: {} });

export function load(teamId) {
  try {
    const data = JSON.parse(localStorage.getItem(storageKey(teamId)));
    if (data && data.version === VERSION && data.members && data.rsvps) return data;
  } catch (e) {
    // Corrupt or blocked storage: start fresh.
  }
  return emptyStore();
}

export function save(teamId, data) {
  try {
    localStorage.setItem(storageKey(teamId), JSON.stringify(data));
    return true;
  } catch (e) {
    return false;
  }
}

export function clear(teamId) {
  try {
    localStorage.removeItem(storageKey(teamId));
  } catch (e) {
    // Nothing to clear.
  }
}

export function prune(data, cutoff) {
  Object.keys(data.rsvps).forEach(id => {
    if (data.rsvps[id].start.slice(0, 10) < cutoff) delete data.rsvps[id];
  });
  return data;
}
