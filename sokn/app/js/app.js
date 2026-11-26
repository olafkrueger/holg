import {de as t} from './i18n.js';
import {horizonDates, isValidTimeRange, upcomingVisits, renderPeople, renderUpcomingAvatars, renderTimeline, renderTodayClock, renderWeekOverview, shiftDate, visitPeople} from './timeline.js';

const app=document.querySelector('#app');
const back=document.querySelector('#back-button');
const path=location.pathname;
let refreshNextVisit=()=>{};
let visibleVisits=[];
let calendarView='day';
let todayView='timeline';

async function api(url,options={}) {
  const r=await fetch(url,{headers:{'content-type':'application/json'},...options});
  if(!r.ok) throw new Error((await r.json().catch(()=>({error:'error'}))).error||'error');
  return r.json();
}
function esc(s=''){const e=document.createElement('span');e.textContent=s;return e.innerHTML;}
function attr(s=''){return esc(s).replace(/"/g,'&quot;');}
function showVisitDetails(visit){
  const dialog=document.createElement('dialog');
  dialog.className='visit-dialog';
  const now=new Date();
  const date=new Date(`${visit.date}T12:00:00`).toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric'});
  dialog.setAttribute('aria-labelledby','visit-dialog-title');
  dialog.innerHTML=`<div class="visit-dialog-content">
    <h2 id="visit-dialog-title" tabindex="-1" autofocus>Wer kommt?</h2>
    <p class="visit-dialog-date">${esc(naturalDate(visit.date))} · ${esc(date)}</p>
    <p class="visit-dialog-time">${esc(visit.start_time)}–${esc(visit.end_time)} Uhr${visit.template ? ` · ${esc(visit.template)}` : ''}</p>
    ${renderPeople(visitPeople(visit))}
    ${renderTimeline(visit.date,[visit],now,{detail:true})}
    ${visit.note ? `<p class="visit-dialog-note">${esc(visit.note)}</p>` : ''}
    <button class="button wide visit-dialog-close" type="button">Schließen</button>
  </div>`;
  document.body.append(dialog);
  dialog.querySelector('.visit-dialog-close').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});
  dialog.showModal();
}
app.addEventListener('click',event=>{
  const button=event.target.closest('[data-visit-id]');
  if(!button || !app.contains(button)) return;
  const visit=visibleVisits.find(item=>item.id===button.dataset.visitId);
  if(visit) showVisitDetails(visit);
});
async function preparePhoto(file){
  if(!file || !file.type.startsWith('image/') || file.size>10*1024*1024) throw new Error('Bitte ein Bild mit höchstens 10 MB auswählen.');
  const url=URL.createObjectURL(file);
  try{
    const image=new Image();
    image.src=url;
    await image.decode();
    const scale=Math.min(1,512/Math.max(image.naturalWidth,image.naturalHeight));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));
    canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
    const context=canvas.getContext('2d');
    if(!context) throw new Error('Das Bild konnte nicht verarbeitet werden.');
    context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);
    context.drawImage(image,0,0,canvas.width,canvas.height);
    for(let quality=.85;quality>=.35;quality-=.1){
      const photo=canvas.toDataURL('image/jpeg',quality);
      if(photo.length<=349500) return photo;
    }
    throw new Error('Das Bild ist zu groß. Bitte ein anderes Bild wählen.');
  }finally{URL.revokeObjectURL(url);}
}
function dateLocal(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function naturalDate(date){
  const d=new Date(`${date}T12:00:00`), today=new Date(), a=dateLocal(today), b=shiftDate(a,1);
  if(date===a)return t.today;
  if(date===b)return t.tomorrow;
  return d.toLocaleDateString('de-DE',{weekday:'long',day:'numeric',month:'long'});
}
function setupUpcoming(container,visits,onSelect,tablet=false){
  let signature=null;
  let expanded=false;
  function updateExpanded(){
    container.querySelectorAll('.upcoming-card').forEach((card,index)=>{card.hidden=!expanded && index>=3;});
    const button=container.querySelector('.upcoming-expand');
    if(button){
      button.setAttribute('aria-expanded',String(expanded));
      button.textContent=expanded?'Weniger anzeigen':`Alle anzeigen (${container.querySelectorAll('.upcoming-card').length})`;
    }
  }
  container.addEventListener('click',event=>{
    const card=event.target.closest('.upcoming-card');
    if(card){onSelect(card.dataset.date);return;}
    if(event.target.closest('.upcoming-expand')){
      expanded=!expanded;
      updateExpanded();
    }
  });
  return ()=>{
    const future=upcomingVisits(visits);
    const key=JSON.stringify(future.map(visit=>visit.id));
    if(key===signature) return;
    signature=key;
    container.hidden=future.length===0;
    if(!future.length){container.innerHTML='';return;}
    container.innerHTML=`<h2 class="upcoming-title">${tablet?esc(t.next):'Nächste Besuche'}</h2>
      <div class="upcoming-list" id="upcoming-list">
        ${future.map((visit,index)=>{
          const people=visitPeople(visit);
          const names=people.map(person=>person.display_name || 'Besuch').join(' + ');
          const date=naturalDate(visit.date);
          const time=`${visit.start_time}–${visit.end_time}`;
          return `<button type="button" class="upcoming-card" data-date="${attr(visit.date)}" aria-label="Tag anzeigen: ${attr(names)}, ${attr(date)}, ${attr(time)}" ${!expanded && index>=3?'hidden':''}>
            <span class="upcoming-avatars ${people.length>1?'multiple':''}">${renderUpcomingAvatars(people)}</span>
            <span class="upcoming-info"><strong class="upcoming-names">${esc(names)}</strong>
              <span class="upcoming-date">${esc(date)}</span>
              <span class="upcoming-time">${esc(time)}</span>
            </span>
          </button>`;
        }).join('')}
      </div>
      ${future.length>3?'<button type="button" class="upcoming-expand" aria-controls="upcoming-list"></button>':''}`;
    updateExpanded();
  };
}
function viewSwitch(){
  return `<div class="view-switch" role="group" aria-label="Ansicht">
    <button type="button" data-view="day" aria-pressed="false">Tagesansicht</button>
    <button type="button" data-view="week" aria-pressed="false">Zeitleiste</button>
  </div>`;
}
function setupOverview(container, visits, selectedDate, onSelect){
  let start=selectedDate || dateLocal(new Date());
  function render(){
    container.innerHTML=`<div class="overview-nav">
      <button type="button" class="overview-nav-button" data-overview-step="-7" aria-label="Vorherige 7 Tage">←</button>
      <strong>7 Tage</strong>
      <button type="button" class="overview-nav-button" data-overview-step="7" aria-label="Nächste 7 Tage">→</button>
    </div><p class="overview-hint" aria-hidden="true">← Wischen →</p>${renderWeekOverview(start,visits,new Date(),selectedDate)}`;
  }
  container.addEventListener('click',event=>{
    const nav=event.target.closest('[data-overview-step]');
    if(nav){
      start=shiftDate(start,Number(nav.dataset.overviewStep));
      if(onSelect){selectedDate=start;onSelect(selectedDate);}
      render();
      container.querySelector(`[data-overview-step="${nav.dataset.overviewStep}"]`).focus();
      return;
    }
    const day=event.target.closest('[data-overview-date]');
    if(!day || !onSelect) return;
    selectedDate=day.dataset.overviewDate;
    container.querySelectorAll('[data-overview-date]').forEach(button=>{
      const selected=button.dataset.overviewDate===selectedDate;
      button.classList.toggle('selected',selected);
      button.setAttribute('aria-pressed',String(selected));
    });
    onSelect(selectedDate);
  });
  return date=>{if(date){start=date;selectedDate=date;} render();};
}
function setupViewSwitch(onChange){
  const buttons=app.querySelectorAll('[data-view]');
  function select(view){
    calendarView=view;
    buttons.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.view===view)));
    onChange(view);
  }
  buttons.forEach(button=>button.addEventListener('click',()=>select(button.dataset.view)));
  select(calendarView);
  return select;
}
function renderToday(visits){
  return `<div class="today-switch" role="group" aria-label="Ansicht für heute">
    <button type="button" data-today-view="timeline" aria-pressed="${todayView==='timeline'}"><span aria-hidden="true">☰</span> Tagesverlauf</button>
    <button type="button" data-today-view="clock" aria-pressed="${todayView==='clock'}"><span aria-hidden="true">◷</span> Uhr</button>
  </div>${todayView==='clock' ? renderTodayClock(visits) : renderTimeline(dateLocal(new Date()),visits)}`;
}
function setupTodaySwitch(container,render){
  container.addEventListener('click',event=>{
    const button=event.target.closest('[data-today-view]');
    if(!button) return;
    todayView=button.dataset.todayView;
    render();
    container.querySelector(`[data-today-view="${todayView}"]`).focus();
  });
}
const visitTemplates=[
  {name:t.morning,start:'08:00',end:'10:00'},
  {name:t.lateMorning,start:'10:00',end:'12:00'},
  {name:t.midday,start:'12:00',end:'14:00'},
  {name:t.afternoon,start:'14:00',end:'17:00'},
  {name:t.evening,start:'17:00',end:'19:00'}
];
function templateTimes(name){
  const template=visitTemplates.find(item=>item.name===name);
  return template ? [template.start,template.end] : null;
}

