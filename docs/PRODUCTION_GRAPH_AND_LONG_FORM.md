# Production Graph and Long-Form Strategy

## Purpose

This document defines how CineJelly creates coherent 2 to 8 minute videos from a single input while Seedance 2.0 operates on short renderable clips.

## Sources Used

- ViMax for RAG-based long script design, multi-scene scripts, storyboard design, multi-camera simulation, intelligent reference selection, parallel candidate generation, and consistency validation.
- VibeFrame for storyboard/design source-of-truth artifacts, dry runs, build reports, review reports, render inspection, and deterministic repair loops.
- DirectorBench for long-form checkpoint evaluation across script, visual, audio, cross-modal, and stability dimensions.
- VideoAgent for intent analysis, graph-powered workflow planning, video understanding, editing, and remaking.
- OpenMontage for reference-video analysis, transcript/pacing/keyframe/style extraction, approval gates, cost estimates, provider scoring, real-footage retrieval, and self-review.
- Atlas Cloud Seedance docs for clip duration, multimodal references, asset registration, async prediction, and resolution settings.

## Why a Production Graph

Long-form video fails when the system treats the whole job as one prompt. A graph gives CineJelly:

- Repairable units.
- Continuity memory.
- Parallel execution where safe.
- Shot-level cost and latency tracking.
- Reusable reference lineage.
- User-facing review checkpoints.
- Fine-grained diagnostics.

Extension based on ViMax + VibeFrame + DirectorBench:

- ViMax contributes multi-agent scene/shot decomposition and consistency-aware reference reuse.
- VibeFrame contributes deterministic artifacts, build/inspect reports, and cost gates.
- DirectorBench contributes checkpoint-level evaluation.
- CineJelly combines these into a typed graph that drives production, rendering, inspection, and repair.

## Graph Hierarchy

```text
Project
  AudienceProfile
  ReferenceLibrary
  StoryArc
    Sequence
      Scene
        Beat
          Shot
            ClipRender
              InspectionReport
              RepairAction
  Timeline
  Deliverable
```

## Node Contracts

### Project

Contains:

- user request
- product/business context
- target duration
- target platforms
- selected tier
- selected resolution
- selected quality mode
- budget/cost ceiling
- language and localization settings
- safety and rights constraints

### ReferenceLibrary

Contains:

- original user files or URLs
- normalized asset records
- role labels
- Atlas Cloud asset IDs where required
- embeddings and thumbnails
- validation results
- usage lineage

Reference roles:

- identity
- product
- wardrobe
- environment
- motion
- camera
- audio tempo
- voice
- style
- first frame
- last frame
- source video structure

Runtime implementation:

- Intake routes every supplied reference through the Reference Librarian before LLM planning or render spend.
- The Reference Librarian normalizes missing labels, infers safe media kind defaults, validates role/kind compatibility, accepts only absolute `http(s)` or `asset://` reference URIs for the current Atlas path, rejects credential-like reference URIs, and deduplicates repeated references.
- Production Graph Builder creates one validated `reference_asset` node per normalized reference, then connects references to dependent shots.
- Identity and wardrobe references add `continues_identity` edges, environment and style references add `continues_environment` edges, and motion/camera/audio/source-structure references add `matches_motion` edges.

### StoryArc

Contains:

- hook
- premise
- progression
- climax/payoff
- call to action or resolution
- audience promise
- emotional rhythm

### Sequence

Long-form grouping that allows parallel and staged production:

- 2-minute video: usually 3 to 6 sequences.
- 8-minute video: usually 8 to 16 sequences.

### Scene

Contains:

- location
- time
- characters/products present
- environment anchors
- lighting continuity
- audio environment
- narrative function

### Beat

The smallest story unit:

- information reveal
- emotional turn
- product benefit
- action moment
- transition bridge
- proof point
- joke/payoff
- visual motif

### Shot

The renderable contract:

- duration, usually 4 to 15 seconds depending on provider support
- shot scale
- camera movement
- action
- lighting
- audio cue
- reference bindings
- start and end state
- transition handles
- inspection checklist

### ClipRender

Provider job:

- provider
- model ID
- schema version
- request payload
- prediction ID
- status
- cost estimate and actual cost
- output URLs
- returned last frame if available
- errors

### InspectionReport

DirectorBench-inspired:

- script score
- visual score
- audio score
- cross-modal score
- stability score
- transition score
- identity score
- product score
- repair recommendation

## Long-Form Duration Planning

Atlas Cloud sources describe Seedance 2.0 clips in the 4 to 15 second range. Therefore:

- 2 minutes requires roughly 8 to 30 clips.
- 8 minutes requires roughly 32 to 120 clips.
- Higher quality usually favors more, shorter, repairable shots.
- Lower cost may favor fewer, longer multi-shot clips.

Clip duration policy:

- 4 seconds: test takes, risky identity/motion shots, transition probes.
- 5 to 8 seconds: standard commercial shots and dialogue beats.
- 9 to 12 seconds: stable one-action shots.
- 13 to 15 seconds: one-shot product showcases or controlled internal multi-shot prompts.

## Long-Form Pipeline

1. Intake one user input.
2. Analyze references and source videos.
3. Build audience and platform profile.
4. Generate story arc.
5. Segment into sequences, scenes, beats, and shots.
6. Build continuity ledgers.
7. Assign reference roles.
8. Compile shot contracts.
9. Run preflight and cost plan.
10. Render test takes for risky shots.
11. Render approved shots.
12. Inspect and repair.
13. Assemble timeline.
14. Inspect full video.
15. Export final deliverables.

