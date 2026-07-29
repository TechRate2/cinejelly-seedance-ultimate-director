#!/usr/bin/env node
/**
 * No-spend regression for content-based reference-role reconciliation (input-audit + ViMax pattern):
 * the vision analyst's detectedKind must catch a MIS-SLOTTED upload (product in KOL slot, face in
 * product slot) BEFORE paid render, WITHOUT false-flagging a correctly-slotted upload or an ambiguous
 * kind. Pure — no network.
 */

import { reconcileReferenceRoles } from "../dist/agents/reference-vision-analyst.js";

const checks = [];
const check = (name, pass, detail) => checks.push({ name, pass: Boolean(pass), ...(detail !== undefined ? { detail: String(detail) } : {}) });

const ref = (label, role) => ({ role, label, priority: "primary", providerReference: { kind: "image", uri: "https://cdn.x/" + label + ".png", role, label } });
const desc = (label, detectedKind) => ({ label, descriptor: "x", detectedKind });

// MISMATCH: product in the KOL (identity) slot -> flagged.
let m = reconcileReferenceRoles([ref("KOL", "identity")], [desc("KOL", "product_object")]);
check("product_in_kol_slot_flagged", m.length === 1 && m[0].declaredRole === "identity" && m[0].detectedKind === "product_object" && m[0].message.includes("ô KOL"));

// MISMATCH: face in the product slot -> flagged.
m = reconcileReferenceRoles([ref("Serum", "product")], [desc("Serum", "person_face")]);
check("face_in_product_slot_flagged", m.length === 1 && m[0].message.includes("ô Sản phẩm"));

// CORRECT slotting -> no flag.
check("correct_identity_face_ok", reconcileReferenceRoles([ref("KOL", "identity")], [desc("KOL", "person_face")]).length === 0);
check("correct_product_object_ok", reconcileReferenceRoles([ref("Serum", "product")], [desc("Serum", "product_object")]).length === 0);

// AMBIGUOUS detected kinds never flag (avoid false blocks on a legit render).
check("unclear_never_flags", reconcileReferenceRoles([ref("KOL", "identity")], [desc("KOL", "unclear")]).length === 0);
check("scene_in_identity_not_flagged", reconcileReferenceRoles([ref("KOL", "identity")], [desc("KOL", "scene_environment")]).length === 0);
check("style_in_product_not_flagged", reconcileReferenceRoles([ref("Serum", "product")], [desc("Serum", "style_board")]).length === 0);

// Missing detectedKind (vision didn't run / fail-open) -> no flag.
check("no_detected_kind_fails_open", reconcileReferenceRoles([ref("KOL", "identity")], [{ label: "KOL", descriptor: "x" }]).length === 0);

// Non-identity/product roles are not checked (environment/style may legitimately show anything).
check("environment_role_not_checked", reconcileReferenceRoles([ref("Bg", "environment")], [desc("Bg", "person_face")]).length === 0);

// Multiple refs: only the mismatched one flags.
m = reconcileReferenceRoles([ref("KOL", "identity"), ref("Serum", "product")], [desc("KOL", "person_face"), desc("Serum", "person_face")]);
check("only_mismatched_ref_flags", m.length === 1 && m[0].label === "Serum");

// DUPLICATE labels are ambiguous — never flag either reference (adversarial-audit #1: a product
// photo's detectedKind was attributed to the correctly-slotted face sharing its label -> false
// block of a paying job). Fail-open on ambiguity.
m = reconcileReferenceRoles(
  [ref("Mai", "product"), ref("Mai", "identity")],
  [desc("Mai", "product_object")]
);
check("duplicate_labels_never_flag", m.length === 0, JSON.stringify(m));

// Unique labels still flag normally even when another PAIR of refs is duplicated.
m = reconcileReferenceRoles(
  [ref("Mai", "product"), ref("Mai", "identity"), ref("Serum", "product")],
  [desc("Mai", "product_object"), desc("Serum", "person_face")]
);
check("dup_pair_ignored_unique_still_flags", m.length === 1 && m[0].label === "Serum");

const failed = checks.filter((c) => !c.pass);
const report = { schemaVersion: "cinejelly.reference-role-reconcile-smoke.v1", status: failed.length === 0 ? "pass" : "fail", checkCount: checks.length, failedCount: failed.length, checks, noSpend: true };
console.log(JSON.stringify(report, null, 2));
if (failed.length > 0) { process.exit(1); }
