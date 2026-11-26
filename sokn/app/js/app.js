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
  app.innerHTML=`<section class="card"><h1>Sókn</h1><p>Besucherkalender für deinen Kreis.</p>
    <button class="button wide" id="create">Kreis erstellen</button></section>`;
  document.querySelector('#create').onclick=async()=>{
    const name=prompt('Wie heißt der Kreis?','Holgers Kreis');
    if(!name)return;
    try {
      const me=await api('/api/me');
      if(!me.id) return loginGate(()=>createCircle(name));
      await createCircle(name);
    } catch(e){app.innerHTML=`<p>${esc(e.message)}</p>`;}
  };
}
async function createCircle(name){
  try{
    const c=await api('/api/circles',{method:'POST',body:JSON.stringify({name})});
    location.href=c.visitor_url;
  }catch(e){app.innerHTML=`<p>${esc(e.message)}</p>`;}
}
async function loginGate(join){
  app.innerHTML=`<section class="join"><h1>Kreis beitreten</h1><div class="join-photo" aria-label="Holger">H</div>
    <div class="providers"><button class="button" id="dev-login">Mit Entwicklungs-Login</button></div></section>`;
  document.querySelector('#dev-login').onclick=async()=>{
    await api('/auth/dev/login',{method:'POST',body:JSON.stringify({name:'Besucherin',subject:`visitor-${crypto.randomUUID()}`})});
    await join();
  };
}
async function joinPage(slug){
  let c;
  try{c=await api(`/api/circles/by-slug/${encodeURIComponent(slug)}`);}catch{return generic();}
  app.innerHTML=`<section class="join"><h1>${esc(c.name)}</h1><div class="join-photo" aria-label="Holger">H</div>
    <h2>Kreis beitreten</h2><div class="providers"><button class="button" id="join-dev">${t.loginDev}</button></div></section>`;
  document.querySelector('#join-dev').onclick=async()=>{
    const me=await api('/api/me');
    if(!me.id) await api('/auth/dev/login',{method:'POST',body:JSON.stringify({name:'Besucherin',subject:`visitor-${crypto.randomUUID()}`})});
    try{await api(`/api/circles/by-slug/${slug}/join`,{method:'POST'});location.href=`/c/${slug}`;}catch(e){await loginGate(()=>joinPage(slug));}
  };
  if(c.role) location.href=`/c/${slug}`;
}
function generic(){
  app.innerHTML=`<section class="card"><h1>Nicht gefunden</h1><p>Dieser Link ist nicht verfügbar.</p></section>`;
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
  app.innerHTML=`<section><h1>${esc(c.name)}</h1><div id="days"></div></section><button class="fab" id="fab">＋ ${t.coming}</button>`;
  const days=[...new Map(visits.map(v=>[v.date,v])).keys()].sort();
  document.querySelector('#days').innerHTML=days.length?days.map(d=>{
    const row=visits.filter(v=>v.date===d).map(v=>`<div class="visit-row"><div class="avatar">${esc(v.display_name?.[0]||'B')}</div><div><strong>${esc(v.display_name||'Besuch')}</strong><br>${esc(v.start_time)}–${esc(v.end_time)}</div></div>`).join('');
    return `<section class="card step"><h2>${esc(naturalDate(d))}</h2>${row}</section>`;
  }).join(''):`<section class="card"><p>${t.noVisits}</p></section>`;
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
    if(parts.length>=4&&parts[2]==='admin') return generic();
    const slug=parts[1];
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
