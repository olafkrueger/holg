import {de as t} from './i18n.js';
import {isValidTimeRange, nextVisit, renderTimeline} from './timeline.js';

const app=document.querySelector('#app');
const back=document.querySelector('#back-button');
const path=location.pathname;
let refreshNextVisit=()=>{};

async function api(url,options={}) {
  const r=await fetch(url,{headers:{'content-type':'application/json'},...options});
  if(!r.ok) throw new Error((await r.json().catch(()=>({error:'error'}))).error||'error');
  return r.json();
}
function esc(s=''){const e=document.createElement('span');e.textContent=s;return e.innerHTML;}
function dateLocal(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function naturalDate(date){
  const d=new Date(`${date}T12:00:00`), today=new Date(), a=dateLocal(today), b=dateLocal(new Date(today.getTime()+86400000));
  if(date===a)return t.today;
  if(date===b)return t.tomorrow;
  return d.toLocaleDateString('de-DE',{weekday:'long',day:'numeric',month:'long'});
}
const visitTemplates=[
  {name:t.morning,start:'07:00',end:'09:00'},
  {name:t.lateMorning,start:'09:00',end:'12:00'},
  {name:t.midday,start:'12:00',end:'14:00'},
  {name:t.afternoon,start:'14:00',end:'18:00'},
  {name:t.evening,start:'18:00',end:'21:00'}
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
  let selected=selectedDate||dateLocal(new Date());
  app.innerHTML=`<section class="visitor-shell">
    <div class="circle-heading"><div><span class="eyebrow">Besucherkalender</span><h1>${esc(c.name)}</h1></div><div class="avatar">${esc(c.name?.charAt(0)||'H')}</div></div>
    <section class="horizon-card" aria-label="Eine Woche zurück bis zwei Wochen voraus">
      <div id="next-visit" class="next-visit"></div>
      <div class="horizon-rail" id="horizon-rail"></div>
    </section>
    <section class="day-panel">
      <div class="day-title" id="day-title"></div>
      <div id="day-visits"></div>
    </section>
  </section><button class="fab" id="fab">＋ ${t.coming}</button>`;
  function updateNextVisit(){
    const future=nextVisit(visits);
    document.querySelector('#next-visit').innerHTML=future?`
      <div class="next-label">Nächster Besuch</div>
      <div class="next-content">
        <div class="next-avatar">${esc(future.display_name?.[0]||'B')}</div>
        <div><strong>${esc(future.display_name||'Besuch')}</strong><span>${esc(naturalDate(future.date))} · ${esc(future.template||`${future.start_time}–${future.end_time}`)}</span></div>
      </div>`:`<div class="next-label">Nächster Besuch</div><div class="next-empty">Kein bevorstehender Besuch</div>`;
  }
  refreshNextVisit=updateNextVisit;
  function renderHorizon(){
    const today=new Date();
    updateNextVisit();

    document.querySelector('#horizon-rail').innerHTML=Array.from({length:21},(_,i)=>{
      const d=new Date(today); d.setDate(today.getDate()+i-7);
      const id=dateLocal(d);
      const dayVisits=visits.filter(v=>v.date===id);
      const isToday=id===dateLocal(today);
      const relative=i===7?'Heute':i===8?'Morgen':i===6?'Gestern':d.toLocaleDateString('de-DE',{weekday:'short'});
      const night=dayVisits.some(v=>v.start_time<'06:00'||v.start_time>='22:00');
      const morning=dayVisits.some(v=>v.start_time>='06:00'&&v.start_time<'12:00');
      const midday=dayVisits.some(v=>v.start_time>='12:00'&&v.start_time<'14:00');
      const afternoon=dayVisits.some(v=>v.start_time>='14:00'&&v.start_time<'18:00');
      const evening=dayVisits.some(v=>v.start_time>='18:00'&&v.start_time<'22:00');
      return `<button class="horizon-day ${isToday?'today':''} ${id===selected?'selected':''}" data-date="${id}" aria-label="${esc(naturalDate(id))}" aria-pressed="${id===selected}">
        <span class="horizon-relative">${esc(relative)}</span>
        <strong>${d.getDate()}</strong>
        <span class="day-phases">${night?'<i class="phase evening" title="Nacht">☾</i>':''}${morning?'<i class="phase morning" title="Morgen oder Vormittag">◐</i>':''}${midday?'<i class="phase midday" title="Mittag">☀</i>':''}${afternoon?'<i class="phase afternoon" title="Nachmittag">●</i>':''}${evening?'<i class="phase evening" title="Abend">◒</i>':''}</span>
        ${dayVisits.length?`<span class="horizon-count">${dayVisits.length}</span>`:''}
      </button>`;
    }).join('');
    document.querySelectorAll('.horizon-day').forEach(b=>b.onclick=()=>{
      selected=b.dataset.date;
      document.querySelectorAll('.horizon-day').forEach(day=>{
        const isSelected=day.dataset.date===selected;
        day.classList.toggle('selected',isSelected);
        day.setAttribute('aria-pressed',String(isSelected));
      });
      renderDay();
    });
    requestAnimationFrame(()=>{
      const rail=document.querySelector('#horizon-rail');
      const todayButton=rail?.querySelector('.today');
      if (rail && todayButton) rail.scrollLeft=todayButton.offsetLeft-rail.offsetLeft-(rail.clientWidth-todayButton.offsetWidth)/2;
    });
  }
  function renderDay(){
    document.querySelector('#day-title').innerHTML=`<h2>${esc(naturalDate(selected))}</h2>`;
    const rows=visits.filter(v=>v.date===selected);
    document.querySelector('#day-visits').innerHTML=renderTimeline(selected,rows);
  }
  renderHorizon();renderDay();
  document.querySelector('#fab').onclick=()=>visitorFlow(c,selected);
}
function visitorFlow(c,selectedDate){
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
      try{await api(`/api/circles/${c.id}/visits`,{method:'POST',body:JSON.stringify({date:visitState.date,start_time:start,end_time:end,template:visitState.template,note:visitState.note})});back.hidden=true;circlePage(location.pathname.split('/')[2],visitState.date);}
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
  const sorted=[...visits].sort((a,b)=>(`${a.date}${a.start_time}`).localeCompare(`${b.date}${b.start_time}`)).filter(v=>v.date>=dateLocal(new Date()));
  const next=nextVisit(sorted);
  app.innerHTML=`<section class="hero-card card"><p>${t.next}</p><h1>${next?esc(next.display_name):t.noVisit}</h1><p class="hero-time">${next?`${esc(naturalDate(next.date))} · ${esc(next.template?.toLowerCase()||`${next.start_time}–${next.end_time}`)}`:''}</p></section>
    <section class="holger-day today"><h2>Heute</h2>${renderTimeline(dateLocal(new Date()),visits.filter(v=>v.date===dateLocal(new Date())))}</section>
    <section class="holger-horizon" aria-label="Besuche der nächsten zwei Wochen">
      ${Array.from({length:14},(_,i)=>{
        const d=new Date();d.setDate(d.getDate()+i);const id=dateLocal(d);
        const dayVisits=visits.filter(v=>v.date===id);
        if(!dayVisits.length||i===0)return '';
        return `<article class="holger-day ${i===0?'today':''}">
          <div class="holger-relative">${i===0?'Heute':i===1?'Morgen':esc(d.toLocaleDateString('de-DE',{weekday:'long'}))}</div>
          ${renderTimeline(id,dayVisits)}
        </article>`;
      }).join('')||`<p>${t.noVisits}</p>`}
    </section>`;
  refreshNextVisit=()=>{
    const upcoming=nextVisit(visits);
    document.querySelector('.hero-card h1').textContent=upcoming?.display_name || t.noVisit;
    document.querySelector('.hero-time').textContent=upcoming
      ? `${naturalDate(upcoming.date)} · ${upcoming.template?.toLowerCase()||`${upcoming.start_time}–${upcoming.end_time}`}` : '';
  };
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
  if(document.querySelector('#next-visit, .hero-card')) refreshNextVisit();
  document.querySelectorAll('.day-timeline').forEach(timeline=>{
    const label=timeline.querySelector('.timeline-now-label');
    if (!label) return;
    const time=`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    label.textContent=`Jetzt ${time}`;
    timeline.querySelector('.timeline-overlay').style.setProperty('--position',`${(now.getHours()*60+now.getMinutes())/1440*100}%`);
  });
}, 60_000);
if('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
