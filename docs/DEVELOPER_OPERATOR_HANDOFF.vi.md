# Handoff Cho Dev Và Operator

Tài liệu này là bản đọc nhanh trước khi sửa code, build UI MVP, tích hợp model/API mới, hoặc deploy CineJelly. Mục tiêu là tránh lạc vào nhiều file: đọc trang này trước, sau đó mới mở tài liệu sâu khi cần.

## Kết Luận Hiện Tại

- Runtime thật nằm trong `src/` và build ra `dist/`.
- Package phát hành chỉ chứa runtime `dist/`, `README.md`, `package.json`, và `.env.production.template`.
- Docker runtime không copy `scripts/`, `schemas/`, `docs/`, `external/`, `.env`, `ops/`, hoặc generated `assets/`.
- `scripts/` và `schemas/` là bộ kiểm chứng cho dev/operator, không phải code thừa.
- Runtime `src/` phải không có file test/mock/demo/smoke và không có marker `TODO`, `FIXME`, `HACK`, hoặc `XXX`; `validation:source-structure` sẽ chặn nếu các dấu hiệu này xuất hiện.
- Không đọc `.env` trực tiếp trong logic lõi video. Env chỉ đi qua các boundary API/application/config/store đã duyệt, rồi truyền thành object config cho core/agent/provider/prompt logic.
- Config deploy tập trung ở `.env.production.template`; secret thật chỉ đi vào ignored `.env` hoặc secret store của server.
- Web shell hiện có là `/short/create` và `/operator/launch-dashboard`; dữ liệu protected vẫn đi qua API auth/client key.

## Đọc Gì Trước

1. `docs/DEVELOPER_OPERATOR_HANDOFF.vi.md`: bản đồ nhanh này.
2. `docs/SOURCE_STRUCTURE_AND_DEPLOY_SECURITY.vi.md`: source map, real mode, package/deploy boundary.
3. `docs/BEGINNER_QUICKSTART.md`: chạy local nhanh cho người không chuyên.
4. `docs/RUNNING_AND_MODEL_SETTINGS_GUIDE.md`: biến môi trường, model, API, settings.
5. `docs/OPERATOR_RUNBOOK.md`: paid/live validation và launch evidence.
6. `README.md`: tổng quan kiến trúc và danh sách tài liệu đầy đủ.

## Folder Nào Là Gì

| Folder/File | Vai trò | Có trong runtime? |
| --- | --- | --- |
| `src/api/` | HTTP API, auth, rate limit, route render/short/operator/admin | Có |
| `src/application/` | Runtime factory, preflight, validation entrypoints | Có |
| `src/agents/` | Director, planner, source-video analyst, render producer | Có |
| `src/core/` | Logic chính: short, long, graph, prompt, review, assembly, audio, billing | Có |
| `src/prompt_compiler/` | Build prompt Seedance/model và reference binding | Có |
| `src/providers/` | Provider abstraction, Atlas Cloud adapter, registry | Có |
| `src/config/` | Runtime config, Seedance settings, capability policy | Có |
| `src/types/` | Type contract nội bộ | Có |
| `src/utils/` | Redaction, retry, IDs, media tools | Có |
| `dist/` | Build output từ TypeScript | Có khi chạy |
| `scripts/` | Validation, audit, evidence, operator tools | Không trong runtime |
| `schemas/` | Report/API/evidence contracts cho validation | Không trong runtime |
| `docs/` | Kiến trúc, roadmap, handoff, runbook | Không runtime |
| `external/upstream/` | Snapshot public để học/copy-adapt có kiểm soát | Không runtime |
| `assets/` | Input/output/evidence thật, ignored | Không commit |
| `ops/*.json` | Attestation/evidence operator, ignored | Không commit |
| `deploy/` | Caddy/reverse proxy config | Deploy |

## Luồng Backend Chính

```text
Client/UI/API request
  -> src/api/server.ts
  -> auth, rate limit, body size, content type
  -> request admission / normalization
  -> Director runtime / Short planner / Long planner
  -> storyboard, shot contract, production graph
  -> prompt compiler + reference binding
  -> provider abstraction
  -> Atlas Cloud Seedance / LLM / audio provider
  -> artifact store + cost ledger
  -> assembly / postproduction / delivery gate
  -> review packet + redacted API response
```

## Short/UI Pipe Hiện Có

| UI mode | Backend pipe | Dùng khi |
| --- | --- | --- |
| Smart Short | `normal_short_pipe` | Người dùng chỉ có ý tưởng hoặc brief ngắn. |
| Product/KOL UGC | `product_kol_reference_pipe` | Có ảnh KOL, ảnh sản phẩm, background/reference. |
| Storyboard Multishot | `storyboard_board_pipe` | Cần nhiều cảnh, timeline rõ, video ngắn có mở-thân-kết. |
| Video Remake | `video_remake_pipe` | Có video mẫu/source structure và muốn dựng lại bằng KOL/sản phẩm riêng. |
| Production Bible | `long_sequence_bible_pipe` | 60-480s, cần consistency dài, visual bible, sequence board. |

UI shell không tự quyết model thô. Backend tạo `uiContract`, `seedanceRouting`, `visualBible`, `reviewCheckpoints`, `approvalPayload`, rồi mới cho phép handoff render sau review.

