# Consistency Guardian Design

## Purpose

Consistency Guardian is the quality and continuity subsystem that makes CineJelly viable for commercial long-form video. It prevents identity drift, product deformation, scene discontinuity, transition failure, audio mismatch, and silent quality regressions.

## Sources Used

- ViMax for automated consistency checking, parallel candidate generation, and VLM/MLLM-based best-frame selection.
- DirectorBench for checkpoint-level long-form diagnosis across script, visual, audio, cross-modal, and stability dimensions.
- Atlas Cloud Seedance reference guides for Identity Locking, Motion Transfer, Reference Cluster, @-tag Binding Logic, test takes, prompt hierarchy, and troubleshooting.
- Emily2040/seedance-2.0 for production QC, troubleshooting levers, safety gates, and role-specific reference mapping.
- VibeFrame for build/review reports, render inspection, and deterministic repair loops.
- OpenMontage for ffprobe validation, frame sampling, audio level analysis, subtitle checks, provider scoring, and delivery promise validation.
- MoneyPrinterTurbo for staged audio/subtitle/material/final-video generation, batch output selection, and task-progress observability patterns.

## Operating Principle

The Guardian never acts on vague quality impressions alone. It compares generated artifacts against graph contracts and produces actionable repair decisions.

## Guardian Stages

### 1. Preflight Guardian

Runs before generation.

Checks:

- storyboard panel coverage and alignment with shot contracts
- provider capability vs requested settings
- duration within provider-supported range
- resolution supported by model/schema
- video/audio references registered when required
- reference media format and dimensions
- prompt/reference contradictions
- identity references present for identity-critical shots
- motion references not overpowering identity constraints
- first/last-frame endpoints present when transition continuity matters
- unsafe IP, likeness, brand, voice, logo, or song risk
- overcrowded prompt risk
- material sourcing rights, duration, aspect, and duplication risk when stock/local materials are used

Outputs:

- `approved`
- `needs_compiler_repair`
- `needs_reference_repair`
- `needs_user_rights_review`
- `blocked`

Runtime storyboard preflight:

- Storyboard panels are generated from approved shot contracts before prompt/render spend.
- Guardian blocks render if panels are missing, duplicated, attached to unknown shots, or misaligned with approved duration, action, camera, lighting, references, or transition intent.
- Passing storyboard preflight is stored as graph inspection evidence and as `storyboard-preflight.json`.

### 2. Test Take Guardian

Runs for high-risk shots before full render.

Source basis:

- Atlas Cloud guide recommends short test takes before committing to longer renders.

Triggers:

- close-up human face
- recurring character
- product/logo macro shot
- complex motion transfer
- audio/lip-sync shot
- first scene establishing a recurring environment
- first shot after a major scene transition

Checks:

- identity lock
- product geometry
- motion feasibility
- camera intent
- lighting direction
- audio sync feasibility
- artifact severity

Runtime implementation:

- Economy skips test takes.
- Standard, High, and Ultimate render a 4-second test take for high-risk shots longer than 4 seconds.
- High-risk triggers include face, product/logo, audio sync, transition, multi-character blocking, motion/camera/audio/voice/source-video references.
- Test takes are inspected with Guardian stage `test_take` and stored as Production Graph `clip_render` evidence.
- `block` or `rerender` test-take results stop full render spend for that shot.
- `repair` test-take results append targeted Guardian repair directives to the full-render prompt before candidate generation.

### 3. Render Guardian

Runs after clip generation.

Uses:

- frame sampling
- keyframe extraction
- metadata inspection
- audio waveform/loudness checks
- VLM/MLLM comparison where available
- transcript and caption checks where relevant
- graph continuity ledgers

### 4. Timeline Guardian

Runs after assembly.

Checks:

- transition quality
- continuity across cuts
- audio bridges
- pacing
- platform duration
- caption timing
- final export integrity

Runtime delivery gate:

- FFprobe delivery inspection is evaluated before the Director Agent returns a deliverable.
- Postproduction scales and pads non-adaptive outputs onto the selected aspect-ratio canvas before delivery validation.
- The gate blocks final output when the assembled media has no video stream, zero/missing duration, or does not match the selected 480p/720p/1080p output height after postproduction scaling.
- The gate also blocks final output when FFprobe width/height does not match the selected non-adaptive aspect ratio within production tolerance.
- Audio absence is a warning when the requested audio mode expects sound, and is allowed when audio mode is `none`.
- The gate emits a machine-readable `delivery-gate.json` artifact for commercial handoff audit.

## Checkpoint Model

Inspired by DirectorBench, each inspection report contains:

- dimension
- checkpoint
- evidence
- score
- confidence
- severity
- affected graph node
- repair action

Dimensions:

- `script`
- `visual`
- `audio`
- `cross_modal`
- `stability`
- `commercial_delivery`

## Core Checkpoints

### Script

- user intent fulfilled
- sequence order coherent
- story beat not skipped
- platform hook present when required
- call to action present when requested
- source-video transformation is rights-safe and differentiated from protected source expression

