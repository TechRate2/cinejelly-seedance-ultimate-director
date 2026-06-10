# Prompt Compiler Design

## Purpose

The Prompt Compiler turns a Production Graph shot contract into a provider-ready Seedance 2.0 prompt plus provider settings. It must support every niche without hardcoded templates.

## Sources Used

- Emily2040/seedance-2.0 for intent-first prompt routing, reference role separation, compact prompt paths, safety rewrites, troubleshooting levers, and professional shot contracts.
- YouMind-OpenLab/awesome-seedance-2-prompts for generalized prompt structure patterns: duration blocks, scene timing, camera motion, character consistency, sound cues, dialogue, lip sync, and negative constraints.
- Atlas Cloud Seedance all-round reference guide for Reference Cluster, Binding Logic, @-tag roles, identity vs motion weighting, prompt hierarchy, test takes, and troubleshooting.
- ViMax for long-script segmentation, storyboard planning, reference selection, and consistency-aware generation.
- DirectorBench for checkpoint-level quality dimensions that inform prompt repair.

## Source-Derived Principles

1. Direct the model, do not micromanage every pixel.
2. Write prompts from a production object, not from loose user text.
3. Bind references by role before writing prose.
4. Use time-bounded shot blocks for multi-shot clips.
5. Prioritize identity references when consistency matters.
6. Keep motion references strong but not dominant when identity is the commercial constraint.
7. Avoid prompt overcrowding.
8. Prefer human-readable directorial language over keyword soup.
9. Add negative constraints only when they protect actual failure modes.
10. Store model/provider claims outside prompt text unless required by provider schema.

## Compiler Inputs

The compiler reads:

- `ProjectSettings`: tier, resolution, aspect ratio, duration target, quality mode, audio mode, output format.
- `ShotContract`: shot ID, duration, scene, beat, camera, action, lighting, character/product/environment anchors, audio intent, transition handles, continuity constraints.
- `ReferenceBindingMap`: role-tagged assets with provider asset IDs or inline image URLs.
- `ContinuityLedger`: canonical identity, wardrobe, product, environment, lighting, and camera rules.
- `SafetyPolicy`: likeness, brand, copyrighted IP, voice, logos, music, and unsafe content constraints.
- `ProviderCapability`: model ID, supported modalities, supported durations, resolution, ratio, asset input format, async behavior, and provider-specific schema fields.

## Compiler Outputs

The compiler writes:

- `provider_prompt`: Seedance-ready natural language prompt.
- `reference_payload`: images, videos, audio, first frame, last frame, or asset references.
- `negative_constraints`: short list of quality and safety constraints.
- `provider_params`: duration, resolution, ratio, audio generation, watermark, return last frame, and quality fields supported by the selected schema.
- `inspection_expectations`: checklist for Consistency Guardian.
- `repair_hints`: likely prompt levers if the shot fails.

## Prompt Contract Shape

```json
{
  "shot_id": "scene_03_shot_02",
  "duration_seconds": 8,
  "intent": "show the product benefit through a controlled cinematic action",
  "reference_roles": {
    "identity": ["@Image1"],
    "environment": ["@Image2"],
    "motion": ["@Video1"],
    "audio_tempo": ["@Audio1"]
  },
  "prompt_sections": {
    "continuity": "Use the exact subject/product identity from @Image1.",
    "scene": "Place the subject in the environment established by @Image2.",
    "action": "Perform the specific action required by the beat.",
    "camera": "Use a direct camera instruction with movement and framing.",
    "lighting": "Use concise lighting and atmosphere language.",
    "audio": "Sync key motion to @Audio1 when audio is enabled.",
    "transition": "Start and end with handles that cut cleanly into neighboring shots."
  },
  "negative_constraints": [
    "no identity drift",
    "no warped logo",
    "no subtitles or watermarks unless requested"
  ]
}
```

## Adaptive Niche Handling

CineJelly must not hardcode templates such as "beauty ad", "real estate ad", or "anime short". Instead, the compiler uses reusable production primitives:

- `AudiencePurpose`: sell, explain, entertain, teach, announce, compare, narrate, dramatize.
- `PacingProfile`: calm, cinematic, high-energy, documentary, tutorial, social hook, luxury slow-burn.
- `SubjectType`: human, product, place, interface, food, fashion, vehicle, abstract concept, event.
- `ContinuityRisk`: face, product logo, outfit, environment, physics, text, multi-character blocking, audio sync.
- `PlatformTarget`: TikTok/Reels/Shorts, YouTube, TV, landing page hero, ad network, internal sales.
- `VisualGrammar`: shot scale, camera support, lens feel, lighting, color, texture, movement, edit rhythm.
- `AudioGrammar`: dialogue, whisper, narration, music bed, beat cuts, ambience, SFX, silence.

Extension based on Emily2040/seedance-2.0 and YouMind:

- Emily's skill routing becomes a compiler decision tree.
- YouMind's prompt corpus is used only to learn structural patterns, not to copy prompts.
- Atlas @-tag Binding Logic becomes a typed `ReferenceBindingMap`.

