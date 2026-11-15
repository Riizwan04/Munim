// After `expo export --platform web`: make the web build installable (home-screen icon, full screen) and able to start offline.
// Writes dist/sw.js (a small service worker that keeps the app shell on the phone) and patches dist/index.html.
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

const dist = new URL("../apps/dealer/dist/", import.meta.url).pathname;
const html = readFileSync(join(dist, "index.html"), "utf8");
const bundles = [...html.matchAll(/src="(\/_expo\/static\/js\/web\/[^"]+\.js)"/g)].map((m) => m[1]);
if (!bundles.length) throw new Error("no JS bundle found in dist/index.html");
const files = ["/", "/index.html", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png", ...bundles].filter((f) => f === "/" || existsSync(join(dist, f)));
const version = createHash("sha256").update(bundles.join("|")).digest("hex").slice(0, 12);

const sw = `// Munim service worker (generated). Build ${version}.
const CACHE = "munim-${version}";
const SHELL = ${JSON.stringify(files.filter((f) => f !== "/index.html"))};
// A response that came through a redirect cannot be used to answer a page load, so keep a clean copy.
const clean = (res) => (res.redirected ? new Response(res.body, { status: 200, statusText: "OK", headers: res.headers }) : res);
async function precache() {
  const c = await caches.open(CACHE);
  await Promise.all(SHELL.map(async (u) => { const res = await fetch(new Request(u, { cache: "reload" })); if (res.ok) await c.put(u, clean(res)); }));
}
self.addEventListener("install", (e) => e.waitUntil(precache().then(() => self.skipWaiting())));
self.addEventListener("activate", (e) => e.waitUntil(
  caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith("munim-") && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (e) => {
  const r = e.request;
  if (r.method !== "GET" || new URL(r.url).origin !== self.location.origin) return;   // never touch the database requests
  if (r.mode === "navigate") { // online: always the newest page; offline: the saved page
    e.respondWith(fetch(r).then(clean).catch(() => caches.match("/").then((hit) => hit || caches.match("/index.html"))));
    return;
  }
  e.respondWith(caches.match(r).then((hit) => hit || fetch(r).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(r, clean(copy))); } return res; })));
});
`;
writeFileSync(join(dist, "sw.js"), sw);

const head = [
  '<link rel="manifest" href="/manifest.webmanifest">',
  '<link rel="apple-touch-icon" href="/apple-touch-icon.png">',
  '<meta name="apple-mobile-web-app-capable" content="yes">',
  '<meta name="mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-status-bar-style" content="default">',
  '<meta name="apple-mobile-web-app-title" content="Munim">',
].join("\n");
const register = `<script>if("serviceWorker"in navigator){window.addEventListener("load",function(){navigator.serviceWorker.register("/sw.js").catch(function(){})})}</script>`;
let out = html.replace("</head>", `${head}\n</head>`).replace("</body>", `${register}\n</body>`);
out = out.replace(/<meta name="viewport"[^>]*>/, '<meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover" />');
writeFileSync(join(dist, "index.html"), out);
console.log(`postbuild: service worker ${version}, ${files.length} files precached`);
