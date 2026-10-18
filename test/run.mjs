// Smoke + logic tests for index.html — zero dependencies.
// Extracts the inline <script>, runs it against minimal DOM shims,
// then drives the real functions through the app's core flows.
// Usage: node test/run.mjs
import {readFileSync} from "node:fs";
import {webcrypto} from "node:crypto";
import {fileURLToPath} from "node:url";
import {dirname,join} from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(root, "index.html"), "utf8");
const m = html.match(/<script>([\s\S]*)<\/script>/);
if (!m) { console.error("no <script> block found in index.html"); process.exit(1); }
const src = m[1];
const syncSrc = readFileSync(join(root, "sync.js"), "utf8");

/* ---- minimal DOM/browser shims (enough to render every view) ---- */
const handlers = {};
const opened = [];
const elCache = {};
// Selectors that must behave as "not present" — helper guards rely on null.
const NULL_SEL = new Set(["#stkHelp", "#bsHelp", "#pricingEx", "#modal .modal"]);
const mkEl = () => ({
  innerHTML: "", textContent: "", hidden: true, value: "", files: null,
  className: "", disabled: false, checked: false, dataset: {}, style: {},
  focus() {}, select() {}, appendChild() {}, remove() {}, click() {},
  setSelectionRange() {}, selectionStart: 0,
  querySelector: () => mkEl(), querySelectorAll: () => [], closest: () => null,
});
const store = {};
const localStorage = {
  getItem: k => store[k] ?? null,
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; },
  key: i => Object.keys(store)[i] ?? null,
  get length() { return Object.keys(store).length; },
};
const document = {
  documentElement: {}, title: "", head: mkEl(), body: mkEl(), activeElement: null,
  querySelector: s => NULL_SEL.has(s) ? null : (elCache[s] || (elCache[s] = mkEl())),
  querySelectorAll: () => [],
  createElement: () => mkEl(),
  getElementById: id => elCache["#" + id] || null,
  addEventListener: (t, fn) => { handlers[t] = fn; },
};
const sessionStore = {};
const sessionStorage = {
  getItem: k => sessionStore[k] ?? null,
  setItem: (k, v) => { sessionStore[k] = String(v); },
  removeItem: k => { delete sessionStore[k]; },
};
const navigator = {};
const location = { protocol: "http:", origin: "http://localhost", hostname: "localhost", hash: "" };
const window = { scrollTo() {}, addEventListener() {}, open: u => opened.push(u), print() {} };
const history = { replaceState() {} };
// Fake Supabase server: one session "tok_u1" -> user "u1". Simulates the
// mill_members / mill_data / mill_invites schema + RLS rules from
// supabase/schema.sql faithfully enough to test the client.
const serverRows = new Map();     // "mill|key" -> {mill_id,key,v,t}
const serverMembers = new Map();  // "mill|uid" -> {mill_id,uid,role}
const serverInvites = new Map();  // code -> {code,mill_id,role,used}
const jres = (status, body) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });
const fetch = async (url, opts = {}) => {
  const u = new URL(url);
  if (u.pathname === "/auth/v1/otp") return jres(200, {});
  if (u.pathname === "/auth/v1/verify") {
    const b = JSON.parse(opts.body);
    return b.token === "123456" ? jres(200, { access_token: "tok_u1", user: { id: "u1" } }) : jres(400, { error: "bad" });
  }
  if ((opts.headers || {}).Authorization !== "Bearer tok_u1") return jres(401, {});
  const me = "u1", roleOf = m => (serverMembers.get(m + "|" + me) || {}).role;
  const eq = (u, p) => { const v = u.searchParams.get(p); return v && v.startsWith("eq.") ? v.slice(3) : null; };
  if (u.pathname === "/rest/v1/mill_members") {
    if (!opts.method || opts.method === "GET") {
      let rows = [...serverMembers.values()].filter(r => r.uid === me || roleOf(r.mill_id));
      const uid = eq(u, "uid"), mill = eq(u, "mill_id");
      if (uid) rows = rows.filter(r => r.uid === uid);
      if (mill) rows = rows.filter(r => r.mill_id === mill);
      return jres(200, rows);
    }
    if (opts.method === "POST") {
      const b = JSON.parse(opts.body);
      if (b.uid === me && b.mill_id === me && b.role === "owner") { serverMembers.set(b.mill_id + "|" + b.uid, { ...b, created_at: "2026-01-01" }); return jres(201, []); }
      return jres(403, {});
    }
    if (opts.method === "DELETE") {
      const uid = eq(u, "uid"), mill = eq(u, "mill_id");
      if (uid === me || roleOf(mill) === "owner") { serverMembers.delete(mill + "|" + uid); return jres(200, []); }
      return jres(403, {});
    }
  }
  if (u.pathname === "/rest/v1/mill_data") {
    const mill = eq(u, "mill_id"), keyEq = eq(u, "key");
    if (!opts.method || opts.method === "GET") {
      let rows = [...serverRows.values()].filter(r => roleOf(r.mill_id));
      if (mill) rows = rows.filter(r => r.mill_id === mill);
      if (keyEq) rows = rows.filter(r => r.key === keyEq);
      return jres(200, rows);
    }
    if (opts.method === "POST") {
      const arr = Array.isArray(JSON.parse(opts.body)) ? JSON.parse(opts.body) : [JSON.parse(opts.body)];
      for (const r of arr) { if (!roleOf(r.mill_id)) return jres(403, {}); }
      arr.forEach(r => serverRows.set(r.mill_id + "|" + r.key, { mill_id: r.mill_id, key: r.key, v: r.v, t: r.t }));
      return jres(200, []);
    }
    if (opts.method === "DELETE") {
      if (!mill || !["owner", "partner"].includes(roleOf(mill))) return jres(403, {});
      if (keyEq) serverRows.delete(mill + "|" + keyEq);
      return jres(200, []);
    }
  }
  if (u.pathname === "/rest/v1/mill_invites") {
    if (opts.method === "POST") {
      const b = JSON.parse(opts.body);
      if (roleOf(b.mill_id) !== "owner") return jres(403, {});
      serverInvites.set(b.code, { code: b.code, mill_id: b.mill_id, role: b.role, used: false });
      return jres(201, []);
    }
    return jres(200, [...serverInvites.values()].filter(i => roleOf(i.mill_id) === "owner"));
  }
  if (u.pathname === "/rest/v1/rpc/join_mill") {
    const b = JSON.parse(opts.body), inv = serverInvites.get(b.p_code);
    if (!inv || inv.used) return jres(400, { message: "invalid or expired invite code" });
    serverMembers.set(inv.mill_id + "|" + me, { mill_id: inv.mill_id, uid: me, role: inv.role, created_at: "2026-01-02" });
    inv.used = true;
    return jres(200, inv.mill_id);
  }
  return jres(404, {});
};
class FormData { constructor(f) { return new Map(Object.entries(f._fd)); } }
class FileReader { readAsText(f) { this.result = f._text; setTimeout(() => this.onload && this.onload(), 0); } }
const errBox = { v: "" };
const errEl = { set textContent(v) { errBox.v = v; }, get textContent() { return errBox.v; } };
const submit = (kind, fd, extra = {}) =>
  handlers.submit({ preventDefault() {}, target: { dataset: { form: kind, ...extra }, _fd: fd, querySelector: () => errEl } });
