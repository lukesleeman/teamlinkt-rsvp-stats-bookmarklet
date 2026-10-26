# TeamLinkt RSVP Stats Bookmarklet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A bookmarklet that loads a TeamLinkt team's past RSVPs into localStorage, groups events into kinds automatically, and shows the stats by event type and by member. Each view has a Copy-to-Excel button, there's a chart over time, and a raw CSV export.

**Architecture:**
- **Data:** it calls TeamLinkt's own two DataTables JSON endpoints using the logged-in session. Parsing of their HTML cells is kept in one module (`api.js`). Past RSVPs are cached forever per team in localStorage.
- **Logic:** grouping and stats are pure functions over plain data.
- **UI:** an overlay built from DOM elements, with a hand-drawn SVG chart.
- **Build:** webpack bundles everything into one `javascript:` URL, which is written into README.md. This is the same pattern as the RevSport crew entry bookmarklet.

**Tech Stack:** webpack 5, Babel `@babel/preset-env`, Terser, css-loader and style-loader, Jest 29 with jsdom. No runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-10-26-teamlinkt-rsvp-stats-design.md`. Read it first. It holds the endpoint formats, the grouping algorithm and the UI layout. The reference grouping implementation is `docs/superpowers/specs/2026-10-26-grouping-prototype.js`.

## Global Constraints

- **Size:** the built bookmarklet, written as `'javascript:' + encodeURIComponent(code)`, must be **≤ 30 × 1024 characters**.
- **Dependencies:** no runtime dependencies or CDN loads. Everything is bundled.
- **Browser targets** (Babel and browserslist): `last 2 Chrome versions, last 2 Firefox versions, last 2 Safari versions`. No IE11.
- **Modules:** ES modules (`import`/`export`) everywhere in `src/`. Jest runs them through babel-jest.
- **CSS:** every class and id is prefixed `tlrsvp-`. The overlay root id is `tlrsvp-overlay`.
- **Host:** only runs on `location.hostname === 'app.teamlinkt.com'`, with `window.team_id` set.
- **Requests:** form-encoded `POST`, `credentials: 'same-origin'`, header `X-Requested-With: XMLHttpRequest`.
- **Storage key:** `tl-rsvp:v1:<teamId>`, holding the value `{ version: 1, members: { [id]: name }, rsvps: { [eventId]: { start, statuses: { [memberId]: 'G'|'M'|'N'|'R' } } } }`.
- **Attended** means status `G` (Going) or `M` (Maybe).
- **Scope:** past events only, in the last 12 months. Cancelled events (`/\bcancel+ed\b/i`) are left out. RSVP entries older than 13 months are deleted.
- **Fetching:** RSVPs are fetched 6 at a time, with 2 retries spaced 1000 ms apart for network errors.
- **Dates:** times are naive local strings `YYYY-MM-DDTHH:MM`. Never convert them through time zones. Ranges are `{ from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }`, inclusive at both ends.
- **Text:** user-facing strings are copied exactly from the spec's Error handling and UI sections.
- **No HTML injection:** event names and member names are set with `textContent`, or escaped when building SVG strings. Never insert them with `innerHTML`.

## Review Focus

1. **Names containing `&`, `<`, quotes or emoji** (e.g. `HK Movie 🦇 & Halloween 🎃 Potluck Party`) must show as literal text in tables, tooltips and the CSV, not as broken or injected HTML. Tests: Task 5 (chart escaping) and Task 7 (overlay renders `<b>` literally).
2. **12 am and 12 pm times** (`12:00 pm`, `12:30 am`) must parse to `12:00` and `00:30`. If they didn't, Saturday lunch socials would land in the wrong slot. Test: Task 4.
3. **Events whose RSVPs failed to load** (not in `data.rsvps`) must be left out of turnout, summaries and percentage denominators, not counted as zero turnout. Test: Task 3.
4. **Members missing from some events** (joined or left mid-range) count as not attending those events. They mustn't crash the member table or skew other people's percentages. Test: Task 3.
5. **A custom range with no events in it** must show "No events in this range." rather than an empty or broken page, and Copy and Export must still produce header-only output. Tests: Task 3 (empty stats) and Task 7 (overlay message).

---

## File Structure

```
package.json, webpack.config.js, .babelrc, jest.config.js, README.md, .gitignore
src/
  index.js            entry: host and team checks, opens the overlay
  dates.js            date string helpers (no time zones)
  grouping.js         groupEvents + helpers (port of the prototype)
  levenshtein.js      edit distance (copied from RevSport)
  stats.js            filtering, summaries, leaderboards, member table, monthly counts, raw rows, TSV/CSV
  api.js              TeamLinkt endpoint calls + HTML cell parsing, TeamLinktError
  store.js            localStorage persistence for the team cache
  loader.js           syncTeam: event list + missing RSVPs, concurrency, retries, progress
  ui/chart.js         lineChart → SVG string
  ui/copy.js          copyText, downloadFile
  ui/overlay.js       openOverlay: shell, header, range controls, tabs, banners, loading
  ui/byEventType.js   renderByEventType
  ui/byMember.js      renderByMember
  styles.css
tests/
  setup.js
  fixtures/events-12mo.json   279 past events (names, start times, types, locations)
  fixtures/cells.js           handwritten endpoint rows with fake names
  dates.test.js, grouping.test.js, stats.test.js, api.test.js, store.test.js, loader.test.js,
  ui.test.js, overlay.test.js, index.test.js, size.test.js
```

---

### Task 1: Project scaffold, build pipeline, size budget and entry guard

**Files:**
- Create: `package.json`, `webpack.config.js`, `.babelrc`, `jest.config.js`, `README.md`, `src/index.js`, `src/styles.css`, `tests/setup.js`, `tests/index.test.js`, `tests/size.test.js`
- Modify: `.gitignore` (already ignores `node_modules`, `dist` and `.DS_Store`; leave as is)

**Interfaces:**
- Produces:
  - `npm run build`, which writes `dist/bookmarklet.js` and updates the README between the markers.
  - `npm test`, which builds and then runs jest.
  - `main(win = window): void` exported from `src/index.js`. It does the checks and opens the UI. The module ends with `if (typeof jest === 'undefined') main();`, so the bundle runs it immediately and tests call it themselves.
  - `getTeamName(doc = document): string` exported from `src/index.js`. It returns the text of `#layout_team_id option:checked`, falling back to `'TeamLinkt'`.

