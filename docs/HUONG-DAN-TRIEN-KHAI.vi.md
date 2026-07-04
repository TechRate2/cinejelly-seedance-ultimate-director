# Hướng dẫn triển khai CineJelly — cho người không rành code

Đọc từ trên xuống, làm theo từng bước là chạy được. Chỉ có 3 việc: điền file cấu hình → bật server → mở web.

## Bước 1 — Điền file cấu hình (chỉ 1 file duy nhất)

1. Chép file `.env.production.template` thành file mới tên `.env` (cùng thư mục).
2. Mở `.env`, điền các dòng có chữ **[BAT BUOC]**:
   - `ATLASCLOUD_API_KEY=` → key Atlas Cloud thật của bạn (thứ tốn tiền để tạo video).
   - `CINEJELLY_API_AUTH_TOKEN=` → khóa quản trị, tự đặt một chuỗi dài ≥ 24 ký tự bất kỳ (ví dụ gõ lung tung 30 ký tự). **Đây là chìa khóa admin — không đưa cho ai.**
   - `CINEJELLY_TOPUP_BANK_INFO=` → số tài khoản ngân hàng của bạn để khách chuyển tiền nạp credits.
3. Tất cả dòng khác đã có giá trị tốt sẵn — không cần đụng. Muốn đổi giá gói/giá credits thì sửa ở mục [KINH DOANH] (có chú thích tiếng Việt từng dòng).

## Bước 2 — Bật server

**Cách A — chạy ngay trên máy (thử nghiệm):**
```
npm install
npm run build
npm start
```
Thấy "CineJelly API listening on port 8787" là xong.

**Cách B — Docker (khuyên dùng khi bán thật, tự chạy lại khi lỗi):**
```
docker compose up -d
```
(Cần điền thêm `CINEJELLY_PUBLIC_HOST=tenmiencuaban.com` trong `.env` — Caddy tự lo HTTPS/ổ khóa xanh.)

## Bước 3 — Dùng hằng ngày

| Ai | Vào đâu | Làm gì |
|---|---|---|
| Khách hàng | `https://tenmien.com/` (tự chuyển vào Studio) | Đăng ký → Nạp credits → tải ảnh KOL/sản phẩm → tạo video |
| Bạn (admin) | `https://tenmien.com/operator/admin` | Dán khóa quản trị 1 lần → thấy ai vừa chuyển khoản → bấm **Duyệt** |

Khách nạp tiền: chọn gói → chuyển khoản theo hướng dẫn trên màn hình → bấm "Tôi đã chuyển khoản" → bạn mở trang quản trị, đối chiếu app ngân hàng, bấm Duyệt → credits cộng ngay. Mặc định video lỗi KHÔNG tự hoàn (có lợi cho bạn) — vào hàng chờ hoàn tiền để bạn duyệt từng ca; đổi sang tự động trong tab Cấu hình nếu muốn.

**Ngôn ngữ giao diện:** khách tự chọn VI / EN / 中文 bằng ô chọn trên thanh đầu trang (máy nhớ lựa chọn). Mỗi nhóm tuỳ chọn đều có mục "💡 Hướng dẫn nhanh" bấm ra đọc được, thu gọn lại được.

**Dịch phụ đề / thuyết minh video có sẵn (nút 🌐 Sub/Dub):** khách tải video lên (VD video tiếng Trung) hoặc bấm 🌐 trên video đã render → chọn ngôn ngữ thuyết minh + các phụ đề muốn xuất (VI/EN/中文/日本/한국) → hệ thống nghe, dịch, viết lời thuyết minh khớp thời gian và trả file phụ đề `.srt` từng ngôn ngữ + kịch bản đọc. Cần bật model nhận dạng giọng nói trước: Trung tâm quản trị → Cài đặt → Model → điền model speech (VD `openai/whisper-large-v3` — kiểm tra ID trong catalog Atlas). Chưa bật thì nút này báo lỗi rõ ràng và không trừ tiền ai. Phí mỗi lần dịch = giá 5 giây video; lỗi giữa chừng vào hàng chờ hoàn tiền cho bạn duyệt.

## Chọn nơi lưu dữ liệu (1 dòng trong .env)

- Mới mở bán: để nguyên (`json`) — không phải cài gì.
- Có khách đều đặn: `CINEJELLY_DATABASE_KIND=sqlite` — CSDL SQL thật, bền hơn (Docker đã hỗ trợ sẵn).
- Bền hơn / có sẵn công cụ sao lưu quản lý: `CINEJELLY_DATABASE_KIND=postgres` + `CINEJELLY_POSTGRES_URL=` (chạy `npm install pg` một lần).

**Lưu ý scale quan trọng:** hệ thống chạy **một tiến trình máy chủ** (mọi dữ liệu nạp vào RAM). **KHÔNG chạy 2 server cùng lúc trên chung một kho dữ liệu** — sẽ ghi đè nhau và mất tiền/tài khoản. Muốn phục vụ nhiều khách hơn thì **nâng cấu hình máy (scale dọc)**, không phải thêm máy:
- Tăng số video chạy song song: `CINEJELLY_API_JOB_CONCURRENCY=4` (mặc định 1). Atlas chạy bất đồng bộ nên nâng 3-8 là chạy được nhiều video cùng lúc.
- Khi có khách đều: chuyển `CINEJELLY_DATABASE_KIND=sqlite` (bền hơn file JSON).
- Nới giới hạn chống-spam khi lượng khách thật tăng: `CINEJELLY_API_RATE_LIMIT_MAX_REQUESTS`.
- **Dọn ổ đĩa:** video/ảnh khách tải lên không tự xoá — đặt lịch xoá file cũ trong thư mục output định kỳ để ổ không đầy.

## Sao lưu tiền + tài khoản (quan trọng!)

Chạy mỗi ngày (hoặc đặt lịch tự động):
```
npm run backup:data
```
Bản sao nằm trong thư mục `backups/` kèm file hướng dẫn phục hồi tiếng Việt. Với Docker, dữ liệu nằm trong volume `cinejelly-output` — không mất khi khởi động lại container.

## Khi có sự cố

- Server sập/khởi động lại: job đang chạy dở của khách được **tự động hoàn credits** khi server bật lại (đối soát tự động).
- Quên khóa quản trị: mở file `.env` trên máy chủ, dòng `CINEJELLY_API_AUTH_TOKEN`.
- Muốn tặng/trừ credits thủ công: trang `/operator/topups`, mục "Cộng/trừ credits thủ công".
- Kiểm tra sức khỏe hệ thống: mở `https://tenmien.com/health` → thấy `{"status":"ok"}` là server sống.
