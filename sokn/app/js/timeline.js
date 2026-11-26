const DAY_MINUTES = 24 * 60;

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

export function localDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
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

export function nextVisit(visits, now = new Date()) {
  const today = localDate(now);
  const currentMinute = now.getHours() * 60 + now.getMinutes();
  return [...visits].filter(visit => {
    const end = minutes(visit.end_time);
    return end !== null && (visit.date > today || (visit.date === today && end >= currentMinute));
  }).sort((a, b) => `${a.date}${a.start_time}`.localeCompare(`${b.date}${b.start_time}`))[0];
}

export function visitPeople(visit) {
  return visit.people?.length ? visit.people : [{display_name:visit.display_name || 'Besuch',avatar_url:visit.avatar_url}];
}

export function renderPeople(people) {
  return `<div class="people-list">${people.map(person=>{
    const name=escapeHtml(person.display_name || 'Besuch');
    const initial=escapeHtml((person.display_name || 'B').trim().charAt(0) || 'B');
    const url=person.avatar_url || '';
    const image=/^(https?:\/\/|\/api\/(circles|profile)\/)/i.test(url)
      ? `<img class="person-photo" src="${escapeHtml(url)}" alt="" referrerpolicy="no-referrer">`
      : `<span class="person-photo person-initial" aria-hidden="true">${initial}</span>`;
    return `<span class="person">${image}<span class="person-name">${name}</span></span>`;
  }).join('')}</div>`;
}

function marker(now) {
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const position = (now.getHours() * 60 + now.getMinutes()) / DAY_MINUTES * 100;
  return `<div class="timeline-overlay" style="--position:${position}%">
    <span class="timeline-now-label">Jetzt ${time}</span>
    <span class="timeline-now" aria-hidden="true"></span>
  </div>`;
}

export function renderTimeline(date, visits, now = new Date()) {
  const isToday = date === localDate(now);
  const rows = [...visits].sort((a, b) => a.start_time.localeCompare(b.start_time)).map(visit => {
    const start = minutes(visit.start_time);
    const end = minutes(visit.end_time);
    if (start === null || end === null || end < start) return '';
    const left = start / DAY_MINUTES * 100;
    const width = (end - start) / DAY_MINUTES * 100;
    return `<article class="timeline-visit">
      <div class="timeline-person">${renderPeople(visitPeople(visit))}<span class="timeline-time">${escapeHtml(visit.start_time)}–${escapeHtml(visit.end_time)}</span></div>
      <div class="timeline-track" aria-hidden="true"><span class="timeline-interval" style="--start:${left}%;--duration:${width}%"></span></div>
    </article>`;
  }).join('');
  return `<section class="day-timeline" aria-label="Tagesverlauf">
    <div class="timeline-heading"><h3>Tagesverlauf</h3></div>
    <div class="timeline-chart ${isToday ? 'has-now' : ''}">
      <div class="timeline-scale">
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
      </div>
      ${rows || `<div class="timeline-visit"><p class="timeline-no-visits">Kein Besuch</p><div class="timeline-track" aria-hidden="true"></div></div>`}
      ${isToday ? marker(now) : ''}
    </div>
  </section>`;
}
