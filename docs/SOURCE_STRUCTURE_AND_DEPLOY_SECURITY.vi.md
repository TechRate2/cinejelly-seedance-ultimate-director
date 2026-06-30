# Cấu trúc source, cấu hình deploy và bảo mật vận hành

Tài liệu này là bản đồ ngắn gọn để quản lý source CineJelly khi chuẩn bị build UI MVP, tích hợp thêm model/API, hoặc deploy thương mại. Mục tiêu là giữ source sạch, dễ scale, không lẫn secret/config thật vào code, và luôn có lệnh audit tự kiểm tra trước khi push/deploy.

## Nguyên tắc chính

1. Code chạy thật nằm trong `src/`.
2. File build ra nằm trong `dist/`, không sửa tay.
3. File kiểm định nằm trong `scripts/` và `schemas/`, không phải code runtime thừa.
4. Config thật và secret nằm trong `.env` hoặc secret store của server, không commit.
5. File deploy nằm riêng ở `Dockerfile`, `docker-compose.yml`, và `deploy/`.
6. Snapshot học từ repo ngoài nằm trong `external/`, không import trực tiếp vào runtime.
7. Output, media, evidence thật nằm trong `assets/` hoặc `ops/*.json`, đều bị ignore để không rò rỉ dữ liệu khách hàng.

## Bản đồ thư mục

| Khu vực | Mục đích | Có nên sửa thường xuyên không? |
| --- | --- | --- |
| `src/api/` | HTTP API, auth, rate limit, job manager, session store, route cho short/long/render. | Chỉ sửa khi thêm endpoint hoặc đổi contract API. |
| `src/application/` | Entry point validation, preflight, normalizer, factory. | Sửa khi đổi flow chạy hoặc validation request. |
| `src/agents/` | Agent điều phối: director, story, reference, render, source-video. | Sửa khi đổi logic agent. |
| `src/core/` | Logic lõi: planning, prompt, graph, short/long, source-video, audio, assembly, guard, audit. | Đây là nơi nâng cấp backend chính. |
| `src/providers/` | Adapter model/provider, hiện có Atlas Cloud/Seedance. | Sửa khi thêm provider/model/API mới. |
| `src/prompt_compiler/` | Biên dịch prompt, reference binding, negative constraints, repair hints. | Sửa khi nâng chất lượng prompt. |
| `src/types/` | Kiểu dữ liệu contract nội bộ. | Sửa cùng lúc với core/API khi đổi shape dữ liệu. |
| `src/config/` | Cấu hình capability model và setting Seedance. | Sửa khi model/setting provider thay đổi. |
| `scripts/` | Smoke, audit, validation, evidence runner. | Không xóa; đây là cổng kiểm định backend. |
| `schemas/` | JSON schema cho request/report/evidence. | Sửa khi report hoặc API contract đổi. |
| `deploy/` | Cấu hình reverse proxy HTTPS. | Sửa khi đổi cách publish API. |
| `docs/` | Tài liệu kiến trúc, vận hành, nguồn tham khảo. | Sửa khi cần hướng dẫn/ghi nhận quyết định. |
| `external/` | Snapshot nguồn học từ repo ngoài. | Không dùng runtime; chỉ đọc để dịch logic vào `src/`. |
| `assets/` | Input/output/evidence sinh ra khi chạy. | Không commit dữ liệu thật. |

## File bạn có thể cần chỉnh khi deploy

### `.env`

Đây là file cấu hình thật trên máy/server. File này bị `.gitignore` chặn, không được commit.

Các trường thường cần điền:

- `ATLASCLOUD_API_KEY`
- `ATLASCLOUD_LLM_API_KEY`
- `CINEJELLY_API_AUTH_TOKEN`
- `CINEJELLY_PUBLIC_HOST`
- `CINEJELLY_OUTPUT_DIR`
- `CINEJELLY_LIVE_VALIDATION_MAX_BUDGET_USD`
- `ATLASCLOUD_SEEDANCE_CAPABILITIES_JSON`

Không đưa key thật vào `package.json`, `Dockerfile`, `docker-compose.yml`, README, docs, hoặc code TypeScript.

### `.env.production.template`

