# `src/` — mã nguồn sản phẩm

> Bản đồ tổng: [`../BAN-DO-DU-AN.md`](../BAN-DO-DU-AN.md)
> Sau mọi thay đổi: `npm test`

## Chín thư mục, chín trách nhiệm

| Thư mục | Trách nhiệm | Được phép gọi mạng? | Được đọc biến môi trường? |
|---|---|---|---|
| `agents/` | Bộ não: điều phối một lần render, và các chuyên gia gọi model AI | ✅ qua `providers/` | ❌ |
| `core/` | Toàn bộ logic nghiệp vụ: kịch bản, cảnh, chi phí, cửa chặn, ghép nối | ❌ | ❌ |
| `api/` | Máy chủ HTTP, 3 trang web, ~70 đường API, tài khoản và tiền | ✅ | ✅ |
| `application/` | Lắp ráp hệ thống, các lệnh chạy từ dòng lệnh | ✅ | ✅ |
| `providers/` | **Nơi duy nhất** gọi ra Atlas Cloud qua internet | ✅ | ❌ (nhận qua tham số) |
| `prompt_compiler/` | Biến kế hoạch cảnh thành câu lệnh gửi model video | ❌ | ❌ |
| `types/` | Chỉ định nghĩa kiểu dữ liệu. Không chứa logic | ❌ | ❌ |
| `config/` | Giá trị mặc định đọc từ biến môi trường | ❌ | ✅ |
| `utils/` | Công cụ nhỏ dùng chung (thời gian, thử lại, che dữ liệu nhạy cảm) | ❌ | ❌ |

Cột "được phép" **không phải quy ước lịch sự** — `npm run validation:source-structure`
(chạy trong `npm test`) sẽ báo lỗi nếu vi phạm.

## Vì sao `core/` bị cấm đọc biến môi trường

Giấu một thiết lập toàn hệ thống vào một file lõi thì không ai tìm ra nó. Bộ canh dung lượng ổ đĩa
từng tự đọc `CINEJELLY_OUTPUT_DIR`; đổi thư mục lưu trữ mà quên chỗ đó thì hệ thống canh nhầm ổ,
và không có cách nào biết. Cần cấu hình thì **nhận qua tham số**, để nơi gọi (thuộc `api/` hoặc
`application/`) quyết định.

## Vì sao chỉ `providers/` được gọi mạng

Mỗi lần gọi ra ngoài là một lần **có thể mất tiền**, có thể treo, có thể lộ dữ liệu.
Gom một chỗ thì đếm được, đặt được giới hạn thời gian, ghi được sổ chi phí, và chặn được.
Rải khắp nơi thì không ai biết một lần render thật sự gọi bao nhiêu lần.

## Điểm bắt đầu đọc code

| Muốn hiểu | Mở file |
|---|---|
| Một lần render diễn ra thế nào | `agents/director-agent.ts` → hàm `run()` |
| Hệ thống được lắp ráp ra sao | `application/director-factory.ts` |
| Khách gửi yêu cầu qua đường nào | `api/server.ts` |
| Câu lệnh gửi model video trông ra sao | `prompt_compiler/prompt-compiler.ts` |
| Toàn bộ những gì được export ra ngoài | `index.ts` |

## Quy tắc bất di bất dịch

1. **Cửa chặn phải nằm TRƯỚC bước tốn tiền** mà nó bảo vệ. Một cửa chặn đặt sau vẫn "hoạt động"
   nhưng khách đã mất tiền — đúng lỗi từng làm mất $7 trong một lần chạy thật.
2. **Không tạo file test/mock/demo trong `src/`.** Bài kiểm tra sống ở `../scripts/`.
3. **Mọi phản hồi HTTP đi qua** `sendJson` / `sendHtml` / `sendVideoStream`. Tự viết header
   nghĩa là mất các tiêu đề bảo mật — đã từng xảy ra ở đường tải phụ đề.
4. **Không import gì từ `../external/upstream/`.** Đó là repo tham khảo, không phải thư viện.
5. Sản phẩm phục vụ **người Việt**: tên có dấu, chữ có thể ở dạng tổ hợp (NFD), "nude" là **tên màu**.
   Test bằng dữ liệu tiếng Việt thật.
