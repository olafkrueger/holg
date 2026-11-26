import {de as t} from './i18n.js';

const app=document.querySelector('#app');
const back=document.querySelector('#back-button');
const path=location.pathname;

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
function templateTimes(name){
  return name==='Morgens'?['09:00','12:00']:name==='Nachmittags'?['13:00','17:00']:name==='Abends'?['18:00','21:00']:null;
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
async function circlePage(slug){
  let c;
  try{c=await api(`/api/circles/by-slug/${encodeURIComponent(slug)}`);}catch{return generic();}
  if(!c.role){return joinPage(slug);}
  let data;
  try{data=await api(`/api/circles/${c.id}/visits`);localStorage.setItem(`sokn-visits-${c.id}`,JSON.stringify(data.visits));}
  catch(e){data={visits:JSON.parse(localStorage.getItem(`sokn-visits-${c.id}`)||'[]')};}
  renderVisitor(c,data.visits);
}
function renderVisitor(c,visits){
  let selected=dateLocal(new Date());
  app.innerHTML=`<section class="visitor-shell">
    <div class="circle-heading"><div><span class="eyebrow">Besucherkalender</span><h1>${esc(c.name)}</h1></div><div class="avatar">${esc(c.name?.charAt(0)||'H')}</div></div>
    <div class="week-nav" aria-label="Woche"></div>
    <section class="day-panel">
      <div class="day-title" id="day-title"></div>
      <div id="day-visits"></div>
    </section>
  </section><button class="fab" id="fab">＋ ${t.coming}</button>`;
  function renderWeek(){
    const today=new Date();
    const monday=new Date(today); monday.setDate(today.getDate()-((today.getDay()+6)%7));
    document.querySelector('.week-nav').innerHTML=Array.from({length:7},(_,i)=>{
      const d=new Date(monday); d.setDate(monday.getDate()+i);
      const id=dateLocal(d);
      return `<button class="day-chip ${id===selected?'selected':''}" data-date="${id}">
        <span>${d.toLocaleDateString('de-DE',{weekday:'short'}).replace('.','')}</span>
        <strong>${d.getDate()}</strong>
      </button>`;
    }).join('');
    document.querySelectorAll('.day-chip').forEach(b=>b.onclick=()=>{
      selected=b.dataset.date;renderWeek();renderDay();
    });
  }
  function renderDay(){
    document.querySelector('#day-title').innerHTML=`<h2>${esc(naturalDate(selected))}</h2>`;
    const rows=visits.filter(v=>v.date===selected);
    document.querySelector('#day-visits').innerHTML=rows.length?rows.map(v=>`
      <article class="visit-row"><div class="avatar">${esc(v.display_name?.[0]||'B')}</div>
      <div class="visit-info"><strong>${esc(v.display_name||'Besuch')}</strong><span>${esc(v.template||`${v.start_time}–${v.end_time}`)}</span></div>
      <span class="time-chip">${esc(v.start_time)}–${esc(v.end_time)}</span></article>`).join(''):
      `<article class="empty-day"><span aria-hidden="true">☀</span><strong>Heute ist noch frei</strong><p>Du kannst einen Besuch ankündigen.</p></article>`;
  }
  renderWeek();renderDay();
  document.querySelector('#fab').onclick=()=>visitorFlow(c);
}
function visitorFlow(c){
  visitState={date:'',time:'',template:'',note:''};
  const today=new Date();
  back.hidden=false;
  function dayStep(){
    app.innerHTML=`<section><h1>${t.day}</h1><div class="chip-row">${[0,1,2,3,4,5,6].map(n=>{
      const d=new Date(today.getTime()+n*86400000), id=dateLocal(d);
      return `<button class="chip" data-date="${id}">${esc(naturalDate(id))}</button>`;
    }).join('')}</div></section>`;
    app.querySelectorAll('[data-date]').forEach(b=>b.onclick=()=>{visitState.date=b.dataset.date;timeStep();});
  }
  function timeStep(){
    app.innerHTML=`<section><h1>${t.time}</h1><div class="chip-row">${['Morgens','Nachmittags','Abends'].map(x=>`<button class="chip" data-template="${x}">${esc(t[x==='Morgens'?'morning':x==='Nachmittags'?'afternoon':'evening'])}</button>`).join('')}</div><label><p>${t.note}</p><input class="field" id="note" maxlength="280"></label><button class="button wide step" id="save">${t.done}</button></section>`;
    app.querySelectorAll('[data-template]').forEach(b=>b.onclick=()=>{
      app.querySelectorAll('[data-template]').forEach(x=>x.classList.remove('selected'));b.classList.add('selected');
      visitState.template=b.dataset.template;const [s,e]=templateTimes(visitState.template);visitState.time=s;visitState.end=e;
    });
    document.querySelector('#save').onclick=async()=>{
      visitState.note=document.querySelector('#note').value;
      if(!visitState.template)visitState.template='Nachmittags';
      const [start,end]=templateTimes(visitState.template)||['14:00','16:00'];
      try{await api(`/api/circles/${c.id}/visits`,{method:'POST',body:JSON.stringify({date:visitState.date,start_time:start,end_time:end,template:visitState.template,note:visitState.note})});back.hidden=true;circlePage(location.pathname.split('/')[2]);}
      catch(e){alert(e.message);}
    };
  }
  back.onclick=()=>{back.hidden=true;circlePage(location.pathname.split('/')[2]);};
  dayStep();
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
  const next=sorted[0];
  app.innerHTML=`<section class="hero-card card"><p>${t.next}</p><h1>${next?esc(next.display_name):t.noVisit}</h1><p>${next?`${esc(naturalDate(next.date))}, ${esc(next.template?.toLowerCase()||`${next.start_time}–${next.end_time}`)}`:''}</p></section>
    <h2>${t.following||'Folgende Tage'}</h2><div>${sorted.slice(1).map(v=>`<div class="visit-row"><div class="avatar">${esc(v.display_name?.[0]||'B')}</div><div><strong>${esc(v.display_name)}</strong><br>${esc(naturalDate(v.date))}, ${esc(v.start_time)}–${esc(v.end_time)}</div></div>`).join('')||`<p>${t.noVisits}</p>`}</div>`;
  localStorage.setItem(`sokn-visits-${c.id}`,JSON.stringify(visits));
}

async function pairingPage(token){
  try{await api(`/api/pair/${token}`,{method:'POST'});const r=await api('/api/me').catch(()=>({id:null}));
  app.innerHTML=`<section class="card"><h1>Tablet verbunden</h1><p>Dieses Tablet zeigt jetzt den Kalender.</p></section>`;
  setTimeout(()=>location.href='/',800);}
  catch{return generic();}
}

function route(){
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
if('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
