// On Approval — try it on, take it home on approval, keep or send back.
// Zero dependencies. Node >= 20.  `node src/server.mjs`  then open http://localhost:8080
import http from "node:http";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname, normalize, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import * as youcam from "./youcam.mjs";
import { fitFor, returnRisk } from "./fit.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUB = join(ROOT, "public");
const DATA = process.env.DATA_DIR || join(ROOT, "data");
const UP = join(DATA, "uploads");
const STORE = join(DATA, "store.json");
const PORT = Number(process.env.PORT || 8080);
const MAX_BODY = 12 * 1024 * 1024;

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".json": "application/json", ".ico": "image/x-icon" };

// ---------- store ----------
let store;
async function load() {
  await mkdir(UP, { recursive: true });
  if (existsSync(STORE)) store = JSON.parse(await readFile(STORE, "utf8"));
  else store = JSON.parse(await readFile(join(ROOT, "seed", "store.json"), "utf8"));
  store.tryons ??= {};
  store.orders ??= [];
}
let saving = Promise.resolve();
function save() { saving = saving.then(() => writeFile(STORE, JSON.stringify(store, null, 2))); return saving; }

// ---------- helpers ----------
function send(res, code, body, type = "application/json") {
  res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(type === "application/json" ? JSON.stringify(body) : body);
}
async function body(req) {
  const chunks = []; let n = 0;
  for await (const c of req) { n += c.length; if (n > MAX_BODY) throw Object.assign(new Error("Image too large (max 12 MB)"), { code: 413 }); chunks.push(c); }
  const s = Buffer.concat(chunks).toString("utf8");
  return s ? JSON.parse(s) : {};
}
function parseDataUrl(u) {
  const m = /^data:(image\/(png|jpeg|jpg|webp));base64,(.+)$/s.exec(u || "");
  if (!m) throw Object.assign(new Error("Send a PNG, JPEG or WebP image"), { code: 400 });
  const type = m[1] === "image/jpg" ? "image/jpeg" : m[1];
  return { type, ext: type === "image/png" ? ".png" : type === "image/webp" ? ".webp" : ".jpg", buf: Buffer.from(m[3], "base64") };
}
async function saveUpload(dataUrl, prefix) {
  const { type, ext, buf } = parseDataUrl(dataUrl);
  const name = `${prefix}-${randomUUID().slice(0, 8)}${ext}`;
  await writeFile(join(UP, name), buf);
  return { name, type, buf };
}
async function fileBytes(webPath) {
  // webPath is /uploads/x or /img/x
  const p = webPath.startsWith("/uploads/") ? join(UP, webPath.slice(9)) : join(PUB, webPath);
  const buf = await readFile(p);
  const ext = extname(p).toLowerCase();
  return { buf, type: TYPES[ext] || "image/jpeg", name: p.split("/").pop() };
}
const item = (id) => store.items.find((i) => i.id === id);
const dayMs = 86400000;