Đây là template an toàn để biết cần những biến nào. Được phép commit vì secret để trống. Khi thêm model/provider mới, cập nhật template này bằng placeholder, không điền key thật.

### `Dockerfile`

Chỉ build runtime từ `src/` sang `dist/`. Không dùng `COPY .` để tránh kéo nhầm `.env`, `external/`, `docs/`, `assets/`, hoặc `ops/*.json` vào image.

### `docker-compose.yml`

Dùng cho deploy đơn giản qua API + Caddy HTTPS. Secret đi qua `env_file: .env`. Output chạy thật được mount vào volume:

- `cinejelly-output`
- `cinejelly-reference-inputs`

### `deploy/Caddyfile`

Reverse proxy HTTPS tới API nội bộ. Chỉ cần đổi host qua biến `CINEJELLY_PUBLIC_HOST`, không hardcode domain hoặc token trong file này.

## File không nên sửa tay

- `dist/`: build output, chạy `npm run build` để tạo lại.
- `assets/output_deliverables/`: report/output sinh ra khi audit/render.
- `assets/reference_inputs/`: input media thật của khách hàng/operator.
- `ops/*.json`: evidence/attestation thật, bị ignore.
- `node_modules/`: dependency cài bằng `npm ci`.

## File không được xóa dù tên là smoke/validation

Các file `scripts/run-*-smoke.mjs`, `scripts/audit-*.mjs`, `scripts/validate-*.mjs` là cổng kiểm định backend. Chúng không phải runtime thừa. Nếu xóa, backend mất bằng chứng rằng short/long/render/request/deploy/source hygiene vẫn hoạt động.

Ví dụ các cổng quan trọng:

- `scripts/run-backend-system-suite.mjs`
- `scripts/run-short-pipeline-smoke.mjs`
- `scripts/run-render-request-contract-smoke.mjs`
- `scripts/audit-source-structure.mjs`
- `scripts/audit-snapshot-parity.mjs`
- `scripts/validate-report-contracts.mjs`

## Public export surface

Integration bên ngoài nên import từ package root, tức `dist/index.js` sau build. Không import thẳng file sâu trong `dist/core/...` nếu không cần.

Source ổn định tương ứng là:

- `src/index.ts`

Các module nội bộ không export công khai:

- `src/core/private-source-pattern-registry.ts`
- `src/providers/atlascloud/atlas-cloud-http.ts`
- `src/providers/atlascloud/atlas-cloud-mappers.ts`

Lý do: đây là registry nguồn học riêng và chi tiết HTTP/mapper nội bộ. UI MVP hoặc app bên ngoài không nên phụ thuộc vào chúng.

## Lệnh kiểm tra trước khi push hoặc deploy

Chạy nhanh:

```bash
npm run validation:source-structure
npm run build
```

Chạy đầy đủ backend local no-spend:

```bash
npm run validation:backend-system-suite
```

Chạy trước khi deploy Docker:

```bash
npm run validation:deployment-package
npm run validation:source-structure
```

Sau khi deploy HTTPS thật:

```bash
npm run validation:deployment-readiness -- --base-url https://your-domain.example
```

## Khi thêm model hoặc API provider mới

Thứ tự an toàn:

1. Thêm capability/config vào `src/config/`.
2. Thêm provider adapter vào `src/providers/`.
3. Nếu request shape đổi, cập nhật `src/types/`, `schemas/`, và admission guard trong `src/api/` hoặc `src/application/`.
4. Nếu prompt/model behavior đổi, cập nhật `src/prompt_compiler/` và planner liên quan trong `src/core/`.
5. Export public module cần thiết qua `src/index.ts`.
6. Thêm hoặc cập nhật smoke/audit trong `scripts/`.
7. Chạy `npm run validation:source-structure` và `npm run validation:backend-system-suite`.

## Cách hiểu readiness

Nếu `validation:backend-system-suite` pass thì code/logic local đang tốt theo gate hiện tại. Nếu còn blocker bên ngoài, đó thường là:

- deployment HTTPS thật
- bằng chứng provider/live paid run
- attestation vận hành
- manual review video/audio

Các blocker đó không nên được xử lý bằng cách nhét secret hoặc evidence thật vào source. Chúng đi qua `.env`, ignored `ops/*.json`, hoặc ignored `assets/output_deliverables/`.
