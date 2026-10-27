// Records HackPath's screenshots, GIFs and videos from a local copy filled with demo data, so they can be
// redone whenever the UI changes:
//
//   cd scripts/promo && npm install && npm run record            # everything
//   npm run record -- shots                                       # just screenshots
//   npm run record -- tour teaser                                 # just these clips
//
// Needs a throwaway Postgres database with "demo" in its name, given by the DB_* variables (it is wiped
// before every clip), network access to Judge0, and Playwright's headless Chromium:
// `npx playwright-core install chromium-headless-shell`.
//
// Writes README screenshots to docs/ and the rest (GIFs, MP4s, framed shots, social card) to docs/media/.
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import ffmpeg from "ffmpeg-static";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const BACKEND = path.join(ROOT, "backend"), FRONTEND = path.join(ROOT, "frontend");
const DOCS = path.join(ROOT, "docs"), MEDIA = path.join(DOCS, "media");
const API_PORT = 4100, WEB_PORT = 5199;
const API = `http://localhost:${API_PORT}`, WEB = `http://localhost:${WEB_PORT}`;
const STAGE = { width: 1600, height: 900 }, STAGE_SCALE = 1.5;   // the video frame: 2400x1350, encoded at 1920x1080
const APP = { width: 1300, height: 700 };                         // the browser window inside it
const GIF_WIDTH = 960;
const DEMO = { email: "demo@hackpath.dev", password: "Demo1234!" };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---- the app: a fresh database and API per clip, one Vite dev server for everything ----------------

const env = { ...process.env, PORT: String(API_PORT), JWT_SECRET: process.env.JWT_SECRET || "demo-secret",
  FRONTEND_URL: WEB, POSTMARK_SERVER_TOKEN: process.env.POSTMARK_SERVER_TOKEN || "demo" };

async function waitFor(url, what) {
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(url)).ok) return; } catch {}
    await sleep(250);
  }
  throw new Error(`${what} didn't come up at ${url}`);
}

function startWeb() {
  const p = spawn("npx", ["vite", "--port", String(WEB_PORT), "--strictPort"], {
    cwd: FRONTEND, env: { ...process.env, VITE_API_URL: API }, stdio: "ignore", detached: true });
  return waitFor(WEB, "the frontend").then(() => p);
}

// Wipes the demo database and fills it again, then starts the API (which also resets its rate limits).
async function startApi() {
  execFileSync("node", [path.join(HERE, "seed-demo.js"), "--reset"], { cwd: BACKEND, env, stdio: ["ignore", "ignore", "inherit"] });
  const p = spawn("node", ["server.js"], { cwd: BACKEND, env, stdio: "ignore", detached: true });
  await waitFor(API + "/health", "the API");
  return p;
}

const stop = p => new Promise(r => { if (p.exitCode !== null) return r(); p.once("exit", r); process.kill(-p.pid, "SIGINT"); });

async function tokens() {
  const r = await fetch(API + "/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(DEMO) });
  if (!r.ok) throw new Error(`demo login failed: ${r.status}`);
  return r.json();
}

// ---- fonts ------------------------------------------------------------------------------------------

// Headless Chromium on Linux has no Segoe UI and no emoji font, so the app falls back to DejaVu and shows
// boxes for its emoji. Use the Windows fonts when they're reachable (WSL), so the shots look like the site
// does on a Windows laptop.
const WINFONTS = "/mnt/c/Windows/Fonts";
const FONTS = [["segoeui.ttf", 400, "normal"], ["seguisb.ttf", 600, "normal"], ["segoeuib.ttf", 700, "normal"],
               ["seguibl.ttf", 800, "normal"], ["segoeuii.ttf", 400, "italic"]].filter(([f]) => fs.existsSync(path.join(WINFONTS, f)));
const EMOJI = fs.existsSync(path.join(WINFONTS, "seguiemj.ttf"));
const MONO = ["consola.ttf", "consolab.ttf"].filter(f => fs.existsSync(path.join(WINFONTS, f)));
const FONT_FACES = FONTS.map(([f, w, s]) => `@font-face{font-family:"Segoe UI";src:url(/__font/${f});font-weight:${w};font-style:${s}}`)
  .concat(EMOJI ? [`@font-face{font-family:"Segoe UI Emoji";src:url(/__font/seguiemj.ttf)}`] : [])
  .concat(MONO.map((f, i) => `@font-face{font-family:Consolas;src:url(/__font/${f});font-weight:${i ? 700 : 400}}`)).join("");
const FONT_CSS = FONT_FACES + (FONTS.length ? `html,body,button,input,select,textarea{font-family:"Segoe UI","Segoe UI Emoji",sans-serif!important}` : "");

// The same fonts inline, for pages made with setContent (no origin for /__font/ to resolve against).
const FONT_CSS_INLINE = FONT_FACES.replace(/url\(\/__font\/([^)]+)\)/g,
  (_, f) => `url(data:font/ttf;base64,${fs.readFileSync(path.join(WINFONTS, f)).toString("base64")})`);