## Script From Long Video

If the user provides a long source video, CineJelly uses a VideoAgent/OpenMontage-style intake:

- extract transcript
- detect scenes
- sample keyframes
- infer pacing
- identify visual style
- identify camera grammar
- identify audio rhythm
- identify structural beats
- preserve only user-approved creative intent
- create an original script and shot plan rather than copying protected content

The source video becomes a structural reference, not a license to reproduce protected material.

## Continuity Strategy

Continuity is represented in ledgers:

- `IdentityLedger`: face, hair, wardrobe, body shape, age, accessories.
- `ProductLedger`: geometry, material, color, label, logo permissions, packaging.
- `EnvironmentLedger`: location, props, weather, time of day, lighting direction.
- `CameraLedger`: lens feel, movement grammar, shot scale, camera support.
- `AudioLedger`: voice, music, beat, ambience, SFX, language.
- `NarrativeLedger`: facts already stated, promises, story state.

Each shot reads the relevant ledgers and writes updates only when approved by the graph.

## Reference Reuse Policy

Source basis:

- ViMax selects reference images required for the current first frame using previous timeline context.
- Atlas Cloud supports reference assets, first/last-frame style workflows, and Asset Library references.
- Emily2040 separates assets by role.

Rules:

- Identity-critical characters always carry identity references unless the shot is distant or abstract.
- Product-critical shots always carry product references or post-composited product plates.
- Scenes reuse environment anchors until the graph explicitly changes location.
- Camera/motion references are reused only when they support the beat.
- Last frames from approved clips may become next-shot first-frame anchors when transition continuity matters.

## Transition Strategy

DirectorBench reports between-unit transition quality as a major bottleneck. CineJelly treats transitions as first-class graph nodes.

Transition data:

- outgoing shot end state
- incoming shot start state
- visual bridge
- audio bridge
- motion direction
- color continuity
- semantic relation
- required handles

Transition repair:

- generate bridge clip
- re-render outgoing last seconds
- re-render incoming first seconds
- use first/last frame anchors
- apply deterministic edit transition
- alter audio bridge

## Parallelization Strategy

Parallel rendering is allowed when:

- shots do not depend on each other's returned frames
- identity/environment references are stable
- scene state is already approved
- no unresolved upstream continuity constraint exists

Parallel rendering is blocked when:

- next shot needs previous last frame
- scene identity is not approved
- reference asset registration is pending
- test take has not passed for a high-risk character/product

This follows ViMax's high-efficiency parallel shot generation idea while preserving graph correctness.

Runtime implementation:

- `CINEJELLY_RENDER_CONCURRENCY` controls the maximum concurrent renderable shot workers; the default is conservative.
- The render scheduler parallelizes only shots without first/last-frame references, endpoint continuity fields, transition risk, or transition wording that implies previous/next/anchor continuity.
- Sequential shots flush pending parallel batches first, preserving graph correctness and final assembly order.

Runtime candidate evidence:

- Validated user references are preserved as `reference_asset` graph nodes before clip rendering begins.
- High-risk shots can produce a 4-second test-take `ClipRender` node before full candidate rendering.
- Quality mode controls how many candidates are rendered per shot.
- Quality mode also controls the maximum targeted repair attempts per shot before delivery.
- Each test take and candidate becomes a `ClipRender` node with candidate index, optional test-take flag, optional repair attempt index, provider status, output URLs, cost metadata when available, and selected/rejected state.
- Render inspection reports are attached to each candidate clip node.
- Repair prompts are generated from Guardian findings and original compiler repair hints, then rerender only the affected shot.
- Repair actions are created only from the selected candidate after the repair budget is exhausted, so rejected alternatives remain audit evidence without forcing unnecessary repair loops.

## Cost and Approval Gates

Source basis:

- VibeFrame uses cost gates, dry runs, and build reports.
- OpenMontage returns cost estimates and approval checkpoints before full production.

CineJelly gates:

- `Graph Plan Gate`: story/scene/shot count and cost estimate.
- `Reference Gate`: asset validation and rights check.
- `Test Take Gate`: high-risk identity/motion approval.
- `Render Gate`: batch render authorization.
- `Repair Gate`: approve expensive rerender if cost exceeds threshold.
- `Delivery Gate`: final QC before export.

For fully automated workflows, gates can be policy-driven rather than manual.

## Long-Form Quality Metrics

DirectorBench-inspired dimensions:

- Script: narrative coherence, beat order, user intent fulfillment.
- Visual: composition, identity, product accuracy, camera, lighting, style.
- Audio: dialogue, voice, music, ambience, loudness, sync.
- Cross-modal: lip-sync, beat matching, scene/audio relationship.
- Stability: temporal consistency, flicker, transition quality, long-term continuity.

Additional commercial metrics:

- brand compliance
- platform fit
- call-to-action clarity
- product legibility
- rights risk
- cost per usable second
- repair count per minute

## Failure Recovery

Failure scopes:

- `ShotLocal`: repair prompt or rerender one shot.
- `SceneLocal`: update scene references or environment ledger.
- `SequenceLocal`: replan pacing or transitions.
- `Global`: rebuild identity anchors, story arc, or provider strategy.

Default policy:

- Prefer smallest repair scope.
- Preserve approved clips.
- Reuse approved frames as anchors.
- Escalate to human only for rights, brand, or unresolved identity failures.
