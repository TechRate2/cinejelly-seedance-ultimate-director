# `src/core/` — logic nghiệp vụ

> Bản đồ tổng: [`../../BAN-DO-DU-AN.md`](../../BAN-DO-DU-AN.md)

106 file, phần lớn khối lượng của dự án. **Không file nào ở đây được gọi mạng hay đọc biến
môi trường** — có máy kiểm tra chặn (`npm test`).

## Bốn nhóm

### 1. Lập kế hoạch & kịch bản — quyết định video có gì

Chạy **trước khi tiêu đồng nào**, hoàn toàn tất định.

| File chính | Việc |
|---|---|
| `shot-planner.ts` | Chia kịch bản thành từng cảnh có thời lượng cụ thể |
| `shot-grammar.ts` | Chọn cỡ cảnh, góc, vị trí máy quay cho từng cảnh |
| `register-grammar.ts` | Hai phong cách: tự quay điện thoại ↔ điện ảnh chuyên nghiệp |
| `keyframe-first-planner.ts` | Kế hoạch vẽ khung hình đầu + khoá gương mặt nhân vật |
| `duration-scripting.ts` | Toán thời lượng: bao nhiêu lời nói vừa bao nhiêu giây |
| `niche-playbooks.ts` | Bí quyết theo từng ngành hàng |
| `avatar-shot-planner.ts` | Cảnh có người nói → định tuyến sang model nhép miệng |

### 2. Tiền & cửa chặn — quyết định có được tiêu và có được giao

| File chính | Chặn cái gì | Chạy khi nào |
|---|---|---|
| `content-safety-gate.ts` | Nội dung cấm | Trước mọi thứ |
| `render-cost-gate.ts` | Vượt trần chi phí | Trước khi tiêu |
| `storyboard-approval-gate.ts` | Chưa có người duyệt | Trước khi tiêu |
| `image-anchor-verifier.ts` | Khung hình đầu sai mặt/bố cục | Sau ảnh, trước video |
| `rendered-candidate-visual-inspector.ts` | Chấm và chọn clip tốt nhất | Sau mỗi clip |
| `delivery-gate.ts` | Video không đạt chuẩn giao khách | Cuối cùng |

**Luật:** cửa chặn phải nằm **trước** bước tốn tiền nó bảo vệ. Đặt sau thì nó vẫn "hoạt động"
nhưng khách đã mất tiền.

### 3. Nhất quán & nhiều tập

| File chính | Việc |
|---|---|
| `series-continuity-store.ts` | Sổ ghi nhớ series: ai là ai, tập trước xảy ra gì, mặt ai đã ghim |
| `series-drama-planner.ts` | Lập kịch bản nhiều tập từ một cốt truyện |
| `consistency-guardian.ts` | Bắt lỗi lệch mặt/bối cảnh giữa các cảnh |
| `long-form-continuity-planner.ts` | Giữ mạch cho video dài |

### 4. Ghép nối & hậu kỳ

| File chính | Việc |
|---|---|
| `assembly-engine.ts` | Ghép các clip thành một file |
| `transition-engine.ts` | Chuyển cảnh (mỗi mối nối **ăn mất 0,35 giây**) |
| `audio-mix-engine.ts` | Trộn tiếng |
| `redub-executor.ts` | Lồng tiếng ngôn ngữ khác |
| `dub-duration-fit.ts` | Ép giọng đọc vừa khung hình |
| `media-inspector.ts` | Đo file thật bằng ffprobe |

## Bẫy: phép trừ chuyển cảnh

Video giao ra **= tổng độ dài các clip − (số cảnh − 1) × 0,35 giây**.

Bất kỳ chỗ nào so thời lượng với mức yêu cầu **phải trừ phần này**. Quên trừ tạo ra một vùng mù
(0,7 giây với đơn 18 giây / 3 cảnh; **27,65 giây** với đơn 8 phút / 80 cảnh) mà ở đó cửa chặn cho
qua, tiền tiêu hết, rồi cửa giao hàng cuối mới chặn. Dùng `transitionOverlapSecondsFor()`
trong `director-agent.ts`, đừng viết lại phép tính.

## Bẫy: tiếng Việt

| Vấn đề | Đúng |
|---|---|
| Tên có dấu | Gấp dấu (NFD + bỏ dấu thanh), **đừng xoá** ký tự có dấu. Xoá thì "Bác Hùng" = "Bác Hằng", "Đức" → "c" |
| Chữ dạng tổ hợp | Chuẩn hoá NFC ở cửa vào (`render-request-normalizer.ts`) |
| Đếm "từ" | Dùng `countSpeechUnits()`. Tách khoảng trắng cho ra **âm tiết**, và tiếng Trung/Nhật **không có khoảng trắng** |
| "nude" | Là **tên màu** trong tiếng Việt (`màu nude`, `tông nude`). Xem `content-safety-gate.ts` |
| "An", "A", "Thế" | Là **âm tiết trong tên người**, không phải mạo từ tiếng Anh. Xem `normalizeCharacterKey()` |
