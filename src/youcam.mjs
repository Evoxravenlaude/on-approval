// YouCam AI Clothes (virtual try-on) client. Server-side only: the API key never reaches the browser.
// Flow: File API (get upload URL + file_id) -> PUT bytes -> POST task -> poll task until success/error.
// Docs: https://docs.perfectcorp.com/reference/ai_clothes/v4.0  (base https://yce-api-01.makeupar.com)

const BASE = process.env.YOUCAM_BASE || "https://yce-api-01.makeupar.com";
const FEATURE = process.env.YOUCAM_FEATURE || "cloth-v4";

export const isMock = () => !process.env.YOUCAM_API_KEY;

function headers(extra = {}) {
  return { Authorization: `Bearer ${process.env.YOUCAM_API_KEY}`, "Content-Type": "application/json", ...extra };
}

async function call(method, path, body) {
  const res = await fetch(BASE + path, { method, headers: headers(), body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) {
    const code = json.error_code || json.error || res.status;
    throw new Error(`YouCam ${method} ${path} failed: ${code} ${json.error_message || json.message || ""}`.trim());
  }
  return json;
}

/** Uploads an image buffer through the File API and returns its file_id. */
export async function uploadImage(buf, contentType, fileName) {
  const init = await call("POST", `/s2s/v2.0/file/${FEATURE}`, {
    files: [{ content_type: contentType, file_name: fileName, file_size: buf.length }],
  });
  const f = init?.data?.files?.[0] ?? init?.files?.[0];
  if (!f?.file_id) throw new Error("YouCam File API: no file_id in response " + JSON.stringify(init).slice(0, 300));
  const req = f.requests?.[0] ?? f.request ?? {};
  if (!req.url) throw new Error("YouCam File API: no upload URL in response");
  const put = await fetch(req.url, {
    method: req.method || "PUT",
    headers: req.headers || { "Content-Type": contentType, "Content-Length": String(buf.length) },
    body: buf,
  });
  if (!put.ok) throw new Error(`YouCam upload PUT failed: ${put.status}`);
  return f.file_id;
}

/** Starts a try-on. category: auto | upper_body | lower_body | full_body | outer | shoes */
export async function startTryOn({ srcFileId, refFileId, category = "auto" }) {
  const r = await call("POST", `/s2s/v2.0/task/${FEATURE}`, {
    src_file_id: srcFileId,
    ref_file_id: refFileId,
    garment_category: category,
    change_shoes: false,
    filter_multi_person: "normal",
  });
  const id = r?.data?.task_id;
  if (!id) throw new Error("YouCam: no task_id returned");
  return id;
}

/** Returns { status: running|success|error, url?, error? } */
export async function getTryOn(taskId) {
  const r = await call("GET", `/s2s/v2.0/task/${FEATURE}/${encodeURIComponent(taskId)}`);
  const d = r?.data ?? {};
  return { status: d.task_status, url: d.results?.url, error: d.error ? `${d.error}${d.error_message ? ": " + d.error_message : ""}` : undefined };
}
