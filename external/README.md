# External Upstream Source Snapshots

`external/upstream/` contains Git subtree snapshots of upstream projects used for source-fidelity review. These snapshots are stored so CineJelly engineering work can verify claims, architecture patterns, prompt structures, and long-form video-agent behavior against original public sources without depending on live upstream availability.

## Runtime Boundary

- CineJelly production runtime code lives in `src/`.
- Runtime code must not import from `external/upstream/`.
- Runtime code must not copy implementation files, prompt corpora, tests, demo scripts, or sample assets from `external/upstream/` unless the license and product use have been explicitly reviewed.
- Upstream tests, demos, examples, and development files may exist inside the snapshots because they are part of the original repositories. They are not CineJelly production modules.
- Source-inspired production behavior must be reimplemented as original CineJelly code and attributed in the relevant design document.

## Snapshot Inventory

| Local path | Upstream | License status | CineJelly usage policy |
| --- | --- | --- | --- |
| `external/upstream/seedance-2.0` | `Emily2040/seedance-2.0` | MIT license file present | Reference for Seedance workflow and reference-role patterns; implementation should remain original unless reused under MIT with attribution. |
| `external/upstream/awesome-seedance-2-prompts` | `YouMind-OpenLab/awesome-seedance-2-prompts` | CC BY 4.0 license file present | Reference for generalized prompt structure only; do not bundle community prompt text into product outputs or code. |
| `external/upstream/vimax` | `HKUDS/ViMax` | MIT license file present | Reference for long-form multi-agent planning, storyboard, reference selection, and consistency validation patterns. |
| `external/upstream/vibeframe` | `vericontext/vibeframe` | MIT license file present | Reference for deterministic artifacts, cost gates, dry runs, build reports, review reports, and repair loops. |
| `external/upstream/videoagent` | `HKUDS/VideoAgent` | MIT license file present; nested tool licenses also exist | Reference for video understanding, intent decomposition, and graph-powered tool planning; nested tool licenses require separate review. |
| `external/upstream/openmontage` | `calesthio/OpenMontage` | AGPL-3.0 license file present | Reference only for orchestration, approval gates, provider scoring, and self-review. Do not copy implementation into proprietary runtime without legal approval. |
| `external/upstream/directorbench` | `jiaminchen-1031/DirectorBench` | No top-level license file in snapshot | Reference only for evaluation dimensions and checkpoint ideas until license status is clarified. |

## Update Policy

Refresh snapshots intentionally with `git subtree pull --prefix=<path> <repo-url> <branch> --squash` after reviewing license changes and secret exposure risk. After any snapshot update, update `docs/EXTERNAL_SOURCE_SNAPSHOTS.md`, run the redacted secret audit, then commit and push.
