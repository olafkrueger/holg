import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidTimeRange, localDate, nextVisit, renderTimeline, renderWeekOverview, shiftDate } from '../../app/js/timeline.js';

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
  assert.doesNotMatch(html, /day-distance/);
});

test('shows now on an empty today, but not on another day', () => {
  assert.match(renderTimeline(localDate(now), [], now), /Jetzt 12:00/);
  assert.doesNotMatch(renderTimeline('2030-01-03', [], now), /timeline-now/);
});

test('detail timeline shows the selected visit and the current time without another visit button', () => {
  const row=visit('Franzi','09:00','10:30');
  const html=renderTimeline(localDate(now),[row],now,{detail:true});
  assert.match(html,/--start:37\.5%;--duration:6\.25%/);
  assert.match(html,/Jetzt 12:00/);
  assert.match(html,/aria-label="Besuch von 09:00 bis 10:30 Uhr"/);
  assert.doesNotMatch(html,/<button|day-distance/);
  assert.doesNotMatch(renderTimeline('2030-01-03',[row],now,{detail:true}),/timeline-now/);
});

test('seven-day overview repeats the scale and positions visits on their correct days', () => {
  const first={...visit('Alex','09:00','10:00'),id:'one'};
  const overlap={...visit('Sam','09:30','11:00'),id:'two'};
  const later={...visit('Mia','14:00','17:00','2030-01-03'),id:'three'};
  const html=renderWeekOverview('2030-01-02',[first,overlap,later],now,'2030-01-03');
  assert.equal((html.match(/class="overview-day"/g)||[]).length,7);
  assert.equal((html.match(/class="timeline-phases"/g)||[]).length,7);
  assert.equal((html.match(/class="overview-now-label"/g)||[]).length,1);
  assert.equal((html.match(/class="overview-visit"/g)||[]).length,3);
  assert.equal((html.match(/class="timeline-interval"/g)||[]).length,3);
  assert.match(html,/data-overview-date="2030-01-03" aria-pressed="true"/);
  assert.match(html,/data-visit-id="one"[\s\S]*?data-track-date="2030-01-02">[\s\S]*?--start:37\.5%;--duration:4\.166666666666666%/);
  assert.match(html,/data-visit-id="two"[\s\S]*?data-track-date="2030-01-02">[\s\S]*?--start:39\.58333333333333%;--duration:6\.25%/);
  assert.match(html,/data-visit-id="three"[\s\S]*?data-track-date="2030-01-03">[\s\S]*?--start:58\.333333333333336%;--duration:12\.5%/);
  assert.match(html,/Heute, 2\.1\./);
  assert.match(html,/Morgen, 3\.1\./);
  const tablet=renderWeekOverview('2030-01-03',[later],now);
  assert.doesNotMatch(tablet,/data-overview-date|overview-now-label/);
  assert.match(tablet,/data-visit-id="three"/);
  assert.equal(shiftDate('2028-02-28',2),'2028-03-01');
  assert.doesNotMatch(renderWeekOverview('2030-01-04',[later],now),/data-visit-id="three"/);
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

test('shows every participant and a safe photo in the timeline', () => {
  const row=visit('Franzi','09:00','10:00');
  row.id='visit-1';
  row.people=[
    {display_name:'Franzi',avatar_url:'/api/circles/c/photos/users/u'},
    {display_name:'<Tim>',avatar_url:'/api/circles/c/photos/companions/p'},
    {display_name:'Toni',avatar_url:'javascript:alert(1)'}
  ];
  const html=renderTimeline(localDate(now),[row],now);
  assert.match(html,/src="\/api\/circles\/c\/photos\/users\/u"/);
  assert.match(html,/src="\/api\/circles\/c\/photos\/companions\/p"/);
  assert.match(html,/&lt;Tim&gt;/);
  assert.match(html,/>Toni</);
  assert.match(html,/<button[^>]*data-visit-id="visit-1"/);
  assert.match(html,/aria-label="Besuch anzeigen: Franzi, &lt;Tim&gt;, Toni, 09:00 bis 10:00"/);
  assert.doesNotMatch(html,/javascript:/);
  const overview=renderWeekOverview(localDate(now),[row],now);
  assert.match(overview,/src="\/api\/circles\/c\/photos\/companions\/p"/);
  assert.match(overview,/&lt;Tim&gt;/);
  assert.doesNotMatch(overview,/javascript:/);
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
