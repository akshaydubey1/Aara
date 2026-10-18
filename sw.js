/* Aara service worker — offline support.
   Navigations are network-first (so updates reach users) with a cached
   fallback; static assets are cache-first and filled as they are fetched.
   Bump CACHE when shipping changes that must bypass old cached assets. */
const CACHE="aara-v3";
const ASSETS=["./","./index.html","./sync.js","./manifest.webmanifest","./icon.svg","./icon-192.png","./icon-512.png","./apple-touch-icon.png","./vendor/html2canvas.min.js","./vendor/jspdf.umd.min.js"];

self.addEventListener("install",e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));
});

self.addEventListener("activate",e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});

self.addEventListener("fetch",e=>{
  if(e.request.method!=="GET")return;
  if(e.request.mode==="navigate"){
    e.respondWith(fetch(e.request).then(res=>{
      const copy=res.clone();caches.open(CACHE).then(c=>c.put("./index.html",copy));
      return res;
    }).catch(()=>caches.match("./index.html")));
    return;
  }
  e.respondWith(
    caches.match(e.request).then(hit=>hit||fetch(e.request).then(res=>{
      // cache same-origin assets and opaque responses (e.g. Google Fonts) so they work offline
      if(res&&(res.ok||res.type==="opaque")){
        const copy=res.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));
      }
      return res;
    }).catch(()=>hit))
  );
});
