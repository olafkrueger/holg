const CACHE='sokn-v1';
const CORE=['/','/css/tokens.css','/css/app.css','/js/app.js','/manifest.webmanifest'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE))));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(u.pathname.startsWith('/api/')) {
    e.respondWith(fetch(e.request).catch(async()=>new Response(JSON.stringify({offline:true}),{status:503,headers:{'content-type':'application/json'}})));
  } else {
    e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));
  }
});
*** Add File: sokn/app/css/tokens.css
:root {
  --md-sys-color-primary:#1d5e66;
  --md-sys-color-on-primary:#fff;
  --md-sys-color-primary-container:#b8ecef;
  --md-sys-color-on-primary-container:#062f34;
  --md-sys-color-secondary:#526f74;
  --md-sys-color-surface:#f7fbfb;
  --md-sys-color-surface-container:#edf4f4;
  --md-sys-color-on-surface:#172425;
  --md-sys-color-outline:#6d7c7d;
  --md-sys-shape-card:28px;
  --md-sys-shape-button:999px;
  --md-sys-shape-chip:8px;
  --md-sys-elevation-1:0 1px 3px rgb(23 36 37 / 10%);
  --md-sys-easing:cubic-bezier(.2,0,0,1);
  --md-sys-typescale-display:clamp(40px,8vw,64px);
  --md-sys-typescale-headline:clamp(28px,5vw,44px);
  --md-sys-typescale-title:22px;
  --md-sys-typescale-body:18px;
}
@media(prefers-color-scheme:dark) {
  :root {
    --md-sys-color-primary:#8bd8de;
    --md-sys-color-on-primary:#00363b;
    --md-sys-color-primary-container:#244f54;
    --md-sys-color-on-primary-container:#b8ecef;
    --md-sys-color-secondary:#b4cbd0;
    --md-sys-color-surface:#101719;
    --md-sys-color-surface-container:#1a2526;
    --md-sys-color-on-surface:#e1ecec;
    --md-sys-color-outline:#9aacab;
  }
}
