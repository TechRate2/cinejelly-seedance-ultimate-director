# Mẻ nghiệm thu đầu tiên (2 video, trần chi phí khóa trong từng file)

Điều kiện: `.env` đã có ATLASCLOUD_API_KEY THẬT (không phải placeholder).

Bước 1 — kiểm tra KHÔNG tốn tiền (đã chạy PASS sẵn cho cả 2 file):
    npm run validation:render-request -- --request config/acceptance/acceptance-ugc-27s.json
    npm run validation:render-request -- --request config/acceptance/acceptance-drama-ep1-60s.json

Bước 2 — chạy TRẢ PHÍ có cổng (readiness + budget gate của hệ thống tự chặn nếu thiếu điều kiện):
    npm run validation:paid-render -- --request config/acceptance/acceptance-ugc-27s.json
    npm run validation:paid-render -- --request config/acceptance/acceptance-drama-ep1-60s.json

Trần chi phí: UGC ≤ $5, Drama ≤ $8 (maxCostUsd trong từng file — cost gate chặn vượt).
Video ra tại assets/output_deliverables/acceptance/**/final.mp4.
Nếu chạy qua UI/API: panel Jobs có nút Xem / Tải ngay khi job succeeded.
