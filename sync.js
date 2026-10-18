/* Aara — optional cloud sync (Supabase). Zero dependencies: talks directly to
   PostgREST and GoTrue over fetch. Loaded lazily by Store.init() only when the
   owner has saved a project URL + anon key under More → Sync across devices.
   All data also stays in localStorage; this is a backup/multi-device layer,
   never the only copy. */
(function(){
"use strict";
const CFGK="aara:cloud",SESK="aara:cloudSession",PENDK="aara:cloudPend";
const NOSYNC=new Set(["cloud","cloudSession","cloudPend"]);
let cfg=null,ses=null,store=null;

function load(){
  try{cfg=JSON.parse(localStorage.getItem(CFGK)||"null")}catch(e){cfg=null}
  try{ses=JSON.parse(localStorage.getItem(SESK)||"null")}catch(e){ses=null}
}
function configured(){return !!(cfg&&cfg.url&&cfg.key)}
function connected(){return configured()&&!!(ses&&ses.token)}
function base(){return cfg.url.replace(/\/+$/,"")}
function headers(extra){const h={apikey:cfg.key,"Content-Type":"application/json"};if(ses&&ses.token)h.Authorization="Bearer "+ses.token;return Object.assign(h,extra||{})}

async function api(path,opts){
  opts=opts||{};opts.headers=headers(opts.headers);
  const r=await fetch(base()+path,opts);
  if(r.status===401&&ses){ses=null;try{localStorage.removeItem(SESK)}catch(e){}if(store){store.db=null}S.mode="device";throw new Error("session expired")}
  if(!r.ok)throw new Error("sync http "+r.status);
  const t=await r.text();return t?JSON.parse(t):null
}

/* Firestore-shaped adapter so Store keeps working unchanged. */
const adapter={
  collection(){return{doc:k=>({
    async get(){const rows=await api("/rest/v1/mill_data?select=v,t&key=eq."+encodeURIComponent(k));const row=rows&&rows[0];return{exists:!!row,data:()=>({v:row?row.v:null,t:row?row.t:0})}},
    async set(o){await api("/rest/v1/mill_data",{method:"POST",headers:{Prefer:"resolution=merge-duplicates"},body:JSON.stringify({uid:ses.user,key:k,v:o.v,t:o.t||Date.now()})})},
    async delete(){await api("/rest/v1/mill_data?key=eq."+encodeURIComponent(k),{method:"DELETE"})}
  })}}
};

/* Last-write-wins merge: pull every key newer on the server, push every key
   newer locally. Per-key granularity means two devices can edit different
   things between syncs without clobbering each other. */
async function pullAll(){
  const rows=await api("/rest/v1/mill_data?select=key,v,t")||[];
  const remote={};rows.forEach(r=>{remote[r.key]=r});
  for(const k in remote){const r=remote[k];
    if((+r.t||0)>store.localT(k)){try{localStorage.setItem("aara:"+k,JSON.stringify(r.v));localStorage.setItem("aarat:"+k,String(+r.t||0))}catch(e){}}}
  const pushes=[];
  for(let i=0;i<localStorage.length;i++){const sk=localStorage.key(i);
    if(!sk||!sk.startsWith("aara:"))continue;const k=sk.slice(5);if(NOSYNC.has(k))continue;
    const lt=store.localT(k),r=remote[k];
    if(!r||lt>(+r.t||0)){try{pushes.push({uid:ses.user,key:k,v:JSON.parse(localStorage.getItem(sk)),t:lt||Date.now()})}catch(e){}}}
  if(pushes.length)await api("/rest/v1/mill_data",{method:"POST",headers:{Prefer:"resolution=merge-duplicates"},body:JSON.stringify(pushes)});
}

async function boot(st){
  load();store=st;
  if(!connected())return"device";
  st.db=adapter;st.uid=ses.user;
  try{await pullAll();S.mode="cloud"}catch(e){st.db=null;S.mode="device";return"device"}
  window.addEventListener("online",()=>{pullAll().catch(()=>{})});
  return"cloud"
}

function saveConfig(url,key){
  cfg={url:String(url||"").trim(),key:String(key||"").trim()};
  if(cfg.url&&!/^https:\/\//.test(cfg.url))throw new Error("url");
  localStorage.setItem(CFGK,JSON.stringify(cfg));
}
async function sendOtp(dest){
  dest=String(dest||"").trim();
  const body=/@/.test(dest)?{email:dest,create_user:true}:{phone:dest,create_user:true};
  const r=await fetch(base()+"/auth/v1/otp",{method:"POST",headers:headers(),body:JSON.stringify(body)});
  if(!r.ok)throw new Error("otp");
  localStorage.setItem(PENDK,dest);
}
async function verify(code){
  const dest=localStorage.getItem(PENDK)||"";
  const body=/@/.test(dest)?{type:"email",email:dest,token:String(code).trim()}:{type:"sms",phone:dest,token:String(code).trim()};
  const r=await fetch(base()+"/auth/v1/verify",{method:"POST",headers:headers(),body:JSON.stringify(body)});
  if(!r.ok)throw new Error("bad code");
  const d=await r.json();
  ses={token:d.access_token,user:d.user&&d.user.id,dest};
  localStorage.setItem(SESK,JSON.stringify(ses));localStorage.removeItem(PENDK);
  if(store){store.db=adapter;store.uid=ses.user}
  S.mode="cloud";
  return ses
}
function disconnect(){
  if(store)store.db=null;ses=null;S.mode="device";
  try{localStorage.removeItem(SESK);localStorage.removeItem(PENDK)}catch(e){}
}

window.AaraSync={boot,pullAll,saveConfig,sendOtp,verify,disconnect,configured,connected,
  config:()=>cfg||{},pending:()=>localStorage.getItem(PENDK)||"",dest:()=>ses&&ses.dest||""};
})();
