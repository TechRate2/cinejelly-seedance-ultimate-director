# Bản đồ dự án CineJelly

> Đọc file này TRƯỚC khi sửa bất cứ thứ gì.
> Viết cho hai người đọc: **chủ dự án (không đọc code)** và **model AI được nhờ sửa code**.
> Cập nhật lần cuối: 2026-07-31.

---

## 1. Sản phẩm này là gì

Một **agent làm video tự động bằng Seedance 2.0**. Khách viết một câu (hoặc tải ảnh lên),
agent tự lo hết: nghĩ kịch bản → chia cảnh → vẽ khung hình đầu → render từng clip →
lồng tiếng → ghép → giao file MP4.

Khách **không cần biết gì về làm phim**. Không có nhiều tab, không có nhiều công cụ.
Một ô nhập, một nút, một video.

**Ba thứ quyết định chất lượng, theo đúng thứ tự đó:**

1. **Kịch bản** — agent viết hay thì video hay. Đây là phần mạnh nhất và cũng đáng đầu tư nhất.
2. **Khung hình đầu (keyframe)** — mỗi cảnh được vẽ một tấm ảnh tĩnh trước, rồi model video mới
   làm cảnh đó chuyển động từ tấm ảnh ấy. Đây là lý do mặt nhân vật không bị đổi giữa các cảnh.
3. **Ghép nối** — chuyển cảnh, tiếng nói, phụ đề, cắt đúng thời lượng.

---

## 2. Chạy dự án

| Việc cần làm | Lệnh |
|---|---|
| **Kiểm tra dự án còn chạy đúng không** | `npm test` |
| Cài đặt lần đầu (có hướng dẫn từng bước) | `npm run setup` |
| Kiểm tra máy đã sẵn sàng chưa | `npm run doctor` |
| Dịch mã nguồn | `npm run build` |
| Bật máy chủ | `npm start` |
| Kiểm tra nhanh, không dịch lại mã | `npm run check:fast` |

**`npm test` là lệnh quan trọng nhất.** Nó chạy 96 bài kiểm tra + 7 bài soi toàn dự án,
**không tốn một đồng nào**, và trả lời bằng tiếng Việt. Sau khi AI sửa bất cứ thứ gì, chạy lệnh này.
Nếu nó nói *"Dự án đang ổn"* thì yên tâm. Nếu có bài đỏ, nó ghi rõ đỏ ở đâu và cách xem chi tiết.

Có 2 bài **đỏ có chủ ý** — chúng chờ bằng chứng từ một lần render trả tiền thật.
`npm test` liệt kê chúng riêng và **không** tính là lỗi.

⚠️ **Lệnh DUY NHẤT tiêu tiền thật:** `npm run validation:paid-render`. Mọi lệnh khác đều miễn phí.

---

## 3. Menu chức năng — cái gì nằm ở đâu

Toàn bộ những gì sản phẩm hứa **đều đã có code chạy được**. Bảng này nối
*"chức năng khách thấy"* → *"file cần sửa"*.

### 3.1 Làm video từ một câu mô tả (chức năng chính)

| | |
|---|---|
| Khách vào | `/short/create` |
| Trang giao diện | `src/api/short-pipeline-create-page.ts` |
| Đường API | `/v1/short-pipeline/*`, `/v1/render`, `/v1/render-jobs` |
| Agent điều phối | `src/agents/director-agent.ts` → hàm `run()` |
| **Sửa kịch bản hay hơn** | `src/agents/story-architect.ts` |
| **Sửa phong cách quay** | `src/core/register-grammar.ts`, `src/core/shot-grammar.ts` |
| **Sửa khung hình đầu** | `src/core/keyframe-first-planner.ts` |
| **Sửa lời nhắc gửi model** | `src/prompt_compiler/prompt-compiler.ts` |

Hỗ trợ sẵn hai phong cách đối lập, tự nhận từ mô tả của khách:
- `natural_phone_kol` — quay bằng điện thoại, tự nhiên như người thật (TikTok/UGC)
- `professional_cinematic` — máy quay chuyên nghiệp, ánh sáng phim

### 3.2 Video dài / phim

