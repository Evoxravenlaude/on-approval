// Live check of the YouCam flow. Usage:  YOUCAM_API_KEY=sk-... node scripts/youcam-check.mjs [selfie.jpg] [garment.jpg]
// Prints every raw response so the client can be adjusted to what the API really returns.
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.YOUCAM_BASE || "https://yce-api-01.makeupar.com";
const KEY = process.env.YOUCAM_API_KEY;
if (!KEY) { console.error("Set YOUCAM_API_KEY"); process.exit(1); }
const [,, selfiePath = join(ROOT, "scripts", "sample-selfie.jpg"), garmentPath = join(ROOT, "public", "img", "plaid-flannel-shirt.jpg")] = process.argv;

const H = { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
async function call(method, path, body) {
  const res = await fetch(BASE + path, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  console.log(`\n--- ${method} ${path} -> ${res.status}\n${text.slice(0, 1500)}`);
  try { return { ok: res.ok, json: JSON.parse(text) }; } catch { return { ok: res.ok, json: null }; }
}

async function upload(path, type) {
  const buf = await readFile(path);
  const name = path.split("/").pop();
  const init = await call("POST", "/s2s/v2.0/file/cloth-v4", { files: [{ content_type: type, file_name: name, file_size: buf.length }] });
  const f = init.json?.data?.files?.[0] ?? init.json?.files?.[0];
  if (!f) throw new Error("No file entry in File API response");
  const req = f.requests?.[0] ?? f.request ?? {};
  console.log("upload target:", JSON.stringify({ method: req.method, url: String(req.url).slice(0, 80) + "…", headers: req.headers }));
  const put = await fetch(req.url, { method: req.method || "PUT", headers: req.headers || { "Content-Type": type, "Content-Length": String(buf.length) }, body: buf });
  console.log(`upload PUT -> ${put.status}`);
  return f.file_id;
}

const src = await upload(selfiePath, "image/jpeg");
const ref = await upload(garmentPath, "image/jpeg");
const task = await call("POST", "/s2s/v2.0/task/cloth-v4", { src_file_id: src, ref_file_id: ref, garment_category: "upper_body", change_shoes: false, filter_multi_person: "normal" });
const id = task.json?.data?.task_id;
if (!id) throw new Error("No task_id");
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 3000));
  const s = await call("GET", `/s2s/v2.0/task/cloth-v4/${id}`);
  const st = s.json?.data?.task_status;
  if (st === "success") { console.log("\nRESULT URL:", s.json.data.results?.url); break; }
  if (st === "error") { console.log("\nTASK ERROR:", s.json.data.error, s.json.data.error_message); break; }
}
