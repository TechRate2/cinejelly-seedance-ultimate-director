# Model Provider Abstraction

## Purpose

CineJelly uses Atlas Cloud as the default provider for both LLM reasoning and Seedance 2.0 rendering, while keeping the system portable to Kie.ai, fal.ai, Runway, Replicate, direct Volcengine, or future providers.

## Sources Used

- Atlas Cloud docs overview for one API key, one endpoint, one billing account, and 300+ models.
- Atlas Cloud LLM docs for OpenAI-compatible chat completions at `https://api.atlascloud.ai/v1`.
- Atlas Cloud developer page for model-string swapping and asynchronous image/video predictions.
- Atlas Cloud CLI docs for schema inspection, media generation, and async polling.
- Atlas Cloud Asset Library guide for Seedance 2.0 reference asset registration.
- Atlas Cloud Seedance model page for T2V, I2V, reference-to-video, fast variants, Universal Reference, duration, resolution, and aspect ratio information.
- VibeFrame and OpenMontage for provider routing, cost gates, reportable provider decisions, and model flexibility.

## Design Goal

Application services should not know Atlas-specific request fields. They should ask for capabilities:

- reason over a brief
- produce structured planning JSON
- register a media asset
- render a video from text
- render a video from image
- render from references
- extend or edit a video
- poll a job
- inspect provider cost/status

The provider layer translates those requests into actual API calls.

## Provider Interfaces

### LLMProvider

```text
LLMProvider
  chat(request) -> ChatResponse
  structured(request, schema) -> StructuredResponse
  stream(request) -> AsyncTokenStream
  capabilities() -> LLMCapabilities
```

Required capabilities:

- OpenAI-compatible messages
- streaming optional
- JSON/structured output support or fallback repair
- model ID configurable
- timeout and retry policy
- cost metadata when available

Atlas implementation:

- base URL: `https://api.atlascloud.ai/v1`
- API key: `ATLASCLOUD_API_KEY`
- OpenAI SDK compatible according to Atlas docs.

### VideoProvider

```text
VideoProvider
  generate_text_to_video(request) -> Prediction
  generate_image_to_video(request) -> Prediction
  generate_reference_to_video(request) -> Prediction
  edit_video(request) -> Prediction
  extend_video(request) -> Prediction
  get_prediction(prediction_id) -> PredictionStatus
  capabilities(model_id) -> VideoCapabilities
```

Required capabilities:

- supported modes
- supported durations
- supported resolutions
- supported ratios
- supported reference types
- async polling
- output URL extraction
- error normalization
- cost metadata when available

Atlas implementation:

- default provider for Seedance 2.0 and Seedance 2.0 Fast.
- use current Atlas model schema to map fields such as prompt, image, last image, duration, resolution, ratio, generate audio, watermark, and return last frame.
- use async prediction submit/poll flow.

### AssetProvider

```text
AssetProvider
  register_asset(request) -> AssetRegistration
  get_asset(asset_id) -> AssetStatus
  wait_until_active(asset_id) -> AssetStatus
  delete_asset(asset_id) -> DeleteStatus
```

Atlas implementation:

- Asset Library host: `https://console.atlascloud.ai/api/v1`
- video/audio references must be registered before generation.
- generation host differs from asset host.
- successful assets are referenced as provider asset IDs, commonly represented in docs as `asset://<asset_id>`.

### MediaInspector

```text
MediaInspector
  probe(file_or_url) -> MediaMetadata
  sample_frames(file_or_url, policy) -> FrameSet
  inspect_audio(file_or_url) -> AudioReport
  inspect_timeline(deliverable) -> DeliveryReport
```

This is provider-neutral and may use ffprobe, frame sampling, audio analysis, and VLM/MLLM calls.

## Core Domain Types

### ProviderRequest

```json
{
  "provider": "atlascloud",
  "model_family": "seedance_2",
  "mode": "image_to_video",
  "prompt": "provider-ready prompt",
  "references": [],
  "settings": {
    "duration_seconds": 8,
    "resolution": "720p",
    "ratio": "16:9",
    "generate_audio": true,
    "watermark": false
  },
  "metadata": {
    "project_id": "project_...",
    "shot_id": "scene_01_shot_03"
  }
}
```

### ProviderCapability

