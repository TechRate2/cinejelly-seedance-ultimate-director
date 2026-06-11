# External Upstream Source Snapshots

`external/upstream/` contains Git Subtree snapshots of upstream projects used for source-fidelity review, copy/adaptation, and product integration planning. These snapshots are stored so CineJelly engineering work can verify claims, copy useful documentation or structures, adapt prompt patterns, and compare long-form video-agent behavior against original public sources without depending on live upstream availability.

## Integration Boundary

- CineJelly production runtime code lives in `src/`.
- Productized runtime behavior should normally be copied or adapted into CineJelly-owned modules under `src/`, with attribution and license notes recorded in `docs/`.
- Direct runtime imports from `external/upstream/` require an explicit architecture decision because they couple production behavior to a snapshot.
- Implementation files, prompt corpora, tests, demo scripts, or sample assets can become product material only after license/product review and an intentional copy/adapt step.
- Upstream tests, demos, examples, and development files may exist inside the snapshots because they are part of the original repositories. They are not CineJelly production modules.
- Source-integrated production behavior should name the upstream snapshot and the CineJelly-specific extension in the relevant design document or source comment.

## Snapshot Inventory

| Local path | Upstream | License status | CineJelly usage policy |
| --- | --- | --- | --- |
| `external/upstream/seedance-2.0` | `Emily2040/seedance-2.0` | MIT license file present | Source for Seedance workflow and reference-role patterns; compatible implementation or docs may be reused under MIT with attribution. |
| `external/upstream/awesome-seedance-2-prompts` | `YouMind-OpenLab/awesome-seedance-2-prompts` | CC BY 4.0 license file present | Source for prompt anatomy and pattern snapshots; exact community prompt text requires CC BY attribution and product review before bundled use. |
| `external/upstream/vimax` | `HKUDS/ViMax` | MIT license file present | Reference for long-form multi-agent planning, storyboard, reference selection, and consistency validation patterns. |
| `external/upstream/vibeframe` | `vericontext/vibeframe` | MIT license file present | Reference for deterministic artifacts, cost gates, dry runs, build reports, review reports, and repair loops. |
| `external/upstream/videoagent` | `HKUDS/VideoAgent` | MIT license file present; nested tool licenses also exist | Reference for video understanding, intent decomposition, and graph-powered tool planning; nested tool licenses require separate review. |
| `external/upstream/openmontage` | `calesthio/OpenMontage` | AGPL-3.0 license file present | Source for orchestration, approval gates, provider scoring, and self-review; direct implementation reuse must follow AGPL obligations or a legal review decision. |
| `external/upstream/directorbench` | `jiaminchen-1031/DirectorBench` | No top-level license file in snapshot | Snapshot/audit source for evaluation dimensions and checkpoint ideas until license status is clarified. |

## Update Policy

Refresh snapshots intentionally with `git subtree pull --prefix=<path> <repo-url> <branch> --squash` after reviewing license changes and secret exposure risk. After any snapshot update, update `docs/EXTERNAL_SOURCE_SNAPSHOTS.md`, run the redacted secret audit, then commit and push.
