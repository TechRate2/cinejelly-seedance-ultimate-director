# CineJelly Agent Operating Rules

## Mission

CineJelly Seedance Ultimate Director is a commercial production system for one-input, high-quality, long-form AI video generation using Atlas Cloud and Seedance 2.0 by default. Treat every change as production work.

## Mandatory Workflow

1. Before editing, read `docs/PROJECT_CONTEXT.md` and the smallest directly relevant design spec.
2. Do not create test, mock, demo, sample, fixture, or example files.
3. Do not commit secrets, `.env` files, provider keys, raw tokens, private keys, local credentials, or generated customer media.
4. Keep Atlas Cloud as the default LLM and Seedance provider unless the user explicitly changes the provider plan.
5. Keep provider-specific details inside provider abstractions; do not hardcode model IDs, pricing, or limits in business logic.
6. After each completed production code or documentation change, run a redacted secret audit, commit intentionally, and push to the configured GitHub remote unless the user explicitly says not to push.
7. If the remote is missing, create or configure a GitHub repo before pushing.

## Token-Efficient Context Loading

Use this order:

1. `docs/PROJECT_CONTEXT.md`
2. One relevant detailed spec:
   - architecture: `docs/ARCHITECTURE_SPEC.md`
   - prompt logic: `docs/PROMPT_COMPILER_DESIGN.md`
   - long-form graph: `docs/PRODUCTION_GRAPH_AND_LONG_FORM.md`
   - consistency/QA: `docs/CONSISTENCY_GUARDIAN_DESIGN.md`
   - providers: `docs/MODEL_PROVIDER_ABSTRACTION.md`
   - user settings: `docs/FLEXIBLE_SEEDANCE_SETTINGS.md`
   - attribution/licensing: `docs/CREDITS.md`
   - upstream snapshots: `docs/EXTERNAL_SOURCE_SNAPSHOTS.md`
3. Original external sources under `external/upstream/` only when the change modifies source-derived claims, provider behavior, license-sensitive reuse, or model capability assumptions.

## Source Fidelity Policy

- `docs/PROJECT_CONTEXT.md` is a compact memory map, not a full replacement for reading the detailed specs or upstream repositories.
- Architecture and behavior must stay traceable to the credited sources and local subtree snapshots, but implementation must be original CineJelly code unless a dependency/license review explicitly allows reuse.
- Do not claim CineJelly has cloned or copied 100% of ViMax, VibeFrame, OpenMontage, VideoAgent, Emily2040/seedance-2.0, or any Atlas Cloud workflow unless the matching production feature is implemented, verified, and attributed.
- Copying public prompt corpora or AGPL implementation code into this product is prohibited without legal approval.
- `external/upstream/` snapshots are source-fidelity references. Runtime code in `src/` must not import from them.
- When implementing a source-inspired feature, write a short note in the relevant design doc or code comment naming the source pattern and the CineJelly-specific extension.

## Security Gate Before Push

Run checks equivalent to:

- no tracked `.env` or credential filenames
- no API key, token, password, bearer token, or private key patterns in tracked files
- `git status -sb` reviewed before staging
- only intended production files staged

If `gitleaks` is installed, run it with `.gitleaks.toml` and redaction. If not installed, use a redacted local scan and report that fallback.

## Commit and Push Policy

- Use short, meaningful commit messages.
- Prefer small commits that match a completed production change.
- Push the current branch immediately after a successful commit and security audit.
- Never force-push unless the user explicitly asks and the risk is explained.