// ---------- API ----------
const routes = {
  "GET /api/state": async () => ({
    mock: youcam.isMock(),
    settings: store.settings,
    items: store.items,
  }),

  // Merchant adds an item with a product photo and a size chart.
  "POST /api/items": async (req) => {
    const b = await body(req);
    if (!b.name || !b.image) throw Object.assign(new Error("Name and photo are required"), { code: 400 });
    const up = await saveUpload(b.image, "item");
    const it = {
      id: randomUUID().slice(0, 8), name: String(b.name).slice(0, 80), price: Number(b.price) || 0,
      category: ["auto", "upper_body", "lower_body", "full_body", "outer", "shoes"].includes(b.category) ? b.category : "auto",
      img: `/uploads/${up.name}`, blurb: String(b.blurb || "").slice(0, 200), chart: b.chart || store.settings.defaultChart,
    };
    store.items.push(it); await save();
    return it;
  },

  "POST /api/settings": async (req) => {
    const b = await body(req);
    if (b.baseReturnRate != null) store.settings.baseReturnRate = Math.min(0.9, Math.max(0.01, Number(b.baseReturnRate)));
    if (b.approvalDays != null) store.settings.approvalDays = Math.min(60, Math.max(1, Math.round(Number(b.approvalDays))));
    await save(); return store.settings;
  },

  // Fit for one item from the shopper's measure card.
  "POST /api/fit": async (req) => {
    const { card, itemId } = await body(req);
    const it = item(itemId); if (!it) throw Object.assign(new Error("No such item"), { code: 404 });
    return fitFor(card, it.chart);
  },

  // Start a YouCam try-on: selfie (data URL) + item.
  "POST /api/tryon": async (req) => {
    const { selfie, itemId } = await body(req);
    const it = item(itemId); if (!it) throw Object.assign(new Error("No such item"), { code: 404 });
    const s = await saveUpload(selfie, "selfie");
    const id = randomUUID();
    const rec = { id, itemId, selfie: `/uploads/${s.name}`, status: "running", createdAt: Date.now() };
    if (youcam.isMock()) {
      rec.mock = true; rec.readyAt = Date.now() + 2500;
    } else {
      const g = await fileBytes(it.img);
      const [srcFileId, refFileId] = await Promise.all([
        youcam.uploadImage(s.buf, s.type, s.name),
        youcam.uploadImage(g.buf, g.type, g.name),
      ]);
      rec.taskId = await youcam.startTryOn({ srcFileId, refFileId, category: it.category });
    }
    store.tryons[id] = rec; await save();
    return { id, status: rec.status };
  },

  "GET /api/tryon/:id": async (_req, id) => {
    const rec = store.tryons[id]; if (!rec) throw Object.assign(new Error("No such try-on"), { code: 404 });
    if (rec.status === "running") {
      if (rec.mock) {
        if (Date.now() >= rec.readyAt) { rec.status = "success"; rec.result = rec.selfie; await save(); }
      } else {
        const t = await youcam.getTryOn(rec.taskId);
        if (t.status === "success" && t.url) {
          // Keep our own copy: YouCam result links expire after 2 hours.
          const r = await fetch(t.url); const buf = Buffer.from(await r.arrayBuffer());
          const name = `result-${id.slice(0, 8)}.jpg`; await writeFile(join(UP, name), buf);
          rec.status = "success"; rec.result = `/uploads/${name}`; await save();
        } else if (t.status === "error") { rec.status = "error"; rec.error = t.error; await save(); }
      }
    }
    return { id, status: rec.status, result: rec.result, error: rec.error, mock: !!rec.mock };
  },

  // Shopper takes items home on approval.
  "POST /api/orders": async (req) => {
    const { card, lines, name } = await body(req);
    if (!Array.isArray(lines) || !lines.length) throw Object.assign(new Error("Nothing in the parcel"), { code: 400 });
    const out = [];
    for (const l of lines.slice(0, 8)) {
      const it = item(l.itemId); if (!it) continue;
      const fit = fitFor(card, it.chart);
      const size = it.chart?.[l.size] ? l.size : fit.best;
      const sizeFit = fit.perSize.find((p) => p.size === size);
      const confidence = sizeFit ? sizeFit.score : null;
      const triedOn = !!(l.tryonId && store.tryons[l.tryonId]?.status === "success");
      const looksRight = triedOn ? (l.looksRight === true ? true : l.looksRight === false ? false : null) : null;
      out.push({
        itemId: it.id, name: it.name, price: it.price, size, confidence, triedOn, looksRight,
        tryonResult: triedOn ? store.tryons[l.tryonId].result : null,
        risk: Math.round(returnRisk({ baseRate: store.settings.baseReturnRate, confidence, triedOn, looksRight }) * 100),
        decision: null, reason: null, decidedAt: null,
      });
    }
    const now = Date.now();
    const order = {
      id: "A-" + String(1000 + store.orders.length + 1), name: String(name || "Shopper").slice(0, 40), card,
      createdAt: now, dueAt: now + store.settings.approvalDays * dayMs,
      hold: out.reduce((s, l) => s + l.price, 0), lines: out,
    };
    store.orders.push(order); await save();
    return order;
  },

  "GET /api/orders": async () => store.orders.slice().reverse(),

  // Keep or send back one line.
  "POST /api/orders/:id/decide": async (req, id) => {
    const { itemId, decision, reason } = await body(req);
    const o = store.orders.find((x) => x.id === id); if (!o) throw Object.assign(new Error("No such parcel"), { code: 404 });
    const l = o.lines.find((x) => x.itemId === itemId && !x.decision); if (!l) throw Object.assign(new Error("Line already decided"), { code: 409 });
    if (!["keep", "return"].includes(decision)) throw Object.assign(new Error("keep or return"), { code: 400 });
    l.decision = decision; l.reason = decision === "return" ? String(reason || "other").slice(0, 40) : null; l.decidedAt = Date.now();
    await save(); return o;
  },

  // Merchant ledger: real counts from decided lines only.
  "GET /api/ledger": async () => {
    const lines = store.orders.flatMap((o) => o.lines.map((l) => ({ ...l, order: o.id, dueAt: o.dueAt })));
    const decided = lines.filter((l) => l.decision);
    const group = (pred) => { const g = decided.filter(pred); const r = g.filter((l) => l.decision === "return").length; return { n: g.length, returned: r, rate: g.length ? r / g.length : null }; };
    const reasons = {};
    for (const l of decided.filter((l) => l.decision === "return")) reasons[l.reason] = (reasons[l.reason] || 0) + 1;
    const open = lines.filter((l) => !l.decision);
    return {
      totals: { parcels: store.orders.length, lines: lines.length, open: open.length, decided: decided.length, kept: decided.filter((l) => l.decision === "keep").length, returned: decided.filter((l) => l.decision === "return").length },
      triedOn: group((l) => l.triedOn), notTriedOn: group((l) => !l.triedOn),
      highConfidence: group((l) => (l.confidence ?? 0) >= 75), lowConfidence: group((l) => (l.confidence ?? 0) < 75),
      reasons,
      expectedOpenReturns: Math.round(open.reduce((s, l) => s + l.risk / 100, 0) * 10) / 10,
      atRiskValue: Math.round(open.reduce((s, l) => s + (l.risk / 100) * l.price, 0) * 100) / 100,
      baseReturnRate: store.settings.baseReturnRate,
    };
  },
};

