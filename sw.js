/* Aara service worker — offline support.
   Cache-first for the app shell; same-origin GETs are cached as they are fetched.
   Bump CACHE when shipping changes that must bypass old cached assets. */
const CACHE="aara-v1";
const ASSETS=["./","./index.html","./manifest.webmanifest","./icon.svg","./icon-192.png","./icon-512.png","./apple-touch-icon.png"];

self.addEventListener("install",e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));
});

self.addEventListener("activate",e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});

self.addEventListener("fetch",e=>{
  if(e.request.method!=="GET")return;
  e.respondWith(
    caches.match(e.request).then(hit=>hit||fetch(e.request).then(res=>{
      if(res.ok&&new URL(e.request.url).origin===location.origin){
        const copy=res.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));
      }
      return res;
    }).catch(()=>hit))
  );
});
