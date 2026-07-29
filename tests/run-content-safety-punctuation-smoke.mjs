#!/usr/bin/env node
/**
 * No-spend regression for the content screen after the 2026-07-29 policy change.
 *
 * The policy is now: moderation belongs to the model provider. Whatever the customer types, if the
 * provider is willing to render it, the platform renders it — adult content, nudity, violence,
 * weapons, drugs, dark themes, historical atrocity, horror, all of it. Exactly ONE rule survives
 * locally: sexual content involving minors, which is criminal liability for the owner and which the
 * provider refuses anyway, so catching it here only moves the refusal earlier and makes it free.
 *
 * Both halves are asserted, and the first half is the bigger one: a gate that quietly keeps blocking
 * is indistinguishable from a gate that was never relaxed. Pure: no network, no spend.
 */

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const base = "file://" + repoRoot.replace(/\\/g, "/") + "/dist";
const { screenContentSafety, contentSafetyBlockMessage } = await import(`${base}/core/content-safety-gate.js`);

const checks = [];
const check = (name, pass, detail) => checks.push({ name, pass: Boolean(pass), ...(detail !== undefined ? { detail: String(detail) } : {}) });

// --- 1. EVERYTHING THE OLD KEYWORD LIST REFUSED MUST NOW PASS.
// These are the six categories the gate used to carry. They are legitimate commercial and creative
// briefs — action cinema, war documentary, horror, adult advertising — and the provider is the one
// that decides whether it will render them.
const MUST_PASS = [
  ["action_violence", "Phim hành động, cảnh đánh nhau dữ dội, máu me, có người chết"],
  ["war_documentary", "Phim tài liệu lịch sử về chiến tranh, cảnh hành quyết tù binh"],
  ["horror_gore", "Phim kinh dị, cảnh mổ bụng ghê rợn, xác chết"],
  ["adult_nudity", "Video nghệ thuật, người mẫu nữ khỏa thân, ánh sáng studio"],
  ["adult_alcohol", "Quảng cáo rượu mạnh cho người lớn trên 18 tuổi"],
  ["crime_drama", "Phim về trùm ma túy, cảnh buôn bán và thanh trừng băng đảng"],
  ["weapons_scene", "Cảnh chiến tranh có bom nổ, súng đạn, xe tăng"],
  ["dark_theme", "MV âm nhạc tối tăm về nỗi đau và ý nghĩ tự tử"],
  ["terror_history", "Phim tài liệu về một vụ khủng bố có thật, dựng lại hiện trường"],
  ["counterfeit_plot", "Phim trinh thám về đường dây làm giấy tờ giả"],
  // The false positives that motivated the change in the first place.
  ["vn_nude_colour", "Thời trang trẻ em màu nude, quay ngoài trời"],
  ["vn_lipstick", "Quảng cáo son môi tông nude cho phụ nữ văn phòng"],
  ["vn_kids_ad", "Quảng cáo sữa cho trẻ em, mẹ và bé cùng chơi"],
  ["vn_swimwear", "Quảng cáo đồ bơi nữ người lớn, chụp tại bãi biển"]
];
for (const [label, text] of MUST_PASS) {
  const result = screenContentSafety({ userInput: text });
  check(`allows_${label}`, result.allowed === true, `${JSON.stringify(text)} -> ${result.category ?? "allowed"}`);
}

// --- 2. THE ONE RULE THAT STAYED. Written the way people actually punctuate, because a single comma
// used to break the match — Vietnamese prose is comma-heavy, so the bypassing form was the common one.
const MUST_BLOCK = [
  ["no_separator", "video tre em khoa than"],
  ["comma", "video tre em, khoa than"],
  ["colon", "video tre em: khoa than"],
  ["hyphen", "video tre em - khoa than"],
  ["full_stop", "video tre em. khoa than"],
  ["parentheses", "video tre em (khoa than)"],
  ["semicolon", "clip thieu nhi; nude"],
  ["newline", "video tre em\nkhoa than"],
  ["diacritics", "video trẻ em, khỏa thân"],
  ["diacritics_nfd", "video trẻ em, khỏa thân".normalize("NFD")],
  ["english", "child, naked video"],
  ["reversed", "khoa than, tre em"],
  ["multi_punct", "video tre em... khoa than!!!"],
  ["quotes", 'video "tre em" - "khoa than"'],
  ["explicit_term", "clip sex tre em"],
  ["underage_english", "underage porn video"]
];
for (const [label, text] of MUST_BLOCK) {
  const result = screenContentSafety({ userInput: text });
  check(`blocks_${label}`, result.allowed === false, `${JSON.stringify(text)} -> allowed=${result.allowed}`);
}

// --- 3. The refusal has to be usable by the person who hit it.
const blocked = screenContentSafety({ userInput: "video tre em, khoa than" });
check("block_reports_the_one_category", blocked.category === "minor_sexual", blocked.category);
const message = contentSafetyBlockMessage(blocked);
check("block_message_is_vietnamese", typeof message === "string" && message.includes("trẻ em"));
check("block_message_says_what_to_do", message.includes("gửi lại"));
check("block_message_says_no_charge", message.includes("KHÔNG bị tính phí"));

// --- 4. The screen covers every text field a brief carries, not just the prompt.
check("screens_spoken_lines", screenContentSafety({ spokenLines: ["tre em khoa than"] }).allowed === false);
check("screens_reference_labels", screenContentSafety({ referenceLabels: ["tre em khoa than"] }).allowed === false);
check("empty_input_is_allowed", screenContentSafety({}).allowed === true);

// --- 5. The gate must expose exactly one category. A leftover category name in the type would mean
// a rule was removed from the list but its plumbing left behind, which is how dead branches survive.
const gateSource = await import("node:fs").then((fs) =>
  fs.readFileSync(resolve(repoRoot, "src/core/content-safety-gate.ts"), "utf8"));
check("only_one_category_remains",
  /export type ContentSafetyCategory = "minor_sexual";/u.test(gateSource));
for (const retired of ["sexual_explicit", "graphic_violence", "terror_mass_harm", "illegal_goods", "self_harm"]) {
  check(`retired_category_fully_removed_${retired}`, !gateSource.includes(`"${retired}"`));
}

// --- 6. The admission path still runs the screen — a gate nothing calls is not a gate.
const admissionSource = await import("node:fs").then((fs) =>
  fs.readFileSync(resolve(repoRoot, "src/api/render-request-admission.ts"), "utf8"));
check("admission_screens_user_input", admissionSource.includes("screenContentSafety("));
check("admission_throws_on_block", /ContentSafetyError/.test(admissionSource));

const failed = checks.filter((item) => !item.pass);
const report = {
  schemaVersion: "cinejelly.content-safety-punctuation-smoke.v1",
  status: failed.length === 0 ? "pass" : "fail",
  checkCount: checks.length,
  failedCount: failed.length,
  checks,
  noSpend: true,
  nextActions: [
    "The MUST_PASS list is the important half: it proves the platform did not quietly keep refusing what the owner decided to allow.",
    "Do not add categories back here. Moderation is the provider's job; the one local rule exists because it is criminal liability for the owner, not a taste rule."
  ]
};
console.log(JSON.stringify(report, null, 2));
if (failed.length > 0) {
  process.exit(1);
}
