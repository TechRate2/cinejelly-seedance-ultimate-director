# Hướng dẫn triển khai CineJelly — cho người không rành code

Đọc từ trên xuống, làm theo từng bước là chạy được. Chỉ có 3 việc: điền file cấu hình → bật server → mở web.

## Bước 0 — Cài máy chủ lần đầu (VPS Ubuntu trắng)

Nếu máy chủ chưa có gì, chạy các lệnh này TRƯỚC (chỉ làm 1 lần):
```
sudo apt update && sudo apt install -y git ffmpeg
# Cài Node 22 LTS (bắt buộc: chạy server cần Node ≥ 20.19; nếu dùng lưu dữ liệu "sqlite" cần Node ≥ 22.5):
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs
# Nếu định dùng Docker (khuyên dùng khi bán thật):
sudo apt install -y docker.io docker-compose-plugin
# Tải mã nguồn về:
git clone https://github.com/TechRate2/cinejelly-seedance-ultimate-director.git
cd cinejelly-seedance-ultimate-director
```
> Dùng Docker (Cách B ở Bước 2) thì KHÔNG cần cài Node/ffmpeg riêng — bản Docker đã có sẵn tất cả bên trong. Cài Node/ffmpeg ở trên chỉ cần cho Cách A (chạy trực tiếp) và cho các lệnh `npm run setup/doctor/update`.

## Bước 1 — Điền file cấu hình

**Cách dễ nhất — hỏi-đáp, KHÔNG cần sửa file (khuyên dùng cho người không rành code):**
```
npm install
npm run setup
```
Nó hỏi bạn vài câu bằng tiếng Việt (key Atlas, thông tin chuyển khoản, tên miền, loại cơ sở dữ liệu), **tự tạo khóa quản trị mạnh**, rồi ghi file `.env` giúp bạn. Nếu đã có `.env`, nó hỏi trước khi ghi đè (Enter = giữ nguyên). Xong thì làm tiếp Bước 2.

**Cách thủ công (nếu muốn tự sửa file):**

1. Chép file `.env.production.template` thành file mới tên `.env` (cùng thư mục).
2. Mở `.env`, điền các dòng có nhãn **[BẮT BUỘC]** (tìm chữ "BAT" trong file):
   - `ATLASCLOUD_API_KEY=` → key Atlas Cloud thật của bạn (thứ tốn tiền để tạo video).
   - `CINEJELLY_API_AUTH_TOKEN=` → khóa quản trị, tự đặt một chuỗi dài ≥ 24 ký tự bất kỳ (ví dụ gõ lung tung 30 ký tự). **Đây là chìa khóa admin — không đưa cho ai.**
   - `CINEJELLY_TOPUP_BANK_INFO=` → số tài khoản ngân hàng của bạn để khách chuyển tiền nạp credits.
3. Tất cả dòng khác đã có giá trị tốt sẵn — không cần đụng. Muốn đổi giá gói/giá credits thì sửa ở mục [KINH DOANH] (có chú thích tiếng Việt từng dòng).

## Bước 2 — Bật server

**Cách A — chạy ngay trên máy (thử nghiệm):**
```
npm install
npm run build
npm run doctor    # kiểm key/model Atlas + cơ sở dữ liệu + ffmpeg + số tài khoản — ô đỏ thì sửa
npm start
```
Thấy "CineJelly API listening on port 8787" là xong. Mở trình duyệt vào **`http://<địa-chỉ-IP-máy-chủ>:8787`** (VD `http://123.45.67.89:8787`). Nếu không mở được, mở cổng 8787 trên tường lửa VPS: `sudo ufw allow 8787`. (Chưa có tên miền/HTTPS ở cách này — chỉ hợp thử nghiệm.)

