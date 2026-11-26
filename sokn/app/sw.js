const CACHE='sokn-v6';
const CORE=['/','/css/tokens.css','/css/app.css','/js/app.js','/js/i18n.js','/js/timeline.js','/manifest.webmanifest'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)));
});

self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(
    keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))
  )));
});

self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(url.pathname.startsWith('/api/')){
    event.respondWith(fetch(event.request).catch(()=>new Response(
      JSON.stringify({offline:true}),
      {status:503,headers:{'content-type':'application/json'}}
    )));
  }else{
    event.respondWith(fetch(event.request).then(response=>{
      const copy=response.clone();
      caches.open(CACHE).then(cache=>cache.put(event.request,copy));
      return response;
    }).catch(()=>caches.match(event.request)));
  }
});
