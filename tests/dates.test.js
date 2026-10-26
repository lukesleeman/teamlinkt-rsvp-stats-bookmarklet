import {
  isoDate, isoMinute, addMonths, monthsBetween, formatDateLabel, formatMonthLabel, formatShortDate, presetRange,
} from '../src/dates.js';

describe('date helpers', () => {
  test('isoDate and isoMinute use local fields', () => {
    const d = new Date(2026, 0, 5, 7, 3);
    expect(isoDate(d)).toBe('2026-01-05');
    expect(isoMinute(d)).toBe('2026-01-05T07:03');
  });

  test('addMonths clamps to the end of shorter months', () => {
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
    expect(addMonths('2026-10-26', -12)).toBe('2025-10-26');
  });

  test('monthsBetween includes both ends', () => {
    expect(monthsBetween('2026-07-15', '2026-09-01')).toEqual(['2026-07', '2026-08', '2026-09']);
  });

  test('formats date and month labels', () => {
    expect(formatDateLabel('2026-08-01T09:30')).toBe('Sat 1 Aug 2026');
    expect(formatMonthLabel('2026-08')).toBe('Aug 2026');
    expect(formatShortDate('2026-10-08T18:00')).toBe('8 Oct');
  });

  test('presetRange counts back from today', () => {
    expect(presetRange(3, '2026-10-26')).toEqual({ from: '2026-07-26', to: '2026-10-26' });
  });
});