| | |
|---|---|
| Đường API | `/v1/long-form` |
| Lập kế hoạch thời lượng dài | `src/core/long-form-timeline-planner.ts` |
| Giữ mạch truyện xuyên suốt | `src/core/long-form-continuity-planner.ts` |
| Giới hạn hiện tại | **480 giây (8 phút)** mỗi video |

### 3.3 Phim nhiều tập, nhiều nhân vật

| | |
|---|---|
| Đường API | `/v1/series` |
| Điều phối từng tập | `src/application/series-episode-director.ts` |
| **Sổ ghi nhớ series** (ai là ai, tập trước xảy ra gì) | `src/core/series-continuity-store.ts` |
| Lập kịch bản nhiều tập | `src/core/series-drama-planner.ts` |

Cách giữ **mặt nhân vật không đổi qua 70 tập**: tập 1 vẽ chân dung mỗi nhân vật và **ghim** lại;
mọi tập sau dùng đúng ảnh đó. Ảnh đã ghim **không bao giờ bị ghi đè**.

### 3.4 Lồng tiếng / phụ đề ngôn ngữ khác

| | |
|---|---|
| Đường API | `/v1/redub` |
| Thực hiện lồng tiếng | `src/core/redub-executor.ts` |
| Ép giọng đọc vừa khung hình | `src/core/dub-duration-fit.ts` |
| Nhận diện ngôn ngữ | `src/core/spoken-language.ts` |

### 3.5 Khách tải ảnh lên rồi nhờ gợi ý kịch bản

| | |
|---|---|
| Đường API | `/v1/uploads`, `/v1/short-pipeline/conversation` |
| Đọc ảnh khách gửi (bằng AI thị giác) | `src/agents/reference-vision-analyst.ts` |
| Phân loại ảnh vào đúng vai | `src/agents/reference-librarian.ts` |

Nếu khách bỏ ảnh sản phẩm vào ô "gương mặt KOL", hệ thống **phát hiện và báo trước khi tiêu tiền**.

### 3.6 Tài khoản, nạp tiền, credits

| | |
|---|---|
| Đường API | `/v1/account` |
| Trang nạp tiền cho chủ hệ thống | `/operator/topups` |
| Điều khoản & chính sách hoàn tiền | `/terms` hoặc `/dieu-khoan` |

### 3.7 Bàn điều khiển của chủ hệ thống

| | |
|---|---|
| Trang | `/operator/admin`, `/operator/launch` |
| Đường API | `/v1/admin` |

---

## 4. Một lần làm video đi qua những bước nào

Tất cả nằm trong một hàm: `DirectorAgent.run()` — `src/agents/director-agent.ts`.

```
Khách gửi mô tả
  │
  ├─ 1. Nhận & làm sạch yêu cầu ............ intake-director.ts
  ├─ 2. Chặn nội dung cấm ................. content-safety-gate.ts      [MIỄN PHÍ]
  ├─ 3. Đọc ảnh khách gửi ................. reference-vision-analyst.ts  💰 (rẻ)
  ├─ 4. Phân tích ý đồ sáng tạo ........... creative-brief-analyst.ts    💰 (rẻ)
  ├─ 5. VIẾT KỊCH BẢN ..................... story-architect.ts           💰 (rẻ)
  ├─ 6. Chia cảnh, chọn góc máy ........... shot-planner.ts             [MIỄN PHÍ]
  ├─ 7. ⛔ CHỐT: kịch bản có đủ dài không?  director-agent.ts           [MIỄN PHÍ]
  ├─ 8. ⛔ CHỐT: có vượt ngân sách không?   render-cost-gate.ts         [MIỄN PHÍ]
  ├─ 9. Vẽ khung hình đầu mỗi cảnh ........ keyframe-first-planner.ts   💰💰
  ├─ 10. Đọc lời thoại thành tiếng ........ (TTS)                       💰
  ├─ 11. ⛔ CHỐT: đo giọng đọc thật ........ director-agent.ts          [MIỄN PHÍ]
  ├─ 12. RENDER TỪNG CLIP ................. render-producer.ts         💰💰💰 ĐẮT NHẤT
  ├─ 13. Chấm & chọn clip tốt nhất ........ rendered-candidate-visual-inspector.ts 💰
  ├─ 14. Ghép, chuyển cảnh, trộn tiếng .... assembly-engine.ts          [MIỄN PHÍ]
  └─ 15. ⛔ CHỐT: đủ chuẩn giao khách?      delivery-gate.ts            [MIỄN PHÍ]
       │
       └─→ file MP4 giao cho khách
```

