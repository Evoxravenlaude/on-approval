// On Approval — front end. Vanilla JS, no build step.
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (n) => "$" + Number(n || 0).toFixed(2).replace(/\.00$/, "");
const IN = 2.54;

const ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

const S = {
  items: [], settings: {}, mock: true,
  card: ls.get("oa.card", {}),          // always stored in cm
  unit: ls.get("oa.unit", "cm"),
  parcel: ls.get("oa.parcel", []),      // [{itemId,size,tryonId,looksRight}]
  mine: ls.get("oa.mine", []),          // order ids placed from this device
  tryons: ls.get("oa.tryons", {}),      // itemId -> {id,status,result}
  selfie: null,                         // data URL, memory only
  current: null,
};
const persist = () => { ls.set("oa.card", S.card); ls.set("oa.unit", S.unit); ls.set("oa.parcel", S.parcel); ls.set("oa.mine", S.mine); ls.set("oa.tryons", S.tryons); };

async function api(path, opts = {}) {
  const r = await fetch(path, { ...opts, headers: { "Content-Type": "application/json" }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("on"), 3200); }

// ---------- tabs ----------
function show(tab) {
  $$(".tab").forEach((s) => s.classList.toggle("on", s.id === "tab-" + tab));
  $$(".tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab || (tab === "item" && b.dataset.tab === "shop")));
  if (tab === "parcel") renderParcel();
  if (tab === "mine") renderMine();
  if (tab === "ledger") renderLedger();
  window.scrollTo({ top: 0, behavior: "smooth" });
}
document.addEventListener("click", (e) => { const b = e.target.closest("[data-tab]"); if (b) show(b.dataset.tab); });

// ---------- measure card ----------
function fillMeasure() {
  const f = $("#measure-form");
  for (const k of ["chest", "waist", "hips", "inseam"]) {
    const v = S.card[k]; f[k].value = v ? (S.unit === "in" ? (v / IN).toFixed(1) : Math.round(v)) : "";
  }
  $("#unit-label").textContent = S.unit;
  $("#unit-toggle").textContent = S.unit === "cm" ? "Use inches" : "Use cm";
}
$("#measure-form").addEventListener("input", (e) => {
  const n = parseFloat(e.target.value);
  S.card[e.target.name] = n > 0 ? (S.unit === "in" ? n * IN : n) : undefined;
  persist(); renderGrid();
});
$("#unit-toggle").addEventListener("click", () => { S.unit = S.unit === "cm" ? "in" : "cm"; persist(); fillMeasure(); });

// Fit is computed locally with the same rules as the server (src/fit.mjs mirrors this).
function fitFor(chart) {
  const DIMS = ["chest", "waist", "hips", "inseam"]; const sizes = Object.keys(chart || {});
  const used = DIMS.filter((d) => S.card[d] > 0 && sizes.some((s) => chart[s][d]));
  if (!used.length) return null;
  const per = sizes.map((size) => {
    let pen = 0; const misses = [];
    for (const d of used) {
      const r = chart[size][d]; if (!r) continue; const v = S.card[d]; const [lo, hi] = r; const w = Math.max(hi - lo, 1);
      if (v < lo) { pen += (lo - v) / w; misses.push(`${d} ${Math.round(lo - v)}cm loose`); }
      else if (v > hi) { pen += (v - hi) / w; misses.push(`${d} ${Math.round(v - hi)}cm tight`); }
      else pen += (Math.abs(v - (lo + hi) / 2) / (w / 2)) * 0.15;
    }
    return { size, score: Math.max(0, Math.round(100 - (pen / used.length) * 100)), misses };
  });
  const sorted = per.slice().sort((a, b) => b.score - a.score);
  const [a, b] = sorted;
  let conf = a.score; if (b && a.score - b.score < 10) conf = Math.round(conf - (10 - (a.score - b.score)) * 1.5);
  const total = DIMS.filter((d) => sizes.some((s) => chart[s][d])).length;
  conf = Math.max(0, Math.min(100, Math.round(conf * (0.7 + 0.3 * (used.length / total)))));
  return { best: a.size, confidence: conf, per, used };
}
const chipClass = (c) => (c >= 75 ? "hi" : c >= 50 ? "mid" : "lo");

// ---------- catalogue ----------
function renderGrid() {
  $("#grid").innerHTML = S.items.map((it) => {
    const f = fitFor(it.chart);
    const chip = f ? `<span class="fit ${chipClass(f.confidence)}">Your size ${esc(f.best)} · ${f.confidence}% fit</span>` : `<span class="fit none">Add your measurements for a size</span>`;
    const t = S.tryons[it.id];
    const img = t?.status === "success" ? t.result : it.img;
    return `<button class="tile" data-item="${esc(it.id)}">
      <img src="${esc(img)}" alt="${esc(it.name)}" loading="lazy">
      <div class="meta"><span class="name">${esc(it.name)}</span><span class="price">${money(it.price)}</span>${chip}</div></button>`;
  }).join("");
}
$("#grid").addEventListener("click", (e) => { const t = e.target.closest("[data-item]"); if (t) openItem(t.dataset.item); });

// ---------- item sheet ----------
function openItem(id) {
  S.current = S.items.find((i) => i.id === id); renderItem(); show("item");
}
function renderItem() {
  const it = S.current; if (!it) return;
  const f = fitFor(it.chart);
  const line = S.parcel.find((l) => l.itemId === it.id);
  const chosen = line?.size || f?.best || Object.keys(it.chart)[0];
  const t = S.tryons[it.id];
  const sizes = Object.keys(it.chart).map((size) => {
    const p = f?.per.find((x) => x.size === size);
    return `<button class="size ${size === chosen ? "on" : ""}" data-size="${esc(size)}" data-why="${esc(p ? (p.misses.join(" · ") || "Within range on every measure") : "")}" type="button" aria-pressed="${size === chosen}">
      <b>${esc(size)}</b><span class="bar"><i style="width:${p ? p.score : 0}%"></i></span><span class="pct">${p ? p.score + "%" : "—"}</span></button>`;
  }).join("");
  const chosenP = f?.per.find((x) => x.size === chosen);
  const right = t?.status === "success"
    ? `<figure><img src="${esc(t.result)}" alt="You wearing ${esc(it.name)}"><figcaption>${t.mock ? "Demo · add YouCam key" : "You, in it"}</figcaption></figure>`
    : t?.status === "running" ? `<figure><div class="wait">YouCam is dressing you…<br>usually 10–30 seconds</div></figure>`
    : t?.status === "error" ? `<figure><div class="wait">Try-on failed: ${esc(t.error || "unknown")}. Try a clearer, front-facing, full-length photo.</div></figure>`
    : `<figure><div class="wait">Your try-on appears here</div></figure>`;
  $("#item").innerHTML = `<div class="sheet">
    <div>
      <div class="mirror"><figure><img src="${esc(it.img)}" alt="${esc(it.name)}"><figcaption>The piece</figcaption></figure>${right}</div>
      <div class="btn-row" style="margin-top:12px">
        <label class="btn alt" style="cursor:pointer">${S.selfie ? "Change photo" : "Add your photo"}<input id="selfie" type="file" accept="image/*" capture="user" hidden></label>
        <button class="btn" id="tryon" ${S.selfie ? "" : "disabled"} type="button">Try it on</button>
      </div>
      <p class="fine">Full-length or waist-up, facing the camera, plain background. Your photo is sent to YouCam for the try-on and kept with your parcel.</p>
      ${t?.status === "success" ? `<div class="verdict"><span>Does it look right on you?</span>
        <button class="btn alt ${line?.looksRight === true ? "on" : ""}" data-looks="yes" type="button">Looks right</button>
        <button class="btn alt ${line?.looksRight === false ? "on" : ""}" data-looks="no" type="button">Looks off</button></div>` : ""}
    </div>
    <div class="sheet-info">
      <h2 class="display">${esc(it.name)}</h2>
      <div class="price-row"><span class="price">${money(it.price)}</span>
        ${f ? `<span class="fit ${chipClass(f.confidence)}">Your size ${esc(f.best)} · ${f.confidence}% fit confidence</span>` : ""}</div>
      <p style="margin:0">${esc(it.blurb)}</p>
      <h3>Size</h3>
      <div class="sizes">${sizes}</div>
      <div class="size-why" id="size-why">${f ? esc(chosenP ? (chosenP.misses.join(" · ") || "Within range on every measure") : "") : "Fill in your measure card to see how each size fits."}</div>
      <button class="btn wide" id="add" type="button">${line ? "Update parcel" : "Add to parcel"} · size <span id="add-size">${esc(chosen)}</span></button>
      <p class="fine">Nothing is charged now. The parcel goes out on approval for ${S.settings.approvalDays} days: keep what fits, send back the rest.</p>
    </div></div>`;
  $("#item").dataset.chosen = chosen;
}
$("#item").addEventListener("click", async (e) => {
  const it = S.current; if (!it) return;
  const sz = e.target.closest("[data-size]");
  if (sz) { $("#item").dataset.chosen = sz.dataset.size; $$(".size", $("#item")).forEach((b) => { b.classList.toggle("on", b === sz); b.setAttribute("aria-pressed", b === sz); }); $("#add-size").textContent = sz.dataset.size; $("#size-why").textContent = sz.dataset.why; return; }
  const looks = e.target.closest("[data-looks]");
  if (looks) {
    let line = S.parcel.find((l) => l.itemId === it.id);
    if (!line) { line = { itemId: it.id, size: $("#item").dataset.chosen }; S.parcel.push(line); }
    line.looksRight = looks.dataset.looks === "yes"; line.tryonId = S.tryons[it.id]?.id;
    persist(); updateBadge(); renderItem(); toast(line.looksRight ? "Noted, and added to your parcel." : "Noted. It stays in the parcel; you can remove it there.");
    return;
  }
  if (e.target.id === "add") {
    let line = S.parcel.find((l) => l.itemId === it.id);
    if (!line) { line = { itemId: it.id }; S.parcel.push(line); }
    line.size = $("#item").dataset.chosen; line.tryonId = S.tryons[it.id]?.status === "success" ? S.tryons[it.id].id : line.tryonId;
    persist(); updateBadge(); renderItem(); toast(`${it.name}, size ${line.size}, is in your parcel.`);
    return;
  }
  if (e.target.id === "tryon") tryOn(it);
});
$("#item").addEventListener("change", async (e) => {
  if (e.target.id !== "selfie" || !e.target.files[0]) return;
  S.selfie = await shrink(e.target.files[0], 1280); renderItem(); toast("Photo ready. Tap Try it on.");
});

function shrink(file, max) {
  return new Promise((ok, bad) => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); ok(c.toDataURL("image/jpeg", 0.9));
    };
    img.onerror = () => bad(new Error("Could not read that image")); img.src = url;
  });
}

