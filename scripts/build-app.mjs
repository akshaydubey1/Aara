#!/usr/bin/env node
/* Copies the web assets into www/ for `npx cap sync`.
   The app is deliberately a thin native shell around the same PWA:
   index.html detects window.Capacitor and routes file saves/shares
   through the Filesystem and Share plugins instead of blob downloads. */
import {cpSync, mkdirSync, rmSync, existsSync} from "node:fs";
import {join, dirname} from "node:path";
import {fileURLToPath} from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const www = join(root, "www");

const FILES = [
  "index.html", "sw.js", "sync.js",
  "manifest.webmanifest", "icon.svg",
  "icon-192.png", "icon-512.png", "apple-touch-icon.png",
];

rmSync(www, {recursive: true, force: true});
mkdirSync(www, {recursive: true});

for (const f of FILES) cpSync(join(root, f), join(www, f));
cpSync(join(root, "vendor"), join(www, "vendor"), {recursive: true});

// The service worker only makes sense on the web; on a native shell the
// Capacitor runtime serves the bundle itself. Keep the file (harmless) but
// skip registration noise by leaving index.html's https check in place —
// capacitor:// origins fail the http(s) test and skip registration already.

console.log("www/ ready — run `npx cap sync` next");