**Nguyên tắc quan trọng nhất của hệ thống:** mọi cửa chặn (⛔) phải nằm **TRƯỚC** bước tốn tiền
mà nó bảo vệ. Một cửa chặn đặt sai chỗ vẫn "hoạt động" nhưng khách đã mất tiền — đó chính là
lỗi từng làm mất $7 trong một lần chạy thật (đặt 18 giây, ra 7,3 giây, mất trọn tiền).

---

## 5. Bản đồ thư mục

```
src/
├── agents/        (10 file)  Bộ não. Điều phối + các chuyên gia gọi AI.
├── core/          (107 file) Toàn bộ logic nghiệp vụ. KHÔNG gọi mạng, KHÔNG đọc cấu hình.
├── api/           (33 file)  Máy chủ HTTP, 3 trang web, ~70 đường API, tài khoản & tiền.
├── application/   (14 file)  Lắp ráp hệ thống + các lệnh chạy từ dòng lệnh.
├── providers/     (7 file)   NƠI DUY NHẤT gọi ra Atlas Cloud qua internet.
├── prompt_compiler/(4 file)  Biến kế hoạch cảnh thành câu lệnh gửi model video.
├── types/         (48 file)  Chỉ định nghĩa kiểu dữ liệu. Không có logic.
├── config/        (3 file)   Giá trị mặc định đọc từ biến môi trường.
└── utils/         (12 file)  Công cụ nhỏ dùng chung.

tests/       96 bài kiểm tra không tốn tiền — lưới an toàn của bạn
scripts/     ~60 công cụ vận hành + 7 bài soi toàn dự án
docs/        Tài liệu chi tiết
external/    12 repo tham khảo (KHÔNG phải code chạy — xem mục 7)
```

**Vì sao code lại làm thế:** [`docs/QUYET-DINH-KY-THUAT.md`](docs/QUYET-DINH-KY-THUAT.md) —
đọc trước khi sửa. Nhiều đoạn trông vòng vo nhưng tồn tại vì một sự cố đã làm mất tiền thật.

**Mỗi vùng có README riêng — mở ra là hiểu ngay vùng đó:**
[`src/`](src/README.md) · [`src/agents/`](src/agents/README.md) · [`src/core/`](src/core/README.md) ·
[`src/api/`](src/api/README.md) · [`tests/`](tests/README.md) · [`scripts/`](scripts/README.md)

**Luật kiến trúc (có máy kiểm tra, `npm test` sẽ báo nếu vi phạm):**

- `core/` **không được** đọc biến môi trường và **không được** gọi mạng. Ai cần cấu hình thì
  nhận qua tham số. Lý do: giấu một thiết lập toàn hệ thống vào file lõi thì không ai tìm ra.
- Chỉ `providers/` được gọi internet.
- Mọi phản hồi HTTP phải đi qua `sendJson` / `sendHtml` / `sendVideoStream`. Tự viết header
  nghĩa là mất các tiêu đề bảo mật — đã từng xảy ra ở đường tải phụ đề.
- Không tạo file test/mock/demo trong `src/`. Bài kiểm tra sống ở `scripts/`.

---

## 6. Sửa chỗ nào cho việc gì

| Muốn thay đổi | Sửa file |
|---|---|
| Kịch bản hay hơn, hook mạnh hơn | `src/agents/story-architect.ts` |
| Cách chọn góc máy / cỡ cảnh | `src/core/shot-grammar.ts` |
| Phong cách điện thoại ↔ điện ảnh | `src/core/register-grammar.ts` |
| Bí quyết theo từng ngành hàng | `src/core/niche-playbooks.ts` |
| Chất lượng khung hình đầu | `src/core/keyframe-first-planner.ts` |
| Câu lệnh gửi cho model video | `src/prompt_compiler/prompt-compiler.ts` |
| Giá tiền, trần chi phí | `src/core/render-cost-gate.ts` |
| Từ khoá nội dung cấm | `src/core/content-safety-gate.ts` |
| Điều khoản, chính sách hoàn tiền | `src/api/terms-page.ts` |
| Giao diện khách | `src/api/short-pipeline-create-page.ts` |
| Thời lượng tối đa, chất lượng mặc định | `src/config/seedance-settings.ts` |

