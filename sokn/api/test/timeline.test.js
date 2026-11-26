import test from 'node:test';
import assert from 'node:assert/strict';
import { horizonDates, isValidTimeRange, localDate, nextVisit, upcomingVisits, renderUpcomingAvatars, renderTimeline, renderTodaySun, renderWeekOverview, shiftDate, sunPosition } from '../../app/js/timeline.js';

const now = new Date(2030, 0, 2, 12, 0);
const visit = (name, start, end, date = localDate(now)) => ({
  display_name: name, start_time: start, end_time: end, date
});

test('day rail keeps today first while retaining past, future and distant selected days', () => {
  const today='2030-01-02';
  const normal=horizonDates(today,today);
  assert.equal(normal.length,21);
  assert.equal(normal[0],today);
  assert.equal(normal.filter(date=>date===today).length,1);
  assert.ok(normal.includes('2029-12-26'));
  assert.ok(normal.includes('2030-01-15'));
  const distant=horizonDates(today,'2030-03-01');
  assert.equal(distant[0],today);
  assert.ok(distant.includes('2030-03-01'));
  assert.equal(distant.filter(date=>date===today).length,1);
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
  const empty=renderTimeline(localDate(now), [], now);
  assert.match(empty, /Jetzt 12:00/);
  assert.match(empty, /timeline-phases/);
  assert.doesNotMatch(empty, /Kein Besuch|timeline-visit/);
  assert.doesNotMatch(renderTimeline('2030-01-03', [], now), /timeline-now/);
  assert.doesNotMatch(renderWeekOverview(localDate(now), [], now), /Kein Besuch|overview-visit/);
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

test('sun position follows a schematic day and switches to the moon at night', () => {
  const at=(hour,minute=0)=>sunPosition(new Date(2030,0,2,hour,minute));
  assert.deepEqual(at(0),{x:0,y:60,day:false});
  assert.deepEqual(at(6),{x:25,y:75,day:true});
  assert.deepEqual(at(12),{x:50,y:50/240*100,day:true});
  assert.deepEqual(at(18),{x:75,y:60,day:false});
  assert.ok(at(23,59).x>99);
  assert.ok(at(9).y<at(6).y);
  assert.ok(at(15).y>at(12).y);
});

test('sun view aligns all visits with the day, including overlapping and night visits', () => {
  const visits=[
    {...visit('<Sam>','11:30','12:30'),id:'crossing'},
    {...visit('Alex','11:30','13:30'),id:'overlap'},
    {...visit('Night','22:00','23:30'),id:'night'},
    {...visit('Later','09:00','10:00','2030-01-03'),id:'tomorrow'},
    {...visit('Invalid','09:00','09:00'),id:'invalid'}
  ];
  const html=renderTodaySun(visits,now);
  assert.match(html,/--sun-x:50%;--sun-y:20\.833333333333336%/);
  assert.match(html,/class="sun-icon"\s+viewBox=/);
  assert.match(html,/class="moon-icon" hidden/);
  assert.match(html,/Jetzt 12:00/);
  assert.match(html,/Schematisch, keine echten Sonnenzeiten/);
  assert.match(html,/data-visit-id="crossing"[\s\S]*?--start:47\.91666666666667%;--duration:4\.166666666666666%/);
  assert.match(html,/data-visit-id="overlap"/);
  assert.match(html,/data-visit-id="night"[\s\S]*?--start:91\.66666666666666%;--duration:6\.25%/);
  assert.match(html,/&lt;Sam&gt;/);
  assert.doesNotMatch(html,/data-visit-id="tomorrow"|data-visit-id="invalid"/);
  const empty=renderTodaySun([],new Date(2030,0,2,23,59));
  assert.match(empty,/class="sun-icon" hidden/);
  assert.match(empty,/class="moon-icon"\s+viewBox=/);
  assert.match(empty,/Jetzt 23:59/);
  assert.doesNotMatch(empty,/Kein Besuch|class="sun-visit"/);
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

test('upcoming visits include every ongoing and future visit in chronological order', () => {
  const visits = [
    visit('Tomorrow','08:00','09:00','2030-01-03'),
    visit('Later','15:00','16:00'),
    visit('Ended','09:00','11:30'),
    visit('Ongoing','11:00','12:30'),
    visit('Yesterday','20:00','21:00','2030-01-01'),
    visit('Much later','10:00','11:00','2030-03-01')
  ];
  assert.deepEqual(upcomingVisits(visits,now).map(v=>v.display_name),['Ongoing','Later','Tomorrow','Much later']);
  assert.deepEqual(upcomingVisits(visits,new Date(2030,0,2,12,31)).map(v=>v.display_name),['Later','Tomorrow','Much later']);
  assert.equal(upcomingVisits([],now).length,0);
});

test('upcoming avatar stack indicates additional people without hiding them in visit details', () => {
  const people=['Franzi','Tim','Toni','Olaf','Marc'].map(display_name=>({display_name}));
  const stack=renderUpcomingAvatars(people);
  assert.equal((stack.match(/class="person"/g)||[]).length,3);
  assert.match(stack,/\+2<\/span>/);
  assert.doesNotMatch(stack,/>Olaf</);
  const detail=renderTimeline(localDate(now),[{...visit('Franzi','09:00','10:00'),people}],now);
  assert.match(detail,/>Olaf</);
  assert.match(detail,/>Marc</);
  assert.doesNotMatch(renderUpcomingAvatars(people.slice(0,3)),/upcoming-avatar-count/);
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
