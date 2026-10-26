import css from './styles.css';
import { openOverlay } from './ui/overlay.js';

export function getTeamName(doc = document) {
  const option = doc.querySelector('#layout_team_id option:checked');
  return (option && option.textContent.trim()) || 'TeamLinkt';
}

// The team switcher on every TeamLinkt page holds the selected team's id. Some pages (Roster,
// Schedules) also set a global team_id, but others (Home) don't.
export function getTeamId(win = window) {
  const picker = win.document.querySelector('#layout_team_id');
  return String((picker && picker.value) || win.team_id || '');
}

export function main(win = window) {
  const teamId = getTeamId(win);
  if (win.location.hostname !== 'app.teamlinkt.com' || !teamId) {
    win.alert('Open TeamLinkt and pick a team first.');
    return;
  }
  const doc = win.document;
  const existingStyle = doc.getElementById('tlrsvp-style');
  if (existingStyle) existingStyle.remove();
  doc.head.append(Object.assign(doc.createElement('style'), { id: 'tlrsvp-style', textContent: css }));
  openOverlay({ teamId, teamName: getTeamName(doc) });
}

if (typeof jest === 'undefined') main();
