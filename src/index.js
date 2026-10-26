import css from './styles.css';
import { openOverlay } from './ui/overlay.js';

export function getTeamName(doc = document) {
  const option = doc.querySelector('#layout_team_id option:checked');
  return (option && option.textContent.trim()) || 'TeamLinkt';
}

export function main(win = window) {
  if (win.location.hostname !== 'app.teamlinkt.com' || !win.team_id) {
    win.alert('Open TeamLinkt and pick a team first.');
    return;
  }
  const doc = win.document;
  const existingStyle = doc.getElementById('tlrsvp-style');
  if (existingStyle) existingStyle.remove();
  doc.head.append(Object.assign(doc.createElement('style'), { id: 'tlrsvp-style', textContent: css }));
  openOverlay({ teamId: String(win.team_id), teamName: getTeamName(doc) });
}

if (typeof jest === 'undefined') main();
