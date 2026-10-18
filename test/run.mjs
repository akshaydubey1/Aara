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

/* ---- minimal DOM/browser shims (enough to render every view) ---- */
const handlers = {};
const opened = [];
const mkEl = () => ({
  innerHTML: "", textContent: "", hidden: true, value: "", files: null,
  focus() {}, select() {}, appendChild() {}, remove() {}, click() {},
  setSelectionRange() {}, selectionStart: 0,
});
const store = {};
const localStorage = {
  getItem: k => store[k] ?? null,
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; },
};
const document = {
  documentElement: {},
  querySelector: () => mkEl(),
  createElement: () => mkEl(),
  addEventListener: (t, fn) => { handlers[t] = fn; },
  body: mkEl(),
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
class FormData { constructor(f) { return new Map(Object.entries(f._fd)); } }
class FileReader { readAsText(f) { this.result = f._text; setTimeout(() => this.onload && this.onload(), 0); } }
let lastErr = "";
const errEl = { set textContent(v) { lastErr = v; }, get textContent() { return lastErr; } };
const submit = (kind, fd, extra = {}) =>
  handlers.submit({ preventDefault() {}, target: { dataset: { form: kind, ...extra }, _fd: fd, querySelector: () => errEl } });

/* ---- assertions ---- */
let pass = 0, fail = 0;
const ok = (name, cond) => { cond ? pass++ : fail++; console.log((cond ? "PASS " : "FAIL ") + name); };

const test = `;(async () => {
  await new Promise(r => setTimeout(r, 60)); // let boot settle

  ok("boot lands on auth", S.screen === "auth");

  // i18n tables: every language must cover every key
  const bad = Object.entries(TR).filter(([k, v]) => v.length !== KEYS.length).map(([k]) => k);
  ok("all " + LANGS.length + " translations have " + KEYS.length + " keys", bad.length === 0);

  // signup
  await submit("signup", { mill: "Test Mill", owner: "Ash K", mobile: "9876543210", pin: "4321", state: "Punjab", district: "Ludhiana", agree: "on" });
  ok("signup enters the app", S.screen === "app" && S.acct === "9876543210");

  // login: wrong PIN rejected, right PIN enters
  ACT.logout();
  await submit("login", { mobile: "9876543210", pin: "9999" });
  ok("wrong PIN rejected", S.screen === "auth");
  await submit("login", { mobile: "9876543210", pin: "4321" });
  ok("correct PIN logs in", S.screen === "app");

  // change PIN
  await submit("pin", { old: "4321", pin1: "2468", pin2: "2468" });
  ACT.logout();
  await submit("login", { mobile: "9876543210", pin: "2468" });
  ok("new PIN works", S.screen === "app");

  // demo mill: every view renders
  await enter("demo", demoMill());
  let viewsOk = true;
  for (const tab of ["home", "people", "auctions", "stock", "orders", "more"])
    try { S.tab = tab; render(); } catch (e) { viewsOk = false; }
  ok("all views render", viewsOk);

  // migrate() repairs partial/corrupt data
  const broken = migrate({ profile: { mill: "X" }, people: [{ id: "p1" }] });
  ok("migrate fills defaults", Array.isArray(broken.orders) && broken.settings.gst === 18 && !!broken.people[0].present);

  // order lifecycle: quote -> confirm via status -> edit -> paid -> cancel
  ACT.newOrder();
  const w0 = S.draft.items[0].wood, q0 = S.data.stock[w0].qty;
  S.draft.items[0].pcs = 10; S.draft.status = "confirmed"; saveDraft();
  const need1 = lineCft(S.draft.items[0]);
  ok("status-change confirm deducts stock", Math.abs(q0 - need1 - S.data.stock[w0].qty) < 0.05);

  S.draft.items[0].pcs = 20; saveDraft();
  const need2 = lineCft(S.draft.items[0]);
  ok("editing a deducted order re-balances stock", Math.abs(q0 - need2 - S.data.stock[w0].qty) < 0.05);
  ok("re-balance writes a ledger entry", S.data.moves.at(-1).note.includes("updated"));

  S.draft.status = "paid"; saveDraft();
  ok("paid does not double-deduct", Math.abs(q0 - need2 - S.data.stock[w0].qty) < 0.05);
  ok("save clears the dirty flag", S.draft.dirty === false);

  S.draft.status = "cancelled"; saveDraft();
  ok("cancelling restores stock", Math.abs(S.data.stock[w0].qty - q0) < 0.05);

  // delete a deducted order -> restore
  S.draft.status = "confirmed"; saveDraft();
  const oid = S.draft.id;
  ACT.doDel({ dataset: { kind: "order", id: oid } });
  ok("deleting a deducted order restores stock", Math.abs(S.data.stock[w0].qty - q0) < 0.05 &&
     !S.data.orders.find(x => x.id === oid));

  // confirm button path
  ACT.newOrder(); S.draft.items[0].pcs = 5; ACT.confirmOrder();
  ok("Confirm & reduce stock works", S.draft.deducted && S.draft.status === "confirmed");

  // attendance for a chosen date + mark all
  const yday = addDays(-1); S.aDay = yday;
  const lab = S.data.people.find(p => p.type === "labour" && p.active);
  CHANGE.present({ dataset: { id: lab.id }, checked: true });
  ok("attendance can be marked for a past day", lab.present[yday] === true);
  ACT.allPresent();
  ok("mark-all-present", S.data.people.filter(p => p.type === "labour" && p.active).every(p => p.present[yday]));

  // import backup
  const backup = demoMill(); backup.profile.mill = "Imported Mill";
  S.pendingImport = backup; ACT.doImport();
  ok("import restores a backup", S.data.profile.mill === "Imported Mill");
  CHANGE.import({ files: [{ _text: JSON.stringify({ app: "Aara", data: backup }) }], value: "" });
  await new Promise(r => setTimeout(r, 20));
  ok("import parses wrapped {app,data} files", S.pendingImport && S.pendingImport.profile.mill === "Imported Mill");
  CHANGE.import({ files: [{ _text: "not json" }], value: "" });
  await new Promise(r => setTimeout(r, 20));
  ok("bad file rejected without replacing data", S.data.profile.mill === "Imported Mill");

  // WhatsApp deep link
  ACT.newOrder(); S.draft.phone = "9876501234"; await ACT.wa();
  ok("wa.me deep link built", opened.length === 1 && opened[0].startsWith("https://wa.me/919876501234"));

  // guards
  S.draft = null; S.tab = "estimate"; render();
  ok("#estimate without a draft falls back to orders", S.tab === "orders");
  ok("safeUrl blocks javascript:", safeUrl("javascript:alert(1)") === "" && safeUrl(" https://x.in ") === "https://x.in");
  ok("addDays uses local dates", addDays(1) > today() && /^\\d{4}-\\d{2}-\\d{2}$/.test(today()));
  ok("quote text + legal + forms render",
     (ACT.newOrder(), quoteText(S.draft).length > 50) && legalHTML().length > 1000 &&
     personForm({ type: "labour", active: true }).length > 200 && stockForm("teak").length > 200 && auctionForm({}).length > 200);

  // order notes land in the quote text
  S.draft.notes = "Deliver to gate 2"; 
  ok("notes appear in quote text", quoteText(S.draft).includes("Deliver to gate 2"));

  // duplicate produces a fresh unsaved quote with the next number
  S.draft.status = "confirmed"; saveDraft();
  const srcId = S.draft.id, srcNo = S.draft.no;
  ACT.dupOrder();
  ok("duplicate makes a new quote", S.draft.id !== srcId && S.draft.no > srcNo &&
     S.draft.saved === false && S.draft.status === "quote" && S.draft.deducted === false);

  // discard clears an unsaved draft
  ACT.discardDraft();
  ok("discard clears the draft", S.draft === null && S.tab === "orders");

  // receivables only count confirmed-ish orders with a balance
  S.data.orders = [
    { id: "o1", no: 1, date: today(), kind: "sale", status: "delivered", items: [{ wood: "teak", mode: "sawn", L: 7, W: 4, T: 2, pcs: 10, rate: 1000 }], transport: 0, discount: 0, advance: 100, gstOn: false, deducted: true },
    { id: "o2", no: 2, date: today(), kind: "sale", status: "quote", items: [{ wood: "teak", mode: "sawn", L: 7, W: 4, T: 2, pcs: 10, rate: 1000 }], transport: 0, discount: 0, advance: 0, gstOn: false, deducted: false },
    { id: "o3", no: 3, date: today(), kind: "sale", status: "cancelled", items: [{ wood: "teak", mode: "sawn", L: 7, W: 4, T: 2, pcs: 10, rate: 1000 }], transport: 0, discount: 0, advance: 0, gstOn: false, deducted: false },
  ];
  const per = lineCft({ mode: "sawn", L: 7, W: 4, T: 2, pcs: 10 }) * 1000;
  ok("receivables excludes quotes/cancelled", Math.abs(receivables() - (per - 100)) < 0.05);
  ok("monthSales counts sold orders", Math.abs(monthSales() - per) < 0.05);
})()`;

const fn = new Function(
  "localStorage", "document", "window", "crypto", "navigator", "sessionStorage",
  "location", "history", "FormData", "FileReader", "ok", "submit", "opened",
  src + ";return " + test.slice(1)  // wrap: evaluate app then return the test promise
);

try {
  await fn(localStorage, document, window, webcrypto, navigator, sessionStorage,
    location, history, FormData, FileReader, ok, submit, opened);
} catch (e) {
  console.error("HARNESS FAIL:", e);
  process.exit(1);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
