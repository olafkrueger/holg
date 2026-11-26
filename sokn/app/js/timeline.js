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

export function endTimeForDuration(start, hours) {
  const startMinutes = minutes(start);
  const duration = Number(hours);
  if (startMinutes === null || startMinutes % 30 !== 0 ||
      !Number.isFinite(duration) || duration <= 0 || !Number.isInteger(duration * 2)) return null;
  const end = startMinutes + duration * 60;
  if (end >= DAY_MINUTES) return null;
  return `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`;
}

export function nextVisit(visits, now = new Date()) {
  const today = localDate(now);
  const currentMinute = now.getHours() * 60 + now.getMinutes();
  return [...visits].filter(visit => {
    const end = minutes(visit.end_time);
    return end !== null && (visit.date > today || (visit.date === today && end >= currentMinute));
  }).sort((a, b) => `${a.date}${a.start_time}`.localeCompare(`${b.date}${b.start_time}`))[0];
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
    const name = escapeHtml(visit.display_name || 'Besuch');
    const initial = escapeHtml((visit.display_name || 'B').trim().charAt(0) || 'B');
    const image = /^https?:\/\//i.test(visit.avatar_url || '')
      ? `<img class="timeline-avatar" src="${escapeHtml(visit.avatar_url)}" alt="" referrerpolicy="no-referrer">`
      : `<span class="timeline-avatar" aria-hidden="true">${initial}</span>`;
    const left = start / DAY_MINUTES * 100;
    const width = (end - start) / DAY_MINUTES * 100;
    return `<article class="timeline-visit">
      <div class="timeline-person">${image}<div><strong>${name}</strong><span>${escapeHtml(visit.start_time)}–${escapeHtml(visit.end_time)}</span></div></div>
      <div class="timeline-track" aria-hidden="true"><span class="timeline-interval" style="--start:${left}%;--duration:${width}%"></span></div>
    </article>`;
  }).join('');
  return `<section class="day-timeline" aria-label="Tagesverlauf">
    <div class="timeline-heading"><h3>Tagesverlauf</h3></div>
    <div class="timeline-chart ${isToday ? 'has-now' : ''}">
      <div class="timeline-scale">
        <div class="timeline-phases" aria-label="Nacht, Morgen, Mittag und Abend">
          <span role="img" title="Nacht" aria-label="Nacht"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 15.5A8 8 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z"/></svg></span>
          <span role="img" title="Morgen" aria-label="Morgen"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 19h18M5 16a7 7 0 0 1 14 0M12 2v3M4 8l2 2M20 8l-2 2"/></svg></span>
          <span role="img" title="Mittag" aria-label="Mittag"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4m0-14.2-1.4 1.4M6.3 17.7l-1.4 1.4"/></svg></span>
          <span role="img" title="Abend" aria-label="Abend"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 19h18M5 16a7 7 0 0 1 14 0M12 3v6m-3-3 3 3 3-3"/></svg></span>
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