async function home(){
  app.innerHTML=`<section class="create-shell">
    <span class="eyebrow">Sókn</span>
    <h1>Besucherkalender</h1>
    <p>Lege den Kalender für eine Person und ihre Besuchenden an.</p>
    <div class="create-form">
      <label for="circle-name">Name</label>
      <input class="field" id="circle-name" maxlength="80" value="Holgers Kalender" autocomplete="off">
      <button class="button wide" id="create">Kalender erstellen</button>
    </div>
  </section>`;
  document.querySelector('#create').onclick=async()=>{
    const name=document.querySelector('#circle-name').value.trim();
    if(!name)return;
    try{
      const me=await api('/api/me');
      if(!me.id)return loginGate(()=>createCircle(name));
      await createCircle(name);
    }catch(e){app.innerHTML=`<p>${esc(e.message)}</p>`;}
  };
}
async function createCircle(name){
  try{
    const c=await api('/api/circles',{method:'POST',body:JSON.stringify({name})});
    location.href=c.visitor_url;
  }catch(e){app.innerHTML=`<p>${esc(e.message)}</p>`;}
}
async function loginGate(join){
  app.innerHTML=`<section class="join shell-card">
    <span class="join-eyebrow">Sókn · Anmeldung</span>
    <div class="join-photo" aria-label="Besucherkalender">S</div>
    <h1>Melde dich an</h1>
    <p class="join-copy">Wähle einen Zugang für deinen Kalender.</p>
    <div class="providers">
      <button class="button wide provider google" data-provider="google"><span class="provider-icon">G</span><span>Weiter mit Google</span></button>
      <button class="button wide provider microsoft" data-provider="microsoft"><span class="provider-icon">M</span><span>Weiter mit Microsoft 365</span></button>
      <button class="button wide provider apple" data-provider="apple"><span class="provider-icon">●</span><span>Weiter mit Apple</span></button>
      <button class="button wide provider dev" data-provider="dev">${t.loginDev}</button>
    </div>
  </section>`;
  document.querySelectorAll('[data-provider]').forEach(button=>button.onclick=async()=>{
    if(button.dataset.provider==='dev'){
      await api('/auth/dev/login',{method:'POST',body:JSON.stringify({name:'Besucherin',subject:`visitor-${crypto.randomUUID()}`})});
      await join();
    }else{
      location.href=`/auth/${button.dataset.provider}/start?next=${encodeURIComponent(location.pathname)}`;
    }
  });
}
async function joinPage(slug){
  let c;
  try{c=await api(`/api/circles/by-slug/${encodeURIComponent(slug)}`);}catch{return generic();}
  app.innerHTML=`<section class="join shell-card">
    <div class="join-eyebrow">Sókn · Besucherkalender</div>
    <div class="join-photo" aria-label="${esc(c.name)}">${esc(c.name?.charAt(0)||'H')}</div>
    <h1>${esc(c.name)}</h1>
    <p class="join-copy">Melde dich an und bleibe mit deinen Besuchen verbunden.</p>
    <div class="providers">
      <button class="button wide provider google" data-provider="google"><span class="provider-icon">G</span><span>Weiter mit Google</span></button>
      <button class="button wide provider microsoft" data-provider="microsoft"><span class="provider-icon">M</span><span>Weiter mit Microsoft 365</span></button>
      <button class="button wide provider apple" data-provider="apple"><span class="provider-icon">●</span><span>Weiter mit Apple</span></button>
      <button class="button wide provider dev" data-provider="dev">${t.loginDev}</button>
    </div>
  </section>`;
  document.querySelectorAll('[data-provider]').forEach(button=>{
    button.onclick=async()=>{
      if(button.dataset.provider==='dev'){
        await api('/auth/dev/login',{method:'POST',body:JSON.stringify({name:'Besucherin',subject:`visitor-${crypto.randomUUID()}`})});
        await api(`/api/circles/by-slug/${slug}/join`,{method:'POST'});
        location.href=`/c/${slug}`;
      }else{
        location.href=`/auth/${button.dataset.provider}/start?next=/c/${slug}`;
      }
    };
  });
  if(c.role) location.href=`/c/${slug}`;
}
function generic(){
  app.innerHTML=`<section class="card"><h1>Nicht gefunden</h1><p>Dieser Link ist nicht verfügbar.</p></section>`;
}