```json
{
  "provider": "atlascloud",
  "model_id": "configured-at-runtime",
  "modes": ["text_to_video", "image_to_video", "reference_to_video"],
  "durations": { "min": 4, "max": 15 },
  "resolutions": ["480p", "720p", "1080p"],
  "ratios": ["adaptive", "16:9", "9:16", "1:1", "4:3", "3:4", "21:9"],
  "references": ["image", "video", "audio", "first_frame", "last_frame"],
  "async": true
}
```

Important:

- This is a desired normalized capability structure.
- Actual values must be loaded from provider docs, schema inspection, or configuration.
- If Atlas docs and articles differ, the current model schema wins.

## Atlas Cloud Default Configuration

Environment:

- `ATLASCLOUD_API_KEY`: required for both LLM and Seedance rendering.

LLM:

- Base URL: `https://api.atlascloud.ai/v1`
- Format: OpenAI ChatCompletion compatible.
- Default reasoning model should be configured, not hardcoded. Candidates can include DeepSeek, Kimi, Qwen, GLM, MiniMax, or Doubao families depending on required context length, reasoning, language, and cost.

Video:

- Default family: Seedance 2.0.
- Fast family: Seedance 2.0 Fast.
- Exact model IDs must be stored in configuration and verified through Atlas schema inspection.

Asset Library:

- Register video/audio assets before generation.
- Poll until Active.
- Use asset references in generation requests.

## Provider Selection Policy

Default:

- Atlas Cloud for all LLM and video operations.
- Seedance 2.0 for high-control cinematic and consistency work.
- Seedance 2.0 Fast for cost/speed-sensitive work.

Future provider routing:

| Need | Default | Possible Future Provider |
|---|---|---|
| Seedance 2.0 via unified API | Atlas Cloud | Kie.ai, fal.ai, Runway, Replicate, direct Volcengine |
| Complex motion realism | Atlas Cloud model router | Kling, Veo, Wan, Runway |
| Long-context script analysis | Atlas Cloud LLM | direct OpenAI, Anthropic, Google, local LLM |
| Video understanding | Atlas Cloud or local pipeline | VideoAgent-like VLM stack |
| Postproduction utilities | local tools | cloud render farms |

## Request Lifecycle

1. Application creates a provider-neutral request.
2. Provider registry resolves provider and model.
3. Capability validator checks duration, resolution, ratio, references, and mode before Asset Library registration or paid generation calls.
4. AssetProvider registers required video/audio assets.
5. VideoProvider submits generation.
6. Worker polls prediction.
7. Output is persisted to ClipRender.
8. Cost and status are logged.
9. Consistency Guardian inspects output.

## Error Normalization

All providers must normalize errors:

- `AUTHENTICATION_FAILED`
- `INSUFFICIENT_CREDITS`
- `RATE_LIMITED`
- `INVALID_SCHEMA`
- `ASSET_NOT_ACTIVE`
- `ASSET_VALIDATION_FAILED`
- `MODEL_UNAVAILABLE`
- `GENERATION_FAILED`
- `POLLING_TIMEOUT`
- `OUTPUT_MISSING`
- `UNSUPPORTED_SETTING`

## Cost Ledger

Every provider call records:

- provider
- model ID
- mode
- input references
- duration
- resolution
- prediction ID
- requested at
- completed at
- status
- estimated cost
- actual cost when available
- retry count
- graph node

Runtime implementation:

- Atlas LLM chat entries record provider-returned estimated or actual cost when the response exposes usage pricing fields.
- Atlas video submit and prediction polling entries record prediction IDs when available.
- Atlas video entries also record provider-returned estimated or actual cost when prediction usage includes those fields.

This follows VibeFrame/OpenMontage cost-gate thinking and is required for commercial operation.

## Provider Abstraction Rules

- No application service imports Atlas-specific request DTOs.
- No prompt compiler emits provider-only fields.
- No model ID is hardcoded in business logic.
- No code assumes 1080p is available for every model path.
- No code assumes reference count limits without reading provider capability.
- Capability validation must run before Asset Library registration so unsupported requests do not spend provider calls unnecessarily.
- No code passes raw video/audio URL directly to Seedance if the selected Atlas path requires Asset Library registration.
- No fallback provider is used without graph metadata recording.

## Future Provider Onboarding Checklist

1. Implement interfaces.
2. Map capabilities.
3. Add schema validation.
4. Add auth config.
5. Add request/response logging with redaction.
6. Add error normalization.
7. Add cost extraction.
8. Add asset upload or registration path.
9. Add output URL persistence.
10. Add Consistency Guardian expectations.
11. Run production validation with real paid provider calls before enabling customers.
