import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidTimeRange, localDate, nextVisit, renderTimeline } from '../../app/js/timeline.js';

const now = new Date(2030, 0, 2, 12, 0);
const visit = (name, start, end, date = localDate(now)) => ({
  display_name: name, start_time: start, end_time: end, date
});

test('places visit intervals and current time on the same 24-hour scale', () => {
  const html = renderTimeline(localDate(now), [
    visit('Alex', '06:00', '12:00'),
    visit('Sam', '09:00', '15:00')
  ], now);
  assert.match(html, /--start:25%;--duration:25%/);
  assert.match(html, /--start:37\.5%;--duration:25%/);
  assert.equal((html.match(/--position:50%/g) || []).length, 1);
  assert.match(html, /class="timeline-now-label">Jetzt 12:00/);
  assert.equal((html.match(/class="timeline-now"/g) || []).length, 1);
  assert.match(html, /06:00–12:00/);
  assert.match(html, /09:00–15:00/);
});

test('shows now on an empty today, but not on another day', () => {
  assert.match(renderTimeline(localDate(now), [], now), /Jetzt 12:00/);
  assert.doesNotMatch(renderTimeline('2030-01-03', [], now), /timeline-now/);
});

test('shows night at both ends of a chronological day', () => {
  const html = renderTimeline(localDate(now), [visit('Late', '22:00', '23:30')], now);
  assert.match(html, /Nacht, 00 bis 06 Uhr[\s\S]*Morgen, 06 bis 10 Uhr[\s\S]*Tag, 10 bis 17 Uhr[\s\S]*Abend, 17 bis 21 Uhr[\s\S]*Nacht, 21 bis 24 Uhr/);
  assert.match(html, /--start:91\.66666666666666%;--duration:6\.25%/);
});

test('places the now marker correctly at the edges of the day', () => {
  const midnight = new Date(2030, 0, 2, 0, 0);
  const late = new Date(2030, 0, 2, 23, 59);
  assert.match(renderTimeline(localDate(midnight), [], midnight), /--position:0%/);
  assert.match(renderTimeline(localDate(late), [], late), /--position:99\.93055555555556%/);
});

test('next visit skips visits already ended and escapes visitor names', () => {
  const visits = [
    visit('Early', '09:00', '10:00'),
    visit('<Sam>', '13:00', '14:00')
  ];
  assert.equal(nextVisit(visits, now).display_name, '<Sam>');
  assert.match(renderTimeline(localDate(now), visits, now), /&lt;Sam&gt;/);
  assert.doesNotMatch(renderTimeline(localDate(now), visits, now), /<Sam>/);
});

test('custom times require half-hour steps and an end after the start on the same day', () => {
  assert.equal(isValidTimeRange('09:30', '11:00'), true);
  assert.equal(isValidTimeRange('23:00', '23:30'), true);
  assert.equal(isValidTimeRange('09:15', '11:00'), false);
  assert.equal(isValidTimeRange('09:00', '11:15'), false);
  assert.equal(isValidTimeRange('09:00', '09:00'), false);
  assert.equal(isValidTimeRange('23:30', '00:00'), false);
  assert.equal(isValidTimeRange('', '12:00'), false);
  assert.equal(isValidTimeRange('25:00', '26:00'), false);
});
