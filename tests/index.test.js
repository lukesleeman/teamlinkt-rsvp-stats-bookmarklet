import { main, getTeamName } from '../src/index.js';

function fakeWindow(hostname, teamId) {
  return { location: { hostname }, team_id: teamId, document, alert: jest.fn() };
}

describe('entry point', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    delete global.fetch;
  });

  test('alerts when not on app.teamlinkt.com', () => {
    const win = fakeWindow('example.com', 52263);
    main(win);
    expect(win.alert).toHaveBeenCalledWith('Open TeamLinkt and pick a team first.');
  });

  test('alerts when team_id is missing', () => {
    const win = fakeWindow('app.teamlinkt.com', undefined);
    main(win);
    expect(win.alert).toHaveBeenCalledWith('Open TeamLinkt and pick a team first.');
  });

  test('injects styles once and opens one overlay, even when run twice', () => {
    global.fetch = jest.fn(() => new Promise(() => {}));
    const win = fakeWindow('app.teamlinkt.com', 52263);
    main(win);
    main(win);
    const styles = document.querySelectorAll('style#tlrsvp-style');
    expect(styles).toHaveLength(1);
    expect(styles[0].textContent).toContain('.tlrsvp-overlay{');
    expect(document.querySelectorAll('#tlrsvp-overlay')).toHaveLength(1);
    expect(win.alert).not.toHaveBeenCalled();
  });

  test('getTeamName reads the selected team option', () => {
    document.body.innerHTML =
      '<select id="layout_team_id"><option>Other</option><option selected>Sea Dragons</option></select>';
    expect(getTeamName(document)).toBe('Sea Dragons');

    document.body.innerHTML = '';
    expect(getTeamName(document)).toBe('TeamLinkt');
  });
});