## Compilation Pipeline

1. Normalize the shot contract.
2. Validate settings against provider capability.
3. Classify reference roles.
4. Decide prompt density based on quality mode.
5. Build continuity clause.
6. Build action and camera clause.
7. Build lighting/style clause.
8. Build audio clause.
9. Build transition handle clause.
10. Build short negative constraints.
11. Run safety and contradiction checks.
12. Emit provider request and inspection expectations.

## Reference Binding Rules

Source basis:

- Emily2040 separates references by role.
- Atlas Cloud documents Reference Cluster, Binding Logic, @-tags, and asset roles.
- Atlas Cloud Asset Library requires video/audio registration before generation.

Rules:

- Identity references go first in prompt text when identity preservation is critical.
- Motion references are attached to actions, not to subject identity.
- Camera references are attached to camera language, not to character appearance.
- Environment references are attached to set continuity.
- Audio references are attached to rhythm, lip-sync, cuts, or ambience.
- First and last frames are treated as endpoint constraints.
- If source limits conflict across articles, runtime provider schema wins.

## Identity vs Motion Weighting

Atlas Cloud's all-round reference guide recommends favoring identity over motion to reduce identity drift. CineJelly encodes this as a policy, not as an unverified numeric constant:

- Default identity-critical prompt language: "Keep the exact face, wardrobe, product geometry, material, label placement, and color from the identity reference."
- Default motion language: "Borrow only the movement path/camera rhythm from the motion reference; do not alter the identity reference."
- High-risk repair: reduce motion complexity, move identity clause earlier, use sharper reference images, add first/last frame anchors.

The Atlas article mentions a 70 percent identity / 30 percent motion rule of thumb. CineJelly may expose this as an internal heuristic label, but should not represent it as a provider API parameter unless Atlas Cloud schema explicitly supports such a field.

## Time-Bounded Multi-Shot Prompts

YouMind prompt patterns often use time ranges inside a 15-second clip. CineJelly uses this pattern when a single Seedance clip needs internal cuts:

```text
Duration: 12 seconds. Shot 1, 0-4s: ...
Shot 2, 4-8s: ...
Shot 3, 8-12s: ...
```

Constraints:

- Use this only when the clip remains visually coherent.
- For long-form work, prefer separate graph shots when continuity, repairability, or transition quality matters.
- Use internal multi-shot prompts for short ads, hook sequences, or montage-like moments.

## Negative Constraint Policy

Allowed negative constraints:

- no identity drift
- no face morphing
- no warped product logo
- no extra fingers when hands are important
- no text, watermark, logo, or subtitles unless requested
- no frame flicker
- no sudden outfit changes
- no camera jump unless specified
- no mismatched lip-sync when dialogue is present

Disallowed negative constraint style:

- Long lists of generic "bad quality" words.
- Contradictory constraints.
- Unsafe evasion language.
- Hidden requests to reproduce protected IP, celebrity likeness, real private people, brand marks, songs, or voices without rights.

## Prompt Repair Matrix

| Failure | Likely Cause | Compiler Repair |
|---|---|---|
| Face drift | Identity reference weak or too late in prompt | Move identity clause first, reduce subject prose, use stronger reference, add endpoint image |
| Product logo warps | Motion too aggressive or logo too small | Reduce motion, add product geometry clause, suggest post-composited logo if required |
| Motion ignored | Motion reference not role-bound | Attach @Video role directly to action/camera clause |
| Jitter | Motion reference too complex or clip too long | Shorten duration, simplify action, render test take |
| Prompt ignored | Prompt overcrowding | Compress to directorial essentials |
| Transition mismatch | No endpoint/handle contract | Add first/last frame or transition handle clause |
| Audio out of sync | Audio duration or beat map mismatch | Align target duration, bind @Audio to beats, inspect rhythm |
| Inconsistent scene | Environment not anchored | Add environment reference and scene continuity clause |

## Commercial Prompt Safety

The compiler must run a safety pass before provider submission:

- Protected IP: rewrite into original style/function.
- Public figures and private people: require authorization or rewrite to fictional equivalent.
- Brands/logos: require user-provided rights or avoid direct reproduction.
- Songs/voices: require rights or use original soundalike-free direction.
- Unsafe or policy-sensitive content: clarify benign production context only when the intent is safe.

Source basis:

- Emily2040/seedance-2.0 copyright, filter, and safe false-positive repair lanes.

## Provider Schema Discipline

The compiler must not bake fixed Atlas model IDs or field names into prompt logic. Model IDs and request schemas belong in the provider layer.

The compiler emits provider-neutral intent:

- `mode`: text_to_video, image_to_video, reference_to_video, video_to_video, extend, edit.
- `duration_seconds`
- `resolution`
- `ratio`
- `references`
- `audio_generation`
- `watermark`
- `return_last_frame`

The provider layer translates this into the current Atlas Cloud schema.