async function adminPage(visitorSlug,adminSlug){
  let c;
  try{c=await api(`/api/circles/by-admin/${encodeURIComponent(adminSlug)}`);}catch{return generic();}
  let members=[];
  try{members=(await api(`/api/circles/${c.id}/members`)).members;}catch(e){return generic();}
  app.innerHTML=`<section class="visitor-shell">
    <div class="circle-heading"><div><span class="eyebrow">Verwaltung</span><h1>${esc(c.name)}</h1></div><div class="avatar">A</div></div>
    <div class="admin-grid">
      <section class="card"><h2>Teilnehmende</h2><div id="members">${members.map(m=>`
        <div class="member-row"><div class="avatar">${esc(m.display_name?.[0]||'?')}</div><strong>${esc(m.display_name)}</strong>
        <button class="button danger" data-ban="${esc(m.id)}" ${m.role==='admin'?'disabled':''}>Sperren</button></div>`).join('')}</div></section>
      <section class="card"><h2>Tablet verbinden</h2><p>Erzeuge einen Einmal-Link für das Schreib-tablet.</p>
        <button class="button wide" id="pair">Einmal-Link erstellen</button><div id="pair-result"></div></section>
      <section class="card"><h2>Links erneuern</h2><p>Neue Einladungslinks ungültig machen alte Links für neue Beitritte.</p>
        <button class="button wide" id="rotate">Links erneuern</button><div id="rotate-result"></div></section>
    </div>
  </section>`;
  document.querySelectorAll('[data-ban]').forEach(button=>button.onclick=async()=>{
    if(!confirm('Diese Person für diesen Kalender sperren?'))return;
    await api(`/api/circles/${c.id}/members/${button.dataset.ban}/block`,{method:'POST'});
    adminPage(visitorSlug,adminSlug);
  });
  document.querySelector('#pair').onclick=async()=>{
    const pairing=await api(`/api/circles/${c.id}/pairings`,{method:'POST'});
    document.querySelector('#pair-result').innerHTML=`<p><strong>Einmal-Link:</strong><br><a href="${esc(pairing.pairing_url)}">${esc(location.origin+pairing.pairing_url)}</a></p>`;
  };
  document.querySelector('#rotate').onclick=async()=>{
    if(!confirm('Alle alten Links ersetzen? Bestehende Teilnehmende bleiben verbunden.'))return;
    const links=await api(`/api/circles/${c.id}/admin/rotate`,{method:'POST'});
    document.querySelector('#rotate-result').innerHTML=`<p>Besucher: <a href="${esc(links.visitor_url)}">${esc(location.origin+links.visitor_url)}</a></p>`;
  };
}