const el = (dataset, props = {}) => ({ dataset, ...props });

/* ---- assertions ---- */
let pass = 0, fail = 0;
const ok = (name, cond) => { cond ? pass++ : fail++; console.log((cond ? "PASS " : "FAIL ") + name); };

const test = `;(async () => {
  await new Promise(r => setTimeout(r, 60)); // let boot settle

  ok("boot lands on auth", S.screen === "auth");

  // i18n tables: every language must cover every key
  const bad = Object.entries(TR).filter(([k, v]) => v.length !== KEYS.length).map(([k]) => k);
  ok("all " + LANGS.length + " translations have " + KEYS.length + " keys", bad.length === 0);

  // signup — mobile normalised via digits() (last 10)
  await submit("signup", { mill: "Test Mill", owner: "Ash K", mobile: "+91 98765-43210", pin: "4321", state: "Punjab", district: "Ludhiana", agree: "on" });
  ok("signup enters the app", S.screen === "app" && S.acct === "9876543210");

  // login: wrong PIN rejected, right PIN enters
  ACT.logout();
  await submit("login", { mobile: "9876543210", pin: "9999" });
  ok("wrong PIN rejected", S.screen === "auth");
  await submit("login", { mobile: "+91 98765-43210", pin: "4321" });
  ok("correct PIN logs in (+91 ok)", S.screen === "app");

  // change PIN
  await submit("pin", { old: "4321", pin1: "2468", pin2: "2468" });
  ACT.logout();
  await submit("login", { mobile: "9876543210", pin: "2468" });
  ok("new PIN works", S.screen === "app");

  // demo mill: every view + sub-view renders
  await enter("demo", demoMill());
  let viewsOk = true;
  const tabs = ["home", "people", "auctions", "stock", "orders", "more"];
  for (const tab of tabs) try { S.tab = tab; render(); } catch (e) { viewsOk = false; console.log("  view fail:", tab, e.message); }
  for (const [k, v] of [["peopleTab", "attendance"], ["orderFilter", "profit"], ["orderFilter", "customers"], ["stockTab", "byp"], ["stockTab", "all"], ["peopleTab", "labour"]])
    try { S[k] = v; S.tab = k === "peopleTab" ? "people" : k === "stockTab" ? "stock" : "orders"; render(); }
    catch (e) { viewsOk = false; console.log("  subview fail:", k, v, e.message); }
  S.orderFilter = "open"; S.stockTab = "mine"; S.peopleTab = "owner";
  ok("all views and sub-views render", viewsOk);

  // migrate() repairs partial/corrupt data
  const broken = migrate({ profile: { mill: "X" }, people: [{ id: "p1", type: "boss" }], orders: [{ status: "weird", no: 7, items: ["x", { wood: "teak", mode: "sawn" }] }], auctions: [{ status: "nope" }] });
  ok("migrate repairs statuses/items/person types",
    broken.orders[0].status === "quote" && broken.orders[0].items.length === 1 &&
    broken.auctions[0].status === "watching" && broken.people[0].type === "labour" &&
    broken.profile.owner === "Owner" && broken.seq === 8 && Array.isArray(broken.customers) && broken.byp && Object.keys(broken.byp).length > 0);
  ok("migrate({}) does not crash", (() => { try { const e = migrate({}); return e && Array.isArray(e.orders) && e.seq >= 1 } catch (x) { return false } })());

  // order lifecycle: quote -> confirm via status -> edit -> paid -> cancel
  ACT.newOrder();
  const w0 = S.draft.items[0].wood, q0 = S.data.stock[w0].qty;
  S.draft.items[0].pcs = 10; S.draft.status = "confirmed"; saveDraft();
  const need1 = lineCft(S.draft.items[0]);
  ok("status-change confirm deducts stock", Math.abs(q0 - need1 - S.data.stock[w0].qty) < 0.05);
  ok("confirm writes a ledger move", S.data.moves.at(-1).delta < 0 && S.data.moves.at(-1).wood === w0);

  S.draft.items[0].pcs = 20; saveDraft();
  const need2 = lineCft(S.draft.items[0]);
  ok("editing a deducted order re-balances stock", Math.abs(q0 - need2 - S.data.stock[w0].qty) < 0.05);
  ok("re-balance writes a ledger entry", S.data.moves.at(-1).note.includes("updated"));

  S.draft.status = "paid"; saveDraft();
  ok("paid does not double-deduct", Math.abs(q0 - need2 - S.data.stock[w0].qty) < 0.05);
  ok("save clears the dirty flag", S.draft.dirty === false);
  ok("confirm froze material cost", S.draft.items[0].matRate != null);

  S.draft.status = "cancelled"; saveDraft();
  ok("cancelling restores stock", Math.abs(S.data.stock[w0].qty - q0) < 0.05);

  // delete a deducted order -> restore
  S.draft.status = "confirmed"; saveDraft();
  const oid = S.draft.id;
  await ACT.doDel(el({ kind: "order", id: oid }));
  ok("deleting a deducted order restores stock", Math.abs(S.data.stock[w0].qty - q0) < 0.05 && !S.data.orders.find(x => x.id === oid));

  // confirm button path (+ no double-deduct on an already-deducted draft)
  ACT.newOrder(); S.draft.items[0].pcs = 5; ACT.confirmOrder(el({ force: "1" }));
  ok("Confirm & reduce stock works", S.draft.deducted && S.draft.status === "confirmed");
  const qAfter = S.data.stock[S.draft.items[0].wood].qty;
  ACT.confirmOrder(el({ force: "1" })); // second call must not re-deduct
  ok("repeat confirm does not double-deduct", S.data.stock[S.draft.items[0].wood].qty === qAfter);

  // loss guard: confirming below cost opens a warning modal instead of deducting
  ACT.newOrder(); S.draft.items[0].rate = 1; S.draft.items[0].custom = true; S.draft.items[0].pcs = 10;
  const lossWood = S.draft.items[0].wood, lossQty = S.data.stock[lossWood].qty;
  ACT.confirmOrder(el({}));
  ok("loss confirm warns instead of deducting", S.draft.deducted === false && S.data.stock[lossWood].qty === lossQty && document.querySelector("#modal").innerHTML.includes("lose"));
  ACT.discardDraft();

  // by-product sale deducts yard stock, not timber
  const bq0 = S.data.byp.sawdust.qty;
  ACT.newOrder(); const bi = S.draft.items[0]; bi.mode = "byp"; bi.wood = "sawdust"; bi.q = 100; bi.rate = 5;
  S.draft.status = "confirmed"; saveDraft();
  ok("by-product order deducts yard stock", Math.abs(bq0 - 100 - S.data.byp.sawdust.qty) < 0.001 && S.draft.deducted);
  await ACT.doDel(el({ kind: "order", id: S.draft.id }));
  ok("deleting by-product order restores yard", Math.abs(S.data.byp.sawdust.qty - bq0) < 0.001);

  // job work never touches mill stock
  const qj = S.data.stock[w0].qty;
  ACT.newOrder(); S.draft.kind = "job"; S.draft.status = "delivered"; saveDraft();
  ok("job work does not deduct", S.data.stock[w0].qty === qj);
  await ACT.doDel(el({ kind: "order", id: S.draft.id }));

  // empty order rejected
  ACT.newOrder(); S.draft.items[0].pcs = 0; S.draft.items[0].L = 0;
  const nOrders = S.data.orders.length;
  ok("empty order not saved", saveDraft() === false && S.data.orders.length === nOrders);
  S.draft.items[0].pcs = 4; S.draft.items[0].L = 7;
  ok("valid draft saves", saveDraft() === true && S.data.orders.length === nOrders + 1);

  // duplicate produces a fresh unsaved quote with the next number
  const srcId = S.draft.id, srcNo = S.draft.no;
  ACT.dupOrder();
  ok("duplicate makes a new quote", S.draft.id !== srcId && S.draft.no >= srcNo && S.draft.saved === false && S.draft.status === "quote" && S.draft.deducted === false);

  // discard clears an unsaved draft
  ACT.discardDraft();
  ok("discard clears the draft", S.draft === null && S.tab === "orders");

  // #estimate without a draft falls back to orders
  S.tab = "estimate"; render();
  ok("estimate without draft falls back", S.tab === "orders");

  // attendance register: cycle a past date, mark all, wage math
  const yday = addDays(-1);
  const lab = S.data.people.find(p => p.type === "labour" && p.active);
  delete lab.present[yday];
  ACT.att(el({ id: lab.id, d: yday }));
  ok("att cycles to present on past day", attVal(lab, yday) === "P");
  ACT.att(el({ id: lab.id, d: yday }));
  ok("att cycles to half day", attVal(lab, yday) === "H");
  const wf = wageFor(lab, today().slice(0, 7));
  ok("wageFor counts units", wf.units >= 0 && wf.earned >= 0);
  ACT.allPresent();
  ok("mark-all-present today", S.data.people.filter(p => p.type === "labour" && p.active).every(p => attVal(p, today()) === "P"));
  CHANGE.present(el({ id: lab.id }), { get checked() { return false } });
  ok("unchecking today marks absent", attVal(lab, today()) === "A");

  // customer book: link order -> stats -> payment clears oldest dues
  ACT.newOrder(); S.draft.customer = "Test Customer"; S.draft.phone = "9876501111"; S.draft.status = "delivered"; saveDraft();
  const tOrd = S.data.orders.find(o => o.customer === "Test Customer" && o.status === "delivered");
  const tc = S.data.customers.find(c => c.name === "Test Customer");
  ok("order links a customer", !!tc && tOrd.custId === tc.id);
  ok("orderDue counts delivered balance", orderDue(tOrd) > 0 && custStats(tc).due === orderDue(tOrd));
  const due0 = orderDue(tOrd);
  await submit("payment", { amt: String(Math.round(due0)), pdate: today() }, { id: tc.id });
  ok("payment clears dues -> paid", orderDue(S.data.orders.find(o => o.id === tOrd.id)) === 0 && S.data.orders.find(o => o.id === tOrd.id).status === "paid");

  // WhatsApp queue + deep link
  ACT.waOrder(el({ id: tOrd.id }));
  ok("wa queue builds for order", S.waQueue && S.waQueue.items.length === 1 && waUrl("9876501111", "hi") === "https://wa.me/919876501111?text=hi");
  ACT.waSent();
  ok("waSent logs to waLog", S.data.waLog.length > 0);

  // import: parse + merge + replace
  const bk = demoMill(); bk.profile.mill = "Imported Mill";
  const pr = parseBackup(JSON.stringify({ app: "Aara", version: 1, exportedAt: new Date().toISOString(), data: bk }));
  ok("parseBackup accepts wrapped file", !pr.err && pr.d.profile.mill === "Imported Mill");
  ok("parseBackup rejects junk", !!parseBackup("not json").err && !!parseBackup('{"a":1}').err);
  S.pendingImport = pr; await ACT.importGo(el({ v: "replace" }));
  ok("replace import swaps data", S.data.profile.mill === "Imported Mill");
  const extra = { people: [{ id: "zz_new", type: "labour", name: "New Worker", phone: "9000000000", active: true, present: {}, wageType: "daily", wage: 500 }] };
  S.pendingImport = { d: { ...JSON.parse(JSON.stringify(S.data)), people: extra.people.concat(S.data.people) } };
  await ACT.importGo(el({ v: "merge" }));
  ok("merge adds unseen records", S.data.people.some(p => p.id === "zz_new"));

  // monthly P&L shape
  const rep = monthReport(today().slice(0, 7));
  ok("monthReport computes", rep.rev >= 0 && rep.mat >= 0 && typeof rep.net === "number" && rep.cft >= 0);

  // frozen costs: stock cost change after confirm does not move profit
  const pz = S.data.orders.find(o => COUNTED.includes(o.status) && o.items.some(i => i.mode !== "byp" && i.matRate != null));
  if (pz) {
    const it = pz.items.find(i => i.mode !== "byp" && i.matRate != null);
    const st = S.data.stock[it.wood]; const avg0 = st && st.avg; const pr0 = orderProfit(pz).profit;
    if (st) st.avg = (avg0 || 100) + 500;
    ok("frozen matRate keeps profit stable", Math.abs(orderProfit(pz).profit - pr0) < 0.01);
    if (st) st.avg = avg0;
  } else ok("frozen matRate keeps profit stable", true);

  // stock in/out via move form: weighted average + ledger
  const smv = Object.keys(S.data.stock)[0], sq0 = S.data.stock[smv].qty, sa0 = S.data.stock[smv].avg;
  await submit("move", { qty: "10", date: today(), rate: String((sa0 || 100) + 100), extra: "0", note: "test buy" }, { id: smv, dir: "in" });
  ok("stock-in moves qty + re-weights avg", S.data.stock[smv].qty === Math.round((sq0 + 10) * 100) / 100 && S.data.stock[smv].avg !== sa0 && S.data.moves.at(-1).delta === 10);

  // guards
  ok("safeUrl blocks javascript:", safeUrl("javascript:alert(1)") === "" && safeUrl(" https://x.in ") === "https://x.in");
  ok("addDays uses local dates", addDays(1) > today() && /^\\d{4}-\\d{2}-\\d{2}$/.test(today()));
  ok("digits normalises +91/0/separators", digits("+91 98765-01234") === "9876501234" && digits("09876501234") === "9876501234" && digits("919876501234") === "9876501234");

  // quote text + docHTML: customer-facing, no internal cost leakage
  ACT.newOrder(); S.draft.notes = "Deliver to gate 2"; S.draft.items[0].rate = 500;
  ok("notes appear in quote text", quoteText(S.draft).includes("Deliver to gate 2"));
  const dh = docHTML(S.draft);
  ok("docHTML is a clean quotation",
    dh.includes("Estimate") && dh.includes("Total") && dh.includes("Amount in words") &&
    !/break-?even|landed cost|suggested rate|recovery|wastage|cost per|your cost/i.test(dh));
  ok("forms render", legalHTML().length > 500 && personForm({ type: "labour", active: true }).length > 200 &&
    stockForm("teak").length > 200 && auctionForm({}).length > 200 && custForm({ type: "Carpenter" }).length > 200);

  // custom wood removal is blocked while referenced anywhere
  await submit("customWood", { en: "Test Wood", hn: "", uses: "testing" });
  const cw = S.data.customWoods.at(-1);
  ok("custom wood added", cw && cw.en === "Test Wood" && cw.id.startsWith("c_"));
  S.data.orders.push({ id: "oc1", no: 99, date: today(), kind: "sale", status: "quote", customer: "X", phone: "", items: [{ wood: cw.id, mode: "sawn", L: 5, W: 4, T: 2, pcs: 1, rate: 500 }], transport: 0, discount: 0, advance: 0, gstOn: false, deducted: false });
  await ACT.doDel(el({ kind: "cwood", id: cw.id }));
  ok("in-use custom wood cannot be removed", !!S.data.customWoods.find(c => c.id === cw.id));
  S.data.orders = S.data.orders.filter(o => o.id !== "oc1");
  await ACT.doDel(el({ kind: "cwood", id: cw.id }));
  ok("unused custom wood removed", !S.data.customWoods.find(c => c.id === cw.id));

  // tune-up repairs negative qty and duplicate order numbers
  const td = migrate(demoMill());
  td.stock.teak.qty = -5; td.orders[0].no = td.orders[1].no; td.people.find(p => p.type === "labour").present["bad-date"] = "X";
  const tr2 = tuneUp(td);
  ok("tuneUp repairs data", tr2.fix.length > 0 && td.stock.teak.qty === 0 && !td.people[0].present["bad-date"] && new Set(td.orders.map(o => o.no)).size === td.orders.length);

  // demo mill carries a licence expiry so the renewal warning shows
  const dm = demoMill();
  ok("demo licence expiry set", !!dm.profile.licenceExp && daysUntil(dm.profile.licenceExp) < 60);

  // per-view title + offline banner
  S.tab = "stock"; render();
  ok("per-view title", document.title.includes("Aara"));
  navigator.onLine = false; S.tab = "home"; render();
  ok("offline banner shows", document.querySelector("#app").innerHTML.includes("Offline"));
  delete navigator.onLine; render();

  // ---- optional cloud sync (sync.js + fake Supabase server) ----
  const A = window.AaraSync;
  ok("sync module loaded", !!A && !A.configured() && !A.connected());
  A.saveConfig("https://x.supabase.co", "anon-key");
  ok("bad config rejected", (() => { try { A.saveConfig("http://evil", "k"); return false } catch (e) { return true } })());
  await A.sendOtp("ash@test.com");
  await A.verify("123456");
  ok("sync connects after OTP", A.connected() && S.mode === "cloud");
  ok("first connect self-creates owner mill", serverMembers.get("u1|u1") && A.role() === "owner" && A.millId() === "u1");
  // seed: server has newer mill doc; local has a newer key + a tombstone
  serverRows.set("u1|mill_9876543210", { mill_id: "u1", key: "mill_9876543210", v: { profile: { mill: "Cloud Mill" }, people: [] }, t: Date.now() + 999999 });
  localStorage.setItem("aara:mill_9876543210", JSON.stringify({ profile: { mill: "Local Mill" } }));
  localStorage.setItem("aarat:mill_9876543210", "1000");
  localStorage.setItem("aara:localonly", JSON.stringify({ x: 1 }));
  localStorage.setItem("aarat:localonly", String(Date.now() + 86400000));
  localStorage.removeItem("aara:gone");
  localStorage.setItem("aarat:gone", String(Date.now() + 86400000));
  const bootMode = await A.boot(Store);
  ok("sync boot reports cloud", bootMode === "cloud" && !!Store.db);
  ok("sync adopts newer remote", JSON.parse(localStorage.getItem("aara:mill_9876543210")).profile.mill === "Cloud Mill");
  ok("sync pushes newer local", serverRows.get("u1|localonly") && serverRows.get("u1|localonly").v.x === 1);
  ok("sync pushes tombstone", serverRows.get("u1|gone") && serverRows.get("u1|gone").v === null);
  ok("sync never pushes config", !serverRows.get("u1|cloud") && !serverRows.get("u1|cloudSession"));
  await Store.del("localonly");
  ok("Store.del tombstones remotely", !localStorage.getItem("aara:localonly") && serverRows.get("u1|localonly").v === null);
  // sharing: invite code -> join -> role sticks
  const code = await A.invite("munshi");
  ok("owner mints single-use invite", typeof code === "string" && serverInvites.has(code) && serverInvites.get(code).role === "munshi");
  const ms = await A.members();
  ok("member list readable", ms.length === 1 && ms[0].uid === "u1" && ms[0].role === "owner");
  await A.join(code);   // u1 redeems on own mill (test-only path — demotes to munshi)
  ok("join applies role + sticks", A.role() === "munshi" && S.role === "munshi" && A.millId() === "u1" && serverInvites.get(code).used);
  const delKey = "mill_9876543210";
  await Store.del(delKey);
  ok("munshi cannot delete (client gate)", !!localStorage.getItem("aara:" + delKey));
  errBox.v = ""; S.role = "munshi";
  await submit("pricing", { wastage: "1", sawing: "1", labour: "1", margin: "1", gst: "0", workDays: "26", recovery: "60", minMargin: "5", gstMode: "intra" });
  ok("munshi cannot change settings", errBox.v.includes("owner") && S.data.settings.margin !== 1);
  errBox.v = "";
  // attendance merges per-day: a mark pushed here + a mark pulled for a
  // different worker must coexist in the doc after folding
  const w1 = S.data.people.find(p => p.type === "labour"), w2 = S.data.people.find(p => p.type === "labour" && p.id !== w1.id);
  markAtt(w1, "2099-01-15", "P");
  ok("markAtt writes per-day key", JSON.parse(localStorage.getItem("aara:att_" + S.acct + "_" + w1.id + "_2099-01-15")).v === "P");
  delete w2.present["2099-01-15"];
  serverRows.set("u1|att_" + S.acct + "_" + w2.id + "_2099-01-15", { mill_id: "u1", key: "att_" + S.acct + "_" + w2.id + "_2099-01-15", v: { v: "H" }, t: Date.now() + 999999 });
  await A.pullAll();
  ok("pulled attendance folds without clobbering", attVal(w1, "2099-01-15") === "P" && attVal(w2, "2099-01-15") === "H");
  // device fallback: broken server must not block the app
  A.disconnect();
  ok("disconnect returns to device mode", !A.connected() && S.mode === "device" && !Store.db && S.role === "owner");
})()`;

const fn = new Function(
  "localStorage", "document", "window", "crypto", "navigator", "sessionStorage",
  "location", "history", "FormData", "FileReader", "fetch", "ok", "submit", "opened", "el", "serverRows", "serverMembers", "serverInvites", "errBox",
  src + ";\n" + syncSrc + ";return " + test.slice(1)  // app + sync layer, then the test promise
);

try {
  await fn(localStorage, document, window, webcrypto, navigator, sessionStorage,
    location, history, FormData, FileReader, fetch, ok, submit, opened, el, serverRows, serverMembers, serverInvites, errBox);
} catch (e) {
  console.error("HARNESS FAIL:", e);
  process.exit(1);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
