# `src/api/` — thế giới bên ngoài

> Bản đồ tổng: [`../../BAN-DO-DU-AN.md`](../../BAN-DO-DU-AN.md)

Một máy chủ HTTP Node thuần (không dùng framework), 3 trang web tự viết, ~70 đường API.
**Mọi thứ khách hàng và chủ hệ thống chạm vào đều đi qua đây** — kể cả đăng nhập, ví credits,
nạp tiền và hoàn tiền.

## Ba trang web

| Đường | File | Cho ai |
|---|---|---|
| `/short/create` | `short-pipeline-create-page.ts` | **Khách hàng.** Toàn bộ sản phẩm nằm ở đây |
| `/operator/admin`, `/operator/launch` | `operator-*-page.ts` | Chủ hệ thống |
| `/terms`, `/dieu-khoan` | `terms-page.ts` | Công khai, không cần đăng nhập |

## Menu khách hàng (trang `/short/create`)

Bốn mục, **tất cả đều chạy thật**:

| Nút | Mở ra | Gọi API |
|---|---|---|
| 🎬 Tạo video AI | Ô nhập chính, thời lượng **15–480 giây** | `/v1/short-pipeline/*`, `/v1/render` |
| 📺 Phim dài tập | Bảng series, 1–200 tập | `/v1/series` |
| 🌐 Lồng tiếng & Phụ đề | Hộp chọn ngôn ngữ | `/v1/redub/plans` |
| 📁 Video của tôi | Danh sách job, nút Xem/Tải | `/v1/render-jobs` |

Không có chức năng nào bị ẩn sau cờ bí mật. "Video dài" không phải mục riêng — nó là
ô thời lượng ở mục đầu tiên.

## Quy tắc bắt buộc

### Mọi phản hồi đi qua hàm gửi chuẩn

`sendJson` / `sendHtml` / `sendVideoStream` — **không tự gọi `response.writeHead`**.

Đây không phải quy ước hình thức. Các hàm đó gắn `BASE_SECURITY_HEADERS`. Một đường tải phụ đề
từng tự viết header và **gửi đi không có tiêu đề bảo mật nào** — nguy hiểm hơn với file văn bản
vì trình duyệt có thể bị dụ coi nó là mã. `npm test` đếm số lần `writeHead` và báo lỗi nếu ≠ 3.

### Chính sách bảo mật trang (CSP)

Đang là "chặn tất cả" + mở đúng những gì cần. Đã từng **quên mở cho video** → nút "Xem" của
khách mở ra trình phát không bao giờ chạy, trình duyệt chặn im lặng. Nay đã có bài kiểm tra khoá.

Muốn thêm loại tài nguyên nào thì **mở hẹp nhất có thể** và ghi rõ lý do.

### Không lộ tên nội bộ ra trang khách

Trang khách bị soi để không chứa tên các repo tham khảo. Từng lộ tên một đối thủ trong 2 bình luận
CSS/JS **được gửi tới trình duyệt**. `npm test` chặn việc này.

## Tiền

Credits **bị trừ trước** khi job chạy. Khi job hỏng, `onJobFinalized` trong `server.ts`
xử lý theo chính sách hoàn: `auto` (tự hoàn) / `manual` (vào hàng chờ admin, **mặc định**) / `off`.

**Không bao giờ viết thông báo hứa "không bị trừ tiền"** trừ khi đã kiểm tra đúng vị trí đó nằm
trước bước trừ. Hứa sai về tiền còn tệ hơn chính lỗi đó.

## `server.ts` dài ~4400 dòng

Đọc bằng cách tìm đường dẫn, không đọc tuần tự:

```
grep -n 'pathname === "/v1/<tên>"' src/api/server.ts
```

Trên mỗi khối route thường có ghi chú giải thích vì sao nó tồn tại và điều gì từng hỏng ở đó.
