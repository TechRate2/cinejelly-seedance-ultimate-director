# Deployment Container Packaging

Implementation status as of 2026-06-19: implemented as a root `Dockerfile`, root `.dockerignore`, root `docker-compose.yml`, `deploy/Caddyfile`, environment-template notes, operator documentation, `scripts/validate-deployment-package.mjs`, `schemas/deployment-package-validation-report.schema.json`, `npm run validation:deployment-package`, and report-contract validation coverage. This packaging is a deployment transport and does not replace real HTTPS deployment, Atlas billing readiness, paid validation, or operations attestations.

## Intent

Business-readiness deployment evidence must come from a real HTTPS host. A repeatable container image makes that host easier to reproduce across Render, Fly.io, Railway, ECS, Cloud Run, Kubernetes, or a private VM while keeping secrets outside the image. The included compose path is the single-host VM reference: API container on the private compose network, Caddy on ports 80/443, automatic HTTPS, durable named volumes, and runtime secrets read from ignored `.env`.

## Constraints

1. Docker build context must not include `.env`, API keys, tokens, operator attestations, generated media, or customer artifacts.
2. Runtime image must install FFmpeg and FFprobe so `/v1/preflight` can validate the same media tools that production renders use.
3. Runtime image must expose the production HTTP entrypoint only; validation evidence is still captured from the deployed host by the existing no-spend scripts.
4. Atlas provider calls remain gated by the runtime configuration, request admission, budget checks, Atlas billing evidence, and explicit paid-validation flags.
5. `CINEJELLY_OUTPUT_DIR` must point to a writable path. Commercial deployments should mount it on durable storage or configure a platform volume.
6. The image must not bake in `.env`; pass secrets through the platform secret manager or `docker run --env-file .env`.
7. The single-host compose path must publish only Caddy to the host network; the API port must stay internal to the compose network.
8. `CINEJELLY_PUBLIC_HOST` must be set to the real DNS hostname before starting the Caddy deployment path.
9. The no-spend deployment-package validator must check Dockerfile, `.dockerignore`, `docker-compose.yml`, `deploy/Caddyfile`, `.env.production.template`, and this document without calling Docker, Atlas, FFmpeg, deployment hosts, or billing APIs.

## Runtime Shape

- Base runtime: `node:22-bookworm-slim`
- Media tools: Debian `ffmpeg` package, including `ffprobe`
- Default port: `8787`
- Default output directory: `/app/assets/output_deliverables`
- Health check: public `GET /health`
- Entrypoint: `node --env-file-if-exists=.env dist/api/server.js`

## Single-Host HTTPS Shape

- API service: built from the root `Dockerfile`
- Runtime secrets: ignored `.env` passed through compose `env_file`
- API network exposure: internal compose port `8787` only
- Reverse proxy: official Caddy 2 Alpine image
- Public ports: Caddy owns `80:80` and `443:443`
- Public host: `CINEJELLY_PUBLIC_HOST`, for example `api.example.com`
- Certificate state: persistent `caddy-data` and `caddy-config` named volumes
- Output state: persistent `cinejelly-output` named volume mounted at `/app/assets/output_deliverables`

## Operator Commands

Build locally:

```bash
npm run validation:deployment-package
docker build -t cinejelly-seedance-ultimate-director:local .
```

Run with local ignored env values:

```bash
docker run --rm -p 8787:8787 --env-file .env cinejelly-seedance-ultimate-director:local
```

For durable evidence/artifacts on a single host, mount an ignored output directory:

```bash
docker run --rm -p 8787:8787 --env-file .env \
  -e CINEJELLY_OUTPUT_DIR=/data/output_deliverables \
  -v "$PWD/assets/output_deliverables:/data/output_deliverables" \
  cinejelly-seedance-ultimate-director:local
```

Run the single-host HTTPS reference deployment after DNS points at the host:

```bash
cp .env.production.template .env
# Fill Atlas keys, CINEJELLY_API_AUTH_TOKEN, client/workspace policy, and:
# CINEJELLY_PUBLIC_HOST=api.example.com
npm run validation:deployment-package
docker compose up -d --build
docker compose ps
```

The compose path uses `deploy/Caddyfile`; do not put raw API keys or Atlas keys in that file or in `docker-compose.yml`.

After deployment to HTTPS, capture no-spend deployment evidence from outside the container:

```bash
export CINEJELLY_DEPLOYMENT_BASE_URL="https://<your-cinejelly-host>"
export CINEJELLY_DEPLOYMENT_API_AUTH_TOKEN="<deployment-token>"
npm run validation:deployment-readiness
```

## Acceptance Checks

- `docker build` succeeds without `.env` in the image.
- `docker compose up -d --build` publishes the API only through Caddy-managed HTTPS.
- `npm run validation:deployment-package` writes `cinejelly.deployment-package-validation.v1` with status `pass`.
- `/health` returns HTTP 200 from the running container.
- `/v1/preflight` reports Atlas configuration, API auth, output directory, FFmpeg, FFprobe, and `atlascloud_docs_conformance` without exposing secrets.
- `validation:deployment-readiness` marks localhost captures as local-only and marks real HTTPS captures as deployment evidence only when all required diagnostics pass.
