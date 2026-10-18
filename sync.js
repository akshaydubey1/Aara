/* Aara — optional cloud sync (Supabase). Zero dependencies: talks directly to
   PostgREST and GoTrue over fetch. Loaded lazily by Store.init() only when the
   owner has saved a project URL + anon key under More → Sync across devices.
   All data also stays in localStorage; this is a backup/multi-device layer,
   never the only copy.

   Model: one mill = one mill_id (the owner's user id). Everyone who signs in
   gets their own mill as 'owner'; partners and munshis join someone else's
   mill with a single-use invite code — joining adopts the mill's data instead
   of pushing local data over it. Mill records are per-item keys (ord_, per_,
   cus_, stk_…), so merges are last-write-wins per record; the server stamps
   each write with its own clock, tombstones propagate deletes, and attendance
   marks travel as per-day keys. */
(function(){
"use strict";
const CFGK="aara:cloud",SESK="aara:cloudSession",PENDK="aara:cloudPend";
const NOSYNC=new Set(["cloud","cloudSession","cloudPend","lang","accounts"]);
const NOSYNC_PRE=["fail_"];   // device-local key families
const skipKey=k=>NOSYNC.has(k)||NOSYNC_PRE.some(p=>k.startsWith(p));
let cfg=null,ses=null,store=null,mill=null;

function load(){
  try{cfg=JSON.parse(localStorage.getItem(CFGK)||"null")}catch(e){cfg=null}
  try{ses=JSON.parse(localStorage.getItem(SESK)||"null")}catch(e){ses=null}
}
function configured(){return !!(cfg&&cfg.url&&cfg.key)}
function connected(){return configured()&&!!(ses&&ses.token)}
function base(){return cfg.url.replace(/\/+$/,"")}
function headers(extra){const h={apikey:cfg.key,"Content-Type":"application/json"};if(ses&&ses.token)h.Authorization="Bearer "+ses.token;return Object.assign(h,extra||{})}
function dropSession(){ses=null;mill=null;try{localStorage.removeItem(SESK)}catch(e){}if(store){store.db=null}S.mode="device";S.role="owner"}

/* GoTrue access tokens live ~1 hour — keep the refresh token and renew
   silently so a mill does not have to re-login with OTP every session. */
async function refresh(){
  const r=await fetch(base()+"/auth/v1/token?grant_type=refresh_token",{method:"POST",headers:{apikey:cfg.key,"Content-Type":"application/json"},body:JSON.stringify({refresh_token:ses.refresh})});
  if(!r.ok){dropSession();throw new Error("session expired")}
  const d=await r.json();
  ses.token=d.access_token;if(d.refresh_token)ses.refresh=d.refresh_token;
  ses.exp=Date.now()+(+(d.expires_in)||3600)*1000;
  try{localStorage.setItem(SESK,JSON.stringify(ses))}catch(e){}
}

async function api(path,opts,retried){
  if(ses&&ses.refresh&&ses.exp&&Date.now()>ses.exp-3e4){try{await refresh()}catch(e){}}
  opts=opts||{};opts.headers=headers(opts.headers);
  const r=await fetch(base()+path,opts);
  if(r.status===401){
    if(!retried&&ses&&ses.refresh){try{await refresh();return api(path,opts,true)}catch(e){}}
    if(ses)dropSession();
    throw new Error("session expired")}
  if(!r.ok)throw new Error("sync http "+r.status);
  const t=await r.text();return t?JSON.parse(t):null
}

/* Resolve which mill this user syncs: the mill they last joined (stored on
   the session), else their earliest membership, else a fresh mill they own. */
async function ensureMembership(){
  const rows=await api("/rest/v1/mill_members?select=mill_id,role,created_at&uid=eq."+encodeURIComponent(ses.user)+"&order=created_at")||[];
  if(!rows.length){
    await api("/rest/v1/mill_members",{method:"POST",headers:{Prefer:"resolution=merge-duplicates"},body:JSON.stringify({mill_id:ses.user,uid:ses.user,role:"owner"})});
    mill={id:ses.user,role:"owner"};
  }else{
    const pick=ses.mill&&rows.find(r=>r.mill_id===ses.mill)||rows[0];
    mill={id:pick.mill_id,role:pick.role};
  }
  ses.mill=mill.id;try{localStorage.setItem(SESK,JSON.stringify(ses))}catch(e){}
  S.role=mill.role;
}

/* Firestore-shaped adapter so Store keeps working unchanged. */
const adapter={
  collection(){return{doc:k=>({
    async get(){const rows=await api("/rest/v1/mill_data?select=v,t&mill_id=eq."+encodeURIComponent(mill.id)+"&key=eq."+encodeURIComponent(k));const row=rows&&rows[0];return{exists:!!row,data:()=>({v:row?row.v:null,t:row?row.t:0})}},
    async set(o){await api("/rest/v1/mill_data",{method:"POST",headers:{Prefer:"resolution=merge-duplicates"},body:JSON.stringify({mill_id:mill.id,key:k,v:o.v,t:o.t||Date.now()})})},
    async delete(){await api("/rest/v1/mill_data?mill_id=eq."+encodeURIComponent(mill.id)+"&key=eq."+encodeURIComponent(k),{method:"DELETE"})}
  })}},
  async batch(kvs){if(!kvs.length)return;
    await api("/rest/v1/mill_data",{method:"POST",headers:{Prefer:"resolution=merge-duplicates"},
      body:JSON.stringify(kvs.map(o=>({mill_id:mill.id,key:o.key,v:o.v,t:o.t||Date.now()})))})}
};

/* A munshi's writes the server will reject (see mill_data_guard in
   schema.sql): tombstones outside att_, plus core_ and per_ records. Skip
   them client-side too so pullAll does not fail wholesale. */
function munshiBlocked(k,v){return mill&&mill.role==="munshi"&&(v===null&&!k.startsWith("att_")||v!==null&&(k.startsWith("core_")||k.startsWith("per_")))}

/* Last-write-wins merge: pull every key newer on the server (the server
   stamps t at write time, so phone clocks do not matter), push every key
   newer locally. Tombstones (v:null) propagate deletes. */
async function pullAll(){
  if(!store||!mill)return;
  const rows=await api("/rest/v1/mill_data?select=key,v,t&mill_id=eq."+encodeURIComponent(mill.id))||[];
  const remote={};rows.forEach(r=>{remote[r.key]=r});
  for(const k in remote){const r=remote[k];
    if((+r.t||0)>store.localT(k)){try{
      if(r.v===null)localStorage.removeItem("aara:"+k);
      else localStorage.setItem("aara:"+k,JSON.stringify(r.v));
      localStorage.setItem("aarat:"+k,String(+r.t||0))}catch(e){}}}
  const pushes=[],keys=new Set();
  for(let i=0;i<localStorage.length;i++){const sk=localStorage.key(i);
    if(sk&&sk.startsWith("aara:"))keys.add(sk.slice(5));
    else if(sk&&sk.startsWith("aarat:"))keys.add(sk.slice(6))}
  for(const k of keys){if(skipKey(k))continue;
    const lt=store.localT(k),r=remote[k];
    if(!r||lt>(+r.t||0)){const raw=localStorage.getItem("aara:"+k),v=raw==null?null:JSON.parse(raw);
      if(munshiBlocked(k,v))continue;
      pushes.push({mill_id:mill.id,key:k,v,t:lt||Date.now()})}}
  if(pushes.length)await api("/rest/v1/mill_data",{method:"POST",headers:{Prefer:"resolution=merge-duplicates"},body:JSON.stringify(pushes)});
  if(window.AaraSyncAfterPull)try{await window.AaraSyncAfterPull()}catch(e){}
  foldAtt();
}

/* Attendance marks travel as their own keys (att_<scope>_<person>_<date>) so
   two devices marking different workers/days never overwrite each other.
   After a pull, fold them back into the live mill doc. */
function foldAtt(){
  try{const sc=typeof scope==="function"?scope():S.acct;const d=S.data;if(!sc||!d||!d.people)return;
    const pre="aara:att_"+sc+"_";let dirty=false;
    for(let i=0;i<localStorage.length;i++){const sk=localStorage.key(i);
      if(!sk||!sk.startsWith(pre))continue;
      const rest=sk.slice(pre.length),sep=rest.lastIndexOf("_");
      const p=d.people.find(x=>x.id===rest.slice(0,sep));if(!p)continue;
      const cell=JSON.parse(localStorage.getItem(sk)||"null"),v=cell&&cell.v,date=rest.slice(1+sep);
      p.present=p.present||{};
      if(v==null){if(p.present[date]!==undefined){delete p.present[date];dirty=true}}
      else if(p.present[date]!==v){p.present[date]=v;dirty=true}}
    if(dirty){persist();render()}}catch(e){}
}

async function boot(st){
  load();store=st;
  if(!connected())return"device";
  try{
    await ensureMembership();
    st.db=adapter;st.uid=mill.id;
    await pullAll();S.mode="cloud";
  }catch(e){st.db=null;S.mode="device";return"device"}
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
  ses={token:d.access_token,refresh:d.refresh_token,exp:Date.now()+(+(d.expires_in)||3600)*1000,user:d.user&&d.user.id,dest};
  localStorage.setItem(SESK,JSON.stringify(ses));localStorage.removeItem(PENDK);
  await ensureMembership();
  if(store){store.db=adapter;store.uid=mill.id}
  S.mode="cloud";
  return ses
}
function disconnect(){
  dropSession();
  try{localStorage.removeItem(PENDK)}catch(e){}
}

/* Sharing: owner mints single-use codes (crypto-random, 12 chars); a signed-in
   partner/munshi redeems one to adopt that mill — the join clears local
   mill-scope keys first so a joiner's stale data can never overwrite the
   mill's. Device-local keys (accounts, PIN lockouts) are never synced. */
function codeGen(){const a=new Uint8Array(10);crypto.getRandomValues(a);
  let s="";a.forEach(b=>{s+="ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b&31]});return s}
async function invite(role){
  if(!mill||mill.role!=="owner")throw new Error("owner only");
  const code=codeGen();
  await api("/rest/v1/mill_invites",{method:"POST",body:JSON.stringify({code,mill_id:mill.id,role,created_by:ses.user})});
  return code;
}
function clearScope(){ // wipe synced mill-data keys, keep device-local ones
  const kill=[];
  for(let i=0;i<localStorage.length;i++){const sk=localStorage.key(i);if(!sk)continue;
    if(sk.startsWith("aara:")&&!skipKey(sk.slice(5)))kill.push(sk);
    else if(sk.startsWith("aarat:")&&!skipKey(sk.slice(6)))kill.push(sk)}
  kill.forEach(k=>localStorage.removeItem(k));
}
async function join(code){
  const r=await api("/rest/v1/rpc/join_mill",{method:"POST",body:JSON.stringify({p_code:String(code).trim().toUpperCase()})});
  const rows=await api("/rest/v1/mill_members?select=mill_id,role&uid=eq."+encodeURIComponent(ses.user)+"&mill_id=eq."+encodeURIComponent(r)+"&limit=1");
  mill={id:r,role:rows&&rows[0]?rows[0].role:"munshi"};
  ses.mill=mill.id;try{localStorage.setItem(SESK,JSON.stringify(ses))}catch(e){}
  S.role=mill.role;
  if(store)store.uid=mill.id;
  clearScope();
  await pullAll();
  return mill;
}
async function members(){return api("/rest/v1/mill_members?select=uid,role,created_at&mill_id=eq."+encodeURIComponent(mill.id))||[]}
async function removeMember(uid){await api("/rest/v1/mill_members?mill_id=eq."+encodeURIComponent(mill.id)+"&uid=eq."+encodeURIComponent(uid),{method:"DELETE"})}

window.AaraSync={boot,pullAll,foldAtt,saveConfig,sendOtp,verify,disconnect,configured,connected,
  invite,join,members,removeMember,refresh,
  role:()=>mill?mill.role:"owner",millId:()=>mill?mill.id:"",uid:()=>ses?ses.user:"",
  config:()=>cfg||{},pending:()=>localStorage.getItem(PENDK)||"",dest:()=>ses&&ses.dest||""};
})();