- [ ] **Step 1: Create the config files**

`package.json`:
- name `teamlinkt-rsvp-stats-bookmarklet`, private, license MIT;
- scripts: `build: webpack --mode=production`, `dev: webpack --mode=development --watch`, `test: npm run build && jest`, `test:watch: jest --watch`;
- devDependencies: the same packages and major versions as RevSport (`@babel/core ^7`, `@babel/preset-env ^7`, `babel-jest ^29`, `babel-loader ^9`, `css-loader ^7`, `identity-obj-proxy ^3`, `jest ^29`, `jest-environment-jsdom ^29`, `style-loader ^4`, `terser-webpack-plugin ^5`, `webpack ^5`, `webpack-cli ^5`);
- `"browserslist": ["last 2 Chrome versions", "last 2 Firefox versions", "last 2 Safari versions"]`.

`.babelrc`: `{ "presets": ["@babel/preset-env"] }`. Targets come from browserslist.

`jest.config.js`: `testEnvironment: 'jsdom'`, `testMatch: ['**/tests/**/*.test.js']`, `setupFilesAfterEnv: ['<rootDir>/tests/setup.js']`, `moduleNameMapper: { '\\.css$': 'identity-obj-proxy' }`.

`webpack.config.js`:
- Copy RevSport's `BookmarkletPlugin` (`afterEmit`): read `dist/bookmarklet.js`, then replace the content between `<!-- BOOKMARKLET_CODE_START -->\n```\n` and `\n```\n<!-- BOOKMARKLET_CODE_END -->` with `javascript:${encodeURIComponent(js)}`.
- Differences from RevSport:
  - no `library` output;
  - `output.iife: true`;
  - TerserPlugin with `extractComments: false`, `terserOptions: { compress: { drop_console: true, drop_debugger: true, passes: 2 }, mangle: true, format: { comments: false } }`;
  - babel-loader with no inline presets, so it uses `.babelrc`.

`README.md` holds:
- a title and one-line description;
- Installation steps, as in RevSport, with the bookmark named "TeamLinkt RSVP Stats";
- the code block between the markers, holding a placeholder line `javascript:` for now;
- `## Usage`, `## Development` (`npm install`, `npm run build`, `npm test`) and `## License` (MIT, copied from RevSport with 2026).

`tests/setup.js`: `global.alert = jest.fn();`, as a guard in case code calls the real `alert`.

- [ ] **Step 2: Write the failing tests**

`tests/index.test.js`. Call `main` with a fake window, `{ location: { hostname }, team_id, document, alert: jest.fn() }`:
- `test('alerts when not on app.teamlinkt.com')`: hostname `example.com`, so the fake `alert` is called with `'Open TeamLinkt and pick a team first.'`.
- `test('alerts when team_id is missing')`: hostname `app.teamlinkt.com` and `team_id` undefined, so the same alert.
- `test('getTeamName reads the selected team option')`: the body contains `<select id="layout_team_id"><option>Other</option><option selected>Sea Dragons</option></select>`, so it returns `'Sea Dragons'`. With no select, it returns `'TeamLinkt'`.

`tests/size.test.js`:
- `test('bookmarklet fits the 30 KB budget')`: read `dist/bookmarklet.js` and assert `('javascript:' + encodeURIComponent(code)).length <= 30 * 1024`.
- `test('README contains the current bookmarklet')`: README.md includes `'javascript:' + encodeURIComponent(code)`.

- [ ] **Step 3: Run the tests and check that they fail**

