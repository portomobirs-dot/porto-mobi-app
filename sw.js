// Cache limitado ao shell publico. Dados pessoais e respostas do Firebase NAO sao salvos aqui.
const CACHE='porto-mobi-shell-v13-layout';
const SHELL=['./index.html','./cliente.html','./motorista.html','./admin.html','./js/common.js','./js/cliente.js','./js/motorista.js','./js/admin.js','./estilo-porto-mobi.css','./logo-porto-mobi.png','./icon-192.png','./icon-512.png','./icon-cliente.svg','./icon-motorista.svg','./icon-motorista-v2.svg','./icon-admin.svg','./icon-admin-v2.svg','./manifest-cliente.webmanifest','./manifest-motorista.webmanifest','./manifest-admin.webmanifest'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const req=event.request;
 if(req.method!=='GET'||new URL(req.url).origin!==self.location.origin)return;
 event.respondWith(fetch(req,{cache:'no-cache'}).then(response=>{
   if(response.ok&&SHELL.some(s=>new URL(s,self.registration.scope).pathname===new URL(req.url).pathname)){
     const copy=response.clone();caches.open(CACHE).then(c=>c.put(req,copy));
   }
   return response;
 }).catch(()=>caches.match(req)));
});