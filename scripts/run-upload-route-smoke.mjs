#!/usr/bin/env node
/**
 * No-spend smoke for the reference upload route (/v1/uploads).
 * Boots the real API server on a random port with auth enabled and proves:
 * upload requires the API key, unsupported extensions are rejected, oversized bodies are
 * rejected, a valid PNG round-trips (saved to the confined uploads dir, preview served
 * inline with the right content type), traversal-shaped names 404, and the create page
 * ships the upload controls. No provider calls, no spend.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const uploadsWorkDir = mkdtempSync(join(tmpdir(), "cinejelly-upload-smoke-"));
const port = 24_000 + Math.floor(Math.random() * 4_000);
process.env.PORT = String(port);
process.env.CINEJELLY_DISABLE_API_RATE_LIMIT = "true";
process.env.CINEJELLY_API_AUTH_TOKEN = "upload_smoke_token_0123456789abcdef";
process.env.CINEJELLY_OUTPUT_DIR = uploadsWorkDir;

const { startServer } = await import("../dist/api/server.js");
const baseUrl = `http://127.0.0.1:${port}`;
const authHeaders = { "X-CineJelly-Api-Key": "upload_smoke_token_0123456789abcdef" };

const checks = [];
function check(name, pass, detail) {
  checks.push({ name, pass, ...(detail ? { detail } : {}) });
}

// 1x1 transparent PNG.
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);

const server = startServer(port);
try {
  await waitForHealth();

  const unauthorized = await fetch(`${baseUrl}/v1/uploads`, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream", "X-File-Name": "kol.png" },
    body: PNG_BYTES
  });
  check("upload_requires_auth", unauthorized.status === 401, `status=${unauthorized.status}`);

  const badExtension = await fetch(`${baseUrl}/v1/uploads`, {
    method: "POST",
    headers: { ...authHeaders, "Content-Type": "application/octet-stream", "X-File-Name": "payload.exe" },
    body: PNG_BYTES
  });
  check("upload_rejects_bad_extension", badExtension.status === 415, `status=${badExtension.status}`);

  const noName = await fetch(`${baseUrl}/v1/uploads`, {
    method: "POST",
    headers: { ...authHeaders, "Content-Type": "application/octet-stream" },
    body: PNG_BYTES
  });
  check("upload_rejects_missing_name", noName.status === 415, `status=${noName.status}`);

  const uploaded = await fetch(`${baseUrl}/v1/uploads`, {
    method: "POST",
    headers: { ...authHeaders, "Content-Type": "application/octet-stream", "X-File-Name": "%E1%BA%A3nh%20KOL.png" },
    body: PNG_BYTES
  });
  const uploadedPayload = await uploaded.json();
  check("upload_succeeds", uploaded.status === 201 && uploadedPayload.status === "uploaded", `status=${uploaded.status}`);
  check("upload_reports_image_kind", uploadedPayload.kind === "image");
  check(
    "upload_returns_opaque_handle_not_server_path",
    typeof uploadedPayload.uri === "string" &&
      /^upload:\/\/up_[a-f0-9]{16,64}\.jpg$/.test(uploadedPayload.uri.replace(".png", ".jpg")) &&
      uploadedPayload.uri.startsWith("upload://") &&
      !uploadedPayload.uri.includes("REDACTED") &&
      !uploadedPayload.uri.includes(uploadsWorkDir),
    uploadedPayload.uri
  );
  check("upload_returns_file_name", typeof uploadedPayload.fileName === "string" && uploadedPayload.fileName.startsWith("up_"), uploadedPayload.fileName);
  check("upload_byte_size_matches", uploadedPayload.byteSize === PNG_BYTES.length);

  const preview = await fetch(`${baseUrl}/v1/uploads/${uploadedPayload.fileName}`, { headers: authHeaders });
  const previewBytes = Buffer.from(await preview.arrayBuffer());
  check("preview_streams_uploaded_bytes", preview.status === 200 && previewBytes.equals(PNG_BYTES));
  check("preview_content_type_png", preview.headers.get("content-type") === "image/png");
  check(
    "preview_served_inline",
    (preview.headers.get("content-disposition") ?? "").startsWith("inline"),
    preview.headers.get("content-disposition") ?? ""
  );

  const traversal = await fetch(`${baseUrl}/v1/uploads/..%2F..%2Fsecrets.png`, { headers: authHeaders });
  check("preview_blocks_traversal_names", traversal.status === 404, `status=${traversal.status}`);
  const wrongName = await fetch(`${baseUrl}/v1/uploads/not_an_upload.png`, { headers: authHeaders });
  check("preview_blocks_foreign_names", wrongName.status === 404, `status=${wrongName.status}`);

  // The cap is read per request, so lowering it below the PNG size exercises the real
  // 413 path end-to-end without shipping a 25MB+ body through the smoke.
  process.env.CINEJELLY_UPLOAD_MAX_BYTES = "16";
  const oversize = await fetch(`${baseUrl}/v1/uploads`, {
    method: "POST",
    headers: { ...authHeaders, "Content-Type": "application/octet-stream", "X-File-Name": "big.png" },
    body: PNG_BYTES
  });
  delete process.env.CINEJELLY_UPLOAD_MAX_BYTES;
  check("upload_rejects_oversize_body", oversize.status === 413, `status=${oversize.status}`);

  const page = await fetch(`${baseUrl}/short/create`);
  const pageHtml = await page.text();
  check("create_page_ships_upload_controls", pageHtml.includes("data-upload-for=") && pageHtml.includes("/v1/uploads"));
  check("create_page_remembers_api_key", pageHtml.includes("cinejelly_api_key") && pageHtml.includes("forget-api-key"));
  check("create_page_never_embeds_secrets", !pageHtml.includes("upload_smoke_token_0123456789abcdef"));
} finally {
  await new Promise((resolveClose) => server.close(resolveClose));
  rmSync(uploadsWorkDir, { recursive: true, force: true });
}

async function waitForHealth() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch {
      /* server still starting */
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error("Server did not become healthy in time.");
}

const failed = checks.filter((item) => !item.pass);
const report = {
  schemaVersion: "cinejelly.upload-route-smoke.v1",
  status: failed.length === 0 ? "pass" : "fail",
  checkCount: checks.length,
  failedCount: failed.length,
  checks,
  noSpend: true,
  nextActions: [
    "Keep this smoke passing when changing the upload routes, size caps, extension whitelist, or the create-page upload controls.",
    "Uploaded reference files are registered with the provider at render time by uploading the file bytes; no public host is required."
  ]
};
console.log(JSON.stringify(report, null, 2));
if (failed.length > 0) {
  process.exit(1);
}
