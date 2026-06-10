# Flexible Seedance Settings

## Purpose

This document defines user-selectable Seedance settings for CineJelly while keeping provider-specific details behind the Model Provider Abstraction Layer.

## Sources Used

- Atlas Cloud Seedance 2.0 model page for Seedance 2.0, Seedance 2.0 Fast, T2V, I2V, reference-to-video, multimodal references, aspect ratios, duration, audio-visual sync, and resolution notes.
- Atlas Cloud character consistency article for image-to-video request fields such as duration, resolution, ratio, generate audio, watermark, and return last frame.
- Atlas Cloud CLI docs for video flags such as image, images, end image, video, audio, resolution, size, duration, params JSON, and async polling.
- Atlas Cloud Asset Library guide for video/audio reference registration and media constraints.
- Emily2040/seedance-2.0 for source-dated model claims and provider-surface caveats.

## Settings Philosophy

User-facing controls should be simple:

- speed tier
- resolution
- quality mode
- aspect ratio
- duration
- audio behavior

Internal controls should remain flexible:

- provider model ID
- reference registration mode
- candidate count
- inspection depth
- test-take policy
- repair budget
- postproduction strategy

## User-Facing Settings

### Speed Tier

| Tier | User Meaning | Default Provider Path |
|---|---|---|
| Fast | Lower latency and lower cost | Atlas Cloud Seedance 2.0 Fast where schema supports requested mode |
| Standard | Balanced quality and cost | Atlas Cloud Seedance 2.0 default family |

Future optional tiers:

- `Premium`: more candidates, more inspection, more repair budget.
- `Ultimate`: maximum consistency workflow with test takes, multi-candidate render, endpoint anchors, and postproduction polish.

### Resolution

User options:

- `480p`
- `720p`
- `1080p`

Policy:

- Validate selected resolution against current provider schema.
- If 1080p is unsupported for the selected Seedance mode, either select a compatible provider/model or ask for downgrade approval according to product policy.
- Never silently downgrade.

Source notes:

- Atlas model page and examples reference 480p, 720p, and 1080p across Seedance paths and examples.
- The current model schema must be the runtime authority.

### Quality Mode

| Mode | Behavior |
|---|---|
| Economy | Minimal candidates, basic inspection, lowest cost policy |
| Standard | Normal inspection, limited repair budget, balanced render plan |
| High | Test takes for risky shots, deeper inspection, targeted rerenders |
| Ultimate | Multi-candidate renders for key shots, strict continuity, stronger postproduction polish |

The user request explicitly requires Fast/Standard selection. The additional quality modes are an extension for commercial product control.

Runtime implementation:

- Economy renders 1 candidate per shot.
- Standard renders 2 candidates per shot.
- High renders 3 candidates per shot.
- Ultimate renders 4 candidates per shot.
- The Consistency Guardian scores each candidate after render, and the Director Agent selects the best candidate by status, severity, usable output presence, latency, then candidate order.
- The Production Graph records every candidate as `clip_render` evidence while marking the selected candidate explicitly.
- The render cost gate multiplies planned render seconds and clip count by the quality-mode candidate count before enforcing `maxCostUsd`.

### Aspect Ratio

Supported user options:

- `adaptive`
- `16:9`
- `9:16`
- `1:1`
- `4:3`
- `3:4`
- `21:9`

Policy:

- `adaptive` is default when references dictate format.
- `16:9` is default for YouTube, web hero, TV, and cinematic storytelling.
- `9:16` is default for TikTok, Reels, and Shorts.
- `1:1` is default for feed-safe product focus.
- `21:9` is only used for cinematic/theatrical outputs.

### Duration

User-facing duration:

- total video target: 15 seconds to 8 minutes in product settings.
- first production target: optimize for 2 to 8 minutes.

Provider clip duration:

- Atlas sources describe Seedance 2.0 clip duration from 4 to 15 seconds.

Policy:

- Split long-form outputs into graph shots.
- Keep each provider render within supported clip duration.
- Use shorter clips for high-risk identity, product, dialogue, or transition shots.

### Audio Mode

Options:

- `none`: no generated audio.
- `native`: request provider audio generation/sync where supported.
- `guided`: use audio references or beat maps.
- `post`: generate/edit audio in postproduction.
- `hybrid`: provider audio for motion sync plus postproduction mix.

Policy:

- If audio/video references are used with Atlas Seedance, register them through Asset Library when required.
- Match audio reference duration to output clip duration where possible.
- Inspect audio-visual sync after render.

### Watermark

Default:

- `false` for paid commercial output when provider allows it.

Policy:

- If provider requires watermark for a model or plan, mark the setting unsupported for commercial delivery.

### Return Last Frame

Default:

- `true` for long-form and transition-critical workflows when provider supports it.
- `false` for low-cost single-clip workflows unless needed.

Use:

- Feed approved last frames into next-shot first-frame anchors.
- Improve transition continuity.
- Support targeted repair.

## Internal Settings Matrix

| Setting | Fast | Standard | High | Ultimate |
|---|---:|---:|---:|---:|
| Candidate count | 1 | 1-2 | 2-3 | 3+ for key shots |
| Test takes | high-risk only | high-risk only | identity/product/motion risk | broad key-shot coverage |
| Inspection depth | basic | normal | strict | strict plus timeline review |
| Repair budget | low | medium | high | highest |
| Endpoint anchors | transition risk only | important transitions | most scene transitions | all continuity-critical transitions |
| Post polish | minimal | normal | enhanced | enhanced plus upscale when selected |

## Preset Definitions

### Fast 720p

Use when:

- social ad variants
- draft preview
- low-cost exploration
- short user deadline

Settings:

- tier: Fast
- resolution: 720p
- quality mode: Economy or Standard
- candidate count: 1
- test takes: only high-risk identity/product shots
- inspection: basic plus S0/S1 blockers

### Standard 720p

Use when:

- normal customer output
- balanced quality/cost
- most commercial social videos

Settings:

- tier: Standard
- resolution: 720p
- quality mode: Standard
- candidate count: 1 to 2
- inspection: normal
- repair: targeted rerender

### Standard 1080p

Use when:

- premium customer output
- website hero video
- YouTube, sales, or product launch assets

Settings:

- tier: Standard
- resolution: 1080p if supported by selected schema
- quality mode: High
- test takes: identity/product/motion risk
- return last frame: true for long-form
- post polish: enabled

### Ultimate Long-Form

Use when:

- 2 to 8 minute videos
- recurring characters or products
- high consistency requirements
- paid campaign deliverables

Settings:

- tier: Standard or future Premium provider path
- resolution: 720p or 1080p depending on provider schema and budget
- quality mode: Ultimate
- graph shots: short enough for repairability
- identity anchors: always present for recurring characters/products
- transition anchors: first/last-frame policy
- inspection: strict DirectorBench-inspired checkpoints
- repair: targeted graph repair before delivery

## Provider Validation Rules

Before submitting a render:

1. Confirm model supports requested mode.
2. Confirm duration is within provider range.
3. Confirm resolution is supported.
4. Confirm ratio is supported.
5. Confirm reference types are supported.
6. Confirm video/audio assets are Active if required.
7. Confirm required images or first frames exist.
8. Confirm safety policy passed.
9. Confirm estimated cost is within project gate.

## Settings API Shape

```json
{
  "tier": "standard",
  "resolution": "720p",
  "quality_mode": "high",
  "ratio": "16:9",
  "duration_target_seconds": 180,
  "audio_mode": "hybrid",
  "watermark": false,
  "return_last_frame": true,
  "max_cost_usd": 50
}
```

## Runtime Fallbacks

Allowed fallback:

- Use a different Atlas model path if it preserves the same user-facing setting and capability.
- Split a shot into shorter clips if duration is unsupported.
- Use postproduction audio if native audio is unsupported.

Requires approval:

- Lowering resolution.
- Changing aspect ratio.
- Removing audio.
- Switching away from Seedance 2.0 family.
- Increasing cost beyond user budget.

Blocked:

- Silent downgrade.
- Unsupported model setting.
- Passing unregistered video/audio assets to an Atlas path that requires Asset Library.
- Publishing with a watermark when commercial output requires watermark-free delivery.
