#!/usr/bin/env node
/**
 * No-spend regression for two deep-audit fixes on the customer render path:
 * (1) UPLOAD INTAKE — the ReferenceLibrarian (SSRF gate at director intake) must ACCEPT the UI's
 *     own upload:// handles (the primary customer flow died here with "must use https or asset://"
 *     on every render that attached an uploaded photo) while still rejecting every unsafe scheme
 *     and malformed handle.
 * (2) CUSTOMER GUIDANCE — a CustomerActionableError thrown pre-spend (e.g. reference-role mismatch)
 *     must surface its plain-VN message to the paying customer via the job summary's
 *     customerGuidance field, while all other errors stay stripped. Verified at the source level
 *     (server.ts is not importable standalone) plus the create-page rendering hook and the
 *     session-route media re-supply.
 * Pure — no network, no server boot.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const base = "file://" + repoRoot.replace(/\\/g, "/") + "/dist";
const { ReferenceLibrarian } = await import(`${base}/agents/reference-librarian.js`);
const { CustomerActionableError } = await import(`${base}/core/customer-actionable-error.js`);

const checks = [];
const check = (name, pass, detail) => checks.push({ name, pass: Boolean(pass), ...(detail !== undefined ? { detail: String(detail) } : {}) });

const librarian = new ReferenceLibrarian();
const tryNormalize = (uri) => {
  try {
    librarian.normalize({ references: [{ role: "identity", label: "KOL", providerReference: { kind: "image", uri, role: "identity", label: "KOL" } }] });
    return "accepted";
  } catch (error) {
    return `rejected: ${error.message}`;
  }
};

// --- 1. Librarian accepts well-formed upload:// handles (all whitelisted extensions).
check("upload_png_accepted", tryNormalize("upload://up_0123456789abcdef.png") === "accepted");
check("upload_mp4_accepted", tryNormalize("upload://up_0123456789abcdef.mp4") === "accepted");
// https and asset still accepted.
check("https_still_accepted", tryNormalize("https://cdn.example.com/x.jpg") === "accepted");
check("asset_still_accepted", tryNormalize("asset://asset_123") === "accepted");
// Malformed upload handles and unsafe schemes still rejected.
check("upload_traversal_rejected", tryNormalize("upload://../../etc/passwd").startsWith("rejected"));
check("upload_nonserver_name_rejected", tryNormalize("upload://evil.png").startsWith("rejected"));
check("upload_bad_ext_rejected", tryNormalize("upload://up_0123456789abcdef.exe").startsWith("rejected"));
check("http_rejected", tryNormalize("http://cdn.example.com/x.jpg").startsWith("rejected"));
check("file_rejected", tryNormalize("file:///C:/secrets.txt").startsWith("rejected"));
check("data_uri_rejected", tryNormalize("data:image/png;base64,AAAA").startsWith("rejected"));

// --- 2. CustomerActionableError name contract (job store serializes {name,message}; the summary
// matches BY NAME — renaming the class breaks guidance silently).
const actionable = new CustomerActionableError("Ảnh bạn để ở ô KOL trông giống một SẢN PHẨM.");
check("actionable_error_name_contract", actionable.name === "CustomerActionableError" && actionable instanceof Error);

// --- 3. Source invariants (server.ts / director-agent / create page).
const serverSource = readFileSync(resolve(repoRoot, "src/api/server.ts"), "utf8");
const directorSource = readFileSync(resolve(repoRoot, "src/agents/director-agent.ts"), "utf8");
const pageSource = readFileSync(resolve(repoRoot, "src/api/short-pipeline-create-page.ts"), "utf8");
check("summary_exposes_guidance_only_for_actionable",
  serverSource.includes('(_error as { name?: unknown }).name === "CustomerActionableError"') &&
  serverSource.includes("...(customerGuidance ? { customerGuidance } : {})"));
check("director_throws_actionable_on_role_mismatch",
  directorSource.includes("throw new CustomerActionableError(roleMismatches"));
check("page_renders_customer_guidance", pageSource.includes("job.customerGuidance"));
check("session_render_resupplies_media_references",
  serverSource.includes("const renderMediaReferenceInputs = mediaReferencesFromBody(") &&
  serverSource.includes("...(renderMediaReferenceInputs ? { mediaReferenceInputs: renderMediaReferenceInputs } : {})"));
check("page_resends_media_references_at_render", pageSource.includes("const renderMediaReferences = mediaReferencesPayload();"));

// TERMS PAGE (Phase 1): purchase terms + refund policy must exist, be reachable WITHOUT auth
// (a buyer reads them before registering), reflect the live refund policy / retention config, and
// be linked from the create page where the customer commits credits.
const { renderTermsPage } = await import("../dist/api/terms-page.js");
const termsAuto = renderTermsPage({ supportContact: "Zalo 0900", refundPolicy: "auto", outputRetentionDays: 14 });
check("terms_states_auto_refund", termsAuto.includes("hoàn tự động"));
check("terms_shows_support_contact", termsAuto.includes("Zalo 0900"));
check("terms_states_retention_days", termsAuto.includes("<strong>14 ngày</strong>"));
const termsManual = renderTermsPage({ refundPolicy: "manual" });
check("terms_states_manual_refund", termsManual.includes("đội ngũ xem xét"));
check("terms_falls_back_to_generic_seller", termsManual.includes("người bán"));
check("terms_publishes_duration_ceiling", termsManual.includes("480 giây"));
check("terms_lists_prohibited_content", termsManual.includes("tình dục liên quan trẻ em") && termsManual.includes("hàng cấm"));
check("terms_escapes_operator_input", !renderTermsPage({ supportContact: "<script>x</script>" }).includes("<script>x</script>"));
const serverSrcTerms = readFileSync(resolve(repoRoot, "src/api/server.ts"), "utf8");
check("terms_route_served", serverSrcTerms.includes('requestUrl.pathname === "/terms"') && serverSrcTerms.includes("renderTermsPage("));
const authSrc = readFileSync(resolve(repoRoot, "src/api/api-auth.ts"), "utf8");
check("terms_route_is_public", authSrc.includes('if (!pathname.startsWith("/v1/"))'));
const createPageSrcTerms = readFileSync(resolve(repoRoot, "src/api/short-pipeline-create-page.ts"), "utf8");
check("create_page_links_terms", createPageSrcTerms.includes('href="/terms"'));

const failed = checks.filter((c) => !c.pass);
const report = {
  schemaVersion: "cinejelly.upload-intake-and-guidance-smoke.v1",
  status: failed.length === 0 ? "pass" : "fail",
  checkCount: checks.length,
  failedCount: failed.length,
  checks,
  noSpend: true
};
console.log(JSON.stringify(report, null, 2));
if (failed.length > 0) { process.exit(1); }
