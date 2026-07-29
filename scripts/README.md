# `scripts/` — bộ đồ nghề vận hành

> Bản đồ tổng: [`../BAN-DO-DU-AN.md`](../BAN-DO-DU-AN.md)
> Bài kiểm tra nằm ở [`../tests/`](../tests/README.md), không nằm ở đây.

Thư mục này chứa **công cụ chủ hệ thống chạy tay** và các bài **soi toàn dự án**.
Trước đây nó trộn lẫn 153 file cả kiểm tra lẫn vận hành, không ai nhìn vào biết cái nào là cái nào.

## Chỉ cần nhớ một lệnh

```
npm test
```

Chạy toàn bộ 93 bài kiểm tra ở `tests/` **và** 6 bài soi ở đây. Không tốn tiền, trả lời tiếng Việt.

## 1. Công cụ chủ hệ thống

| Lệnh | Việc |
|---|---|
| `npm run setup` | Cài đặt lần đầu, hỏi từng bước |
| `npm run doctor` | Kiểm tra máy đã sẵn sàng chưa |
| `npm run update` | Cập nhật ứng dụng |
| `npm run backup:data` | Sao lưu dữ liệu |

## 2. Soi toàn dự án (6 bài, chạy trong `npm test`)

Soi những thứ một bài kiểm tra lẻ không thấy được:

| File | Soi cái gì |
|---|---|
| `audit-source-structure.mjs` | File rác, biến môi trường lọt tầng lõi, thiếu export |
| `audit-snapshot-parity.mjs` | Giấy phép 12 repo tham khảo, phát hiện repo lạ chưa khai báo |
| `audit-private-source-lineage-boundary.mjs` | Mã sản phẩm không được import từ repo tham khảo |
| `validate-deployment-package.mjs` | Gói triển khai đủ file để chạy trên máy chủ |
| `validate-report-contracts.mjs` | Báo cáo sinh ra đúng định dạng đã cam kết |
| `audit-backend-system-readiness.mjs` | Mọi lệnh kiểm tra đều được khai báo và phân loại |

Ba trong sáu bài này từng **hỏng âm thầm rất lâu** vì không lệnh nào gọi chúng.
Nay `npm test` gọi hết — đó là lý do chúng nằm trong danh sách `REPO_AUDITS` của
`run-all-checks.mjs`.

## 3. Bộ chạy tổng — `run-all-checks.mjs`

Trái tim của `npm test`. Ba điều đáng biết:

- **Tự tìm** mọi bài trong `tests/`. Viết bài mới là nó chạy ngay, không phải đăng ký.
- **Tách hai loại đỏ**: lỗi thật, và đỏ có chủ ý (chờ bằng chứng render trả tiền).
  Trộn chung sẽ khiến người ta quen với màu đỏ rồi bỏ qua nó.
- **Chạy lại đơn lẻ** bài nào hỏng khi chạy song song, trước khi kết luận là lỗi —
  vài bài dựng máy chủ thật nên dễ tranh chấp cổng.

## ⚠️ Lệnh tiêu tiền thật

**Chỉ một:** `npm run validation:paid-render` — xem
[`../config/acceptance/HUONG-DAN-NGHIEM-THU.vi.md`](../config/acceptance/HUONG-DAN-NGHIEM-THU.vi.md).

Vài script khác có `--env-file-if-exists=.env` để **đọc** cấu hình, nhưng không gọi model tính tiền.

## 4. Các file `create-*` / `validate-*` khác

Tạo bản nháp bằng chứng cho chủ hệ thống điền, rồi kiểm tra bằng chứng đã điền có hợp lệ không
(duyệt chất lượng, quyền sản phẩm, vận hành). Chúng đọc file JSON đã có sẵn trên đĩa,
không gọi mạng, không tiêu tiền.
