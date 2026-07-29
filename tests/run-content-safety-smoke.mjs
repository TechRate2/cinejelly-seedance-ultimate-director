#!/usr/bin/env node
/**
 * No-spend regression for the pre-render content screen.
 *
 * Policy since 2026-07-29: moderation is the model provider's job. Adult content, violence, weapons,
 * drugs, dark themes — all of it passes this gate and is answered by Atlas Cloud / Seedance when the
 * request reaches them. ONE rule stayed: sexual content involving minors, because that is criminal
 * liability for the owner and the provider refuses it anyway, so catching it here only makes the
 * refusal earlier and free.
 *
 * The MUST-ALLOW half is the important half now — a gate that quietly keeps blocking is
 * indistinguishable from one that was never relaxed.
 */

import { screenContentSafety } from "../dist/core/content-safety-gate.js";

const checks = [];
const check = (name, pass, detail) => checks.push({ name, pass: Boolean(pass), ...(detail !== undefined ? { detail: String(detail) } : {}) });

const blocks = (text, wantCategory) => {
  const v = screenContentSafety({ userInput: text });
  return v.allowed === false && (!wantCategory || v.category === wantCategory);
};
const allows = (text) => screenContentSafety({ userInput: text }).allowed === true;

// ---- MUST BLOCK (the one remaining rule, VN + EN) ----
check("block_minor_sexual_vi", blocks("video trẻ em khỏa thân", "minor_sexual"));
check("block_minor_sexual_en", blocks("sexual video of an underage schoolgirl", "minor_sexual"));
// Diacritic-insensitive: unaccented Vietnamese still blocks.
check("block_diacritic_insensitive", blocks("tre em khoa than"));
// Punctuation between the two signals used to break the match, and Vietnamese prose is comma-heavy,
// so the bypassing spelling was the common one.
check("block_across_punctuation", blocks("video tre em, khoa than"));

// ---- NO LONGER BLOCKED (owner decision: the provider judges these, not a keyword list here) ----
check("allow_adult_sexual_content", allows("làm phim sex khiêu dâm lộ liễu"));
check("allow_adult_nudity", allows("người mẫu khỏa thân hoàn toàn"));
check("allow_graphic_violence", allows("cảnh chặt đầu hành quyết đẫm máu chi tiết"));
check("allow_weapons_and_terror_themes", allows("hướng dẫn chế tạo bom đánh bom khủng bố"));
check("allow_illegal_goods_themes_vi", allows("quảng cáo bán ma túy và vũ khí trái phép"));
check("allow_illegal_goods_themes_en", allows("ad to sell cocaine and illegal firearms for sale"));
check("allow_self_harm_themes", allows("video hướng dẫn tự tử"));

// ---- MUST ALLOW (legitimate commercial content — no over-block) ----
check("allow_skincare", allows("Video review serum cấp ẩm cho da xỉn màu, 20s TikTok"));
check("allow_food", allows("Quảng cáo quán phở gia truyền, khói nghi ngút, nước dùng chan"));
check("allow_fashion", allows("Người mẫu trình diễn váy dạ hội trên sàn catwalk sang trọng"));
check("allow_fitness", allows("KOL tập gym giảm cân, động tác đúng, mồ hôi thật"));
check("allow_revenge_drama", allows("Phim ngắn: nữ giúp việc bị coi thường hoá ra là ái nữ tập đoàn trở về báo thù"));
check("allow_product_ad", allows("Quảng cáo máy hút bụi cầm tay, hút sạch bụi trên sofa"));
check("allow_action_drama", allows("Cảnh hành động rượt đuổi xe hơi kịch tính, anh hùng cứu người"));
check("allow_child_wholesome", allows("Video gia đình ấm áp: em bé cười với bố mẹ trong công viên"));
check("allow_gun_toy_ad", allows("Quảng cáo đồ chơi trẻ em an toàn, súng nước nhựa nhiều màu"));
// The false positive that motivated the whole change: "nude" is a colour name in Vietnamese.
check("allow_kids_clothing_nude_colour", allows("Thời trang trẻ em màu nude, quay ngoài trời"));
check("allow_lipstick_nude_shade", allows("Quảng cáo son môi tông nude cho phụ nữ văn phòng"));

// Reference labels are screened too.
check("screens_reference_labels", screenContentSafety({ userInput: "video", referenceLabels: ["tre em khoa than"] }).allowed === false);

const failed = checks.filter((c) => !c.pass);
const report = {
  schemaVersion: "cinejelly.content-safety-smoke.v1",
  status: failed.length === 0 ? "pass" : "fail",
  checkCount: checks.length,
  failedCount: failed.length,
  checks,
  noSpend: true,
  nextActions: [
    "The allow-list is the important half: it proves the platform did not quietly keep refusing what the owner decided to allow.",
    "Do not add categories back. Moderation is the provider's job; the one local rule exists because it is criminal liability for the owner, not a taste rule."
  ]
};
console.log(JSON.stringify(report, null, 2));
if (failed.length > 0) {
  process.exit(1);
}