function match(method, path) {
  for (const key of Object.keys(routes)) {
    const [m, p] = key.split(" ");
    if (m !== method) continue;
    if (!p.includes(":")) { if (p === path) return [routes[key]]; continue; }
    const re = new RegExp("^" + p.replace(/:[a-z]+/g, "([^/]+)") + "$");
    const mm = re.exec(path); if (mm) return [routes[key], ...mm.slice(1).map(decodeURIComponent)];
  }
  return null;
}

async function serveStatic(res, path) {
  let p;
  if (path.startsWith("/uploads/")) p = join(UP, normalize(path.slice(9)).replace(/^(\.\.[/\\])+/, ""));
  else p = join(PUB, normalize(path === "/" ? "/index.html" : path).replace(/^(\.\.[/\\])+/, ""));
  if (!p.startsWith(PUB) && !p.startsWith(UP)) return send(res, 403, { error: "forbidden" });
  try {
    const s = await stat(p); if (!s.isFile()) throw 0;
    res.writeHead(200, { "Content-Type": TYPES[extname(p).toLowerCase()] || "application/octet-stream", "Cache-Control": path.startsWith("/uploads/") ? "public, max-age=86400" : "no-cache" });
    res.end(await readFile(p));
  } catch { send(res, 404, { error: "not found" }); }
}

await load();
http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const m = match(req.method, url.pathname);
  if (m) {
    try { send(res, 200, await m[0](req, ...m.slice(1))); }
    catch (e) { console.error(e); send(res, e.code && Number.isInteger(e.code) ? e.code : 500, { error: e.message }); }
    return;
  }
  if (req.method === "GET") return serveStatic(res, url.pathname);
  send(res, 404, { error: "not found" });
}).listen(PORT, () => console.log(`On Approval on http://localhost:${PORT}  (${youcam.isMock() ? "MOCK try-on: set YOUCAM_API_KEY" : "YouCam live"})`));
