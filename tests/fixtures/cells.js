// Handwritten examples of the HTML cells TeamLinkt's DataTables endpoints return (fake names).
export const eventRow = {
  0: '<a href="#">Tue October 27 2026, 6:00 pm</a> <i class="fa fa-redo popovers"></i>',
  1: 'Dragon Boat Training  ',
  2: 'Training',
  3: 'Docklands',
  4: 'Team',
  5: '<span class="team_availability_count">26</span>',
  6: '<div id="actions"><a href="/events/view/13930893" class="green_link">View</a></div>',
  test_event: 0,
};

export const noonRow = { ...eventRow, 0: '<a href="#">Sat October 31 2026, 12:00 pm</a>' };
export const midnightRow = { ...eventRow, 0: '<a href="#">Sat October 31 2026, 12:30 am</a>' };

const img = '<img class="player_image badge badge-circle h-40px w-40px" id="player_image" src="x.png">';
const player = (id, name, status) => ({
  0: img,
  1: `<a href="/players/view/${id}">${name}</a>`,
  2: '',
  3: status,
  4: '',
});
const label = cls => `<span class="status_label ${cls}">${cls}</span>`;

export const availabilityRows = [
  { 0: '', 1: '<h4><b>Going (2)</b></h4>', 2: '', 3: '', 4: 'status_label_going_header' },
  player(101, 'Alex Smith 💉💉', label('status_label_going')),
  player(102, 'Sam Lee',
    '<select name="data[response_status_102]" class="status_dd form-select status_label_going" id="response_status_102">' +
    '<option value="needs_action">No Response</option><option value="accepted" selected>Going</option>' +
    '<option value="declined">Not Going</option><option value="tentative">Maybe</option></select>'),
  player(103, 'Jo Park', label('status_label_maybe')),
  player(104, 'Kim Ng', label('status_label_not_going')),
  player(105, 'Pat Roe', label('status_label_default')),
];

export const weirdStatusRow = player(106, 'Lee Tan', label('status_label_weird'));
