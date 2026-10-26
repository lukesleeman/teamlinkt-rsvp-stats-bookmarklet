# TeamLinkt RSVP Stats Bookmarklet — Design

Date: 2026-10-26

## Purpose

A bookmarklet for [TeamLinkt](https://app.teamlinkt.com/) that shows who has RSVPed to past events, broken down by kind of event. It is for a dragon boat club (Sea Dragons) and serves three uses:

- **Crew planning and selection:** who reliably turns up to each kind of session.
- **Turnout trends:** whether attendance at a session (e.g. Tuesday night training) is rising or falling.
- **Recognition:** leaderboards of who attends most.

TeamLinkt records RSVPs, not attendance. In this tool, a person "attended" an event if their RSVP is **Going or Maybe**.

## Scope

- **Past events only.** Upcoming events are ignored. A past event's RSVPs are treated as final.
- **Date range:** presets for the last 3, 6 and 12 months (default 12), plus a custom From/To range. Every range falls within the last 12 months, which is what's loaded.
- **Fully automatic grouping** of events into kinds. There's no UI for editing groups. Tuning happens in code.
- **Two views:** by event type and by member, each with a Copy-to-Excel button and a chart over time.
- **Raw CSV export:** one row per event × member, with every RSVP status, for the selected range.
- **Out of scope:** upcoming events, ranges older than 12 months, manual group editing, multi-team reports.

## Constraints

- **Bookmarklet size budget:** at most **40 KB** URL-encoded, checked by a test. Firefox caps bookmark URLs at about 64 KB, so 40 KB leaves headroom. (Raised from 30 KB on 2026-10-26 for the chart labels, attendance strip and member search.)
- **No runtime dependencies:** all code, including charts, is bundled. Nothing is loaded from a CDN.
- **Build targets:** current Firefox, Chrome and Safari. No IE11 target, since Babel's down-compilation bloats the output.

## Stack

This copies the [RevSport crew entry bookmarklet](https://github.com/lukesleeman/revsport-crew-entry-bookmarklet):

- webpack 5, Babel `preset-env` (targets as above) and Terser (drops console calls, mangles names).
- `css-loader` and `style-loader`, so the CSS is bundled into the JS and injected at runtime. All classes are prefixed `tlrsvp-`.
- A webpack plugin that URL-encodes `dist/bookmarklet.js` as `javascript:…` and writes it into `README.md` between `<!-- BOOKMARKLET_CODE_START -->` and `<!-- BOOKMARKLET_CODE_END -->`.
- Jest with jsdom and `identity-obj-proxy` for CSS imports.

## TeamLinkt data sources

TeamLinkt is a server-rendered jQuery/Metronic app. Its tables are DataTables fed by two JSON endpoints, which the bookmarklet calls with the user's session cookie (`credentials: 'same-origin'`). Each request is a form-encoded POST with `X-Requested-With: XMLHttpRequest`.

### Team ID

Every page has `team_id` as a global variable, and it follows the team switcher. `user_id` is not needed.

### `POST /schedules/getEvents`

Parameters: `team_id`, `status=past`, `draw=1`, `start=0`, `length=2000`, `order[0][column]=0`, `order[0][dir]=desc`.

The response is `{ draw, recordsTotal, recordsFiltered, data }`. Each row in `data` is an object with keys `"0"`–`"6"` holding HTML cells:

| Key | Content |
|---|---|
| 0 | Date text, e.g. `Tue October 27 2026, 6:00 pm`, inside an `<a>` |
| 1 | Event name. Cancelled events contain `CANCELED` or `[CANCELLED]` |
| 2 | Event type text (`Training`, `Social Event`, `Meeting`, …) |
| 3 | Location name |
| 4 | Schedule (`Team`) |
| 5 | Availability counts (`span.team_availability_count`). Not used |
| 6 | `<a href="/events/view/<eventId>">View</a>` |

All past events come back in one call: 1,240 events for Sea Dragons, back to January 2021. The bookmarklet keeps those in the last 12 months.

### `POST /events/getEventAvailability`

Parameters: `team_id`, `event_id`, `draw=1`, `start=0`, `length=500`.

This returns every **current** roster member with their RSVP for that event, as rows of HTML cells:

- **Group header rows:** cell `"1"` contains `<h4><b>Going (26)</b></h4>`, and cell `"4"` is a marker such as `status_label_going_header`. Skip these.
- **Player rows:** cell `"1"` contains `<a href="/players/view/<playerId>">Name</a>`, sometimes followed by emoji. The status is in cell `"3"`:
  - Normally `span.status_label.status_label_{going|not_going|default|maybe}`.
  - For rows the viewer can edit, a `<select class="status_dd …">` whose options are `needs_action`, `accepted`, `declined` and `tentative`. Use the option with the `selected` attribute.
- **Status mapping:**
  - `going` or `accepted` → **Going**
  - `tentative` or `maybe` → **Maybe**
  - `not_going` or `declined` → **Not Going**
  - `default` or `needs_action` → **No Response**

Each call takes about 0.9 seconds.

## Architecture

```
src/
  index.js          entry: check host is app.teamlinkt.com and team_id is set, then open the overlay
  api.js            fetchPastEvents(teamId), fetchAvailability(teamId, eventId):
                    POST and parse HTML cells into plain objects. The only module that knows TeamLinkt markup.
  store.js          localStorage persistence: load(teamId), save(teamId, data), prune(data, cutoff), clear(teamId)
  loader.js         syncs the store with TeamLinkt: fetches the event list, then missing RSVPs 6 at a time, reporting progress
  grouping.js       groupEvents(events) → groups (algorithm below)
  stats.js          pure functions: leaderboard, memberTable, memberMonthly, turnout, groupSummary, toTSV
  ui/overlay.js     overlay shell, header, presets, Reload, tabs, progress and error banners
  ui/byEventType.js the "By event type" tab
  ui/byMember.js    the "By member" tab
  ui/chart.js       a minimal SVG line chart (about 600 bytes minified)
  ui/copy.js        clipboard write with fallback
  styles.css
tests/
  fixtures/         events from the last 12 months (names, dates, locations), plus handwritten endpoint cells with fake names
  grouping.test.js, api.test.js, stats.test.js, store.test.js, size.test.js
```

`grouping.js` and `stats.js` don't touch the DOM. They take and return plain data, so they can be tested directly.

### Data model

```js
Event      = { id, start: 'YYYY-MM-DDTHH:MM' (team local time), name, type, location }
Member     = { id, name }
Status     = 'G' | 'M' | 'N' | 'R'   // Going, Maybe, Not Going, No Response
Stored     = {
  version: 1,
  members: { [memberId]: name },           // latest name seen
  rsvps:   { [eventId]: { start, statuses: { [memberId]: Status } } },
}
```

`start` is parsed from the date text in cell `"0"`, e.g. `Tue October 27 2026, 6:00 pm` → `2026-10-27T18:00`. It stays a naive local time string throughout and is never converted through time zones.

## Loading and caching

**Storage:** one `localStorage` key per team, `tl-rsvp:v1:<teamId>`. About 250 KB for a year. Changing the schema means bumping the version in the key, which drops old data.

**Startup:**
1. Open the overlay showing "Loading your data…" and a progress bar ("112 / 279 events").
2. Fetch the past event list (one call). Keep events from the last 12 months and leave out cancelled ones. The event list is never cached, so names, types and cancellations are always current.
3. For each kept event without an entry in `rsvps`, fetch its RSVPs, 6 at a time. Save to `localStorage` after each event, so a closed overlay keeps its progress.
4. Delete `rsvps` entries older than 13 months.
5. Group the events and render.

**Cache rule:** an event in the past is final. Once fetched, its RSVPs are never fetched again. **⟳ Reload** clears the team's key and runs startup again.

**Roster drift:** TeamLinkt returns the *current* roster for every event. New members show as No Response on older events, which doesn't count towards stats. Cached data keeps members who have since left.

## Grouping algorithm

This was tuned interactively against Sea Dragons' events (see the expected results below). The reference implementation is [`2026-10-26-grouping-prototype.js`](2026-10-26-grouping-prototype.js), which produces exactly that table. All thresholds are in one `CONFIG` object:

```js
CONFIG = { nameSimilarity: 0.9, slotToleranceMins: 60, minSlotEvents: 3, minGroupEvents: 3 }
```

Grouping runs once over all events from the last 12 months. The presets and custom range filter each group's events afterwards, so group names stay the same whatever range is selected. Groups with no events in the selected range are hidden.

1. **Leave out cancelled events:** names matching `/\bcancel+ed\b/i`.
2. **Clean each name:**
   - Remove cancellation markers and emoji (`\p{Extended_Pictographic}`, U+FE0F, U+200D).
   - Cut at the first `:` or ` - `. Anything after it is a sub-name, e.g. "Training Camp - Theory" → "Training Camp", "Dragon Boat Training: Sea-Noirs And Prems Boats" → "Dragon Boat Training".
   - Strip a trailing `...` and collapse whitespace.
3. **Build a name key:** lowercase the cleaned name, replace runs of characters other than `a-z0-9` with a space, and drop a trailing `s` from words longer than 3 letters. So "Pango Gym - Wednesdays" → "pango gym".
4. **Cluster by name:** an event joins the first cluster that has a key at least `nameSimilarity` similar to its own. Similarity is 1 minus the Levenshtein distance divided by the length of the longer key. The cluster's label is its most common cleaned name.
5. **Small clusters:** a cluster with fewer than `minGroupEvents` events becomes a candidate for **Other**.
6. **Split clusters into slots:** within each cluster, group events by weekday. Within each weekday, repeatedly take the most common start time as an anchor and gather all events within `slotToleranceMins` of it.
   - With at most one slot of `minSlotEvents` or more events, the cluster is one group under its label.
   - Otherwise each such slot becomes a group labelled `<label> – <Day> <time>`, e.g. "Dragon Boat Training – Tue 6:00pm". The remaining small slots are pooled as `<label> – other times`. If that pool has fewer than `minGroupEvents` events, its events become candidates for **Other** instead.
7. **Place each Other candidate:** try these in order.
   1. **Same kind:** strip numbers from the candidate's name key and take the last word. If exactly one cluster label ends in the same word, the event joins that cluster. If the cluster was split into slots, the slot is picked by the stand-in rule. Example: "Dragon Boat Camp 1" → "Training Camp".
   2. **Stand-in:** the event joins a group when all of these hold:
      - the event's type is not a Meeting;
      - it's at the same location and on the same weekday as the group's regular slot;
      - it starts within `slotToleranceMins` of that slot;
      - the regular slot holds at least `minSlotEvents` events, and at least half of the group's events;
      - the group has no event of its own on that date;
      - the date falls between the group's first and last events.

      If several groups qualify, the one with the most events in the matching slot wins. Picking the closest start time doesn't work: it sent Open Day (Saturday 9:00) to Pilates (8:45) instead of Saturday training (9:30). Examples: River Run, Christmas Paddle and Open Day → "Dragon Boat Training – Sat 9:30am".
   3. **Otherwise:** the event goes into **Other**.
8. Events added by step 7 are recorded as **stand-ins** on their group. The turnout chart's tooltip shows each event's real name, so stand-ins stay visible.

The event type field is ignored except for the Meeting check in 7.2. It's inconsistent: Pango Gym is tagged both "Training" and "Other".

### Expected result on Sea Dragons data

The test fixture is the 279 past events from 28 Oct 2025 to 25 Oct 2026, with 22 cancelled:

| Events | Group | Includes |
|---|---|---|
| 48 | Pango Gym – Wed 6:00pm | "Pango Gym - Wednesday(s)" |
| 46 | Dragon Boat Training – Tue 6:00pm | |
| 45 | Dragon Boat Training – Sat 9:30am | 9:15 and 9:20 starts; ": Sea-Noirs…" and ": She-Dragons…" variants; stand-ins Christmas Paddle, Open Day ×2, River Run And Dragon Boat Training, River Run |
| 43 | Pango Gym – Sun 9:00am | "Pango Gym - Sunday(s)" |
| 21 | Dragon Boat Training – Thu 6:00pm | |
| 21 | Foundation Class | 8:10, 8:30 and 9:00 starts; stand-in Foundation Session |
| 9 | Pilates session with Yalin | differences in capital letters; a single Tuesday session |
| 9 | Penang Crew | |
| 5 | Training Camp | Theory, Water Session, Video Session; Dragon Boat Camp 1 (same kind) |
| 10 | Other | AGM 2026/27, lunches, dinners, Christmas parties, LNY volunteering, Labour Day session, the one Tuesday-morning Dragon Boat Training |

## Stats

All counts use **attended = Going or Maybe**, over the events of the selected preset.

- `groupSummary(group)`: number of events, and the average, highest and lowest attended count per event.
- `turnout(group)`: per event, in date order: `{ date, name, count }`.
- `leaderboard(group)`: for each member who attended at least once: `{ member, sessions, pct }`, where `pct = sessions / events in group`. Sorted by sessions, descending, then by name.
- `memberTable(groups)`: one row per member. Columns are each visible group's attended count plus Total. Members with a total of zero are sorted last.
- `memberMonthly(member)`: attended count per calendar month across the range.
- `toTSV(headers, rows)`: tab-separated text with a header row and `\n` line endings. Tabs and newlines inside values are replaced with spaces.
- `rawRows(groups, data)`: one row per event × stored member status, ordered by date and then member name. Columns:
  - `event_id`
  - `date` (`YYYY-MM-DD`)
  - `time` (`HH:MM`)
  - `event` (the raw TeamLinkt name)
  - `group`
  - `location`
  - `type`
  - `member_id`
  - `member`
  - `status` (`Going`, `Maybe`, `Not Going` or `No Response`)
- `toCSV(headers, rows)`: RFC 4180 CSV with `\r\n` line endings. A value is quoted if it contains a comma, quote, CR or LF, and quotes inside it are doubled. The file starts with a UTF-8 BOM so Excel shows emoji in event names correctly.

## UI

The overlay is a modal covering about 90% of the screen, built from DOM elements as in RevSport. Clicking the bookmarklet again replaces any existing overlay.

**Header:** `RSVP Stats · <team name>`, then:
- Preset buttons `[3 months] [6 months] [12 months]`. 12 is selected at first.
- A custom range: two `<input type="date">` fields, **From** and **To**.
  - They're limited to the last 12 months, up to today.
  - Changing either one deselects the preset and applies the range straight away. If From is after To, the two are swapped.
  - Picking a preset fills both fields with that preset's range.
- `⬇ Export CSV`, `⟳ Reload` and `✕` close.

Below that, tabs: **By event type** and **By member**. Clicking the backdrop also closes the overlay.

**Export CSV** downloads `rawRows` for the selected range as `<team name> RSVPs <from> to <to>.csv`. It builds a `Blob` and clicks a temporary `<a download>` link.

**Loading state:** "Loading your data… N / M events" with a progress bar. Stats render when loading finishes.

**By event type:**
- **Left:** the list of groups with their event counts in range, sorted by count. Other is last.
- **Right, for the selected group:**
  - The summary line: *48 events · average 21 · highest 33 · lowest 6*.
  - The turnout chart.
  - The leaderboard table: `#`, `Member`, `Sessions`, `% of sessions`.
  - A **Copy** button that copies the leaderboard as TSV.

**By member:**
- **A table:** `Member`, one column per visible group, `Total`. Sorted by Total at first. Clicking a column header sorts by that column, descending.
- **Clicking a member row** expands a small `memberMonthly` chart under it.
- **A Copy button** that copies the whole table as TSV.

**Chart (`ui/chart.js`):** an SVG line chart, `lineChart(points)` with points `{ label, y }`:
- full width, about 160 px high;
- the y-axis shows 0 and the maximum value;
- one line, and a dot per point with a `<title>` tooltip, e.g. `Sat 1 Aug 2026 · River Run: 18`.

## Error handling

| Situation | Behaviour |
|---|---|
| Not on `app.teamlinkt.com`, or `team_id` missing | Alert: "Open TeamLinkt and pick a team first." |
| A response isn't JSON (session expired, login redirect) | Stop loading and show a banner: "Your TeamLinkt session has expired. Log in and try again." Nothing is cached from that response. |
| A single RSVP fetch fails | Retry twice with a short pause (about 1 second). If it still fails, skip the event and show a banner: "N events couldn't be loaded and will be retried next time." It stays uncached, and the stats leave it out. |
| A cell can't be parsed (markup changed) | Show a banner naming the endpoint, e.g. "Couldn't read RSVPs from TeamLinkt (getEventAvailability). The bookmarklet may need updating." Don't cache the bad data. |
| `localStorage` is unavailable or full | Keep data in memory for this session. Banner: "Couldn't save data, so the next run will be slow." |
| Copy fails with `navigator.clipboard` | Fall back to a hidden textarea and `document.execCommand('copy')`. If that fails too, select the text so the user can copy it by hand. |

## Testing

- **`grouping.test.js`:** runs the 279-event fixture and asserts the expected table above: group labels, counts and which events are stand-ins. Also unit tests for `cleanName`, `nameKey`, slot splitting and each step-7 rule on small handwritten inputs.
  - The fixture holds event names, start times, types and locations only. Personal names in event titles are replaced: a team lunch named after a member becomes "Team Lunch With Alex J".
- **`api.test.js`:** parsing against handwritten example cells with fake names:
  - event rows, including cancelled ones;
  - the date format;
  - availability header rows, each status class, the editable `<select>` row and a name followed by emoji.

  Also: a response that isn't JSON raises a session-expired error.
- **`stats.test.js`:** leaderboard ordering and percentages, Going + Maybe counting, the member table and zero rows, monthly counts, and TSV escaping. Also: filtering by preset and custom range (inclusive of both end dates); `rawRows` columns and ordering; CSV quoting of commas, quotes and newlines; and the BOM.
- **`store.test.js`:** save and load round trip in jsdom `localStorage`, pruning older than 13 months, the version key, and falling back to memory when `localStorage` throws.
- **`size.test.js`:** the built `dist/bookmarklet.js`, URL-encoded with the `javascript:` prefix, is at most 40 KB. The build runs before the tests.
- **Manual check:** run the built bookmarklet in Chrome against the live Sea Dragons team. Check the first load, a faster second load, each preset, a custom range, both tabs, Copy pasted into a spreadsheet, the exported CSV opened in Excel (emoji intact), and Reload.
