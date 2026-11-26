import test from 'node:test';
import assert from 'node:assert/strict';
import { localDate, nextVisit, renderTimeline } from '../../app/js/timeline.js';

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
