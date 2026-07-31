# `src/agents/` — bộ não

> Bản đồ tổng: [`../../BAN-DO-DU-AN.md`](../../BAN-DO-DU-AN.md)

Một nhạc trưởng và các chuyên gia. Nhạc trưởng quyết định thứ tự và thời điểm tiêu tiền;
mỗi chuyên gia làm đúng một việc.

| File | Việc | Gọi model AI? |
|---|---|---|
| `director-agent.ts` | **Nhạc trưởng.** Hàm `run()` đi từ mô tả của khách tới file MP4 | điều phối |
| `intake-director.ts` | Cửa trước: làm sạch và kiểm tra yêu cầu thô | ❌ |
| `reference-librarian.ts` | Phân loại ảnh/video khách gửi vào đúng vai, chặn link nguy hiểm | ❌ |
| `reference-vision-analyst.ts` | **Nhìn** ảnh khách gửi và nói nó thật sự là gì | 💰 rẻ |
| `creative-brief-analyst.ts` | Đọc brief một lần, chốt hướng sáng tạo (tông, thể loại, ngôn ngữ) | 💰 rẻ |
| `story-architect.ts` | **Viết kịch bản.** Cảnh, nhịp, lời thoại lấp đủ thời lượng | 💰 rẻ |
| `script-enhancer.ts` | Đánh bóng lời thoại cho tự nhiên. Hỏng thì giữ nguyên bản gốc | 💰 rẻ |
| `source-video-analyst.ts` | Làm sạch bản phân tích video mẫu do người gọi cung cấp | ❌ |
| `source-video-reference-metadata-enricher.ts` | Gắn ghi chú cảnh vào từng tài nguyên | ❌ |
| `render-producer.ts` | **Nơi duy nhất** gửi lời nhắc đã hoàn chỉnh đi render | 💰💰💰 đắt nhất |

## `director-agent.ts` — đọc file này thế nào

Gần 3000 dòng, nhưng chỉ có **một** hàm cần hiểu: `run()`. Mọi thứ còn lại là hàm phụ nó gọi.

Đọc `run()` từ trên xuống, và để ý ba loại dòng:

- `await this.<gì đó>Stage(...)` — một giai đoạn của quy trình
- `this.assert<gì đó>(...)` — một **cửa chặn**. Hỏi ngay: nó đứng trước hay sau bước tốn tiền?
- `this.reportStageProgress(...)` — báo tiến độ cho khách xem

Sơ đồ 15 bước đầy đủ nằm ở mục 4 của [`BAN-DO-DU-AN.md`](../../BAN-DO-DU-AN.md).

## Sửa chất lượng video thì sửa ở đâu

Đây là **phần đáng đầu tư nhất** — kịch bản quyết định video hay hay dở, và nó **rẻ**
(vài xu mỗi lần gọi) so với render (hàng đô mỗi clip).

| Muốn | Sửa |
|---|---|
| Kịch bản hay hơn, mở đầu níu người xem hơn | `story-architect.ts` |
| Lời thoại tự nhiên hơn | `script-enhancer.ts` |
| Bắt lỗi ảnh khách gửi sai vai sớm hơn | `reference-vision-analyst.ts` |
| Đổi cách chọn model hoặc cách thử lại khi render lỗi | `render-producer.ts` |

## Nguyên tắc "hỏng mở" (fail-open)

Nhiều chuyên gia ở đây được thiết kế để **hỏng thì bỏ qua, không chặn**: đánh bóng lời thoại,
phân tích ý đồ, đọc ảnh. Lý do: chúng làm video **tốt hơn**, không phải làm video **đúng**.
Một lần gọi AI lỗi không được phép giết đơn hàng của khách.

Ngược lại, các bước quyết định **tiền** và **giao hàng** thì **hỏng đóng** (fail-closed) —
thà dừng còn hơn tiêu nhầm hoặc giao sai.

Khi sửa, giữ đúng phân loại này. Biến một bước làm-đẹp thành hỏng-đóng nghĩa là một ghi chú
thẩm mỹ của AI có thể giết cả đơn hàng đã trả tiền — lỗi đó đã từng xảy ra thật.