**Cách B — Docker (khuyên dùng khi bán thật, tự chạy lại khi lỗi, có tên miền + HTTPS):**
```
docker compose up -d --build
```
(Cần điền thêm `CINEJELLY_PUBLIC_HOST=tenmiencuaban.com` trong `.env` — Caddy tự lo HTTPS/ổ khóa xanh. Trỏ tên miền về IP máy chủ trước, và mở cổng 80+443: `sudo ufw allow 80,443/tcp`.)

> **Dùng Neon/Postgres (SQL ngoài) + Docker:** thư viện `pg` không cài sẵn. Trước khi `docker compose up`, chạy `npm install pg` một lần (bản Docker sẽ build lại và có `pg`). Nếu sau này `npm run update` báo lỗi git vì `package.json` bị đổi, chạy `git stash` rồi update rồi `git stash pop`. Không dùng SQL ngoài thì bỏ qua đoạn này (mặc định lưu bằng file json, chạy ngay).

## Bước 3 — Dùng hằng ngày

| Ai | Vào đâu | Làm gì |
|---|---|---|
| Khách hàng | `https://tenmien.com/` (tự chuyển vào Studio) | Đăng ký → Nạp credits → tải ảnh KOL/sản phẩm → tạo video |
| Bạn (admin) | `https://tenmien.com/operator/admin` | Dán khóa quản trị 1 lần → thấy ai vừa chuyển khoản → bấm **Duyệt** |

Khách nạp tiền: chọn gói → chuyển khoản theo hướng dẫn trên màn hình → bấm "Tôi đã chuyển khoản" → bạn mở trang quản trị, đối chiếu app ngân hàng, bấm Duyệt → credits cộng ngay. Mặc định video lỗi KHÔNG tự hoàn (có lợi cho bạn) — vào hàng chờ hoàn tiền để bạn duyệt từng ca; đổi sang tự động trong tab Cấu hình nếu muốn.

**Ngôn ngữ giao diện:** khách tự chọn VI / EN / 中文 bằng ô chọn trên thanh đầu trang (máy nhớ lựa chọn). Mỗi nhóm tuỳ chọn đều có mục "💡 Hướng dẫn nhanh" bấm ra đọc được, thu gọn lại được.

**Dịch phụ đề / thuyết minh video có sẵn (nút 🌐 Sub/Dub):** khách tải video lên (VD video tiếng Trung) hoặc bấm 🌐 trên video đã render → chọn ngôn ngữ thuyết minh + các phụ đề muốn xuất (VI/EN/中文/日本/한국) → hệ thống nghe, dịch, viết lời thuyết minh khớp thời gian và trả file phụ đề `.srt` từng ngôn ngữ + kịch bản đọc. **Model nhận giọng đã BẬT SẴN trong bản mẫu** (`openai/whisper-large-v3`) nên nút này chạy được ngay — chỉ cần đổi khi Atlas ra model mới (Trung tâm quản trị → Cài đặt → Model). Nếu vì lý do gì model bị bỏ trống, nút này báo lỗi rõ ràng và không trừ tiền ai. Phí mỗi lần dịch = giá 5 giây video; lỗi giữa chừng vào hàng chờ hoàn tiền cho bạn duyệt. Nếu đoạn thuyết minh dài hơn khung thời gian, hệ thống tự tăng tốc nhẹ cho vừa và báo "đoạn X nên rút gọn".

