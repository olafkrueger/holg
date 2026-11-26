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

export function nextVisit(visits, now = new Date()) {
  const today = localDate(now);
  const currentMinute = now.getHours() * 60 + now.getMinutes();
  return [...visits].filter(visit => {
    const end = minutes(visit.end_time);
    return end !== null && (visit.date > today || (visit.date === today && end >= currentMinute));
  }).sort((a, b) => `${a.date}${a.start_time}`.localeCompare(`${b.date}${b.start_time}`))[0];
}

function marker(now) {
  if (!now) return '';
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const position = (now.getHours() * 60 + now.getMinutes()) / DAY_MINUTES * 100;
  return `<span class="timeline-now" style="--position:${position}%" aria-hidden="true"></span>`;
}

export function renderTimeline(date, visits, now = new Date()) {
  const isToday = date === localDate(now);
  const todayMarker = isToday ? marker(now) : '';
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
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
      <div class="timeline-person">${image}<strong>${name}</strong><span>${escapeHtml(visit.start_time)}–${escapeHtml(visit.end_time)}</span></div>
      <div class="timeline-track" aria-hidden="true"><span class="timeline-interval" style="--start:${left}%;--duration:${width}%"></span>${todayMarker}</div>
    </article>`;
  }).join('');
  return `<section class="day-timeline" aria-label="Tagesverlauf">
    <div class="timeline-heading"><h3>Tagesverlauf</h3>${isToday ? `<span class="timeline-now-label">Jetzt ${time}</span>` : ''}</div>
    <div class="timeline-axis" aria-hidden="true">
      <span>00</span><span>06</span><span>12</span><span>18</span><span>24</span>
    </div>
    ${rows || `<div class="timeline-track timeline-empty" aria-hidden="true">${todayMarker}</div><p class="timeline-no-visits">Kein Besuch an diesem Tag.</p>`}
  </section>`;
}
