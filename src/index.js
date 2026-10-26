import './styles.css';

export function getTeamName(doc = document) {
  const option = doc.querySelector('#layout_team_id option:checked');
  return (option && option.textContent.trim()) || 'TeamLinkt';
}

export function main(win = window) {
  if (win.location.hostname !== 'app.teamlinkt.com' || !win.team_id) {
    win.alert('Open TeamLinkt and pick a team first.');
    return;
  }

  const existing = win.document.getElementById('tlrsvp-overlay');
  if (existing) existing.remove();
  // overlay opened in Task 7
}

if (typeof jest === 'undefined') main();