**Sau MỌI thay đổi: chạy `npm test`.**

---

## 7. `external/upstream/` — 12 repo tham khảo

Đây **không phải** code chạy của sản phẩm. Không file nào trong `src/` import từ đây
(có máy kiểm tra chặn việc đó). Chúng là mã nguồn mở để **đọc và học cách làm**.

| Nhóm | Repo | Được phép |
|---|---|---|
| **MIT — copy thoải mái**, chỉ cần ghi nguồn | vimax, videoagent, vibeframe, moneyprinterturbo, director, seedance-2.0, awesome-seedance-2-prompts | ✅ Sao chép, chuyển thể tự do |
| **AGPL-3.0 — NGUY HIỂM** | openmontage | ⛔ Chỉ đọc để hiểu ý tưởng. Sao chép code từ đây **buộc toàn bộ sản phẩm của bạn phải mở mã nguồn** |
| **Không có giấy phép** | directorbench, open-ai-ugc, open-ai-micro-drama-generator, skyreels-v2 | ⚠️ Đọc để hiểu cách làm, rồi **tự viết lại** bằng code của mình |

`npm test` sẽ báo lỗi nếu có repo lạ xuất hiện mà chưa khai báo giấy phép.

---

## 8. Việc còn dang dở

| Việc | Vì sao quan trọng |
|---|---|
| **Danh sách phim đọc toàn bộ file của mọi khách** | Đã chặn bằng giới hạn 20 bộ/khách, nhưng khi đông khách vẫn cần chỉ mục riêng |
| **Chưa dùng 3 góc mặt nhân vật** | Code vẽ được nhưng lời nhắc keyframe chưa nhận — bật lên là mặt hết trôi khi quay nghiêng |
| **Một clip lỗi làm hỏng cả video** | Đang: 1 trong 10 cảnh lỗi → vứt cả 10 clip đã trả tiền. Cần: giữ 9 clip tốt, làm lại 1 cảnh |
| **Chưa có bộ nhớ đệm** | Chạy lại một yêu cầu giống hệt vẫn trả tiền lại từ đầu |
| **Ảnh khách tải lên không bao giờ bị xoá** | Thư mục đầy dần → đến lúc mọi khách đều không tải lên được |
| **Chưa có nhạc nền** | Video hiện chỉ có giọng đọc |
| **Menu chức năng chưa hiện ra giao diện** | Series, video dài, lồng tiếng **đã có API chạy được** nhưng khách chưa thấy nút bấm nào |
| **66/265 bài kiểm tra trong một file là "sơn xanh"** | `tests/run-input-matrix-smoke.mjs` — chúng chỉ tìm chữ trong mã nguồn, không chạy code thật |
| Giới hạn tốc độ bị lách ở một đường API | `/v1/short-pipeline/conversation` chạy cùng engine với đường đã giới hạn nhưng không bị chặn |

---

## 9. Quy tắc cho AI sửa dự án này

1. **Chạy `npm test` trước và sau** mỗi thay đổi. Không có ngoại lệ.
2. **Không bao giờ gọi API trả tiền** khi chưa được chủ dự án đồng ý rõ ràng bằng chữ "chạy".
3. **Đọc `.env` là cấm.** File đó chứa khoá API tiền thật.
4. **Bài kiểm tra đỏ thì sửa CODE, không sửa bài kiểm tra** — trừ khi chứng minh được bài kiểm tra
   sai. Nới lỏng bài kiểm tra cho khớp code hỏng là cách nhanh nhất phá sản phẩm của một người
   không đọc được code.
5. **Cửa chặn phải nằm trước bước tốn tiền** mà nó bảo vệ.
6. Sản phẩm cho **người Việt**: tên có dấu, chữ có thể ở dạng tổ hợp, "nude" là **tên một màu**.
   Test bằng dữ liệu tiếng Việt thật, đừng chỉ dùng "Linh"/"Mai" không dấu.
7. Thông báo lỗi cho khách viết **tiếng Việt đơn giản**, nói rõ phải làm gì tiếp.
   **Không hứa về tiền** nếu chưa kiểm tra chính sách hoàn credits thực tế.
