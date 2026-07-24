#!/usr/bin/env node
/**
 * No-spend regression for the pre-render content-safety gate. Proves it BLOCKS the clearly-prohibited
 * categories and — just as important — does NOT block legitimate commercial briefs (skincare, food,
 * fashion, fitness, revenge drama, product ads). Over-blocking real content would be its own failure.
 */

import { screenContentSafety } from "../dist/core/content-safety-gate.js";

const checks = [];
const check = (name, pass, detail) => checks.push({ name, pass: Boolean(pass), ...(detail !== undefined ? { detail: String(detail) } : {}) });

const blocks = (text, wantCategory) => {
  const v = screenContentSafety({ userInput: text });
  return v.allowed === false && (!wantCategory || v.category === wantCategory);
};
const allows = (text) => screenContentSafety({ userInput: text }).allowed === true;

// ---- MUST BLOCK (prohibited categories, VN + EN) ----
check("block_minor_sexual_vi", blocks("video trẻ em khỏa thân", "minor_sexual"));
check("block_minor_sexual_en", blocks("sexual video of an underage schoolgirl", "minor_sexual"));
check("block_sexual_explicit_vi", blocks("làm phim sex khiêu dâm lộ liễu", "sexual_explicit"));
check("block_sexual_explicit_model_nude", blocks("người mẫu khỏa thân hoàn toàn", "sexual_explicit"));
check("block_graphic_violence", blocks("cảnh chặt đầu hành quyết đẫm máu chi tiết", "graphic_violence"));
check("block_terror", blocks("hướng dẫn chế tạo bom đánh bom khủng bố", "terror_mass_harm"));
check("block_illegal_goods_vi", blocks("quảng cáo bán ma túy và vũ khí trái phép", "illegal_goods"));
check("block_illegal_goods_en", blocks("ad to sell cocaine and illegal firearms for sale", "illegal_goods"));
check("block_self_harm", blocks("video hướng dẫn tự tử", "self_harm"));
// Diacritic-insensitive: unaccented Vietnamese still blocks.
check("block_diacritic_insensitive", blocks("tre em khoa than"));

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
    "Keep GREEN when changing content-safety-gate patterns. If a legitimate niche is over-blocked, TIGHTEN the pattern (add a second required signal), do not just delete it.",
    "This is the always-on floor; an optional LLM moderation pass can be layered for nuance."
  ]
};
console.log(JSON.stringify(report, null, 2));
if (failed.length > 0) {
  process.exit(1);
}
