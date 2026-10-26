// Generates a made-up club's past events and RSVPs for the demo page (used for README
// screenshots). Seeded, so every run produces the same data. Nothing here is real.

const FIRST = ['Alex', 'Sarah', 'Mike', 'Emma', 'David', 'Lisa', 'James', 'Maya', 'Ryan', 'Sophie', 'Kevin', 'Rachel',
  'Daniel', 'Amanda', 'Chris', 'Jess', 'Tom', 'Priya', 'Ben', 'Grace', 'Sam', 'Olivia', 'Nathan', 'Chloe', 'Leo', 'Zoe',
  'Marcus', 'Hannah', 'Eric', 'Mei', 'Jordan', 'Ava', 'Tyler', 'Ruby', 'Hugo', 'Isla', 'Raj', 'Nina', 'Owen', 'Tara'];
const LAST = ['Johnson', 'Wilson', 'Chen', 'Rodriguez', 'Kim', 'Thompson', 'Patel', "O'Connor", 'Martinez', 'Zhang',
  'Brown', 'Lee', 'Taylor', 'Garcia', 'Nguyen', 'Davis', 'Miller', 'Jones', 'Smith', 'Walker'];
const TAGS = ['', '', '', '', ' 🚣', ' 🥁', ' 🚣🚣', ' 🏅'];

function rng(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const pad = n => String(n).padStart(2, '0');
const isoDay = d => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

// Weekly sessions: [name, weekday (0 = Sun), time, location, first date, last date].
const SESSIONS = [
  ['Dragon Boat Training', 6, '09:30', 'Riverside', '2025-10-27', '2026-10-25'],
  ['Dragon Boat Training', 2, '18:00', 'Riverside', '2025-10-27', '2026-10-25'],
  ['Dragon Boat Training', 4, '18:00', 'Riverside', '2026-05-01', '2026-10-25'],
  ['Gym Session - Wednesday', 3, '18:00', 'Club Gym', '2025-10-27', '2026-10-25'],
  ['Gym Session - Sunday', 0, '09:00', 'Club Gym', '2025-10-27', '2026-10-25'],
  ['Beginners Class', 6, '08:30', 'Riverside', '2026-01-05', '2026-10-25'],
  ['Regatta Crew', 6, '11:30', 'Riverside', '2026-07-01', '2026-10-25'],
];
const ONE_OFFS = [
  ['Christmas Paddle 🎄', '2025-12-20T09:30', 'Riverside', 'Social Event'],
  ['Training Camp - Theory', '2026-01-17T09:00', 'Clubhouse', 'Other'],
  ['Training Camp - Water Session', '2026-01-17T13:00', 'Riverside', 'Other'],
  ['Training Camp - Video Session', '2026-03-14T13:00', 'Clubhouse', 'Meeting'],
  ['AGM 2026', '2026-08-22T09:20', 'Riverside', 'Meeting'],
  ['Team BBQ 🌭', '2026-05-02T12:00', 'Riverside Park', 'Social Event'],
  ['End of Season Dinner', '2026-04-19T18:00', 'Harbour Bistro', 'Social Event'],
];

export function fakeClub() {
  const random = rng(20261026);
  const pick = list => list[Math.floor(random() * list.length)];

  const events = [];
  let nextId = 1000;
  SESSIONS.forEach(([name, weekday, time, location, first, last]) => {
    const day = new Date(`${first}T00:00Z`);
    while (day.getUTCDay() !== weekday) day.setUTCDate(day.getUTCDate() + 1);
    for (; isoDay(day) <= last; day.setUTCDate(day.getUTCDate() + 7)) {
      const cancelled = random() < 0.06;
      events.push({
        id: String(nextId++), start: `${isoDay(day)}T${time}`, location,
        name: `${cancelled ? 'CANCELED ' : ''}${name}`, type: /Gym/.test(name) ? 'Other' : 'Training',
      });
    }
  });
  ONE_OFFS.forEach(([name, start, location, type]) => events.push({ id: String(nextId++), start, name, location, type }));
  events.sort((a, b) => (a.start < b.start ? -1 : 1));

  // Each member has an overall keenness and a liking for water, gym and beginner sessions.
  const used = new Set();
  const members = Array.from({ length: 64 }, (_, i) => {
    let name;
    do name = `${pick(FIRST)} ${pick(LAST)}`; while (used.has(name));
    used.add(name);
    return {
      id: String(500 + i),
      name: name + pick(TAGS),
      keen: 0.15 + 0.8 * random() ** 1.4,
      water: random() < 0.85 ? 0.6 + 0.4 * random() : 0.1,
      gym: random() < 0.35 ? 0.3 + 0.6 * random() : 0.03,
      beginner: i % 9 === 0,
      joined: random() < 0.15 ? `2026-0${1 + Math.floor(random() * 8)}-01` : '2000-01-01',
    };
  });

  const data = { version: 1, members: {}, rsvps: {} };
  members.forEach(m => { data.members[m.id] = m.name; });
  events.forEach(e => {
    const day = e.start.slice(0, 10);
    // Saturday training is the big one; Tuesday training slowly gets busier over the year.
    const weekday = new Date(`${day}T00:00Z`).getUTCDay();
    const water = /Dragon/.test(e.name);
    const yearDone = (Date.parse(day) - Date.parse('2025-10-27')) / 3.15e10;
    const trend = !water ? 1 : weekday === 6 ? 1.35 : weekday === 2 ? 0.5 + 0.6 * yearDone : 0.75;
    const statuses = {};
    members.forEach(m => {
      if (day < m.joined) { statuses[m.id] = 'R'; return; }
      const liking = /Gym|Pilates/.test(e.name) ? m.gym : /Beginners/.test(e.name) ? (m.beginner ? 0.9 : 0.02)
        : /Regatta/.test(e.name) ? m.water * 0.5 : e.type === 'Social Event' ? 0.6 : m.water;
      const goes = random() < Math.min(0.92, m.keen * liking * trend);
      statuses[m.id] = goes ? (random() < 0.9 ? 'G' : 'M') : (random() < 0.4 ? 'N' : 'R');
    });
    data.rsvps[e.id] = { start: e.start, statuses };
  });

  const past = events.filter(e => !/cancel/i.test(e.name));
  return { events: past, data };
}