**Chính sách kinh doanh (bật trong `.env` hoặc tab Cấu hình):**
- **Tiền mặt luôn ở lại ngân hàng bạn** — hệ thống không bao giờ chuyển tiền mặt ngược về khách ở bất kỳ chế độ nào. "Hoàn tiền" chỉ là trả CREDITS (điểm) về ví khách.
- **Khách gửi là chạy luôn (`CINEJELLY_CUSTOMER_AUTO_RUN=true`):** khách bấm tạo → trừ credits → chạy ngay → chỉ hiện "đang hoàn thiện" → trả video (không hiện bước duyệt). Bạn vẫn xem mọi job trong `/operator/admin`. **Lưu ý:** bật cái này = khách tiêu tiền ngay khi bấm tạo, không có bước bạn chặn trước.
- **Không hoàn credits khi lỗi (`CINEJELLY_REFUND_POLICY=off`):** video lỗi thì credits không trả lại. Nên bật KÈM "treo chờ admin" (mặc định đã bật) để lỗi hạ tầng tự chạy lại tới khi ra video — nhờ vậy credits chỉ mất ở lỗi nội dung thật sự hiếm.
- **Gói & giá:** bộ gói mặc định (Dùng thử/Phổ biến/Chuyên nghiệp/Studio) tính lãi ~2.5–3x giá vốn Atlas, nạp gói to rẻ hơn mỗi credit, credits không hết hạn. **Bạn PHẢI kiểm tra giá vốn thật trên dashboard Atlas của mình rồi chỉnh lại số cho khớp thị trường** trong tab Cấu hình (giá tính theo ~45–50k đ/video 15 giây tiêu chuẩn — nếu khách chủ yếu dùng chất lượng thấp hơn thì vốn rẻ hơn, lãi cao hơn).

## Chọn nơi lưu dữ liệu (1 dòng trong .env)

- Mới mở bán: để nguyên (`json`) — không phải cài gì.
- Có khách đều đặn: `CINEJELLY_DATABASE_KIND=sqlite` — CSDL SQL thật, bền hơn (Docker đã hỗ trợ sẵn).
- Bền hơn / có sẵn công cụ sao lưu quản lý: `CINEJELLY_DATABASE_KIND=postgres` + `CINEJELLY_POSTGRES_URL=` (chạy `npm install pg` một lần).
- **Dùng Neon (Postgres đám mây, miễn phí để bắt đầu — khuyên dùng vì Neon tự lo sao lưu/độ bền):** tạo DB trên neon.tech → copy chuỗi kết nối (chọn "Pooled connection") → đặt `CINEJELLY_DATABASE_KIND=postgres` và `CINEJELLY_POSTGRES_URL=postgresql://...-pooler...neon.tech/db?sslmode=require` → `npm install pg`. Lưu ý: vẫn chạy **một tiến trình máy chủ** (Neon cho độ bền + sao lưu, chưa phải để chạy nhiều máy chủ cùng lúc); Neon có thể "ngủ" khi rảnh nên request đầu tiên hơi chậm.

**Lưu ý scale quan trọng:** hệ thống chạy **một tiến trình máy chủ** (mọi dữ liệu nạp vào RAM). **KHÔNG chạy 2 server cùng lúc trên chung một kho dữ liệu** — sẽ ghi đè nhau và mất tiền/tài khoản. Muốn phục vụ nhiều khách hơn thì **nâng cấu hình máy (scale dọc)**, không phải thêm máy:
- Tăng số video chạy song song: `CINEJELLY_API_JOB_CONCURRENCY=4` (mặc định 1). Atlas chạy bất đồng bộ nên nâng 3-8 là chạy được nhiều video cùng lúc.
- Khi có khách đều: chuyển `CINEJELLY_DATABASE_KIND=sqlite` (bền hơn file JSON).
- Nới giới hạn chống-spam khi lượng khách thật tăng: `CINEJELLY_API_RATE_LIMIT_MAX_REQUESTS`.
- **Dọn ổ đĩa (tự động):** đặt `CINEJELLY_OUTPUT_RETENTION_DAYS=30` (hoặc số ngày bạn muốn) để hệ thống TỰ xoá video render cũ hơn ngần đó ngày, ổ không bao giờ đầy. An toàn tuyệt đối: chỉ xoá kết quả render cũ (thư mục `work/`, `redub/`), KHÔNG bao giờ đụng file tài khoản/tiền, ảnh khách tải lên, backup, hay video phim-dài-tập. Mặc định TẮT (vì xoá video khách cũ là lựa chọn của bạn). Ảnh khách tải lên (`uploads/`) vẫn cần dọn tay nếu muốn.

## Sao lưu tiền + tài khoản (quan trọng!)