async function tryOn(it) {
  const btn = $("#tryon"); btn.disabled = true;
  try {
    const r = await api("/api/tryon", { method: "POST", body: { selfie: S.selfie, itemId: it.id } });
    S.tryons[it.id] = { id: r.id, status: "running" }; persist(); renderItem();
    for (let i = 0; i < 60; i++) {
      await new Promise((z) => setTimeout(z, i < 3 ? 1500 : 3000));
      const s = await api("/api/tryon/" + r.id);
      if (s.status !== "running") { S.tryons[it.id] = s; persist(); break; }
    }
    if (S.tryons[it.id].status === "running") S.tryons[it.id] = { id: r.id, status: "error", error: "timed out" };
    if (S.current?.id === it.id) renderItem(); renderGrid();
  } catch (err) { S.tryons[it.id] = { status: "error", error: err.message }; renderItem(); toast(err.message); }
}

// ---------- parcel ----------
function updateBadge() { $("#parcel-n").textContent = S.parcel.length; }
function riskFor(line, it) {
  const f = fitFor(it.chart); const p = f?.per.find((x) => x.size === line.size); const conf = p ? p.score : null;
  let r = S.settings.baseReturnRate; if (conf != null) r *= 1.5 - conf / 100;
  const tried = S.tryons[it.id]?.status === "success" && line.tryonId;
  if (tried) r *= line.looksRight === false ? 1.4 : 0.8;
  return { conf, risk: Math.round(Math.max(.01, Math.min(.95, r)) * 100), tried };
}
function renderParcel() {
  const el = $("#parcel");
  if (!S.parcel.length) { el.innerHTML = `<p class="empty">Your parcel is empty. Try something on in the shop.</p>`; return; }
  let total = 0;
  const rows = S.parcel.map((l) => {
    const it = S.items.find((i) => i.id === l.itemId); if (!it) return "";
    total += it.price; const r = riskFor(l, it); const t = S.tryons[it.id];
    return `<div class="line"><img src="${esc(r.tried ? t.result : it.img)}" alt="">
      <div><div class="t">${esc(it.name)}</div>
      <div class="s">Size ${esc(l.size)} · ${money(it.price)} · ${r.conf != null ? r.conf + "% fit" : "no measurements"} · ${r.tried ? (l.looksRight === false ? "tried on, looked off" : "tried on") : "not tried on"}</div>
      <div class="s">Chance it comes back: <b>${r.risk}%</b> <span title="Estimate from the shop's usual return rate, your fit score and your try-on">(estimate)</span></div>
      <button class="link" data-remove="${esc(it.id)}" type="button">Remove</button></div></div>`;
  }).join("");
  el.innerHTML = `<div class="list">${rows}</div>
    <div class="total"><span>Held on approval, not charged</span><span>${money(total)}</span></div>
    <div class="parcel-form">
    <label>Name on the parcel<input id="pname" maxlength="40" placeholder="Your name"></label>
    <button class="btn wide" id="send" type="button">Send it on approval · ${S.settings.approvalDays} days</button>
    <p class="note">You'll get an approval slip. Mark each piece keep or send back before the date.</p></div>`;
}
$("#parcel").addEventListener("click", async (e) => {
  const rm = e.target.closest("[data-remove]");
  if (rm) { S.parcel = S.parcel.filter((l) => l.itemId !== rm.dataset.remove); persist(); updateBadge(); renderParcel(); return; }
  if (e.target.id === "send") {
    e.target.disabled = true;
    try {
      const o = await api("/api/orders", { method: "POST", body: { card: S.card, name: $("#pname").value, lines: S.parcel } });
      S.mine.unshift(o.id); S.parcel = []; persist(); updateBadge(); toast(`Parcel ${o.id} is on its way, on approval.`); show("mine");
    } catch (err) { toast(err.message); e.target.disabled = false; }
  }
});

