# `tests/` — lưới an toàn

> Bản đồ tổng: [`../BAN-DO-DU-AN.md`](../BAN-DO-DU-AN.md)

## Chạy tất cả

```
npm test
```

Không tốn tiền, không gọi mạng, trả lời bằng tiếng Việt. Chạy sau **mỗi** lần sửa code.

## Đây là gì

93 file chạy code đã dịch trong `dist/` với **nhà cung cấp giả**, chứng minh hành vi còn đúng
mà không tiêu đồng nào.

Với một chủ dự án không đọc được code và phụ thuộc vào AI để sửa, đây là **cách duy nhất**
biết một thay đổi có làm hỏng gì không. Riêng trong ngày 28–29/07/2026, bộ này bắt được
**13 lỗi thật**, trong đó có hai lỗi phá sản phẩm: khách không xem được video đã trả tiền,
và hệ thống buộc tội sai khách hàng vì một cái tên màu.

## Vì sao tách khỏi `scripts/`

`scripts/` từng chứa 153 file trộn lẫn: bài kiểm tra và công cụ vận hành. Không ai nhìn vào
biết cái nào là cái nào. Giờ:

- **`tests/`** — chứng minh code đúng. Chạy tự động, không bao giờ tiêu tiền.
- **`scripts/`** — công cụ chủ hệ thống chạy tay (cài đặt, chẩn đoán, sao lưu, soi toàn dự án),
  và **một** lệnh tiêu tiền thật.

## `npm test` tự tìm bài kiểm tra

Đặt tên `run-<chủ-đề>-smoke.mjs` vào thư mục này là xong — không phải đăng ký ở đâu cả.
Đây là điểm quan trọng: bộ chạy cũ liệt kê tay và chỉ gọi **19/93**, nên nó báo "đạt"
trong khi ba phần tư lưới an toàn **chưa từng chạy**.

## Bài kiểm tra tốt và bài "sơn xanh"

**Tốt:** nạp code thật từ `dist/`, gọi hàm, so kết quả.

**Sơn xanh:** mở file `.ts` ra và tìm chuỗi ký tự trong đó. Nó xanh kể cả khi tính năng
đã bị xoá sạch — tức là không bảo vệ gì. Đã có trường hợp thật: xoá hẳn đường ghim mặt
nhân vật mà bộ test vẫn báo 36/36 đạt.

Hiện `run-input-matrix-smoke.mjs` còn **66/265** bài thuộc loại này (ghi trong mục 8 của bản đồ).

## Cách viết một bài mới

1. Tên `run-<chủ-đề>-smoke.mjs`, đặt trong thư mục này.
2. Nạp code từ `../dist/`, **đừng** đọc `../src/` dưới dạng văn bản.
3. In JSON: `{ status, checkCount, failedCount, checks: [{ name, pass, detail }] }`.
4. Thoát khác 0 khi có bài hỏng.
5. Thêm một lệnh `validation:<chủ-đề>` vào `package.json` —
   `scripts/audit-backend-system-readiness.mjs` bắt buộc mọi lệnh phải được khai báo.

## Hai loại đỏ

- **Lỗi thật** — vừa hỏng do một thay đổi. Phải sửa CODE, không nới lỏng bài kiểm tra.
- **Đỏ có chủ ý** — chờ bằng chứng từ một lần render trả tiền thật. Khai trong `EXPECTED_RED`
  ở đầu `../scripts/run-all-checks.mjs`, kèm lý do. Hết đỏ thì `npm test` tự nhắc gỡ khỏi danh sách.

Bài nào hỏng khi chạy song song sẽ được **chạy lại đơn lẻ** trước khi bị kết luận là lỗi —
vài bài dựng máy chủ thật nên dễ tranh chấp cổng, và báo động giả làm mất niềm tin vào cả bộ.