Chạy mỗi ngày (hoặc đặt lịch tự động):
```
npm run backup:data
```
Bản sao nằm trong thư mục `backups/` kèm file hướng dẫn phục hồi tiếng Việt.

**⚠ Nếu bạn chạy bằng Docker (Cách B):** dữ liệu tiền/tài khoản nằm TRONG volume `cinejelly-output`, nên lệnh `npm run backup:data` chạy trên máy chủ (ngoài container) sẽ **không thấy dữ liệu**. Dùng lệnh này để sao lưu volume ra file:
```
docker run --rm -v cinejelly-output:/data -v "$PWD/backups":/backup alpine tar czf /backup/cinejelly-backup-$(date +%F).tar.gz -C /data .
```
Dữ liệu Docker không mất khi khởi động lại container; lệnh trên là để có bản sao mang đi nơi khác.

**Đặt lịch tự động mỗi đêm + chép sang nơi khác (BẮT BUỘC trước khi kinh doanh):** trên VPS Linux, chạy `crontab -e` rồi thêm 2 dòng (đổi đường dẫn cho đúng máy bạn):
```
30 2 * * * cd /duong-dan/du-an && docker run --rm -v cinejelly-output:/data -v "$PWD/backups":/backup alpine tar czf /backup/cinejelly-backup-$(date +\%F).tar.gz -C /data .
0 3 * * * scp /duong-dan/du-an/backups/cinejelly-backup-$(date +\%F).tar.gz ban@may-khac:/backup/  # hoặc rclone copy ... lên Google Drive
```
Backup để chung một máy với dữ liệu gốc = hỏng máy là mất cả hai. Thư mục `backups/` cũng cần thỉnh thoảng xoá bản quá cũ cho đỡ đầy ổ.

## 3 mặc định trong file mẫu `.env` bạn PHẢI biết trước ngày đầu

| Biến | File mẫu đặt | Nghĩa là gì |
|---|---|---|
| `CINEJELLY_OUTPUT_RETENTION_DAYS=14` | **BẬT 14 ngày** | Video render cũ hơn 14 ngày bị TỰ XOÁ (chỉ file tạm `work/`, `redub/` — không đụng tiền/tài khoản/uploads). Muốn giữ lâu hơn thì tăng số; muốn tắt hẳn thì xoá dòng này (ổ sẽ tự đầy — phải dọn tay). |
| `CINEJELLY_CUSTOMER_AUTO_RUN=true` | **BẬT** | Khách bấm tạo là trừ credits + chạy NGAY, không có bước bạn duyệt trước. Tắt (`false`) thì mọi job chờ bạn duyệt — nhớ vào duyệt kẻo khách đợi. |
| `CINEJELLY_PIPELINE_PRICING=true` | **BẬT** | Giá tính theo công thức chi phí (video+ảnh+giọng nói) nhân hệ số lãi — chỉnh hệ số trong `/operator/admin`. |

**`CINEJELLY_SUPPORT_CONTACT` (đừng để trống):** điền Zalo/số điện thoại/email hỗ trợ của bạn vào biến này trong `.env`. Nó hiện ngay trên màn hình đăng nhập — là đường duy nhất để khách quên mật khẩu liên hệ bạn cấp lại. Để trống thì khách chỉ thấy chữ chung chung "người bán (chủ hệ thống)" và không biết tìm bạn ở đâu.

**Theo dõi từ điện thoại (miễn phí):** tạo tài khoản UptimeRobot, thêm monitor loại HTTP(s) trỏ vào `https://ten-mien-cua-ban/health`, chọn "Keyword" và điền từ khóa `"status":"ok"`, kiểm tra mỗi 5 phút. Khi server sập, đầy ổ, thiếu API key, hay có hàng chờ hoàn tiền — chữ `ok` biến mất và UptimeRobot báo về điện thoại bạn. Trang `/health` giờ hiển thị: ổ đĩa còn bao nhiêu GB, đã cấu hình key chưa, bộ dọn ổ bật/tắt, số đơn nạp tiền + hoàn tiền đang chờ, số video lỗi 24h qua.

