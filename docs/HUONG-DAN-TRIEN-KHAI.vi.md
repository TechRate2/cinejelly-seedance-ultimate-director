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
| Bạn (admin) | `https://tenmien.com/operator/topups` | Dán khóa quản trị 1 lần → thấy ai vừa chuyển khoản → bấm **Duyệt** |

Khách nạp tiền: chọn gói → chuyển khoản theo hướng dẫn trên màn hình → bấm "Tôi đã chuyển khoản" → bạn mở trang Duyệt nạp, đối chiếu app ngân hàng, bấm Duyệt → credits cộng ngay. Video lỗi hệ thống tự hoàn credits.

## Chọn nơi lưu dữ liệu (1 dòng trong .env)

- Mới mở bán: để nguyên (`json`) — không phải cài gì.
- Có khách đều đặn: `CINEJELLY_DATABASE_KIND=sqlite` — CSDL SQL thật, bền hơn (Docker đã hỗ trợ sẵn).
- Scale nhiều máy chủ: `CINEJELLY_DATABASE_KIND=postgres` + điền `CINEJELLY_POSTGRES_URL=` (cần chạy `npm install pg` một lần).

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
