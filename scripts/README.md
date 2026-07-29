# `scripts/` — lưới an toàn và bộ đồ nghề vận hành

> Bản đồ tổng: [`../BAN-DO-DU-AN.md`](../BAN-DO-DU-AN.md)

## Chỉ cần nhớ một lệnh

```
npm test
```

Chạy **toàn bộ** bài kiểm tra + bài soi dự án. Không tốn tiền, không gọi mạng, trả lời tiếng Việt.

## Ba loại file trong thư mục này

### 1. `run-*-smoke.mjs` — bài kiểm tra (93 file)

Chạy code đã dịch trong `dist/` với **nhà cung cấp giả**, chứng minh hành vi còn đúng mà
không tiêu đồng nào. Đây là **lưới an toàn duy nhất** của một chủ dự án không đọc được code.

`npm test` **tự tìm** mọi file khớp mẫu này. Viết bài mới là nó tự chạy — không phải đăng ký ở đâu.
(Bộ chạy cũ liệt kê tay và chỉ gọi 19/93, nên báo "đạt" trong khi 3/4 lưới không hề chạy.)

**Bài kiểm tra tốt chạy code thật.** Bài chỉ mở file `.ts` ra tìm chuỗi ký tự là **"sơn xanh"** —
xanh mà không bảo vệ gì. Xoá hẳn một tính năng mà bộ test vẫn xanh thì bộ test đó vô dụng.
Hiện `run-input-matrix-smoke.mjs` còn 66/265 bài thuộc loại này (đã ghi trong mục 8 của bản đồ).

### 2. `audit-*.mjs` / `validate-*.mjs` — soi toàn dự án

Soi những thứ một bài kiểm tra lẻ không thấy: file không ai import, biến môi trường lọt tầng lõi,
repo tham khảo thiếu giấy phép, báo cáo lệch định dạng đã cam kết.

Sáu bài chạy trong `npm test`. Chúng từng hỏng âm thầm rất lâu vì **không lệnh nào gọi**.

### 3. Công cụ vận hành

| Lệnh | Việc |
|---|---|
| `npm run setup` | Cài đặt lần đầu, hỏi từng bước |
| `npm run doctor` | Kiểm tra máy đã sẵn sàng chưa |
| `npm run update` | Cập nhật ứng dụng |
| `npm run backup:data` | Sao lưu dữ liệu |

## ⚠️ Lệnh tiêu tiền thật

**Chỉ một:** `npm run validation:paid-render` — xem
[`../config/acceptance/HUONG-DAN-NGHIEM-THU.vi.md`](../config/acceptance/HUONG-DAN-NGHIEM-THU.vi.md).

Vài script khác có `--env-file-if-exists=.env` để **đọc** cấu hình, nhưng không gọi model tính tiền.

## Hai loại đỏ

`npm test` tách riêng chúng, và bạn cũng nên:

- **Lỗi thật** — vừa hỏng do một thay đổi. Phải sửa.
- **Đỏ có chủ ý** — chờ bằng chứng từ một lần render trả tiền thật. Không phải lỗi.
  Danh sách nằm trong `EXPECTED_RED` / `AUDIT_KNOWN_DRIFT` ở đầu `run-all-checks.mjs`,
  kèm lý do. Bài nào hết đỏ thì `npm test` tự nhắc gỡ khỏi danh sách.

Trộn hai loại lại là cách nhanh nhất khiến người ta quen với màu đỏ rồi bỏ qua nó.

## Viết bài kiểm tra mới

1. Đặt tên `run-<chủ-đề>-smoke.mjs` — `npm test` tự nhặt.
2. In JSON ra màn hình với `{ status, checkCount, failedCount, checks: [{name, pass, detail}] }`.
3. Thoát khác 0 khi hỏng.
4. **Chạy code thật trong `dist/`**, đừng tìm chuỗi trong `src/`.
5. Đăng ký thêm một lệnh `validation:<chủ-đề>` trong `package.json` —
   `audit-backend-system-readiness.mjs` yêu cầu mọi lệnh đều được khai báo.