// ---------- my approvals ----------
const REASONS = ["too small", "too big", "looked different", "colour", "quality", "changed mind"];
async function renderMine() {
  const el = $("#mine");
  const all = await api("/api/orders");
  const mine = all.filter((o) => S.mine.includes(o.id));
  if (!mine.length) { el.innerHTML = `<p class="empty">Nothing on approval yet.</p>`; return; }
  el.innerHTML = mine.map((o) => {
    const open = o.lines.filter((l) => !l.decision).length;
    const kept = o.lines.filter((l) => l.decision === "keep").reduce((s, l) => s + l.price, 0);
    return `<div class="slip"><h3>Approval slip ${esc(o.id)}</h3>
      <div class="s note">For ${esc(o.name)} · decide by <b>${new Date(o.dueAt).toLocaleDateString(undefined, { day: "numeric", month: "long" })}</b> · ${open} undecided · kept so far ${money(kept)}</div>
      ${o.lines.map((l) => `<div class="line"><img src="${esc(l.tryonResult || (S.items.find((i) => i.id === l.itemId)?.img) || "")}" alt="">
        <div><div class="t">${esc(l.name)}</div><div class="s">Size ${esc(l.size)} · ${money(l.price)} · ${l.confidence ?? "—"}% fit · ${l.triedOn ? "tried on" : "not tried on"}</div>
        ${l.decision ? `<div class="decided ${l.decision}">${l.decision === "keep" ? "Kept, charged " + money(l.price) : "Sent back: " + esc(l.reason)}</div>`
        : `<div class="chips"><button data-o="${esc(o.id)}" data-i="${esc(l.itemId)}" data-d="keep" type="button">Keep it</button>
           ${REASONS.map((r) => `<button data-o="${esc(o.id)}" data-i="${esc(l.itemId)}" data-d="return" data-r="${esc(r)}" type="button">Return: ${esc(r)}</button>`).join("")}</div>`}
        </div></div>`).join("")}</div>`;
  }).join("");
}
$("#mine").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-d]"); if (!b) return;
  try { await api(`/api/orders/${b.dataset.o}/decide`, { method: "POST", body: { itemId: b.dataset.i, decision: b.dataset.d, reason: b.dataset.r } }); renderMine(); }
  catch (err) { toast(err.message); }
});