UI runtime phải bắt đầu từ dữ liệu thật của user: không hardcode số dư, không tự điền brief/sản phẩm/claim mẫu, không dùng ảnh placeholder từ host ngoài, và không chọn pattern starter trước khi user bấm. `validation:source-structure` và `validation:short-mvp-ui-contract` sẽ fail nếu các dấu vết preview này quay lại.

## Config Và Deploy

Chỉ coi `.env.production.template` là bảng config deploy chính. Khi chạy thật:

```powershell
Copy-Item .env.production.template .env
npm.cmd run setup:local
npm.cmd run doctor
npm.cmd run build
npm.cmd run start
```

Deploy Docker cơ bản:

```powershell
npm.cmd run validation:deployment-package
docker compose up -d --build
```

Biến tối thiểu cần có trong `.env` hoặc secret store:

- `ATLASCLOUD_API_KEY`
- `ATLASCLOUD_LLM_API_KEY` nếu dùng key LLM riêng
- `ATLASCLOUD_LLM_MODEL`
- `ATLASCLOUD_SEEDANCE_MINI_MODEL`
- `ATLASCLOUD_SEEDANCE_STANDARD_MODEL`
- `ATLASCLOUD_SEEDANCE_FAST_MODEL`
- `ATLASCLOUD_SEEDANCE_CAPABILITIES_JSON`
- `CINEJELLY_API_AUTH_TOKEN`
- `CINEJELLY_PUBLIC_HOST` khi dùng docker compose/Caddy HTTPS

Không bật trong production:

```env
CINEJELLY_DISABLE_API_AUTH=true
CINEJELLY_DISABLE_API_RATE_LIMIT=true
```

## Lệnh Kiểm Tra Bắt Buộc

Trước khi push code:

```powershell
npm.cmd run build
npm.cmd run validation:source-structure
npm.cmd run validation:deployment-package
```

`validation:deployment-package` kiểm Docker/Compose/env template/package config và, sau khi `dist/` đã build, tự chạy `npm pack --dry-run` để xác nhận package runtime không chứa source, docs, scripts, schemas, snapshots, secrets, ops, hoặc generated assets.

Trước khi nói backend/UI contract ổn:

```powershell
npm.cmd run validation:short-mvp-ui-contract
npm.cmd run validation:operator-launch-ui-contract
npm.cmd run validation:backend-system-suite
```

Trước khi deploy thật:

```powershell
npm.cmd run validation:report-contracts
npm.cmd run validation:business-plan
npm.cmd run validation:live-inputs
```

Sau khi có HTTPS host thật:

```powershell
npm.cmd run validation:deployment-readiness -- --base-url https://your-domain.example
```

## Khi Sửa Code

- Sửa short flow: `src/core/short-*`, `src/types/short-*`, `src/api/server.ts`.
- Sửa long flow: `src/core/long-*`, `src/agents/story-architect.ts`, `src/core/production-graph-*`.
- Sửa prompt/model: `src/prompt_compiler/`, `src/config/seedance-settings.ts`, `src/config/seedance-capabilities.ts`.
- Thêm provider/API mới: `src/providers/provider-registry.ts`, `src/providers/contracts.ts`, `src/config/runtime-config.ts`, `src/types/provider.ts`.
- Sửa UI shell: `src/api/short-pipeline-create-page.ts`, `src/api/operator-launch-dashboard-page.ts`.
- Sửa report/evidence contract: `schemas/`, `scripts/validate-*`, `scripts/audit-*`.

Nếu thêm biến môi trường mới trong `src/`, phải cập nhật `.env.production.template`. `validation:source-structure` và `validation:deployment-package` sẽ fail nếu runtime đọc env mới nhưng template chưa ghi.

## Không Xoá Nhầm

Không xoá các nhóm này chỉ vì tên có `smoke`, `audit`, `validation`, hoặc `schema`:

- `scripts/run-*-smoke.mjs`
- `scripts/audit-*.mjs`
- `scripts/validate-*.mjs`
- `schemas/*-report.schema.json`
- `docs/reference-implementations/`
- `external/upstream/`

Chúng không phải runtime thừa. Chúng là bằng chứng để dev không làm lệch backend, UI contract, package, deploy, redaction, source lineage, graph, provider handoff, short/long logic.

Có thể dọn local ignored artifacts:

- `assets/output_deliverables/**`
- `assets/live-tests/**`
- `dist/` nếu chuẩn bị build lại
- `node_modules/` nếu chuẩn bị `npm ci`

Không commit `.env`, media thật, output thật, hoặc `ops/*.json`.

## Trạng Thái Readiness

Nếu `backend-system-suite` pass và `backend-system-readiness` là `blocked_by_external_evidence`, điều đó nghĩa là source/code contract đang pass nhưng còn thiếu bằng chứng ngoài source.

Những bằng chứng ngoài source thường là:

- live HTTPS deployment capture
- paid/live provider evidence
- operator attestation
- manual media/audio review
- product rights/review evidence

Không giả lập các bằng chứng này trong source. Chúng phải nằm trong ignored `assets/output_deliverables/`, ignored `ops/*.json`, hoặc report thật từ validation command.
