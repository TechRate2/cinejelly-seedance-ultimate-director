# Deployment Container Packaging

Implementation status as of 2026-06-16: implemented as a root `Dockerfile`, root `.dockerignore`, environment-template notes, and operator documentation. This packaging is a deployment transport and does not replace real HTTPS deployment, Atlas billing readiness, paid validation, or operations attestations.

## Intent

Business-readiness deployment evidence must come from a real HTTPS host. A repeatable container image makes that host easier to reproduce across Render, Fly.io, Railway, ECS, Cloud Run, Kubernetes, or a private VM while keeping secrets outside the image.

## Constraints

1. Docker build context must not include `.env`, API keys, tokens, operator attestations, generated media, or customer artifacts.
2. Runtime image must install FFmpeg and FFprobe so `/v1/preflight` can validate the same media tools that production renders use.
3. Runtime image must expose the production HTTP entrypoint only; validation evidence is still captured from the deployed host by the existing no-spend scripts.
4. Atlas provider calls remain gated by the runtime configuration, request admission, budget checks, Atlas billing evidence, and explicit paid-validation flags.
5. `CINEJELLY_OUTPUT_DIR` must point to a writable path. Commercial deployments should mount it on durable storage or configure a platform volume.
6. The image must not bake in `.env`; pass secrets through the platform secret manager or `docker run --env-file .env`.

## Runtime Shape

- Base runtime: `node:22-bookworm-slim`
- Media tools: Debian `ffmpeg` package, including `ffprobe`
- Default port: `8787`
- Default output directory: `/app/assets/output_deliverables`
- Health check: public `GET /health`
- Entrypoint: `node --env-file-if-exists=.env dist/api/server.js`

## Operator Commands

Build locally:

```bash
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

After deployment to HTTPS, capture no-spend deployment evidence from outside the container:

```bash
export CINEJELLY_DEPLOYMENT_BASE_URL="https://<your-cinejelly-host>"
export CINEJELLY_DEPLOYMENT_API_AUTH_TOKEN="<deployment-token>"
npm run validation:deployment-readiness
```

## Acceptance Checks

- `docker build` succeeds without `.env` in the image.
- `/health` returns HTTP 200 from the running container.
- `/v1/preflight` reports Atlas configuration, API auth, output directory, FFmpeg, FFprobe, and `atlascloud_docs_conformance` without exposing secrets.
- `validation:deployment-readiness` marks localhost captures as local-only and marks real HTTPS captures as deployment evidence only when all required diagnostics pass.