let visitState={date:'',time:'',template:'',note:''};
async function circlePage(slug,selectedDate){
  let c;
  try{c=await api(`/api/circles/by-slug/${encodeURIComponent(slug)}`);}catch{return generic();}
  if(!c.role){return joinPage(slug);}
  let data;
  try{data=await api(`/api/circles/${c.id}/visits`);localStorage.setItem(`sokn-visits-${c.id}`,JSON.stringify(data.visits));}
  catch(e){data={visits:JSON.parse(localStorage.getItem(`sokn-visits-${c.id}`)||'[]')};}
  renderVisitor(c,data.visits,selectedDate);
}
function renderVisitor(c,visits,selectedDate){
  visibleVisits=visits;
  let selected=selectedDate||dateLocal(new Date());
  app.innerHTML=`<section class="visitor-shell">
    <div class="circle-heading"><div><span class="eyebrow">Besucherkalender</span><h1>${esc(c.name)}</h1></div><button class="button profile-button" id="profile">Mein Profil</button></div>
    <section class="horizon-card" aria-label="Tage auswählen">
      <div id="next-visit" class="next-visit"></div>
      ${viewSwitch()}
      <div class="horizon-rail" id="horizon-rail"></div>
    </section>
    <section class="day-panel" tabindex="-1">
      <div class="day-title" id="day-title"></div>
      <div id="day-visits"></div>
    </section>
    <section class="overview-panel" id="week-overview" aria-label="Übersicht über sieben Tage" hidden></section>
  </section><button class="fab" id="fab">＋ ${t.coming}</button>`;
  refreshNextVisit=setupUpcoming(app.querySelector('#next-visit'),visits,date=>{
    selectDay(date);
    selectView('day');
    const day=app.querySelector('.day-panel');
    day.scrollIntoView({block:'start'});
    day.focus({preventScroll:true});
  });
  function renderHorizon(){
    const todayDate=dateLocal(new Date());
    const tomorrow=shiftDate(todayDate,1), yesterday=shiftDate(todayDate,-1);
    refreshNextVisit();

    document.querySelector('#horizon-rail').innerHTML=horizonDates(todayDate,selected).map(id=>{
      const d=new Date(`${id}T12:00:00`);
      const dayVisits=visits.filter(v=>v.date===id);
      const isToday=id===todayDate;
      const relative=isToday?'Heute':id===tomorrow?'Morgen':id===yesterday?'Gestern':d.toLocaleDateString('de-DE',{weekday:'short'});
      const night=dayVisits.some(v=>v.start_time<'06:00'||v.start_time>='22:00');
      const morning=dayVisits.some(v=>v.start_time>='06:00'&&v.start_time<'12:00');
      const midday=dayVisits.some(v=>v.start_time>='12:00'&&v.start_time<'14:00');
      const afternoon=dayVisits.some(v=>v.start_time>='14:00'&&v.start_time<'17:00');
      const evening=dayVisits.some(v=>v.start_time>='17:00'&&v.start_time<'22:00');
      return `<button class="horizon-day ${isToday?'today':''} ${id===selected?'selected':''}" data-date="${id}" aria-label="${esc(naturalDate(id))}" aria-pressed="${id===selected}">
        <span class="horizon-relative">${esc(relative)}</span>
        <strong>${d.getDate()}</strong>
        <span class="day-phases">${night?'<i class="phase evening" title="Nacht">☾</i>':''}${morning?'<i class="phase morning" title="Morgen oder Vormittag">◐</i>':''}${midday?'<i class="phase midday" title="Mittag">☀</i>':''}${afternoon?'<i class="phase afternoon" title="Nachmittag">●</i>':''}${evening?'<i class="phase evening" title="Abend">◒</i>':''}</span>
        ${dayVisits.length?`<span class="horizon-count">${dayVisits.length}</span>`:''}
      </button>`;
    }).join('');
    document.querySelectorAll('.horizon-day').forEach(b=>b.onclick=()=>selectDay(b.dataset.date));
    scrollHorizon();
  }
  function scrollHorizon(){
    requestAnimationFrame(()=>{
      const rail=app.querySelector('#horizon-rail');
      if(!rail || rail.hidden) return;
      const todayButton=rail.querySelector('.today');
      const tomorrow=shiftDate(dateLocal(new Date()),1);
      const target=rail.querySelector('.selected:not(.today)') || rail.querySelector(`[data-date="${tomorrow}"]`) || rail.querySelector('.horizon-day:not(.today)');
      if(todayButton && target){
        rail.scrollLeft=0;
        const gap=parseFloat(getComputedStyle(rail).columnGap) || 0;
        rail.scrollLeft=target.getBoundingClientRect().left-todayButton.getBoundingClientRect().right-gap;
      }
    });
  }
  function selectDay(date){
      selected=date;
      const today=dateLocal(new Date());
      const tomorrow=shiftDate(today,1);
      if(!app.querySelector(`.horizon-day[data-date="${selected}"]`) || (selected===today && !app.querySelector(`.horizon-day[data-date="${tomorrow}"]`))) renderHorizon();
      document.querySelectorAll('.horizon-day').forEach(day=>{
        const isSelected=day.dataset.date===selected;
        day.classList.toggle('selected',isSelected);
        day.setAttribute('aria-pressed',String(isSelected));
      });
      renderDay();
      if(selected===today) scrollHorizon();
  }
  function renderDay(){
    document.querySelector('#day-title').innerHTML=`<h2>${esc(naturalDate(selected))}</h2>`;
    const rows=visits.filter(v=>v.date===selected);
    document.querySelector('#day-visits').innerHTML=selected===dateLocal(new Date()) ? renderToday(rows) : renderTimeline(selected,rows);
  }
  setupTodaySwitch(app.querySelector('#day-visits'),renderDay);
  renderHorizon();renderDay();
  const overview=app.querySelector('#week-overview');
  const renderOverview=setupOverview(overview,visits,selected,selectDay);
  const selectView=setupViewSwitch(view=>{
    const week=view==='week';
    app.querySelector('#horizon-rail').hidden=week;
    app.querySelector('.day-panel').hidden=week;
    overview.hidden=!week;
    if(week) renderOverview(selected);
    else scrollHorizon();
  });
  document.querySelector('#fab').onclick=()=>visitorFlow(c,selected);
  document.querySelector('#profile').onclick=()=>profilePage(c,selected);
}
async function profilePage(c,selectedDate){
  let me;
  try{me=await api('/api/me');}catch(e){alert(`Profil konnte nicht geladen werden: ${e.message}`);return;}
  back.hidden=false;
  app.innerHTML=`<section class="booking-card"><h1>Mein Profil</h1>
    <p>Dieses Foto sehen die Menschen in deinen Kalendern.</p>
    ${renderPeople([{display_name:me.name,avatar_url:me.avatar}])}
    <label class="booking-field" for="profile-name">Name
      <input class="field" id="profile-name" maxlength="80" value="${esc(me.name)}" autocomplete="name">
    </label>
    <button class="button wide" id="save-name">Name speichern</button>
    <label class="booking-field" for="profile-photo">Foto auswählen
      <input class="field" id="profile-photo" type="file" accept="image/*">
    </label>
    <button class="button wide" id="save-photo">Foto speichern</button>
    <button class="button wide photo-remove" id="remove-photo">Hochgeladenes Foto entfernen</button>
    <p id="profile-message" role="status"></p>
  </section>`;
  back.onclick=()=>{back.hidden=true;circlePage(location.pathname.split('/')[2],selectedDate);};
  const message=document.querySelector('#profile-message');
  document.querySelector('#save-name').onclick=async()=>{
    const name=document.querySelector('#profile-name').value.trim();
    if(!name){message.textContent='Bitte einen Namen eingeben.';return;}
    try{await api('/api/profile',{method:'PUT',body:JSON.stringify({name})});profilePage(c,selectedDate);}
    catch(e){message.textContent=`Name konnte nicht gespeichert werden: ${e.message}`;}
  };
  document.querySelector('#save-photo').onclick=async()=>{
    const file=document.querySelector('#profile-photo').files[0];
    if(!file){message.textContent='Bitte zuerst ein Foto auswählen.';return;}
    try{
      const photo=await preparePhoto(file);
      await api('/api/profile/photo',{method:'PUT',body:JSON.stringify({photo})});
      message.textContent='Foto gespeichert.';
      profilePage(c,selectedDate);
    }catch(e){message.textContent=`Foto konnte nicht gespeichert werden: ${e.message}`;}
  };
  document.querySelector('#remove-photo').onclick=async()=>{
    try{await api('/api/profile/photo',{method:'DELETE'});profilePage(c,selectedDate);}
    catch(e){message.textContent=`Foto konnte nicht entfernt werden: ${e.message}`;}
  };
}
async function visitorFlow(c,selectedDate){
  let people;
  try{people=await api(`/api/circles/${c.id}/people`);}
  catch(e){alert(`Personen konnten nicht geladen werden: ${e.message}`);return;}
  visitState={date:selectedDate,time:'',template:'',note:''};
  let customTime=false;
  back.hidden=false;
  function timeStep(){
    app.innerHTML=`<section class="booking-card">
      <h1>${t.time}</h1>
      <p class="booking-date" id="booking-date">${esc(naturalDate(visitState.date))}</p>
      <div class="chip-row">${visitTemplates.map(({name,start,end})=>{
        return `<button class="chip booking-time" data-template="${esc(name)}" aria-pressed="false"><strong>${esc(name)}</strong><span>${start}–${end}</span></button>`;
      }).join('')}
        <button class="chip booking-time" id="custom-time" aria-pressed="false"><strong>Eigene Uhrzeit</strong><span>Beginn und Ende wählen</span></button>
      </div>
      <div class="custom-time-fields" id="custom-time-fields" hidden>
        <label for="start-time">Beginn
          <input class="field" id="start-time" type="time" step="1800" value="09:00" aria-describedby="time-error" required>
        </label>
        <label for="end-time">Ende
          <input class="field" id="end-time" type="time" step="1800" value="10:00" aria-describedby="time-error" required>
        </label>
        <p class="booking-error" id="time-error" role="status" hidden></p>
      </div>
      <fieldset class="participant-picker">
        <legend>Wer kommt mit?</legend>
        <p>Du bist automatisch dabei. Wähle weitere Personen aus.</p>
        <h3>Personen mit Konto</h3>
        <p>Wähle Personen, die diesem Kalender bereits beigetreten sind.</p>
        <div id="member-list" class="participant-list"></div>
        <h3>Weitere Personen</h3>
        <p>Zum Beispiel Kinder oder Personen, die noch nicht im Kalender sind. Diese Einträge sind nicht mit einem Konto verbunden.</p>
        <div id="companion-list" class="participant-list"></div>
        <button class="button add-person" type="button" id="add-person">＋ Weitere Person hinzufügen</button>
        <div id="companion-form" class="companion-form" hidden>
          <label for="companion-name">Name
            <input class="field" id="companion-name" maxlength="80" autocomplete="off">
          </label>
          <label for="companion-photo">Foto (optional)
            <input class="field" id="companion-photo" type="file" accept="image/*">
          </label>
          <label class="remove-companion-photo" id="remove-companion-label" hidden><input type="checkbox" id="remove-companion-photo"> Foto entfernen</label>
          <button class="button" type="button" id="save-companion">Person speichern</button>
          <p id="companion-error" role="status"></p>
        </div>
      </fieldset>
      <label class="booking-field" for="other-date">Datum ändern (optional)
        <input class="field" id="other-date" type="date" value="${esc(visitState.date)}" required>
      </label>
      <label class="booking-field" for="note">${t.note} (optional)
        <input class="field" id="note" maxlength="280">
      </label>
      <button class="button wide step" id="save" disabled>${t.done}</button>
    </section>`;
    const dateInput=document.querySelector('#other-date');
    const startInput=document.querySelector('#start-time');
    const endInput=document.querySelector('#end-time');
    const customButton=document.querySelector('#custom-time');
    const customFields=document.querySelector('#custom-time-fields');
    const timeError=document.querySelector('#time-error');
    const saveButton=document.querySelector('#save');
    const selectedPeople=new Set();
    let editingCompanion=null;
    function openCompanionForm(person=null){
      editingCompanion=person;
      document.querySelector('#companion-name').value=person?.display_name || '';
      document.querySelector('#companion-photo').value='';
      document.querySelector('#remove-companion-photo').checked=false;
      document.querySelector('#remove-companion-label').hidden=!person?.avatar_url;
      document.querySelector('#companion-error').textContent='';
      document.querySelector('#companion-form').hidden=false;
      document.querySelector('#companion-name').focus();
    }
    function renderParticipants(){
      function renderOptions(options,type){
        return options.map(p=>{
          const key=`${type}:${p.id}`;
          return `<div class="participant-wrap"><label class="participant-option"><input type="checkbox" data-person-type="${esc(type)}" data-person-id="${esc(p.id)}" ${selectedPeople.has(key)?'checked':''}>${renderPeople([p])}</label>${type==='companion'?`<button class="edit-person" type="button" data-edit-person="${esc(p.id)}">Bearbeiten</button>`:''}</div>`;
        }).join('');
      }
      const members=people.members.filter(p=>p.id!==people.me);
      document.querySelector('#member-list').innerHTML=members.length
        ? renderOptions(members,'user')
        : '<p>Noch niemand anderes ist beigetreten. Teile den Kalender-Link, damit weitere Personen hier erscheinen.</p>';
      document.querySelector('#companion-list').innerHTML=renderOptions(people.companions,'companion');
      document.querySelectorAll('[data-person-id]').forEach(input=>input.onchange=()=>{
        const key=`${input.dataset.personType}:${input.dataset.personId}`;
        if(input.checked) selectedPeople.add(key); else selectedPeople.delete(key);
      });
      document.querySelectorAll('[data-edit-person]').forEach(button=>button.onclick=()=>{
        openCompanionForm(people.companions.find(p=>p.id===button.dataset.editPerson));
      });
    }
    renderParticipants();
    document.querySelector('#add-person').onclick=()=>{
      const form=document.querySelector('#companion-form');
      if(!form.hidden && !editingCompanion) form.hidden=true;
      else openCompanionForm();
    };
    document.querySelector('#save-companion').onclick=async()=>{
      const name=document.querySelector('#companion-name').value.trim();
      const file=document.querySelector('#companion-photo').files[0];
      const error=document.querySelector('#companion-error');
      if(!name){error.textContent='Bitte einen Namen eingeben.';return;}
      const button=document.querySelector('#save-companion');
      button.disabled=true;
      try{
        const photo=file ? await preparePhoto(file) : null;
        const url=`/api/circles/${c.id}/companions${editingCompanion?`/${editingCompanion.id}`:''}`;
        const person=await api(url,{method:editingCompanion?'PUT':'POST',body:JSON.stringify({name,photo,remove_photo:document.querySelector('#remove-companion-photo').checked})});
        if(editingCompanion){
          const index=people.companions.findIndex(p=>p.id===editingCompanion.id);
          people.companions[index]=person;
        }else{
          people.companions.push(person);selectedPeople.add(`companion:${person.id}`);
        }
        renderParticipants();
        document.querySelector('#companion-form').hidden=true;
        document.querySelector('#companion-name').value='';
        document.querySelector('#companion-photo').value='';
        error.textContent='';
      }catch(e){error.textContent=`Person konnte nicht hinzugefügt werden: ${e.message}`;}
      finally{button.disabled=false;}
    };
    function updateCustomTime(){
      const valid=isValidTimeRange(startInput.value,endInput.value);
      const startIsValid=startInput.validity.valid;
      const endIsValid=endInput.validity.valid;
      timeError.hidden=valid;
      timeError.textContent=startIsValid && endIsValid
        ? 'Das Ende muss nach dem Beginn am selben Tag liegen.'
        : 'Bitte Beginn und Ende im 30-Minuten-Raster wählen.';
      startInput.setAttribute('aria-invalid',String(!startIsValid));
      endInput.setAttribute('aria-invalid',String(!endIsValid || (startIsValid && !valid)));
      saveButton.disabled=!valid;
    }
    startInput.addEventListener('input',updateCustomTime);
    endInput.addEventListener('input',updateCustomTime);
    customButton.onclick=()=>{
      if(!customTime && visitState.time && visitState.end){
        startInput.value=visitState.time;
        endInput.value=visitState.end;
      }
      customTime=true;
      visitState.template='';
      app.querySelectorAll('[data-template]').forEach(x=>{
        x.classList.remove('selected');
        x.setAttribute('aria-pressed','false');
      });
      customButton.classList.add('selected');
      customButton.setAttribute('aria-pressed','true');
      customFields.hidden=false;
      updateCustomTime();
    };
    dateInput.addEventListener('input',()=>{
      if(dateInput.value){
        visitState.date=dateInput.value;
        document.querySelector('#booking-date').textContent=naturalDate(visitState.date);
      }
    });
    app.querySelectorAll('[data-template]').forEach(b=>b.onclick=()=>{
      app.querySelectorAll('[data-template]').forEach(x=>{
        const isSelected=x===b;
        x.classList.toggle('selected',isSelected);
        x.setAttribute('aria-pressed',String(isSelected));
      });
      customTime=false;
      customButton.classList.remove('selected');
      customButton.setAttribute('aria-pressed','false');
      customFields.hidden=true;
      visitState.template=b.dataset.template;const [s,e]=templateTimes(visitState.template);visitState.time=s;visitState.end=e;
      saveButton.disabled=false;
    });
    saveButton.onclick=async()=>{
      if(!dateInput.reportValidity())return;
      if(customTime && !isValidTimeRange(startInput.value,endInput.value)){
        updateCustomTime();
        return;
      }
      visitState.date=dateInput.value;
      visitState.note=document.querySelector('#note').value;
      const [start,end]=customTime ? [startInput.value,endInput.value] : templateTimes(visitState.template);
      const participants=[...selectedPeople].map(key=>{const [type,id]=key.split(':');return {type,id};});
      try{await api(`/api/circles/${c.id}/visits`,{method:'POST',body:JSON.stringify({date:visitState.date,start_time:start,end_time:end,template:visitState.template,note:visitState.note,participants})});back.hidden=true;circlePage(location.pathname.split('/')[2],visitState.date);}
      catch(e){alert(e.message);}
    };
  }
  back.onclick=()=>{back.hidden=true;circlePage(location.pathname.split('/')[2],visitState.date);};
  timeStep();
}