## Cập nhật lên bản mới (1 lệnh, an toàn)

```
npm run update
```
Tự động: **sao lưu trước** → tải bản mới (git pull) → build → chạy doctor kiểm tra. Nếu có bước lỗi thì DỪNG ngay (dữ liệu đã sao lưu, bản đang chạy vẫn nguyên cho tới khi bạn khởi động lại). Xong thì khởi động lại: `npm start` hoặc `docker compose up -d --build`.

## Khi có sự cố

- Server sập/khởi động lại: job đang chạy dở của khách được đối soát lại khi bật lên. Với chính sách mặc định "manual" (có lợi cho bạn), các job đó **vào hàng chờ hoàn tiền** ở `/operator/admin` để bạn duyệt (không tự hoàn). Đặt `CINEJELLY_REFUND_POLICY=auto` thì mới tự hoàn ngay. **Mẹo:** tránh khởi động lại/deploy khi đang có video của khách chạy dở hoặc chờ duyệt; sau mỗi lần khởi động lại, ghé mục hoàn tiền để duyệt các ca vừa vào hàng chờ.
- Sau khi deploy hoặc đổi `.env`: chạy `npm run doctor` để kiểm **trước khi** mời khách. Nó kiểm: có đủ key/model chưa, **cấu hình cơ sở dữ liệu** (json/sqlite/postgres — báo rõ nếu sai, VD sqlite cần Node ≥ 22.5, postgres thiếu URL/gói pg), **dung lượng ổ đĩa còn trống**, và ffmpeg. LƯU Ý: doctor kiểm *có điền và đúng định dạng*; còn key Atlas có **thật sự hợp lệ** hay model có tồn tại trên tài khoản Atlas thì chỉ chắc chắn khi chạy render thật (bước nghiệm thu). Server vẫn "sống" kể cả khi thiếu key.
- **🩺 Tab "Sức khỏe" trong trang quản trị (dễ nhất — không cần dòng lệnh):** vào `tenmien.com/operator/admin` → tab **🩺 Sức khỏe** → bấm **Kiểm tra ngay**. Hiện xanh/vàng/đỏ cho: key + model Atlas còn dùng được không (gọi thử KHÔNG tốn tiền), cơ sở dữ liệu, ổ đĩa còn trống, ffmpeg. Ô ĐỎ nào cũng kèm dòng "cách sửa" tiếng Việt. Đây là cách kiểm tra qua web, không cần gõ lệnh.
- **Kiểm tra "sống" nhanh:** mở `https://tenmien.com/health`. Thấy `{"status":"ok"}` = ổn. Thấy `{"status":"degraded","database":"unreachable",...}` = **mất kết nối cơ sở dữ liệu** (Neon đang ngủ / sai `CINEJELLY_POSTGRES_URL`) — sửa rồi khởi động lại. (Khi DB mất kết nối, khách sẽ không đăng ký/nạp/đăng nhập được và báo lỗi nêu rõ nguyên nhân, không phải "thử lại sau" mơ hồ.)
- Đặt sau proxy riêng (nginx…) thay vì Caddy đi kèm: BẮT BUỘC bật `CINEJELLY_TRUST_PROXY_HEADERS=true`, nếu không mọi khách bị gộp chung một hạn mức chống-spam (cả web chỉ còn ~6 lệnh tạo video/phút). Bản Docker đi kèm đã bật sẵn.
- Quên khóa quản trị: mở file `.env` trên máy chủ, dòng `CINEJELLY_API_AUTH_TOKEN`.
- Muốn tặng/trừ credits thủ công: trang `/operator/admin`, mục "Cộng/trừ credits thủ công".
- Kiểm tra sức khỏe hệ thống: mở `https://tenmien.com/health` → thấy `{"status":"ok"}` là server sống.
