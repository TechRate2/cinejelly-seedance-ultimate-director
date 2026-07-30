# CineJelly Agent Operating Rules

## Mission

CineJelly Seedance Ultimate Director is a commercial production system for one-input, high-quality, long-form AI video generation using Atlas Cloud and Seedance 2.0 by default. Treat every change as production work.

## Mandatory Workflow

1. Before editing, read [`BAN-DO-DU-AN.md`](BAN-DO-DU-AN.md) and run `npm test`. Open a design spec
   under `docs/` only afterwards, and treat it as historical intent rather than a description of the
   code — most were frozen on 2026-07-02/04 while the code moved on. When a spec and the code
   disagree, the code wins and the spec is the bug.
2. Do not create test, mock, demo, sample, fixture, or example files.
3. Do not commit secrets, `.env` files, provider keys, raw tokens, private keys, local credentials, or generated customer media.
4. Keep Atlas Cloud as the default LLM and Seedance provider unless the user explicitly changes the provider plan.
5. Keep provider-specific details inside provider abstractions; do not hardcode model IDs, pricing, or limits in business logic.
6. After each completed production code or documentation change, run a redacted secret audit, commit intentionally, and push to the configured GitHub remote unless the user explicitly says not to push.
7. If the remote is missing, create or configure a GitHub repo before pushing.

## Token-Efficient Context Loading

Use this order:

1. **`BAN-DO-DU-AN.md` (repository root) — read this first, always.**
   It is the current map: which file to change for which outcome, the full render sequence marked
   with which steps cost money and where each gate sits, the license status of every reference
   snapshot, and what is unfinished. It is maintained; the long-form specs below are not.
2. **`npm test`** before and after any change. One command, no spend, plain Vietnamese answer.
3. One relevant detailed spec — treat these as HISTORICAL DESIGN INTENT, not as a description of
   the code as it stands. Most were last touched on 2026-07-04/05 while the code moved on 124
   commits across 88 source files, and several name TypeScript types that were never built under
   those names. When a spec and the code disagree, the code wins and the spec is the bug:
   - project context (frozen 2026-07-04): `docs/PROJECT_CONTEXT.md`
   - architecture: `docs/ARCHITECTURE_SPEC.md`
   - prompt logic: `docs/PROMPT_COMPILER_DESIGN.md`
   - long-form graph: `docs/PRODUCTION_GRAPH_AND_LONG_FORM.md`
   - consistency/QA: `docs/CONSISTENCY_GUARDIAN_DESIGN.md`
   - providers: `docs/MODEL_PROVIDER_ABSTRACTION.md`
   - user settings: `docs/FLEXIBLE_SEEDANCE_SETTINGS.md`
   - attribution/licensing: `docs/CREDITS.md`
   - subtree policy: `docs/SUBTREE_POLICY.md`
   - upstream snapshots: `docs/EXTERNAL_SOURCE_SNAPSHOTS.md`
   - faithful source translation: `docs/FAITHFUL_LOGIC_TRANSLATION_PROCESS.md`
   - implementation roadmap: `docs/IMPLEMENTATION_ROADMAP.md`
4. `docs/UPSTREAM_CONTEXT_ROUTING.md` when upstream snapshot context is needed.
5. Original external sources under `external/upstream/` only when the change modifies source-derived claims, provider behavior, license-sensitive reuse, or model capability assumptions. Read only the focused upstream files named by the context-routing guide or by `src/core/source-logic-translation-records.ts`; do not scan the whole snapshot tree during normal implementation.

## Snapshot Integration Policy

`external/upstream/` is raw material to mine aggressively. This is a commercial MVP built to compete with Topview and Higgsfield, so the priority is the strongest possible product: integrate useful pipeline logic, prompt patterns, and structures directly into CineJelly-owned `src/`, `data/`, and `docs/`.

- Integrate freely into owned modules. Adapt, rewrite, extend, and combine upstream ideas into production code. No mandatory reference-implementation ceremony and no "faithful logic translation" gate is required before building.
- Keep attribution. When a module is clearly adapted from a snapshot, name the source in a short code/doc comment. Attribution stays; process gates do not block shipping.
- Do not `import` at runtime from `external/upstream/` — copy/adapt into owned modules so the product is self-contained (snapshots may be pruned or removed).
- One real legal line: do not ship OpenMontage AGPL-licensed source code verbatim inside the commercial product. Re-implement its useful behavior as owned TypeScript instead. Permissive (MIT/Apache/CC-BY) material may be reused with a short notice.
- Build for full capability. It is fine to aim for and describe strong parity with upstream systems once a feature works and passes checks; defensive "not full parity" hedging is not required in code or docs.
- Aim for every-niche coverage through data-driven adaptation (prompt-DNA corpora, scored candidates) rather than rigid per-niche code branches.

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
