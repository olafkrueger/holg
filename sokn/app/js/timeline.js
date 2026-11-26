const DAY_MINUTES = 24 * 60;

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

export function localDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function shiftDate(date, days) {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  return localDate(d);
}

export function horizonDates(today, selected) {
  const base = selected < shiftDate(today, -7) || selected > shiftDate(today, 13) ? selected : today;
  const dates = Array.from({length:21}, (_, i) => shiftDate(base, i - 7));
  return [today, ...dates.filter(date => date !== today)];
}

function minutes(time) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time || '')) return null;
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

export function isValidTimeRange(start, end) {
  const startMinutes = minutes(start);
  const endMinutes = minutes(end);
  return startMinutes !== null && endMinutes !== null &&
    startMinutes % 30 === 0 && endMinutes % 30 === 0 && endMinutes > startMinutes;
}

export function upcomingVisits(visits, now = new Date()) {
  const today = localDate(now);
  const currentMinute = now.getHours() * 60 + now.getMinutes();
  return [...visits].filter(visit => {
    const end = minutes(visit.end_time);
    return end !== null && (visit.date > today || (visit.date === today && end >= currentMinute));
  }).sort((a, b) => `${a.date}${a.start_time}`.localeCompare(`${b.date}${b.start_time}`));
}

export function nextVisit(visits, now = new Date()) {
  return upcomingVisits(visits, now)[0];
}

export function visitPeople(visit) {
  return visit.people?.length ? visit.people : [{display_name:visit.display_name || 'Besuch',avatar_url:visit.avatar_url}];
}

export function renderPeople(people) {
  return `<span class="people-list">${people.map(person=>{
    const name=escapeHtml(person.display_name || 'Besuch');
    const initial=escapeHtml((person.display_name || 'B').trim().charAt(0) || 'B');
    const url=person.avatar_url || '';
    const image=/^(https?:\/\/|\/api\/(circles|profile)\/)/i.test(url)
      ? `<img class="person-photo" src="${escapeHtml(url)}" alt="" referrerpolicy="no-referrer">`
      : `<span class="person-photo person-initial" aria-hidden="true">${initial}</span>`;
    return `<span class="person">${image}<span class="person-name">${name}</span></span>`;
  }).join('')}</span>`;
}

export function renderUpcomingAvatars(people) {
  const extra = Math.max(0, people.length - 3);
  return `${renderPeople(people.slice(0, 3))}${extra ? `<span class="upcoming-avatar-count" aria-hidden="true">+${extra}</span>` : ''}`;
}

function marker(now) {
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const position = (now.getHours() * 60 + now.getMinutes()) / DAY_MINUTES * 100;
  return `<div class="timeline-overlay" style="--position:${position}%">
    <span class="timeline-now-label">Jetzt ${time}</span>
    <span class="timeline-now" aria-hidden="true"></span>
  </div>`;
}

function renderScale() {
  return `<div class="timeline-scale">
        <div class="timeline-phases" aria-label="Tageszeiten von Mitternacht bis Mitternacht">
          <span class="timeline-phase night" role="img" title="Nacht, 00 bis 06 Uhr" aria-label="Nacht, 00 bis 06 Uhr"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.5 15.5A8 8 0 0 1 8.5 4 8.5 8.5 0 1 0 19.5 15.5Z"/><path d="M17 3v4m-2-2h4"/></svg><small>Nacht</small></span>
          <span class="timeline-phase morning" role="img" title="Morgen, 06 bis 10 Uhr" aria-label="Morgen, 06 bis 10 Uhr"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 19h20M5 16a7 7 0 0 1 14 0M12 9V2m-3 3 3-3 3 3M4 10l2 2m14-2-2 2"/></svg><small>Morgen</small></span>
          <span class="timeline-phase day" role="img" title="Tag, 10 bis 17 Uhr" aria-label="Tag, 10 bis 17 Uhr"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4m0-14.2-1.4 1.4M6.3 17.7l-1.4 1.4"/></svg><small>Tag</small></span>
          <span class="timeline-phase evening" role="img" title="Abend, 17 bis 21 Uhr" aria-label="Abend, 17 bis 21 Uhr"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 19h20M5 16a7 7 0 0 1 14 0M12 2v7m-3-3 3 3 3-3M4 10l2 2m14-2-2 2"/></svg><small>Abend</small></span>
          <span class="timeline-phase night" role="img" title="Nacht, 21 bis 24 Uhr" aria-label="Nacht, 21 bis 24 Uhr"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.5 15.5A8 8 0 0 1 8.5 4 8.5 8.5 0 1 0 19.5 15.5Z"/><path d="M17 3v4m-2-2h4"/></svg><small>Nacht</small></span>
        </div>
        <div class="timeline-axis" aria-hidden="true">
          <span>00</span><span>06</span><span>12</span><span>18</span><span>24</span>
        </div>
      </div>`;
}