const FONT_SCRIPT = `addEventListener("DOMContentLoaded", () => {
  const st = document.createElement("style"); st.textContent = ${JSON.stringify(FONT_CSS)}; document.head.append(st) })`;

async function newContext(browser, opts) {
  const ctx = await browser.newContext(opts);
  await ctx.route("**/__font/*", r => r.fulfill({ path: path.join(WINFONTS, path.basename(new URL(r.request().url()).pathname)) }));
  await ctx.addInitScript(FONT_SCRIPT);
  return ctx;
}

// A plain page for screenshots, signed in as the demo student unless `signedIn` is false.
async function newPage(browser, { width = 1440, height = 900, signedIn = true } = {}) {
  const ctx = await newContext(browser, { viewport: { width, height }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(WEB + "/login");
  if (signedIn) await signIn(page, await tokens());
  return page;
}

const signIn = (page, t) => page.evaluate(t => { localStorage.setItem("accessToken", t.accessToken); localStorage.setItem("refreshToken", t.refreshToken) }, t);

// ---- the stage: the app in a browser window on a backdrop, with captions, title cards and a camera ----
//
// The videos are recorded from a "stage" page that shows the app in an iframe (same origin, so it works as
// usual). Everything around it - the cursor, captions, zooming in - is drawn on the stage.
//
// They're rendered frame by frame on a virtual clock rather than screen-recorded: each frame advances the
// clock by 1/30 s, sets every animation to where it should be at that moment, and is captured. The page's
// own timers run on Playwright's fake clock and move on by the same 1/30 s, so a toast that shows for four
// seconds shows for four seconds of video however long the capture takes. Scenes wait with hold(ms),
// which renders that much video, never with sleep().

const FPS = 30, FRAME = 1000 / FPS;
const CAPTION_SPACE = 120;   // stage px at the bottom kept for the caption when framing a zoom

const LOGO = "data:image/png;base64," + fs.readFileSync(path.join(FRONTEND, "src/assets/logo.png")).toString("base64");
const SITE = "hackpath.co.uk";

const STAGE_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box}html,body{margin:0;height:100%;overflow:hidden}
  body{font-family:"Segoe UI",system-ui,sans-serif;color:#e6e8ee;
    background:radial-gradient(1400px 800px at 85% -10%,#2b4a86 0%,transparent 60%),radial-gradient(1000px 700px at -10% 110%,#1f5a46 0%,transparent 55%),#0b0d12}
  #cam{position:absolute;inset:0;transform-origin:0 0}
  .win{position:absolute;left:${(STAGE.width - APP.width) / 2}px;top:44px;border-radius:12px;overflow:hidden;background:#fff;
    box-shadow:0 30px 90px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.09)}
  .bar{height:34px;background:#1a1e26;display:flex;align-items:center;gap:8px;padding:0 14px;position:relative}
  .bar i{width:12px;height:12px;border-radius:50%}
  .bar span{position:absolute;left:50%;transform:translateX(-50%);font-size:13px;color:#a9b0be;pointer-events:none;
    background:#0f1115;border-radius:7px;padding:3px 60px}
  iframe{display:block;border:0;width:${APP.width}px;height:${APP.height}px;background:#fff}

  #cap{position:absolute;left:50%;bottom:30px;opacity:0;pointer-events:none;
    background:rgba(13,15,20,.88);backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.12);border-radius:14px;
    padding:14px 26px 15px;box-shadow:0 16px 50px rgba(0,0,0,.5);text-align:center;white-space:nowrap}
  #cap .k{font-size:12.5px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#7fb0ff;margin-bottom:3px}
  #cap .t{font-size:25px;font-weight:600;line-height:1.3}
  #cap .t em{font-style:normal;color:#f5b942}

  #card{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;
    background:inherit;opacity:0;pointer-events:none;z-index:5}
  #card .logo{display:flex;align-items:center;gap:22px;font-size:78px;font-weight:700;letter-spacing:-1px}
  #card .logo img{width:88px;height:88px;border-radius:18px}
  #card .line{font-size:38px;font-weight:600}
  #card .line em{font-style:normal;color:#60a5fa}
  #card .sub{font-size:24px;color:#a9b0be}
  #card .url{font-size:30px;font-weight:600;background:#2563eb;border-radius:12px;padding:12px 28px;color:#fff}

  #cur{position:absolute;left:0;top:0;width:30px;height:30px;z-index:9;pointer-events:none;opacity:0;filter:drop-shadow(0 2px 3px rgba(0,0,0,.5))}
  .ring{position:absolute;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;border:3px solid #3b82f6;z-index:8;pointer-events:none}
</style></head><body>
<div id="cam"><div class="win"><div class="bar"><i style="background:#f06a6a"></i><i style="background:#f5b942"></i><i style="background:#3ecf8e"></i>
  <span>${SITE}</span></div><iframe></iframe></div></div>
<div id="cap"><div class="k"></div><div class="t"></div></div>
<div id="card"></div>
<div id="cur"><svg viewBox="0 0 22 22" width="30" height="30"><path d="M3 2l14 9.5-6.2 1.1 3.6 7.1-2.6 1.3-3.6-7.2L3 18z" fill="#fff" stroke="#111" stroke-width="1.3" stroke-linejoin="round"/></svg></div>
<script>
  // Every animation is a value tweened from -> to over [t0, t0 + d] of the virtual clock; render(T) draws time T.
  const $ = id => document.getElementById(id), lerp = (a, b, t) => a + (b - a) * t;
  const inOut = t => t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2, out = t => 1 - (1 - t) ** 3;
  const prog = (a, T) => a.d ? Math.min(1, Math.max(0, (T - a.t0) / a.d)) : 1;
  const A = { cam: { from: { x: 0, y: 0, z: 1 }, to: { x: 0, y: 0, z: 1 }, t0: 0, d: 0 },
              cap: { from: 0, to: 0, t0: 0, d: 0 }, card: { from: 0, to: 0, t0: 0, d: 0 }, cur: { from: 0, to: 0, t0: 0, d: 0 } };
  const rings = [];
  window.now = 0;
  window.camAt = T => { const c = A.cam, k = inOut(prog(c, T));
    return { x: lerp(c.from.x, c.to.x, k), y: lerp(c.from.y, c.to.y, k), z: lerp(c.from.z, c.to.z, k) } };
  const val = (a, T) => lerp(a.from, a.to, out(prog(a, T)));
  window.tween = (name, to, d) => { A[name] = { from: name === "cam" ? camAt(now) : val(A[name], now), to, t0: now, d } };
  window.camTarget = () => A.cam.to;
  window.cursorAt = (x, y) => { $("cur").style.transform = \`translate(\${x - 4}px,\${y - 3}px)\` };
  window.ring = (x, y) => { const r = document.createElement("div"); r.className = "ring"; r.style.left = x + "px"; r.style.top = y + "px";
    document.body.append(r); rings.push({ el: r, t0: now }) };
  window.setCaption = (k, t) => { $("cap").querySelector(".k").textContent = k; $("cap").querySelector(".t").innerHTML = t };
  window.setCard = h => { $("card").innerHTML = h };

  window.render = T => {
    now = T;
    const c = camAt(T); $("cam").style.transform = \`translate(\${c.x}px,\${c.y}px) scale(\${c.z})\`;
    const o = val(A.cap, T); $("cap").style.opacity = o; $("cap").style.transform = \`translate(-50%,\${(1 - o) * 22}px)\`;
    const co = val(A.card, T); $("card").style.opacity = co;
    [...$("card").children].forEach((el, i) => {   // the card's lines rise in one after another
      const p = A.card.to ? out(Math.min(1, Math.max(0, (T - A.card.t0 - 250 * i) / 700))) : 1;
      el.style.opacity = p; el.style.transform = \`translateY(\${(1 - p) * 16}px)\` });
    $("cur").style.opacity = val(A.cur, T);
    for (const r of [...rings]) { const p = (T - r.t0) / 500;
      if (p >= 1) { r.el.remove(); rings.splice(rings.indexOf(r), 1) }
      else { r.el.style.opacity = 1 - p; r.el.style.transform = \`scale(\${lerp(.3, 1.25, out(p))})\` } }
  };
</script></body></html>`;

async function newStage(browser, { start = "/dashboard", signedIn = true } = {}) {
  const ctx = await newContext(browser, { viewport: STAGE, deviceScaleFactor: STAGE_SCALE });
  await ctx.route(WEB + "/__stage", r => r.fulfill({ contentType: "text/html", body: STAGE_HTML }));
  await ctx.clock.install();
  await ctx.clock.pauseAt(Date.now() + 1000);   // from here the page's time only moves when we move it
  const page = await ctx.newPage();
  await page.goto(WEB + "/__stage");
  if (signedIn) await signIn(page, await tokens());
  const s = { ctx, page, app: null, T: 0, n: 0, dir: null, capOn: false, mouse: { x: STAGE.width * .62, y: STAGE.height * .6 } };
  await go(s, start);
  return s;
}

// Load a page of the app in the window (between scenes, not on camera).
async function go(s, route) {
  await s.page.evaluate(src => document.querySelector("iframe").src = src, WEB + route);
  s.app = await (await s.page.waitForSelector("iframe")).contentFrame();
  await idle(s);
}

// Let the app finish loading: run its timers on and wait until nothing's loading, without recording.
async function idle(s, ms = 1500) {
  for (let i = 0; i < ms / 100; i++) { await s.ctx.clock.runFor(100); await sleep(60); }
  await s.app.evaluate(() => document.fonts.ready);
}

const ease = t => t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
const loc = (s, target) => typeof target === "string" ? s.app.locator(target).first() : target;
const tween = (s, name, to, d) => s.page.evaluate(([n, to, d]) => tween(n, to, d), [name, to, d]);

// One frame of video: move both clocks on, draw that moment, capture it.
async function frame(s) {
  s.T += FRAME;
  await s.ctx.clock.runFor(FRAME);
  await s.page.evaluate(T => render(T), s.T);
  const { data } = await (s.cdp ??= await s.ctx.newCDPSession(s.page)).send("Page.captureScreenshot", { format: "jpeg", quality: 92 });
  fs.writeFileSync(path.join(s.dir, `${String(s.n++).padStart(5, "0")}.jpg`), Buffer.from(data, "base64"));
}
async function hold(s, ms) { for (let i = Math.round(ms / FRAME); i > 0; i--) await frame(s); }

// Wait for something the app is fetching (Judge0 marking code, a page loading): record up to `show` ms of
// it happening, then wait off camera, so a slow network doesn't make a slow video. Off camera the page's
// clock keeps ticking for page loads (Monaco needs it), but stops for a submission, so the toasts that
// come with the result still show for as long as they should.
async function settle(s, selector, { show = 1200, tick = true } = {}) {
  const l = s.app.locator(selector).first();
  for (let t = 0; !(await l.isVisible()); t += FRAME) {
    if (t < show) await frame(s);
    else { if (tick) await s.ctx.clock.runFor(50); await sleep(100); }
    if (t > 60000) throw new Error(`gave up waiting for ${selector}`);
  }
}

// Where an element of the app is on the stage (at the current camera). Playwright's boundingBox() leaves
// out the camera's scale for elements inside the iframe, so map it ourselves.
async function box(s, l) {
  const r = await l.evaluate(e => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height } });
  const c = await s.page.evaluate(() => { const f = document.querySelector("iframe"); return { ...camAt(now), fx: f.offsetLeft + f.parentElement.offsetLeft, fy: f.offsetTop + f.parentElement.offsetTop } });
  return { x: c.x + c.z * (c.fx + r.x), y: c.y + c.z * (c.fy + r.y), width: r.width * c.z, height: r.height * c.z };
}

// Is the element inside the app's scrolled view (not necessarily inside the camera's frame), and not
// under the sticky navbar?
const NAVBAR = 72;
const inApp = l => l.evaluate((e, nav) => { const r = e.getBoundingClientRect(); return r.top >= nav && r.bottom <= innerHeight && r.height > 0 }, NAVBAR);

// Scroll the page so the element sits about a fifth of the way down, frame by frame.
async function reveal(s, l, ms = 700) {
  const by = await l.evaluate(e => {
    const sc = document.scrollingElement, want = e.getBoundingClientRect().top - innerHeight * .18;
    return Math.max(-sc.scrollTop, Math.min(sc.scrollHeight - innerHeight - sc.scrollTop, want));
  });
  if (Math.abs(by) > 2) await scroll(s, by, ms);
}

async function scroll(s, by, ms = 800) {
  const from = await s.app.evaluate(() => document.scrollingElement.scrollTop);
  const n = Math.max(1, Math.round(ms / FRAME));
  for (let i = 1; i <= n; i++) {
    await s.app.evaluate(v => document.scrollingElement.scrollTop = v, from + by * ease(i / n));
    await frame(s);
  }
}
const scrollTop = async (s, ms) => scroll(s, -(await s.app.evaluate(() => document.scrollingElement.scrollTop)), ms);

const zoomed = s => s.page.evaluate(() => camTarget().z !== 1);

async function unzoom(s, ms = 800) {
  if (!(await zoomed(s))) return;
  await tween(s, "cam", { x: 0, y: 0, z: 1 }, ms); await hold(s, ms + 100);
}

// Point the camera at part of the app. If it has to scroll there, zoom out first, scroll, then zoom in,
// so nothing moves under a zoomed-in camera. The element is centered, or, when it's wider than the frame
// at that zoom, aligned to its left edge (anchor "left") or right edge (anchor "right").
async function zoom(s, target, z = 1.5, { dy = 0, anchor = "left", ms = 900 } = {}) {
  const l = loc(s, target);
  await l.waitFor();
  if (!(await inApp(l))) { await unzoom(s); await reveal(s, l); }
  const b = await box(s, l);
  const to = await s.page.evaluate(([b, z, dy, anchor, W, H, CS]) => {
    const c = camAt(now), u = { x: (b.x - c.x) / c.z, y: (b.y - c.y) / c.z, w: b.width / c.z, h: b.height / c.z };   // unzoomed px
    const w = document.querySelector(".win"), L = w.offsetLeft, T = w.offsetTop, R = L + w.offsetWidth, B = T + w.offsetHeight;
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    let x = z * u.w <= W - 120 ? W / 2 - z * (u.x + u.w / 2) : anchor === "right" ? W - 60 - z * (u.x + u.w) : 60 - z * u.x;
    let y = (H - CS) / 2 - z * (u.y + u.h / 2 + dy);
    if (z * (R - L) >= W) x = clamp(x, W - z * R - 36, -z * L + 36);   // a little backdrop past the window's edge is fine
    y = clamp(y, H - CS - z * B - 60, -z * T + 24);   // the window's bottom may rise a little above the caption
    return { x, y, z };
  }, [b, z, dy, anchor, STAGE.width, STAGE.height, CAPTION_SPACE]);
  await tween(s, "cam", to, ms); await hold(s, ms + 150);
}

// A caption at the bottom: a small heading and a line saying what's going on. `text` may hold <em>.
async function caption(s, kicker, text) {
  if (s.capOn) { await tween(s, "cap", 0, 260); await hold(s, 280); }
  await s.page.evaluate(([k, t]) => setCaption(k, t), [kicker, text]);
  await tween(s, "cap", 1, 420); await hold(s, 420);
  s.capOn = true;
}
async function uncaption(s) { if (s.capOn) { await tween(s, "cap", 0, 300); await hold(s, 320); s.capOn = false; } }

// A beat: the caption goes, the camera moves to what the next caption is about, the new caption comes in.
async function beat(s, kicker, text, target, z, opts = {}) {
  await uncaption(s);
  if (target) await zoom(s, target, z, opts); else await unzoom(s);
  await caption(s, kicker, text);
}

// A full-screen card over everything (the opening title, the closing link, a jump in time). `during` runs
// while the card covers the app, for changing pages without it showing.
async function card(s, html, ms, { stay = false, first = false, during } = {}) {
  await s.page.evaluate(h => setCard(h), html);
  await tween(s, "card", 1, first ? 0 : 600); await hold(s, first ? 0 : 600);   // the opening card is up from the first frame
  if (during) await during();
  await hold(s, ms);
  if (stay) return;   // the video ends on it
  await tween(s, "card", 0, 700); await hold(s, 700);
}

async function moveTo(s, target, { ms = 600, dx = 0, dy = 0 } = {}) {
  const l = loc(s, target);
  await l.waitFor();
  if (!(await inApp(l))) { await unzoom(s); await reveal(s, l); }
  const b = await box(s, l);
  const x = b.x + b.width / 2 + dx, y = b.y + b.height / 2 + dy, { mouse } = s;
  if (x < 0 || x > STAGE.width || y < 0 || y > STAGE.height - 40) console.warn(`  note: ${target} is out of frame`);
  await tween(s, "cur", 1, 200);
  const n = Math.max(1, Math.round(ms / FRAME));
  for (let i = 1; i <= n; i++) {
    const e = ease(i / n), px = mouse.x + (x - mouse.x) * e, py = mouse.y + (y - mouse.y) * e;
    await s.page.mouse.move(px, py);
    await s.page.evaluate(([x, y]) => cursorAt(x, y), [px, py]);
    await frame(s);
  }
  mouse.x = x; mouse.y = y;
}

async function click(s, target, opts) {
  await moveTo(s, target, opts);
  await hold(s, 130);
  await s.page.evaluate(([x, y]) => ring(x, y), [s.mouse.x, s.mouse.y]);
  await s.page.mouse.down(); await s.page.mouse.up();
  await hold(s, 100);
}

const hideCursor = async s => { await tween(s, "cur", 0, 250); await hold(s, 250); };

// Type into a focused input, a key at a time.
async function type(s, text, delay = 70) {
  for (const ch of text) { await s.page.keyboard.type(ch); await hold(s, delay + Math.random() * 30); }
}

// Type into the Monaco editor. Its auto-closing brackets and auto-indent would mangle typed keys, so put
// each character straight into the document, as if it had been typed exactly.
async function typeCode(s, code, delay = 45) {
  await s.app.evaluate(() => { const ed = monaco.editor.getEditors()[0]; ed.setValue(""); ed.focus() });
  for (const ch of code) {
    await s.app.evaluate(ch => {
      const ed = monaco.editor.getEditors()[0], m = ed.getModel(), end = m.getFullModelRange().getEndPosition();
      ed.executeEdits("demo", [{ range: new monaco.Range(end.lineNumber, end.column, end.lineNumber, end.column), text: ch }]);
      ed.setPosition(m.getFullModelRange().getEndPosition());
    }, ch);
    await hold(s, ch === "\n" ? delay * 3 : delay + Math.random() * 25);
  }
}

// ---- the app's parts, as locators ---------------------------------------------------------------------

const box2 = (s, label) => s.app.locator(`.rounded-2xl:has(p:text-is("${label}"))`).last();   // a dashboard card by its heading
const challengeCard = (s, title) => s.app.locator("button", { hasText: title }).first();
const solveHeader = s => s.app.locator(".rounded-2xl:has(button:text-is('Submit'))").last();
const toast = s => s.app.locator("div.shadow-lg:has-text('Unlocked')").first();

const SOLUTION = `const word = 'programming';
let vowels = 0;

for (const ch of word) {
  if ('aeiou'.includes(ch)) vowels++;
}

console.log(vowels);
`;

const TITLE = `<div class="logo"><img src="${LOGO}">HackPath</div><div class="line">Learn to code. <em>One path at a time.</em></div>`;
const OUTRO = `<div class="logo"><img src="${LOGO}">HackPath</div>
  <div class="sub">Real code · instant marking · XP, streaks, badges and a leaderboard</div>
  <div class="url">${SITE}</div><div class="sub">Free to try · sign up in seconds</div>`;

// ---- recording ----------------------------------------------------------------------------------

async function record(s, name, scene, fps = 15, gifWidth = GIF_WIDTH) {
  s.dir = fs.mkdtempSync(path.join(os.tmpdir(), "hackpath-rec-"));
  try {
    await scene(s);
    await hold(s, 500);
  } catch (e) {
    const shot = path.join(os.tmpdir(), `hackpath-${name}-failed.png`);
    await s.page.screenshot({ path: shot }); console.error(`  failed; the screen at that moment: ${shot}`);
    throw e;
  }
  const mp4 = path.join(MEDIA, `${name}.mp4`), gif = path.join(MEDIA, `${name}.gif`);
  const run = args => execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "inherit" });
  run(["-framerate", String(FPS), "-i", path.join(s.dir, "%05d.jpg"), "-vf", "scale=1920:1080:flags=lanczos",
       "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4]);
  run(["-i", mp4, "-vf", `fps=${fps},scale=${gifWidth}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=160:stats_mode=diff[p];` +
       "[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle", gif]);
  fs.rmSync(s.dir, { recursive: true, force: true });
  const size = f => (fs.statSync(f).size / 1048576).toFixed(1) + " MB";
  console.log(`  ${path.relative(ROOT, gif)} (${size(gif)}), ${path.relative(ROOT, mp4)} (${size(mp4)}), ${(s.n / FPS).toFixed(0)} s`);
}

// The part every video shares: open the challenge, write the answer, submit it, and the rewards come in.
async function solve(s, { typeDelay = 45, short = false } = {}) {
  await beat(s, "Solve", "Write real code in the browser, in the same editor as <em>VS Code</em>", ".rounded-2xl:has(:text-is('Instructions'))", 1.35, { dy: 120 });
  await typeCode(s, SOLUTION, typeDelay); await hold(s, short ? 300 : 700);
  await beat(s, "Instant marking", "Submit, and your code runs in a sandbox and is checked straight away", null);
  await click(s, s.app.getByRole("button", { name: "Submit" }));
  await settle(s, ":text-is('Correct ✅')", { tick: false });
  await beat(s, "Rewards", "<em>Correct!</em> Every solve earns XP, and milestones unlock badges", solveHeader(s), 1.15, { dy: -60, ms: 700 });
  await moveTo(s, toast(s)); await hold(s, short ? 1300 : 2000);
}

const CLIPS = {
  // The full walkthrough: for the top of the README and for launch posts.
  async tour(s) {
    await card(s, TITLE, 2400, { first: true });

    await caption(s, "Sign up", "Create an account and you're straight in. <em>No email codes.</em>");
    await click(s, s.app.getByRole("textbox", { name: /name/i }).or(s.app.locator("input[placeholder=Name]")));
    await type(s, "Sam Carter", 55);
    await click(s, "input[placeholder=Email]"); await type(s, "sam@example.com", 40);
    await click(s, "input[type=password]"); await type(s, "Sup3rSecret!", 40);
    await click(s, s.app.getByRole("button", { name: "Create account" }));
    await settle(s, ":text-is('Dashboard')"); await hold(s, 1600);

    await uncaption(s); await hideCursor(s);
    await card(s, `<div class="line">A week later…</div>`, 900, { during: async () => {
      await signIn(s.page, await tokens()); await go(s, "/dashboard"); } });

    await caption(s, "Level up", "Earn XP, level up and climb the ranks from Bronze to Master"); await hold(s, 600);
    await zoom(s, box2(s, "Level"), 1.6); await hold(s, 1600);
    await beat(s, "Streaks", "Keep a <em>daily streak</em> going", box2(s, "Streak"), 1.6); await hold(s, 1400);
    await beat(s, "Leaderboard", "See where you stand against everyone else", box2(s, "Leaderboard"), 1.4, { anchor: "right" });
    await moveTo(s, s.app.getByText("745 XP", { exact: true }).last()); await hold(s, 1500);

    await beat(s, "Learning paths", "Pick a language and a level: Beginner, Intermediate or Advanced", s.app.getByText("Browse & Subscribe"), 1.25, { dy: 110 });
    await moveTo(s, s.app.getByRole("button", { name: "Java", exact: true })); await hold(s, 1200);
    await click(s, s.app.getByRole("button", { name: "Continue" }).first());
    await settle(s, ":text-is('Arrays & Loops')"); await scrollTop(s, 10);
    await beat(s, "Learning paths", "Work through each path section by section", null); await hold(s, 1200);
    await click(s, s.app.getByRole("button", { name: "Start / Continue" }).nth(2));
    await settle(s, "button:has-text('Count the Vowels')");
    await beat(s, "Progress", "Every challenge shows what you've finished and what's next", challengeCard(s, "Sum an Array"), 1.25, { dy: 60 });
    await hold(s, 1500);
    await click(s, challengeCard(s, "Count the Vowels"));
    await settle(s, ".monaco-editor .view-lines"); await scrollTop(s, 10);

    await solve(s);
    await unzoom(s); await uncaption(s);

    await caption(s, "Rewards", "Your badges and achievements, all in one place");
    await click(s, s.app.locator("button[title='View your achievements']"));
    await settle(s, ":text-is('Rewards')"); await hold(s, 600);
    await click(s, s.app.getByRole("button", { name: /Badges/ }).first()); await hold(s, 600);
    await zoom(s, s.app.locator(".rounded-2xl:has-text('Sharp Shooter')").last(), 1.5); await hold(s, 2000);
    await uncaption(s); await hideCursor(s); await unzoom(s);

    await card(s, OUTRO, 4200, { stay: true });
  },

  // About 30 seconds for LinkedIn and X: the dashboard, solving a challenge, the reward.
  async teaser(s) {
    await card(s, TITLE, 1800, { first: true });
    await caption(s, "Level up", "Learn to code by solving challenges: earn XP, keep a streak, climb the leaderboard");
    await hold(s, 800);
    await zoom(s, box2(s, "Leaderboard"), 1.4, { anchor: "right" }); await hold(s, 1500);
    await uncaption(s); await hideCursor(s);
    await card(s, `<div class="line">Pick a challenge…</div>`, 500, { during: () => go(s, `/challenges/${s.challengeId}/solve`) });
    await settle(s, ".monaco-editor .view-lines");
    await solve(s, { typeDelay: 28, short: true });
    await uncaption(s); await hideCursor(s);
    await card(s, OUTRO, 3600, { stay: true });
  },

  // Just solving one, for the README.
  async solving(s) {
    await solve(s, { typeDelay: 40 });
    await uncaption(s); await hideCursor(s); await unzoom(s);
  },
};

// Where each clip starts.
const STARTS = { tour: { start: "/register", signedIn: false }, teaser: {}, solving: { challenge: true } };

// The challenge the videos solve.
function challengeId() {
  return execFileSync("psql", ["-tA", "-h", process.env.DB_HOST || "localhost", "-p", process.env.DB_PORT || "5432",
    "-U", process.env.DB_USER || "postgres", process.env.DB_DATABASE, "-c", `select id from challenges where title='Count the Vowels'`],
    { env: { ...process.env, PGPASSWORD: process.env.DB_PASSWORD || "" } }).toString().trim();
}

// ---- screenshots --------------------------------------------------------------------------------

async function shots(browser) {
  const out = f => { const p = path.join(f.includes("/") ? DOCS : MEDIA, f); console.log("  " + path.relative(ROOT, p)); return p; };
  const at = async (page, route, ms = 1800) => { await page.goto(WEB + route); await sleep(ms); };

  let page = await newPage(browser, { signedIn: false });
  await at(page, "/");
  await page.screenshot({ path: out("./home.png") });
  await page.context().close();

  page = await newPage(browser);
  await at(page, "/dashboard");
  await page.screenshot({ path: out("./dashboard.png") });
  await page.screenshot({ path: path.join(os.tmpdir(), "hackpath-card.png"), clip: { x: 0, y: 0, width: 1440, height: 680 } });

  await page.getByRole("button", { name: "Continue" }).first().click(); await sleep(1500);
  await page.getByRole("button", { name: "Start / Continue" }).nth(2).click(); await sleep(1800);
  await page.getByText("Arrays & Loops", { exact: true }).evaluate(e => scrollTo(0, e.getBoundingClientRect().top + scrollY - 400));
  await sleep(300);
  await page.screenshot({ path: out("./path.png") });

  await page.locator("button", { hasText: "Count the Vowels" }).click();
  await page.waitForSelector(".monaco-editor .view-lines"); await sleep(1500);
  await page.evaluate(code => monaco.editor.getEditors()[0].setValue(code), SOLUTION);
  await page.getByRole("button", { name: "Submit" }).click();
  await page.waitForSelector(":text-is('Correct ✅')", { timeout: 60000 });
  await page.evaluate(() => scrollTo(0, 0)); await sleep(600);
  await page.screenshot({ path: out("./solve.png") });

  await page.locator("button[title='View your achievements']").click(); await sleep(1800);
  await page.getByRole("button", { name: /Badges/ }).first().click(); await sleep(600);
  await page.screenshot({ path: out("./rewards.png") });
  await page.context().close();

  page = await newPage(browser, { signedIn: false });
  const r = await fetch(API + "/auth/login", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@hackpath.dev", password: DEMO.password }) });
  await signIn(page, await r.json());
  await at(page, "/admin/analytics", 2500);
  await page.screenshot({ path: out("./analytics.png") });
  await page.context().close();
}

// A screenshot on a backdrop with a window title bar, for posts; and GitHub's social preview card.
async function framed(browser) {
  const img = f => "data:image/png;base64," + fs.readFileSync(path.isAbsolute(f) ? f : path.join(DOCS, f)).toString("base64");
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 640 }, deviceScaleFactor: 2 })).newPage();
  const base = `<style>${FONT_CSS_INLINE}*{box-sizing:border-box}body{margin:0;font-family:"Segoe UI",system-ui,sans-serif;color:#e6e8ee;
    background:radial-gradient(1200px 700px at 85% -10%,#2b4a86 0%,transparent 60%),radial-gradient(900px 600px at -10% 110%,#1f5a46 0%,transparent 55%),#0b0d12}
    .win{border-radius:12px;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.55),0 0 0 1px rgba(255,255,255,.08);background:#fff}
    .bar{height:30px;background:#1a1e26;display:flex;align-items:center;gap:7px;padding:0 12px;position:relative}.bar i{width:11px;height:11px;border-radius:50%}
    .bar span{position:absolute;left:50%;transform:translateX(-50%);font-size:12px;color:#a9b0be;background:#0f1115;border-radius:6px;padding:2px 50px}
    .win img{display:block;width:100%}</style>`;
  const win = src => `<div class="win"><div class="bar"><i style="background:#f06a6a"></i><i style="background:#f5b942"></i><i style="background:#3ecf8e"></i><span>${SITE}</span></div><img src="${src}"></div>`;

  // GitHub's social preview size: 1280x640.
  await page.setContent(`${base}<div style="display:flex;height:640px;align-items:center;padding:0 0 0 64px;gap:44px;overflow:hidden">
    <div style="flex:0 0 410px"><div style="display:flex;align-items:center;gap:14px"><img src="${LOGO}" width="54" height="54" style="border-radius:12px">
      <span style="font-size:46px;font-weight:700;letter-spacing:-.5px">HackPath</span></div>
      <div style="font-size:31px;line-height:1.25;font-weight:600;margin:26px 0 18px">Learn to code.<br><span style="color:#60a5fa">One path at a time.</span></div>
      <div style="font-size:19px;line-height:1.5;color:#a9b0be">Solve real coding challenges in the browser, get marked instantly,
        and earn XP, streaks and badges on the way.</div>
      <div style="margin-top:26px;font-size:19px;font-weight:600;background:#2563eb;border-radius:9px;padding:10px 18px;display:inline-block">${SITE}</div></div>
    <div style="flex:1;transform:translateY(60px);min-width:800px">${win(img(path.join(os.tmpdir(), "hackpath-card.png")))}</div></div>`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(MEDIA, "social-card.png") });
  console.log("  docs/media/social-card.png");

  await page.setViewportSize({ width: 1280, height: 900 });
  for (const f of ["home", "dashboard", "path", "solve", "rewards", "analytics"]) {
    await page.setContent(`${base}<div style="padding:56px 72px">${win(img(f + ".png"))}</div>`);
    await page.evaluate(() => document.fonts.ready);
    await page.locator("body > div").screenshot({ path: path.join(MEDIA, `${f}-framed.png`) });
    console.log(`  docs/media/${f}-framed.png`);
  }
  await page.context().close();
}