async function holgerPage(slug){
  let c;
  try{c=await api(`/api/circles/by-slug/${encodeURIComponent(slug)}`);}catch{return generic();}
  try{
    const device=await api(`/api/circles/${c.id}/device`);
    const data=await api(`/api/circles/${c.id}/visits`);
    renderHolger(c,data.visits);
  }catch{return joinPage(slug);}
}
function renderHolger(c,visits){
  visibleVisits=visits;
  app.innerHTML=`<section class="hero-card card" id="next-visit"></section>
    ${viewSwitch()}
    <div id="holger-day-view">
    <section class="holger-day today" data-day="${dateLocal(new Date())}" tabindex="-1"><h2>Heute</h2><div id="today-visits"></div></section>
    <section class="holger-horizon" aria-label="Besuche der nächsten zwei Wochen">
      ${Array.from({length:14},(_,i)=>{
        const d=new Date();d.setDate(d.getDate()+i);const id=dateLocal(d);
        const dayVisits=visits.filter(v=>v.date===id);
        if(!dayVisits.length||i===0)return '';
        return `<article class="holger-day" data-day="${id}" tabindex="-1">
          <div class="holger-relative">${i===0?'Heute':i===1?'Morgen':esc(d.toLocaleDateString('de-DE',{weekday:'long'}))}</div>
          ${renderTimeline(id,dayVisits)}
        </article>`;
      }).join('')}
    </section></div>
    <section class="overview-panel" id="week-overview" aria-label="Übersicht über sieben Tage" hidden></section>`;
  const todayContainer=app.querySelector('#today-visits');
  const renderTodaySection=()=>{todayContainer.innerHTML=renderToday(visits.filter(v=>v.date===dateLocal(new Date())));};
  setupTodaySwitch(todayContainer,renderTodaySection);
  renderTodaySection();
  const overview=app.querySelector('#week-overview');
  const renderOverview=setupOverview(overview,visits,null,null);
  const selectView=setupViewSwitch(view=>{
    const week=view==='week';
    app.querySelector('#holger-day-view').hidden=week;
    overview.hidden=!week;
    if(week) renderOverview();
  });
  refreshNextVisit=setupUpcoming(app.querySelector('#next-visit'),visits,date=>{
    selectView('day');
    app.querySelector('.holger-day[data-extra]')?.remove();
    let day=app.querySelector(`.holger-day[data-day="${date}"]`);
    if(!day){
      const horizon=app.querySelector('.holger-horizon');
      horizon.insertAdjacentHTML('beforeend',`<article class="holger-day" data-day="${attr(date)}" data-extra tabindex="-1">
        <div class="holger-relative">${esc(naturalDate(date))}</div>
        ${renderTimeline(date,visits.filter(visit=>visit.date===date))}
      </article>`);
      day=horizon.lastElementChild;
    }
    day.scrollIntoView({block:'start'});
    day.focus({preventScroll:true});
  },true);
  refreshNextVisit();
  localStorage.setItem(`sokn-visits-${c.id}`,JSON.stringify(visits));
}