Run: `npm install && npx jest tests/index.test.js`
Expected: FAIL (`src/index.js` doesn't exist).

- [ ] **Step 4: Implement `src/index.js`**

- `src/index.js` imports `./styles.css` and exports `main` and `getTeamName`.
- `main` checks `win.location.hostname` and `win.team_id`, calling `win.alert(...)` if either fails.
- If the checks pass, it removes any existing `#tlrsvp-overlay`. Later, Task 7 replaces this with `openOverlay({ teamId: String(win.team_id), teamName: getTeamName(win.document) })`. For now, leave a `// overlay opened in Task 7` stub that does nothing.
- `src/styles.css` starts with a single `.tlrsvp-overlay {}` rule.

- [ ] **Step 5: Run the tests and check that they pass**

Run: `npm test`
Expected: the build succeeds, prints `✅ README.md updated with current bookmarklet`, and all tests in `index.test.js` and `size.test.js` pass.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json webpack.config.js .babelrc jest.config.js README.md src tests
git commit -m "Scaffold bookmarklet build, size budget and entry guard"
```

---

### Task 2: Grouping algorithm (port of the prototype)

**Files:**
- Create: `src/levenshtein.js`, `src/grouping.js`, `tests/fixtures/events-12mo.json`, `tests/grouping.test.js`

**Interfaces:**
- Consumes: `Event = { id: string, start: 'YYYY-MM-DDTHH:MM', name: string, type: string, location: string }`
- Produces (from `src/grouping.js`):
  - `CONFIG = { nameSimilarity: 0.9, slotToleranceMins: 60, minSlotEvents: 3, minGroupEvents: 3 }`
  - `isCancelled(name: string): boolean`
  - `cleanName(name: string): string`
  - `nameKey(cleaned: string): string`
  - `groupEvents(events: Event[]): { groups: Group[], cancelled: number }`
  - `Group = { label: string, baseLabel: string | null, events: Event[], standIns: Event[] }`. The `Other` group has `label: 'Other'` and `baseLabel: null`. Every group has a `standIns` array, which may be empty.
- `src/levenshtein.js`: `levenshteinDistance(a: string, b: string): number`, as an ES module export.

- [ ] **Step 1: Create the fixture**

Run:
```bash
node -e "
const all = require('/private/tmp/claude-501/-Users-lukesleeman-Developer-teamlinkt-bookmarklet/2dfe6bd3-080e-4a63-8348-dfb9775ed121/scratchpad/proto/events.json');
const past = all.filter(e => e.start < '2026-10-26T00:00')
  .map((e, i) => ({ id: 'e' + (i + 1), ...e, name: e.name.replace('<the one personal name>', 'Alex J') }));
require('fs').writeFileSync('tests/fixtures/events-12mo.json', JSON.stringify(past, null, 1));
console.log(past.length);"
```
Expected: prints `279`. If the scratchpad file is gone, ask the user to re-export the data. Don't make up a substitute.

- [ ] **Step 2: Write the failing tests** in `tests/grouping.test.js`

- **`test('groups the Sea Dragons fixture as agreed')`:** run `groupEvents(fixture)` and assert `cancelled === 22`. Then map the groups to `{ label: events.length }` and assert they equal:
  ```js
  { 'Pango Gym – Wed 6:00pm': 48, 'Dragon Boat Training – Tue 6:00pm': 46,
    'Dragon Boat Training – Sat 9:30am': 45, 'Pango Gym – Sun 9:00am': 43,
    'Dragon Boat Training – Thu 6:00pm': 21, 'Foundation Class': 21,
    'Pilates session with Yalin': 9, 'Penang Crew': 9, 'Training Camp': 5, 'Other': 10 }
  ```
  The `–` is U+2013.
- **`test('records stand-ins on the right groups')`:**
  - The stand-in names of `Dragon Boat Training – Sat 9:30am`, sorted, are `['River Run', 'River Run And Dragon Boat Training', 'Open Day', 'Open day', '🎄Christmas Paddle🎄']`, sorted the same way.
  - `Foundation Class` has stand-ins `['Foundation Session']`.
  - `Training Camp` has stand-ins `['Dragon Boat Camp 1']`.
  - `Other`'s event names include `'AGM 2026/27'` and `'Team Lunch With Alex J'`.
- **`test('cleanName strips emoji, cancel markers and sub-names')`:**
  - `'🎄Christmas Paddle🎄'` → `'Christmas Paddle'`
  - `'[CANCELLED] Pango Gym - Sunday'` → `'Pango Gym'`
  - `'Dragon Boat Training: She-Dragons And Mongrels Bo...'` → `'Dragon Boat Training'`
  - `'Labour Day-foundation Session'` → `'Labour Day-foundation Session'` (a hyphen with no spaces isn't a sub-name)
- **`test('nameKey lowercases and singularises')`:** `nameKey('Pilates Session With Yalin') === nameKey('Pilates session with Yalin')`, and `nameKey('Wednesdays') === 'wednesday'`.
- **`test('isCancelled matches both spellings')`:** true for `'CANCELED Penang Crew'` and `'[CANCELLED] Pango Gym - Sunday'`; false for `'Penang Crew'`.
- **`test('meetings never stand in')`:** a handwritten list of 4 events, all `Dragon Boat Training` on Saturdays at 09:30 at `Docklands` (2026-01-03, -10, -17, -31), plus `{ name: 'AGM', type: 'Meeting', start: '2026-01-24T09:30', location: 'Docklands' }`. The AGM ends up in `Other`.
- **`test('a stand-in goes to the busiest matching slot')`:** handwritten events:
  - 5× `Big Session` on Saturdays at 09:30 at `Dock`;
  - 3× `Small Session` on Saturdays at 08:45 at `Dock`, on the same dates;
  - one `Open Day` at 09:00 at `Dock` on a Saturday with neither.

  `Open Day` is a stand-in on `Big Session`.

- [ ] **Step 3: Run the tests and check that they fail**

Run: `npx jest tests/grouping.test.js`
Expected: FAIL (module not found).

- [ ] **Step 4: Implement `src/levenshtein.js` and `src/grouping.js`**

Port `docs/superpowers/specs/2026-10-26-grouping-prototype.js` to ES modules, keeping the behaviour the same:
- `baseLabel` becomes `null` for `Other`.
- `standIns` is always set.
- Remove the `require.main` CLI block.
- Copy `levenshtein.js` from `/private/tmp/claude-501/-Users-lukesleeman-Developer-teamlinkt-bookmarklet/2dfe6bd3-080e-4a63-8348-dfb9775ed121/scratchpad/revsport-crew-entry-bookmarklet/src/matching/levenshtein.js` and convert it to `export function`. If that path is gone, write a standard dynamic-programming Levenshtein.

- [ ] **Step 5: Run the tests and check that they pass**

Run: `npx jest tests/grouping.test.js`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add src/levenshtein.js src/grouping.js tests/fixtures/events-12mo.json tests/grouping.test.js
git commit -m "Add automatic event grouping with Sea Dragons fixture"
```

---

### Task 3: Date helpers and stats

**Files:**
- Create: `src/dates.js`, `src/stats.js`, `tests/dates.test.js`, `tests/stats.test.js`

**Interfaces:**
- Consumes: `Group` from Task 2, and `Stored` (the storage shape in Global Constraints).
- Produces (from `src/dates.js`):
  - `isoDate(d: Date): 'YYYY-MM-DD'`, using local fields.
  - `isoMinute(d: Date): 'YYYY-MM-DDTHH:MM'`, using local fields.
  - `addMonths(day: 'YYYY-MM-DD', n: number): 'YYYY-MM-DD'`. When the target month is shorter, the day is set to that month's last day.
  - `monthsBetween(from: 'YYYY-MM-DD', to: 'YYYY-MM-DD'): string[]`, returning `'YYYY-MM'` values with both ends included.
  - `formatDateLabel(start: string): string`, e.g. `'2026-08-01T09:30'` → `'Sat 1 Aug 2026'`.
  - `formatMonthLabel(month: 'YYYY-MM'): string`, e.g. `'2026-08'` → `'Aug 2026'`.
  - `presetRange(months: 3|6|12, today: 'YYYY-MM-DD'): { from, to }`, equal to `{ from: addMonths(today, -months), to: today }`.
- Produces (from `src/stats.js`). Every function takes `data: Stored`. An event counts only if `data.rsvps[event.id]` exists, so events whose RSVPs failed to load are ignored.
  - `attended(status): boolean` is true for `'G'` or `'M'`.
  - `filterGroups(groups: Group[], range): Group[]` keeps only events with `range.from <= start.slice(0,10) <= range.to`. It drops groups that end up empty, and sorts by event count, descending, with `Other` always last.
  - `loadedEvents(group, data): Event[]` returns the group's events that have RSVPs stored, in date order.
  - `groupSummary(group, data): { events, average, highest, lowest }`. It covers loaded events only. `average` is rounded to an integer. If there are no loaded events, all four are 0.
  - `turnout(group, data): { start, name, count }[]` is in date order. `count` is the number of attended statuses.
  - `leaderboard(group, data): { memberId, name, sessions, pct }[]`.
    - It lists members with at least one session.
    - `pct = Math.round(100 * sessions / loadedEvents.length)`.
    - It's sorted by sessions, descending, then by name, ascending.
    - `name` comes from `data.members[id]`, falling back to the id.
  - `memberTable(groups, data): { columns: string[], rows: { memberId, name, counts: number[], total }[] }`.
    - `columns` are the group labels in order.
    - Rows cover every member who has a status in any loaded event of these groups.
    - They're sorted by total, descending, then by name.
  - `memberMonthly(memberId, groups, data, range): { month, count }[]` covers every month in `monthsBetween(range.from, range.to)`, including months with a count of zero.
  - `rawRows(groups, data): string[][]`. Columns are in the order of `RAW_HEADERS`. It covers loaded events only, sorted by start, then by member name. Status words are `G` → `Going`, `M` → `Maybe`, `N` → `Not Going`, `R` → `No Response`.
  - `RAW_HEADERS = ['event_id','date','time','event','group','location','type','member_id','member','status']`
  - `toTSV(headers: string[], rows: (string|number)[][]): string` joins cells with `\t` and rows with `\n`. Any `\t`, `\r` or `\n` inside a value becomes a space.
  - `toCSV(headers, rows): string` starts with `'﻿'` and ends rows with `\r\n`. A value containing `,`, `"`, `\r` or `\n` is wrapped in `"…"`, with each `"` doubled.

- [ ] **Step 1: Write the failing tests**

`tests/dates.test.js`:
- `addMonths('2026-03-31', -1) === '2026-02-28'` and `addMonths('2026-10-26', -12) === '2025-10-26'`
- `monthsBetween('2026-07-15', '2026-09-01')` is `['2026-07','2026-08','2026-09']`
- `formatDateLabel('2026-08-01T09:30') === 'Sat 1 Aug 2026'`
- `formatMonthLabel('2026-08') === 'Aug 2026'`
- `presetRange(3, '2026-10-26')` is `{ from: '2026-07-26', to: '2026-10-26' }`

`tests/stats.test.js` uses a small handwritten world:
- Group `A` has events `a1` (2026-08-01), `a2` (2026-08-08), `a3` (2026-08-15) and `a4` (2026-09-05). `a3` has **no** RSVP entry.
- Group `Other` has `o1` (2026-08-02).
- `data.members = { m1: 'Zoe', m2: 'Amy', m3: 'Bob <b>' }`.
- Statuses:
  - `a1`: m1 G, m2 M, m3 N
  - `a2`: m1 G, m2 R
  - `a4`: m1 G, m2 G, m3 G (`m3` is missing from `a2`)
  - `o1`: m2 G

Tests:
- `test('filterGroups applies an inclusive range and keeps Other last')`: range `2026-08-08`..`2026-09-05` leaves `A` with `a2`, `a3`, `a4` and drops `Other`.
- `test('summary and turnout ignore events with no RSVPs')`: for `A` over the full range, `groupSummary` is `{ events: 3, average: 2, highest: 3, lowest: 1 }`, and `turnout` counts are `[2, 1, 3]`.
- `test('leaderboard counts Going and Maybe, with percentages of loaded events')`: `[{m1, 'Zoe', 3, 100}, {m2, 'Amy', 2, 67}, {m3, 'Bob <b>', 1, 33}]`.
- `test('memberTable treats missing statuses as not attended')`: columns `['A', 'Other']`. Rows in order: Amy `[2,1]` total 3, then Zoe `[3,0]` total 3, then Bob `[1,0]` total 1. Amy and Zoe tie on 3, so they're ordered by name.
- `test('memberMonthly fills empty months')`: m1 over `2026-07-01`..`2026-09-30` gives `[{ '2026-07', 0 }, { '2026-08', 2 }, { '2026-09', 1 }]`.
- `test('rawRows lists every stored status')`: 9 rows. The first row is `['a1','2026-08-01','<time>','<name>','A','<loc>','<type>','m2','Amy','Maybe']`, since rows within an event are sorted by member name.
- `test('empty range produces empty stats and header-only exports')`: `filterGroups` over `2027-01-01`..`2027-01-31` is `[]`. `memberTable([], data).rows` is `[]`. `toCSV(RAW_HEADERS, rawRows([], data))` is `'﻿' + RAW_HEADERS.join(',') + '\r\n'`.
- `test('toTSV replaces tabs and newlines')`: `toTSV(['a'], [['x\ty\nz']])` is `'a\nx y z'`.
- `test('toCSV quotes commas, quotes and newlines')`: `toCSV(['a','b'], [['1,2', 'say "hi"\nok']])` is `'﻿a,b\r\n"1,2","say ""hi""\nok"\r\n'`.

- [ ] **Step 2: Run the tests and check that they fail**

Run: `npx jest tests/dates.test.js tests/stats.test.js`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement `src/dates.js` and `src/stats.js`** as specified in Interfaces. Use no `Date` parsing on `start` strings. Slice them, or build Dates with `Date.UTC` and read them back with `getUTC*`, so the local time zone can't change weekdays.

- [ ] **Step 4: Run the tests and check that they pass**

Run: `npx jest tests/dates.test.js tests/stats.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/dates.js src/stats.js tests/dates.test.js tests/stats.test.js
git commit -m "Add date helpers and RSVP stats"
```

---

### Task 4: TeamLinkt API and HTML cell parsing

**Files:**
- Create: `src/api.js`, `tests/fixtures/cells.js`, `tests/api.test.js`

**Interfaces:**
- Produces (from `src/api.js`):
  - `class TeamLinktError extends Error { constructor(kind: 'session'|'parse'|'network', endpoint: string, message?: string) }`, with the properties `kind` and `endpoint`.
  - `parseEventDate(text: string): 'YYYY-MM-DDTHH:MM'`, e.g. `'Tue October 27 2026, 6:00 pm'` → `'2026-10-27T18:00'`. It throws `TeamLinktError('parse', 'getEvents')` if the text doesn't match.
  - `parseEventRow(row: object): Event`. It reads text from cells `"0"`–`"3"` (date, name, type, location) and the id from `/events/view/(\d+)/` in cell `"6"`. Names and types are trimmed, with whitespace collapsed.
  - `parseAvailabilityRows(rows: object[]): { id: string, name: string, status: 'G'|'M'|'N'|'R' }[]`.
    - Header rows (cell `"1"` contains `<h4>`) are skipped.
    - The id comes from `/players/view/(\d+)/` in cell `"1"`, and the name from that link's trimmed text.
    - The status comes from the `status_label_{going|maybe|not_going|default}` class in cell `"3"`. If cell `"3"` has a `<select>`, the selected option's value is used instead (`accepted|tentative|declined|needs_action`).
    - Anything else throws `TeamLinktError('parse', 'getEventAvailability')`.
  - `fetchPastEvents(teamId: string): Promise<Event[]>` sends `POST /schedules/getEvents` with `team_id, status: 'past', draw: 1, start: 0, length: 2000, 'order[0][column]': 0, 'order[0][dir]': 'desc'`.
  - `fetchAvailability(teamId: string, eventId: string): Promise<{id,name,status}[]>` sends `POST /events/getEventAvailability` with `team_id, event_id, draw: 1, start: 0, length: 500`.
  - Both fetchers throw:
    - `TeamLinktError('network', endpoint)` when `fetch` rejects or `!res.ok`;
    - `TeamLinktError('session', endpoint)` when the body isn't valid JSON or has no `data` array.
- Parse cell HTML with `new DOMParser().parseFromString(html, 'text/html')`, or a detached `<template>`. Never attach it to the page.

- [ ] **Step 1: Write the fixture cells** in `tests/fixtures/cells.js`. Use the shapes from the spec's "TeamLinkt data sources" section, with fake names:
  - `eventRow`:
    - `"0": '<a href="#">Tue October 27 2026, 6:00 pm</a> <i class="fa fa-redo popovers"></i>'`
    - `"1": 'Dragon Boat Training  '`
    - `"2": 'Training'`
    - `"3": 'Docklands'`
    - `"4": 'Team'`
    - `"5": '<span class="team_availability_count">26</span>'`
    - `"6": '<div id="actions"><a href="/events/view/13930893" class="green_link">View</a></div>'`
  - `noonRow`: the same with `"0"` set to `'Sat October 31 2026, 12:00 pm'`.
  - `midnightRow`: `"0"` set to `'Sat October 31 2026, 12:30 am'`.
  - `availabilityRows`, in this order:
    - a header row: `"1": '<h4><b>Going (2)</b></h4>'`, `"4": 'status_label_going_header'`
    - Alex Smith 💉💉 (id 101): `"1": '<a href="/players/view/101">Alex Smith 💉💉</a>'`, `"3": '<span class="status_label status_label_going">Going</span>'`
    - Sam Lee (id 102): `<select class="status_dd form-select status_label_going">` containing `<option value="needs_action">No Response</option><option value="accepted" selected>Going</option><option value="declined">Not Going</option><option value="tentative">Maybe</option>`
    - Jo Park (id 103): `status_label_maybe`
    - Kim Ng (id 104): `status_label_not_going`
    - Pat Roe (id 105): `status_label_default`

- [ ] **Step 2: Write the failing tests** in `tests/api.test.js`

- `parseEventRow(eventRow)` is `{ id: '13930893', start: '2026-10-27T18:00', name: 'Dragon Boat Training', type: 'Training', location: 'Docklands' }`.
- `parseEventDate` of the noon row's text is `'2026-10-31T12:00'`, and of the midnight row's text is `'2026-10-31T00:30'` (Review Focus 2).
- `parseEventDate('garbage')` throws an error with `kind: 'parse'`.
- `parseAvailabilityRows(availabilityRows)` is ids `['101','102','103','104','105']` with statuses `['G','G','M','N','R']`. The first row's name is `'Alex Smith 💉💉'`.
- An unknown status class (`status_label_weird`) throws `kind: 'parse'`.
- `fetchPastEvents` with `global.fetch` mocked to resolve `{ ok: true, text: () => '{"data":[<eventRow>]}' }`:
  - returns one event;
  - sends a body that is a `URLSearchParams` containing `status=past` and `length=2000`, with `credentials: 'same-origin'`.
- `fetchAvailability` where `text()` returns `'<html>login</html>'` rejects with `kind: 'session'`.
- `fetchAvailability` where `fetch` rejects rejects with `kind: 'network'`.

Read the body as text and `JSON.parse` it inside a try. Don't use `res.json()`, so that non-JSON bodies map to `session`.

- [ ] **Step 3: Run the tests and check that they fail**

Run: `npx jest tests/api.test.js`
Expected: FAIL (module not found).

- [ ] **Step 4: Implement `src/api.js`** as specified in Interfaces.

- [ ] **Step 5: Run the tests and check that they pass**

Run: `npx jest tests/api.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/api.js tests/fixtures/cells.js tests/api.test.js
git commit -m "Add TeamLinkt endpoint client and cell parsing"
```

---

### Task 5: Chart and clipboard/download helpers

**Files:**
- Create: `src/ui/chart.js`, `src/ui/copy.js`, `tests/ui.test.js`

**Interfaces:**
- Produces:
  - `lineChart(points: { label: string, y: number }[], width = 600, height = 160): string`. It returns an SVG string with a `viewBox`, `width="100%"`, the y-axis labels `0` and the maximum, one `<path>`, and one `<circle>` per point. Each circle contains `<title>${escape(label)}: ${y}</title>`. The maximum is at least 1. With 0 points it returns `''`.
  - `escapeXml(s: string): string` escapes `& < > " '`.
  - `copyText(text: string): Promise<boolean>`.
    1. Try `navigator.clipboard.writeText`.
    2. Otherwise use a hidden `textarea.tlrsvp-copybuf` with `document.execCommand('copy')`.
    3. If that also fails, leave the textarea's text selected and return `false`.
  - `downloadFile(filename: string, text: string, mime = 'text/csv;charset=utf-8'): void`. It uses `URL.createObjectURL(new Blob([text], { type: mime }))` and a temporary `<a download>` that it clicks and removes. The object URL is revoked after a `setTimeout` of 0.

- [ ] **Step 1: Write the failing tests** in `tests/ui.test.js`

- **Escaping (Review Focus 1):** `lineChart([{label:'HK Movie 🦇 & <Party>', y: 5}, {label:'b', y: 10}])`
  - contains `HK Movie 🦇 &amp; &lt;Party&gt;: 5` and `>10<`;
  - parsed with DOMParser as `image/svg+xml`, it has 2 `circle` elements and no `parsererror`.
- `lineChart([])` is `''`.
- `copyText` with `navigator.clipboard.writeText` mocked to resolve resolves `true` and receives the text.
- `copyText` with the clipboard mocked to reject and `document.execCommand` mocked to return `true` resolves `true`.
- `downloadFile` with `URL.createObjectURL` and `revokeObjectURL` mocked, and `HTMLAnchorElement.prototype.click` spied: the click is called once, the anchor's `download` is the filename, and the anchor is removed from the DOM afterwards.

- [ ] **Step 2: Run the tests and check that they fail**

Run: `npx jest tests/ui.test.js`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement `src/ui/chart.js` and `src/ui/copy.js`.** Keep the chart minimal, like the measured ~600-byte version: axis text, a path with `fill="none"`, circles, and no gridlines. Use `stroke`/`fill` `#2563eb`.

- [ ] **Step 4: Run the tests and check that they pass**

Run: `npx jest tests/ui.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/chart.js src/ui/copy.js tests/ui.test.js
git commit -m "Add SVG line chart and copy/download helpers"
```

---

### Task 6: Store and loader

**Files:**
- Create: `src/store.js`, `src/loader.js`, `tests/store.test.js`, `tests/loader.test.js`

**Interfaces:**
- Consumes:
  - `fetchPastEvents`, `fetchAvailability` and `TeamLinktError` from Task 4
  - `isCancelled` from Task 2
  - `isoDate`, `isoMinute` and `addMonths` from Task 3
- Produces (from `src/store.js`):
  - `storageKey(teamId): 'tl-rsvp:v1:' + teamId`
  - `emptyStore(): { version: 1, members: {}, rsvps: {} }`
  - `load(teamId): Stored` returns `emptyStore()` if the key is missing, holds invalid JSON, has the wrong `version`, or `localStorage` throws.
  - `save(teamId, data): boolean` returns `false` if `localStorage` throws.
  - `clear(teamId): void` swallows errors.
  - `prune(data, cutoff: 'YYYY-MM-DD'): Stored` mutates `data`, deleting `rsvps` entries whose `start.slice(0,10) < cutoff`. It returns `data`.
- Produces (from `src/loader.js`):
  - `syncTeam(teamId, opts): Promise<{ events: Event[], data: Stored, failed: number, saveFailed: boolean }>`
  - `opts = { now?: Date, onProgress?: (done, total) => void, api?: { fetchPastEvents, fetchAvailability }, concurrency?: 6, retries?: 2, retryDelayMs?: 1000 }`
  - Behaviour:
    1. `data = load(teamId)`.
    2. Fetch the event list. Keep `events` with `!isCancelled(name)`, `start < isoMinute(now)` and `start.slice(0,10) >= addMonths(isoDate(now), -12)`.
    3. `todo` is the kept events with no `data.rsvps[id]`. Call `onProgress(0, todo.length)`.
    4. Run up to `concurrency` workers. For each event, `fetchAvailability`, retrying `retries` times with `retryDelayMs` between attempts, but only for `kind === 'network'`.
    5. On success: set `data.members[id] = name` for each row, and `data.rsvps[event.id] = { start, statuses: { [id]: status } }`. Then `save`. If `save` returns false, set `saveFailed = true` and carry on in memory.
    6. After the retries run out: `failed++`.
    7. `session` and `parse` errors reject `syncTeam` immediately with that error. The bad response isn't stored, but earlier successful events stay saved.
    8. Call `onProgress(done, total)` after each event, whether it succeeded or failed.
    9. Finally, `prune(data, addMonths(isoDate(now), -13))`, `save`, and resolve.

- [ ] **Step 1: Write the failing tests**

`tests/store.test.js`:
- A round trip: `save` then `load` gives back an equal object, stored under `'tl-rsvp:v1:52263'`.
- `load` on missing data, on `'not json'`, and on `{"version":0}` each return `emptyStore()`.
- `prune(data, '2025-09-26')` drops an rsvp with start `2025-09-25T18:00` and keeps one with `2025-09-26T09:00`.
- With `Storage.prototype.setItem` mocked to throw, `save` returns `false`. With `getItem` mocked to throw, `load` returns `emptyStore()`.
- `clear` removes the key.

`tests/loader.test.js` uses a fake `api`, `now = new Date(2026, 9, 26, 12, 0)` and `retryDelayMs: 0`. Events:
- `e1` 2026-10-20T18:00 Training
- `e2` 2026-10-21T18:00 `CANCELED Training`
- `e3` 2026-10-27T18:00 (in the future)
- `e4` 2025-09-01T09:00 (older than 12 months)
- `e5` 2026-10-22T18:00

Tests:
- `test('fetches RSVPs only for past, uncancelled events in the last 12 months')`: `fetchAvailability` is called for exactly `e1` and `e5`. The result's `events` ids are `['e1','e5']`. `data.rsvps.e1.statuses` matches the fake rows. Members are recorded.
- `test('second run reuses the cache')`: run twice against the same localStorage. The second run calls `fetchAvailability` 0 times, and `onProgress` is first called with `(0, 0)`.
- `test('retries network errors then counts the event as failed')`: `fetchAvailability('e5')` always rejects with `kind: 'network'`. It's called 3 times, `failed === 1`, `e5` isn't in `data.rsvps`, and `e1` is.
- `test('session error aborts the sync')`: `fetchAvailability` rejects once with `kind: 'session'`, so `syncTeam` rejects with an error of that kind.
- `test('keeps working in memory when saving fails')`: `setItem` throws. The sync resolves with `saveFailed: true`, and `data.rsvps` has `e1` and `e5`.
- `test('never runs more than the concurrency limit at once')`: 10 past events, with `fetchAvailability` tracking how many are in flight using deferred promises. The highest in-flight count is ≤ 6.

- [ ] **Step 2: Run the tests and check that they fail**

Run: `npx jest tests/store.test.js tests/loader.test.js`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement `src/store.js` and `src/loader.js`** as specified in Interfaces.

- [ ] **Step 4: Run the tests and check that they pass**

Run: `npx jest tests/store.test.js tests/loader.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/store.js src/loader.js tests/store.test.js tests/loader.test.js
git commit -m "Add localStorage cache and RSVP sync with retries"
```

---

### Task 7: Overlay UI and wiring

**Files:**
- Create: `src/ui/overlay.js`, `src/ui/byEventType.js`, `src/ui/byMember.js`, `tests/overlay.test.js`
- Modify: `src/index.js` (replace the Task 1 stub with the `openOverlay` call), `src/styles.css`

**Interfaces:**
- Consumes:
  - `syncTeam` (Task 6) and `clear` (Task 6)
  - `groupEvents` (Task 2)
  - from Task 3: `filterGroups`, `groupSummary`, `turnout`, `leaderboard`, `memberTable`, `memberMonthly`, `rawRows`, `RAW_HEADERS`, `toTSV`, `toCSV`, `presetRange`, `addMonths`, `isoDate`, `formatDateLabel` and `formatMonthLabel`
  - from Task 5: `lineChart`, `copyText` and `downloadFile`
- Produces:
  - **`openOverlay({ teamId: string, teamName: string, sync = syncTeam, now = new Date() }): HTMLElement`.** It removes any existing `#tlrsvp-overlay`, builds the new one, appends it to `document.body`, starts the sync, and returns the root element.
  - **`renderByEventType(container: HTMLElement, { groups: Group[], data: Stored }): void`.**
    - The group list is `button.tlrsvp-group` with text `${label} (${events.length})`. The first one is selected.
    - The detail pane shows:
      - a summary line, `${events} events · average ${average} · highest ${highest} · lowest ${lowest}`;
      - the chart, from `turnout`, with labels `${formatDateLabel(start)} · ${name}`;
      - `table.tlrsvp-table` with headers `#`, `Member`, `Sessions` and `% of sessions`;
      - `button.tlrsvp-copy`, which copies `toTSV(['#','Member','Sessions','% of sessions'], rows)`, with each percentage written as `${pct}%`.
  - **`renderByMember(container, { groups, data, range }): void`.**
    - `table.tlrsvp-table` has the headers `Member`, the group labels and `Total`. Clicking a header sorts by that column, descending. `Member` sorts ascending.
    - Clicking a row toggles a following `tr.tlrsvp-monthly`, which holds `lineChart` of `memberMonthly`, with labels from `formatMonthLabel`.
    - `button.tlrsvp-copy` copies `toTSV(['Member', ...labels, 'Total'], rows)`.
- **Overlay structure**, all classes prefixed `tlrsvp-`:
  - Root `div#tlrsvp-overlay.tlrsvp-overlay`; clicking the backdrop closes it.
  - Modal `div.tlrsvp-modal`.
  - Header:
    - title `RSVP Stats · ${teamName}`;
    - preset buttons `3 months`, `6 months` and `12 months` (`button.tlrsvp-preset`, with `.tlrsvp-active` on the selected one; 12 at first);
    - `input[type=date].tlrsvp-from` and `.tlrsvp-to`, with `min = addMonths(today, -12)` and `max = today`;
    - `button.tlrsvp-export` labelled `⬇ Export CSV`, `button.tlrsvp-reload` labelled `⟳ Reload`, and `button.tlrsvp-close` labelled `✕`.
  - Tabs `button.tlrsvp-tab`: `By event type` and `By member`.
  - `div.tlrsvp-banners`.
  - `div.tlrsvp-body`.
- **Loading:** the body shows `Loading your data… ${done} / ${total} events` and a `progress.tlrsvp-progress` element. When `sync` resolves:
  1. `groups = groupEvents(result.events).groups` (computed once).
  2. The render step: `filterGroups(groups, range)`, then the active tab's renderer.
  3. If the filtered list is empty, the body shows `No events in this range.` instead.
- **Range controls:**
  - A preset sets `range = presetRange(n, today)` and fills both inputs.
  - Changing either input clears `.tlrsvp-active` from the presets. If `from > to`, the two are swapped. Then it re-renders without fetching anything.
- **Export:** `downloadFile(`${teamName} RSVPs ${range.from} to ${range.to}.csv`, toCSV(RAW_HEADERS, rawRows(filtered, data)))`.
- **Reload:** `clear(teamId)`, then start the sync again.
- **Banners** (`div.tlrsvp-banner`), with this exact text:
  - `failed > 0`: `${failed} events couldn't be loaded and will be retried next time.`
  - `saveFailed`: `Couldn't save data, so the next run will be slow.`
  - Rejected with `kind 'session'`: `Your TeamLinkt session has expired. Log in and try again.`
  - Rejected with `kind 'parse'`: `Couldn't read RSVPs from TeamLinkt (${endpoint}). The bookmarklet may need updating.`
  - Anything else: the error message.
- **Copy feedback:** the button text changes to `Copied!` for 1.5 seconds, or to `Select and copy manually` if `copyText` resolved `false`.
- **Safety:** all names go in with `textContent`. Chart SVG strings come only from `lineChart`, which escapes them, and are the only thing inserted with `innerHTML`.

- [ ] **Step 1: Write the failing tests** in `tests/overlay.test.js`

The fake `sync(teamId, { onProgress })` resolves `{ events, data, failed: 0, saveFailed: false }` with:
- events: 3× `Dragon Boat Training` (Tuesdays 2026-10-06, -13 and -20 at 18:00, `Docklands`) and 1× `<b>Party</b> & Co` (2026-10-10T12:00). `groupEvents` turns these into the groups `Dragon Boat Training` and `Other`.
- 2 members, `Amy` and `<i>Kim</i>`. Both are Going to every training, and Kim is Going to the party.
- `now = new Date(2026, 9, 26)`.

Use `jest.mock('../src/ui/copy.js')`.

- `test('shows loading progress then the event type tab')`: while the sync is pending, the body text contains `Loading your data…`. When `onProgress(1, 3)` fires, it shows `1 / 3 events`. After the sync resolves, there are 2 `button.tlrsvp-group`, the first reading `Dragon Boat Training (3)`, and the leaderboard table has rows.
- `test('names render as text, not HTML')` (Review Focus 1): after selecting the `Other` group, `document.querySelector('#tlrsvp-overlay b')` is `null`, and the body text contains `<i>Kim</i>`.
- `test('copy puts TSV on the clipboard')`: clicking `.tlrsvp-copy` calls `copyText` with a string starting `'#\tMember\tSessions\t% of sessions\n1\t'`.
- `test('by member tab sorts by a clicked column')`: switch tabs and click the `Total` header. The first body row's first cell is the member with the higher total.
- `test('custom range with no events shows a message')` (Review Focus 5): set `.tlrsvp-from` and `.tlrsvp-to` to `2026-01-01` and `2026-01-02`, and dispatch `change`. The body text is `No events in this range.`, and no preset has `.tlrsvp-active`.
- `test('export downloads CSV named after team and range')`: click `.tlrsvp-export`. `downloadFile` is called with `'Sea Dragons RSVPs 2025-10-26 to 2026-10-26.csv'` and a string starting `'﻿event_id,date,'`.
- `test('session error shows the expired banner')`: the sync rejects with `new TeamLinktError('session', 'getEvents')`, and the banner text matches exactly.
- `test('clicking the bookmarklet again replaces the overlay')`: calling `openOverlay` twice leaves exactly one `#tlrsvp-overlay`.

- [ ] **Step 2: Run the tests and check that they fail**

Run: `npx jest tests/overlay.test.js`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement `src/ui/overlay.js`, `src/ui/byEventType.js` and `src/ui/byMember.js`**, then wire up `src/index.js`. Write `src/styles.css`:
  - an overlay similar to RevSport's (fixed, `rgba(0,0,0,.5)`, `z-index: 10000`);
  - the modal at `width: 90vw; height: 90vh; display: flex; flex-direction: column`;
  - the body scrolls (`overflow: auto`);
  - in the event type tab, a two-column grid: the group list at `minmax(200px, 25%)` and the detail pane at `1fr`;
  - tables with sticky headers, compact padding and a 14px system font;
  - `.tlrsvp-active` and `.tlrsvp-banner` visibly styled.

  Keep the CSS terse, because it counts against the size budget.

- [ ] **Step 4: Run all the tests**

Run: `npm test`
Expected: the build succeeds and every suite passes, including `size.test.js`. If the size test fails, report the measured size, then shrink the CSS and markup before anything else.

- [ ] **Step 5: Commit**

```bash
git add src tests README.md
git commit -m "Add RSVP stats overlay with event type and member views"
```

---

### Task 8: README and manual check on live TeamLinkt

**Files:**
- Modify: `README.md` (Usage, Features, and "How events are grouped", summarising the spec's grouping section in about 8 lines)

**Interfaces:**
- Consumes: the built `dist/bookmarklet.js` from Task 7.

- [ ] **Step 1: Write the README sections.**
  - **Usage:** open TeamLinkt, pick the team, click the bookmarklet, and wait for the first load.
  - **Features:** both views, Copy, Export CSV, the presets and custom range, and Reload.
  - **Privacy:** data stays in this browser's localStorage.
  - Then run `npm run build` so the README carries the current code.

- [ ] **Step 2: Run the live check in Chrome.** Use the Claude in Chrome tab on `https://app.teamlinkt.com/` with Sea Dragons selected, and run the contents of `dist/bookmarklet.js` through the JavaScript tool. Check each of these and note the result:
  1. The first load shows progress and finishes. Note the time.
  2. The group list matches the Task 2 table for the 12-month range. New events since 26 Oct 2026 may add counts.
  3. Running it again finishes in a few seconds.
  4. The 3- and 6-month presets and a custom range change the counts.
  5. Leaderboard Copy pastes into a spreadsheet as columns. Check this in a Google Sheet or Excel, or ask the user to check.
  6. Export CSV downloads, and its first rows look right.
  7. Reload re-fetches.
  8. Clicking the bookmarklet twice leaves one overlay.

  Before running, confirm the download with the user.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "Document usage and grouping; refresh bookmarklet"
```