// ---------- ledger ----------
const pct = (x) => (x == null ? "—" : Math.round(x * 100) + "%");
async function renderLedger() {
  const L = await api("/api/ledger");
  const cmp = (a, b, la, lb) => `<div class="compare">
    <div class="stat"><div class="k">${la}</div><div class="v">${pct(a.rate)}</div><div class="d">returned · ${a.returned} of ${a.n} decided</div></div>
    <div class="stat"><div class="k">${lb}</div><div class="v">${pct(b.rate)}</div><div class="d">returned · ${b.returned} of ${b.n} decided</div></div></div>`;
  const reasons = Object.entries(L.reasons).sort((a, b) => b[1] - a[1]);
  $("#ledger").innerHTML = `<div class="stats">
      <div class="stat"><div class="k">Parcels out</div><div class="v">${L.totals.parcels}</div><div class="d">${L.totals.lines} pieces</div></div>
      <div class="stat"><div class="k">Still on approval</div><div class="v">${L.totals.open}</div><div class="d">pieces undecided</div></div>
      <div class="stat"><div class="k">Kept</div><div class="v">${L.totals.kept}</div><div class="d">of ${L.totals.decided} decided</div></div>
      <div class="stat"><div class="k">Expected back</div><div class="v">${L.expectedOpenReturns}</div><div class="d">estimate · ${money(L.atRiskValue)} at risk</div></div>
    </div>
    <h3 class="display">Does trying on first change returns?</h3>
    ${cmp(L.triedOn, L.notTriedOn, "Tried on with YouCam", "Not tried on")}
    <h3 class="display">Does fit confidence predict returns?</h3>
    ${cmp(L.highConfidence, L.lowConfidence, "75% fit or better", "Under 75% fit")}
    <h3 class="display">Why things came back</h3><div>
      ${reasons.length ? `<table><tr><th>Reason</th><th>Pieces</th></tr>${reasons.map(([r, n]) => `<tr><td>${esc(r)}</td><td>${n}</td></tr>`).join("")}</table>` : `<p class="note">No returns yet.</p>`}</div>`;
  const f = $("#settings-form"); f.baseReturnRate.value = Math.round(S.settings.baseReturnRate * 100); f.approvalDays.value = S.settings.approvalDays;
}
$("#settings-form").addEventListener("submit", async (e) => {
  e.preventDefault(); const f = e.target;
  S.settings = await api("/api/settings", { method: "POST", body: { baseReturnRate: Number(f.baseReturnRate.value) / 100, approvalDays: Number(f.approvalDays.value) } });
  toast("Settings saved."); renderLedger();
});
$("#item-form").addEventListener("submit", async (e) => {
  e.preventDefault(); const f = e.target; const btn = f.querySelector("button"); btn.disabled = true;
  try {
    const image = await shrink(f.image.files[0], 1280);
    const it = await api("/api/items", { method: "POST", body: { name: f.name.value, price: f.price.value, category: f.category.value, blurb: f.blurb.value, image } });
    S.items.push(it); renderGrid(); f.reset(); toast(`${it.name} added to the shop.`);
  } catch (err) { toast(err.message); } finally { btn.disabled = false; }
});

// ---------- boot ----------
(async function boot() {
  const st = await api("/api/state");
  Object.assign(S, { items: st.items, settings: st.settings, mock: st.mock });
  const m = $("#mode"); m.textContent = st.mock ? "Demo try-on" : "YouCam live"; m.className = "mode " + (st.mock ? "mock" : "live");
  fillMeasure(); renderGrid(); updateBadge();
})();
