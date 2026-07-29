# Chạy nghiệm thu bằng tiền thật

⚠️ **Đây là cách DUY NHẤT trong dự án tiêu tiền thật.** Mọi lệnh khác đều miễn phí.

Điều kiện: `.env` đã có `ATLASCLOUD_API_KEY` **thật** (không phải chuỗi mẫu),
và tài khoản Atlas Cloud còn số dư.

## Các file cấu hình có sẵn

| File | Loại video | Trần chi phí | Đã duyệt storyboard |
|---|---|---|---|
| `acceptance-idol-18s.json` | KOL tự quay 18 giây | $7 | ✅ có |
| `acceptance-cinema-18s.json` | Điện ảnh 18 giây | $7 | ✅ có |
| `acceptance-ugc-27s.json` | UGC 27 giây | $5 | ❌ **chưa** — xem Bước 2 |
| `acceptance-drama-ep1-60s.json` | Drama tập 1, 60 giây | $8 | ❌ **chưa** — xem Bước 2 |

`maxCostUsd` trong mỗi file là **mức tối đa cho phép**, không phải mức sẽ tiêu.
Cổng chi phí chặn trước nếu ước tính vượt trần.

## Bước 1 — kiểm tra miễn phí (luôn chạy trước)

```
npm run validation:render-request -- --request config/acceptance/acceptance-ugc-27s.json
```

Không gọi nhà cung cấp, không tốn tiền. Chỉ kiểm tra yêu cầu hợp lệ và đường ghi file an toàn.

## Bước 2 — duyệt storyboard (BẮT BUỘC, thiếu là không chạy được)

Hệ thống **chặn mọi lần render chưa được duyệt storyboard**. Mặc định là `pending`, và bị chặn
**trước khi tiêu đồng nào**.

Đây chính là lý do hai lệnh trả phí ở bản hướng dẫn cũ **không bao giờ tiêu được tiền** —
bản hướng dẫn đó nói sai. `acceptance-ugc-27s.json` và `acceptance-drama-ep1-60s.json`
chưa có dấu duyệt nên sẽ dừng ngay ở cổng này.

Muốn chạy thật, thêm vào `metadata` của file cấu hình:

```json
"metadata": {
  "storyboardApproval": "operator_approved",
  "storyboardReviewer": "<tên người duyệt>",
  "storyboardReviewedAt": "2026-07-29T10:00:00.000Z",
  "storyboardApprovalNotes": "<lý do duyệt>"
}
```

Xem `acceptance-idol-18s.json` làm mẫu — nó đã có sẵn.

Bước duyệt này **cố ý bắt buộc**: đây là lần cuối cùng một con người xác nhận trước khi máy tiêu tiền.

## Bước 3 — chạy trả phí

```
npm run validation:paid-render -- --request config/acceptance/acceptance-idol-18s.json
```

Trước khi tiêu, hệ thống tự chặn nếu: thiếu điều kiện môi trường, vượt trần chi phí,
storyboard chưa duyệt, hoặc kịch bản quá ngắn so với thời lượng đã đặt.

## Kết quả

- Video: `assets/output_deliverables/acceptance/**/final.mp4`
- Chi phí thật từng bước: `.../artifacts/**/cost-ledger.json`
- Nếu hỏng: `.../artifacts/**/failure-report.json` ghi rõ dừng ở bước nào và vì sao

Chạy qua giao diện web thì mục **📁 Video của tôi** có nút Xem / Tải ngay khi job xong.

## Sau khi chạy

Hai bài kiểm tra đang **đỏ có chủ ý** (`npm test` liệt kê riêng) đang chờ bằng chứng từ đúng
lần render thật này. Chạy xong và lưu bằng chứng thì chúng tự chuyển xanh.
