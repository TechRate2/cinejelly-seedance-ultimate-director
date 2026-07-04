# Bản đồ: repo snapshot nào → phần nào của pipeline

Dự án hấp thụ **tinh túy logic** của các repo mã nguồn mở (snapshot đặt trong `external/upstream/`, chỉ để đối chiếu — KHÔNG import, KHÔNG chạy) vào bản tự viết sạch trong `src/`. Bảng dưới trả lời: dùng mấy repo, repo nào cho phần nào.

**Số repo snapshot tham chiếu: 11.**

| Repo snapshot | Cấp cho phần nào của pipeline | File chính trong `src/` | Độ hấp thụ |
|---|---|---|---|
| **awesome-seedance-2-prompts** | Giải phẫu prompt: beat theo mốc thời gian, khối camera/chuyển động/âm thanh, negative chống-slop | `prompt_compiler/prompt-compiler.ts`, `negative-constraints.ts`, `seedance-dna.ts` | ~85% |
| **seedance-2.0** | Chọn chế độ (t2v/i2v/ref2v/extend/edit), thứ tự ưu tiên reference, khung nhiều-shot, nối khung cuối | `prompt-compiler.ts` (mode), `reference-binding.ts`, `endpoint-frame-chain.ts` | ~90% |
| **moneyprinterturbo** | Cả pipeline short: sinh kịch bản, tìm tư liệu, phụ đề/TTS/BGM, ghép video theo giai đoạn | `short-video-pipe-planner.ts`, `material-sourcing-planner.ts`, `subtitle-caption-builder.ts`, `assembly-engine.ts`, `audio-mix-engine.ts` | ~95% |
| **open-ai-ugc** | Studio nhập tối giản (ý tưởng + ≤7 ảnh reference), handle `@image`, mặc định thông minh | `simple-brief-resolver.ts`, `prompt-compiler.ts` (reference handles) | ~88% |
| **vimax** | Lập kế hoạch long-form, chấm điểm reference (cùng camera/gần đây), nhiều ứng viên, **phân đoạn theo ngữ nghĩa**, **chân dung nhiều góc** | `reference-selection-planner.ts`, `long-form-sequence-planner.ts`, `semantic-sequence-segmenter.ts`, `keyframe-first-planner.ts` (multi-view) | ~88% |
| **vibeframe** | Xác thực-trước-khi-tốn-tiền, cổng chi phí, báo cáo/artifact, vòng sửa lỗi, **dựng cảnh chữ (typography)** | `delivery-gate.ts`, `render-cost-gate.ts`, `review-packet-builder.ts`, `typography-scene-composer.ts` | ~92% |
| **open-ai-micro-drama-generator** | Drama nhiều tập: biên kịch → storyboard → khung tĩnh từng cảnh → animate; khóa nhân vật | `series-drama-planner.ts`, `keyframe-first-planner.ts` (cast portrait) | ~90% |
| **skyreels-v2** | Nhịp hook short-drama, cliffhanger cắt-trước-cao-trào, **các trục shot có cấu trúc (camera-motion + biểu cảm)** | `series-drama-planner.ts`, `shot-grammar.ts` (enums) | ~85% |
| **openmontage** (AGPL) | Cổng duyệt, chấm điểm nguồn, ma trận stock-vs-tự-sinh, giao thức checkpoint (chỉ phân tích ý tưởng, KHÔNG chép code) | `review-approval-system.ts`, `material-source-validator.ts`, `consistency-guardian.ts` | ~60% |
| **director** | Lập kế hoạch hội thoại, điều phối agent, thông báo tiến độ | `short-director-planner.ts`, `short-pipeline-conversation.ts` | ~66% |
| **directorbench** | Phân loại checkpoint chất lượng, tổng hợp theo trọng số, chẩn đoán điểm nghẽn | `director-style-benchmark.ts` | ~88% |

## Toàn cảnh pipeline: mỗi tầng do repo nào chống lưng

```
Ý tưởng/nhập liệu ──── open-ai-ugc, moneyprinterturbo
   → Kế hoạch truyện ── director, vimax
   → Phân cảnh/khung ── awesome-seedance-2-prompts, seedance-2.0, skyreels-v2 (trục shot)
   → Biên soạn prompt ─ awesome-seedance-2-prompts, seedance-2.0
   → Khung tĩnh trước ─ open-ai-micro-drama-generator, vimax (chân dung nhiều góc)
   → Chọn reference ─── vimax, seedance-2.0
   → Chiến lược render ─ vibeframe (cổng chi phí), directorbench (chất lượng)
   → Ghép + phụ đề ──── moneyprinterturbo, openmontage (ý tưởng)
   → Cảnh chữ/text ──── vibeframe (typography-scene-composer)
   → Drama nhiều tập ── open-ai-micro-drama-generator, skyreels-v2
   → Long-form ──────── vimax, semantic-sequence-segmenter
```

## Còn thiếu gì để tuyệt đối 100%?

- **Bằng chứng chạy trả tiền** (không phải thiếu code): chất lượng video Seedance thật, nghe thử audio sinh ra — chờ mẻ nghiệm thu ~$13.
- **Phi-sáng-tạo**: giao diện chat + thư viện VideoDB của Director; workflow footage-thật của OpenMontage bị chặn bởi giấy phép AGPL (chỉ hấp thụ ý tưởng).
- Các gap sáng tạo (RAG long-form, dựng cảnh chữ) đã đóng ở tầng logic bằng 4 nâng cấp gần nhất; cảnh chữ cần thêm bộ rasterize SVG trong khâu ghép để render ra khung hình.