export function renderTimeline(date, visits, now = new Date(), {detail = false} = {}) {
  const isToday = date === localDate(now);
  const rows = [...visits].sort((a, b) => a.start_time.localeCompare(b.start_time)).map(visit => {
    const start = minutes(visit.start_time);
    const end = minutes(visit.end_time);
    if (start === null || end === null || end < start) return '';
    const left = start / DAY_MINUTES * 100;
    const width = (end - start) / DAY_MINUTES * 100;
    if (detail) return `<div class="timeline-visit">
      <div class="timeline-track" role="img" aria-label="Besuch von ${escapeHtml(visit.start_time)} bis ${escapeHtml(visit.end_time)} Uhr"><span class="timeline-interval" style="--start:${left}%;--duration:${width}%"></span></div>
    </div>`;
    return `<button type="button" class="timeline-visit timeline-visit-button" data-visit-id="${escapeHtml(visit.id || '')}" aria-label="Besuch anzeigen: ${escapeHtml(visitPeople(visit).map(p=>p.display_name || 'Besuch').join(', '))}, ${escapeHtml(visit.start_time)} bis ${escapeHtml(visit.end_time)}">
      <span class="timeline-person">${renderPeople(visitPeople(visit))}<span class="timeline-time">${escapeHtml(visit.start_time)}–${escapeHtml(visit.end_time)} <span aria-hidden="true">ⓘ</span></span></span>
      <span class="timeline-track" aria-hidden="true"><span class="timeline-interval" style="--start:${left}%;--duration:${width}%"></span></span>
    </button>`;
  }).join('');
  return `<section class="day-timeline" aria-label="Uhrzeiten">
    <div class="timeline-chart ${isToday ? 'has-now' : ''}">
      ${renderScale()}
      ${rows}
      ${isToday ? marker(now) : ''}
    </div>
  </section>`;
}

export function renderWeekOverview(startDate, visits, now = new Date(), selectedDate = null) {
  const today = localDate(now);
  const tomorrow = shiftDate(today, 1);
  const dates = Array.from({length:7}, (_, i) => shiftDate(startDate, i));
  const position = (now.getHours() * 60 + now.getMinutes()) / DAY_MINUTES * 100;
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const days = dates.map(date => {
    const d = new Date(`${date}T12:00:00`);
    const label = date === today ? 'Heute' : date === tomorrow ? 'Morgen' : d.toLocaleDateString('de-DE',{weekday:'long'});
    const fullLabel = `${label}, ${d.toLocaleDateString('de-DE',{day:'numeric',month:'numeric'})}`;
    const heading = selectedDate === null
      ? `<h3 class="overview-date">${escapeHtml(fullLabel)}</h3>`
      : `<button type="button" class="overview-date ${date === selectedDate ? 'selected' : ''}" data-overview-date="${date}" aria-pressed="${date === selectedDate}">${escapeHtml(fullLabel)}</button>`;
    return `<div class="overview-day">${heading}<div class="overview-day-scale">
      ${date === today ? `<span class="overview-now-label">Jetzt ${time}</span>` : ''}
      ${renderScale()}
    </div></div>`;
  }).join('');
  const rows = [...visits].filter(visit => {
    const start=minutes(visit.start_time), end=minutes(visit.end_time);
    return dates.includes(visit.date) && start !== null && end !== null && end >= start;
  }).sort((a,b) => `${a.date}${a.start_time}`.localeCompare(`${b.date}${b.start_time}`)).map(visit => {
    const start=minutes(visit.start_time), end=minutes(visit.end_time);
    const tracks=dates.map(date=>`<span class="overview-track-day" data-track-date="${date}">
      ${date===visit.date ? `<span class="timeline-interval" style="--start:${start / DAY_MINUTES * 100}%;--duration:${(end - start) / DAY_MINUTES * 100}%"></span>` : ''}
      ${date===today ? '<span class="overview-now-line" aria-hidden="true"></span>' : ''}
    </span>`).join('');
    const names=visitPeople(visit).map(person=>person.display_name || 'Besuch').join(', ');
    const labelDate=new Date(`${visit.date}T12:00:00`).toLocaleDateString('de-DE',{weekday:'long',day:'numeric',month:'long'});
    return `<button type="button" class="overview-visit" data-visit-id="${escapeHtml(visit.id || '')}" aria-label="Besuch anzeigen: ${escapeHtml(names)}, ${escapeHtml(labelDate)}, ${escapeHtml(visit.start_time)} bis ${escapeHtml(visit.end_time)}">
      <span class="timeline-person">${renderPeople(visitPeople(visit))}<span class="timeline-time">${escapeHtml(visit.start_time)}–${escapeHtml(visit.end_time)} <span aria-hidden="true">ⓘ</span></span></span>
      <span class="overview-tracks">${tracks}</span>
    </button>`;
  }).join('');
  return `<div class="overview-scroll" role="region" aria-label="Zeitachse, horizontal scrollbar" tabindex="0">
    <div class="week-overview" style="--now-position:${position}%">
      <div class="overview-header"><span class="overview-corner">Besuche</span>${days}</div>
      ${rows}
    </div>
  </div>`;
}