async function pairingPage(token){
  try{await api(`/api/pair/${token}`,{method:'POST'});const r=await api('/api/me').catch(()=>({id:null}));
  app.innerHTML=`<section class="card"><h1>Tablet verbunden</h1><p>Dieses Tablet zeigt jetzt den Kalender.</p></section>`;
  setTimeout(()=>location.href='/',800);}
  catch{return generic();}
}

function route(){
  refreshNextVisit=()=>{};
  if(path.startsWith('/c/')){
    const parts=path.split('/').filter(Boolean);
    const slug=parts[1];
    if(parts.length>=4&&parts[2]==='admin') return adminPage(slug,parts[3]);
    api('/api/device').then(()=>holgerPage(slug)).catch(()=>circlePage(slug));
  }else if(path.startsWith('/pair/')){
    pairingPage(path.split('/')[2]);
  }else if(path==='/' ){
    api('/api/device').then(async device=>{
      const data=await api(`/api/circles/${device.circle.id}/visits`);
      renderHolger({id:device.circle.id,name:device.circle.name},data.visits);
    }).catch(()=>home());
  }else{
    home();
  }
}

route();
let clockDate=dateLocal(new Date());
setInterval(()=>{
  const now=new Date();
  if(dateLocal(now)!==clockDate){
    clockDate=dateLocal(now);
    route();
    return;
  }
  if(document.querySelector('#next-visit')) refreshNextVisit();
  document.querySelectorAll('.clock-period').forEach(period=>{
    const current=Number(period.dataset.clockPeriod)===Math.floor(now.getHours()/12);
    const label=period.querySelector('.clock-current');
    const hands=period.querySelector('.clock-hands');
    label.hidden=!current;
    hands.toggleAttribute('hidden',!current);
    label.textContent=`Jetzt ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    hands.querySelector('.clock-hour-hand').setAttribute('transform',`rotate(${((now.getHours()%12)*60+now.getMinutes())/2} 140 140)`);
    hands.querySelector('.clock-minute-hand').setAttribute('transform',`rotate(${now.getMinutes()*6} 140 140)`);
  });
  document.querySelectorAll('.day-timeline').forEach(timeline=>{
    const label=timeline.querySelector('.timeline-now-label');
    if (!label) return;
    const time=`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    label.textContent=`Jetzt ${time}`;
    timeline.querySelector('.timeline-overlay').style.setProperty('--position',`${(now.getHours()*60+now.getMinutes())/1440*100}%`);
  });
  document.querySelectorAll('.week-overview').forEach(overview=>{
    const label=overview.querySelector('.overview-now-label');
    if(!label) return;
    label.textContent=`Jetzt ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    overview.style.setProperty('--now-position',`${(now.getHours()*60+now.getMinutes())/1440*100}%`);
  });
}, 60_000);
if('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