### Visual

- identity preserved
- wardrobe preserved
- product geometry preserved
- product label/logo legible when rights allow
- environment consistent
- lighting consistent
- camera instruction followed
- style coherent
- no visible warping
- no unintended text/watermark/subtitles

### Audio

- dialogue present if required
- no dialogue if prohibited
- voice tone matches contract
- music/ambience matches scene
- loudness acceptable
- audio duration matches clip/timeline
- no unauthorized song/voice use

### Cross-Modal

- lip-sync acceptable
- beat cuts align with audio cue
- action matches sound effect
- narration matches visual beat
- camera/motion follows reference where specified

### Stability

- no identity drift within clip
- no identity drift across clips
- no temporal flicker
- no sudden costume or environment jumps
- transition handles align
- no major physics discontinuity

### Commercial Delivery

- selected resolution exported
- aspect ratio correct
- platform variant conforms
- watermark policy honored
- captions/subtitles validated when requested
- material sources and licenses recorded when stock/local material is used
- batch candidates recorded with selected/rejected status
- final file playable
- review packet complete

## Scoring

Scores:

- `pass`: no repair needed.
- `warn`: acceptable but record risk.
- `repair`: fix before delivery.
- `rerender`: provider render failed contract.
- `block`: rights, safety, or severe quality issue.

Severity:

- `S0`: blocks commercial delivery.
- `S1`: likely customer-visible failure.
- `S2`: noticeable quality issue.
- `S3`: minor issue or metadata risk.

## Identity Guardian

Identity is protected through:

- master identity anchors
- role-bound reference prompts
- test takes
- frame sampling
- cross-shot comparison
- endpoint frame reuse
- identity drift repair actions

Repair options:

- move identity clause earlier
- simplify subject prose
- reduce motion reference pressure
- use sharper reference asset
- add front/profile/45-degree references if provided
- add first/last frame anchor
- split long shot into shorter shots
- rerender only failed shot

## Product Guardian

Product shots are commercially fragile because geometry, material, labels, and logo placement must remain stable.

Checks:

- silhouette
- material
- color
- logo/text distortion
- packaging geometry
- hero angle
- macro detail

Repair options:

- reduce motion complexity
- use a static product plate
- use shorter clip duration
- composite exact logo/text in post when legal and necessary
- change shot scale to avoid model text rendering weakness

## Motion Guardian

Motion references must transfer action without destroying identity.

Checks:

- action follows reference
- camera follows reference if requested
- motion does not contradict text
- motion complexity fits duration
- no jitter or impossible body mechanics

Repair options:

- simplify movement
- reduce action count per clip
- shorten clip
- separate camera motion from character motion
- render as multi-shot sequence rather than one complex shot

## Transition Guardian

Transition quality is a first-class target because DirectorBench identifies between-unit transition quality as a long-form bottleneck.

Checks:

- outgoing end state matches incoming start state
- screen direction preserved unless intentionally changed
- audio bridge smooth
- lighting/color not jarring
- semantic continuity clear
- no lost character/product state

Repair options:

- generate bridge shot
- use last frame as next first frame
- rerender start/end handles
- add audio bridge
- adjust edit timing
- insert cutaway

## Audio-Visual Guardian

Atlas Cloud references Seedance 2.0 audio-visual sync and beat matching. CineJelly should inspect this instead of assuming it succeeded.

Checks:

- lip movement timing
- beat hit timing
- sound effect/action alignment
- music duration
- ambience continuity
- narration-to-visual alignment

Repair options:

- regenerate with aligned audio asset duration
- trim audio and visual handles
- post-sync sound effects
- rerender dialogue shot
- use external dubbing or caption path when model lip-sync is insufficient

## Reports

Every report should be machine-readable:

```json
{
  "node_id": "scene_02_shot_04",
  "status": "repair",
  "scores": {
    "visual.identity": 0.72,
    "visual.product": 0.95,
    "stability.transition": 0.61
  },
  "findings": [
    {
      "checkpoint": "identity_across_clip",
      "severity": "S1",
      "evidence": "face shape changes in final third",
      "repair": "shorten shot to 6s and move identity reference clause first"
    }
  ]
}
```

Runtime repair behavior:

- Render reports with `repair`, `rerender`, or `block` trigger targeted shot-level regeneration when the selected quality mode has remaining repair budget.
- Repair prompts preserve the approved shot contract and append only Guardian repair directives plus compiler repair hints.
- The Director Agent rerenders only the affected shot, never the whole video.
- If all candidates and repair attempts still fail the render gate, assembly is blocked before a deliverable can be published.

## Human Review Escalation

Escalate when:

- rights or likeness are unclear
- brand/product distortion persists after repair budget
- public figure/private person issue appears
- generated output could harm a customer campaign
- final delivery has S0/S1 findings after automated repair

## Production Guardrails

- Never overwrite approved clips unless graph revision requires it.
- Never rerender entire video for one local failure.
- Never ignore provider errors.
- Never publish with unresolved S0/S1 findings.
- Never claim a clip passed without an inspection report.