// ---- main ---------------------------------------------------------------------------------------

if (!/demo/i.test(process.env.DB_DATABASE || "")) {
  console.error('Set DB_DATABASE (and DB_HOST, DB_PORT, DB_USER, DB_PASSWORD) to a throwaway database with "demo" in its name.');
  process.exit(1);
}
const want = process.argv.slice(2);
const pick = k => !want.length || want.includes(k);
fs.mkdirSync(MEDIA, { recursive: true });
const web = await startWeb();
const browser = await chromium.launch();
try {
  if (pick("shots")) {
    console.log("screenshots");
    const api = await startApi();
    try { await shots(browser); } finally { await stop(api); }
    await framed(browser);
  }
  for (const [name, scene] of Object.entries(CLIPS)) {
    if (!pick(name)) continue;
    console.log(name);
    const api = await startApi();   // a fresh database each time, so one clip's solve doesn't leak into the next
    try {
      const { challenge, ...opts } = STARTS[name];
      const id = challengeId();
      const s = await newStage(browser, challenge ? { start: `/challenges/${id}/solve` } : opts);
      s.challengeId = id;
      if (challenge) await s.app.waitForSelector(".monaco-editor .view-lines");
      await record(s, name, scene, ...(name === "tour" ? [10, 800] : [12]));   // keep the long one's GIF small
      await s.ctx.close();
    } finally { await stop(api); }
  }
} finally {
  await browser.close();
  await stop(web);
}
