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

  test('alerts when there is no team_id and no team picker', () => {
    const win = fakeWindow('app.teamlinkt.com', undefined);
    main(win);
    expect(win.alert).toHaveBeenCalledWith('Open TeamLinkt and pick a team first.');
  });

  test('reads the team from the team picker on pages without team_id (e.g. Home)', () => {
    global.fetch = jest.fn(() => new Promise(() => {}));
    document.body.innerHTML =
      '<select id="layout_team_id"><option value="111">Other</option><option value="52263" selected>Sea Dragons</option></select>';
    const win = fakeWindow('app.teamlinkt.com', undefined);
    main(win);
    expect(win.alert).not.toHaveBeenCalled();
    expect(document.querySelector('#tlrsvp-overlay h2').textContent).toBe('RSVP Stats · Sea Dragons');
    expect(global.fetch.mock.calls[0][1].body.get('team_id')).toBe('52263');
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
