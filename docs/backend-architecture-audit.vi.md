# CineJelly Seedance Ultimate Director - Báo Cáo Audit Sâu Backend Có Chứng Minh Code

Ngày lập báo cáo: 2026-06-30

Branch được đọc: `codex/backend-audit-short-pipes`

Commit nền được đọc: `9143170`; báo cáo này đã được cập nhật thêm theo các thay đổi local sau vòng nâng cấp backend cuối.

Phạm vi: phân tích backend logic thật trong `src/agents`, `src/core`, `src/prompt_compiler`, `src/providers`, `src/application`, `src/config`, `src/types`, và smoke scripts liên quan. Báo cáo này được viết lại từ đầu sau khi xóa bản cũ, tập trung vào điểm yếu còn tồn tại, không dựa vào README hay báo cáo trước.

---

# 0. Kết Luận Ngắn Gọn

Backend hiện tại có nền tảng agentic khá mạnh: planner, shot chunking, prompt compiler, reference binding, render scheduler, cost gate, assembly, production graph và một số no-spend validation smoke. Sau vòng nâng cấp mới nhất, last-frame chaining đã có fallback extract ảnh cuối bằng ffmpeg khi provider không trả image sidecar, có multi-offset endpoint-frame scoring nhẹ, default Seedance đã ưu tiên `720p` + bitrate `high` + `returnLastFrame`, và prompt/audio timing đã chặt hơn. Tuy nhiên, nếu đánh giá theo tiêu chuẩn video dài 5-10 phút dùng thật ngoài thị trường, bốn nhóm rủi ro lớn còn lại vẫn có thật trong code:

1. Last-frame chaining đã robust hơn nhờ `selectOrExtractLastFrameReference()` và scoring nhẹ, nhưng vẫn phụ thuộc nguồn video có thể đọc được, cần `workDirectory`, và chưa có semantic visual score thật cho blur/crop/identity/product.
2. Continuity Bible hiện là kế hoạch trước render, không phải state sống được cập nhật sau mỗi clip render thành công.
3. Visual Semantic Inspection có implement LLM vision trên frame samples, nhưng optional và chỉ chạy sau assembly, chưa được dùng để chọn candidate hoặc tự rerender từng shot.
4. Source Video Analysis đã có frame sampling, LLM structured analysis và deterministic media metrics bằng `ffprobe/ffmpeg` cho duration/fps/audio/cut-density estimate; nhưng vẫn opt-in, mặc định tắt, chưa có ASR/OCR/caption understanding thật, và chưa tự tạo reference asset/keyframe mới từ source video.

Mức sẵn sàng thực tế cho video dài 5-10 phút: khoảng 70-78% nếu xét backend architecture và no-spend orchestration; khoảng 60-68% nếu xét vận hành thương mại có media QA thật, continuity thật qua nhiều clip, audio/source-video analysis thật và automatic repair theo visual evidence.

---

# 1. Last-Frame Chaining & Continuation Logic

## 1.1 Các file và function liên quan

Các file được đọc trực tiếp:

- `src/core/endpoint-frame-chain.ts`
- `src/agents/director-agent.ts`
- `src/core/video-render-strategy-planner.ts`
- `src/core/render-scheduler.ts`
- `src/prompt_compiler/prompt-compiler.ts`
- `src/providers/atlascloud/atlas-cloud-provider.ts`
- `src/config/seedance-settings.ts`
- `scripts/run-last-frame-chaining-smoke.mjs`

## 1.2 Provider có được yêu cầu trả last frame không?

Có. Runtime settings mặc định bật `returnLastFrame`, và payload Atlas có `return_last_frame`.

Code trong `src/types/settings.ts:106-116`:

```ts
export const DEFAULT_SEEDANCE_SETTINGS: FlexibleSeedanceSettings = {
  tier: "standard",
  resolution: "720p",
  qualityMode: "standard",
  ratio: "16:9",
  durationTargetSeconds: 120,
  audioMode: "hybrid",
  bitrateMode: "high",
  watermark: false,
  returnLastFrame: true
};
```

Code trong `src/config/seedance-settings.ts:97-112`:

```ts
export function toVideoGenerationSettings(
  settings: FlexibleSeedanceSettings,
  clipDurationSeconds: number
): VideoGenerationSettings {
  return {
    durationSeconds: clipDurationSeconds,
    resolution: settings.resolution,
    ratio: settings.ratio,
    generateAudio: settings.audioMode === "native" || settings.audioMode === "guided" || settings.audioMode === "hybrid",
    bitrateMode: settings.bitrateMode,
    watermark: settings.watermark,
    returnLastFrame: settings.returnLastFrame
  };
}
```

Code trong `src/providers/atlascloud/atlas-cloud-provider.ts:831-863`:

```ts
private toAtlasVideoPayload(request: VideoGenerationRequest): Record<string, unknown> {
  const references = request.references.map((reference) => this.toAtlasReference(reference));
  const firstImageUrl = this.firstReferenceUrl(references, ["first_frame", "image", "identity", "product", "environment", "style"]);
  const lastImageUrl = this.firstReferenceUrl(references, ["last_frame"]);

  return {
    model: request.modelId,
    prompt: request.prompt,
    duration: request.settings.durationSeconds,
    ...(firstImageUrl ? { image: firstImageUrl, image_url: firstImageUrl } : {}),
    ...(lastImageUrl ? { last_image: lastImageUrl, image_end: lastImageUrl, last_image_url: lastImageUrl, end_image_url: lastImageUrl } : {}),
    generate_audio: request.settings.generateAudio,
    watermark: request.settings.watermark,
    return_last_frame: request.settings.returnLastFrame,
    metadata: request.metadata
  };
}
```

Đánh giá: phần request xuống Atlas là đúng hướng. Nhưng việc dùng lại last frame vẫn phụ thuộc output response có URL ảnh cuối.

## 1.3 Strategy quyết định khi nào bắt buộc chaining

Code trong `src/core/video-render-strategy-planner.ts:268-318`:

```ts
private lastFrameChaining(input: {
  readonly workflowMode: VideoRenderWorkflowMode;
  readonly continuityMode: VideoRenderContinuityMode;
  readonly shotCount: number;
  readonly returnLastFrame: boolean | undefined;
}): VideoRenderStrategyPlan["lastFrameChaining"] {
  if (input.shotCount <= 1 || input.workflowMode === "single_clip" || input.workflowMode === "reference_locked_single_clip") {
    return { status: "not_needed", eligibleShotCount: 0, requiresReturnLastFrame: false, reason: "Single-clip workflows do not need inter-shot endpoint chaining." };
  }
  const eligibleShotCount = Math.max(0, input.shotCount - 1);
  const requiresReturnLastFrame = input.continuityMode === "last_frame_chaining" ||
    input.workflowMode === "source_video_guided" ||
    input.workflowMode === "sequence_bible";
  if (requiresReturnLastFrame && input.returnLastFrame === false) {
    return { status: "blocked", eligibleShotCount, requiresReturnLastFrame, reason: "The selected workflow needs provider last-frame output, but returnLastFrame is disabled." };
  }
  if (input.continuityMode === "last_frame_chaining" || input.workflowMode === "sequence_bible") {
    return { status: "required", eligibleShotCount, requiresReturnLastFrame, reason: "..." };
  }
  if (input.workflowMode === "reference_locked_multishot" || input.workflowMode === "source_video_guided") {
    return { status: "recommended", eligibleShotCount, requiresReturnLastFrame, reason: "..." };
  }
  return { status: "not_needed", eligibleShotCount: 0, requiresReturnLastFrame: false, reason: "..." };
}
```

Code trong `src/core/video-render-strategy-planner.ts:454-460` block khi user tắt last frame:

```ts
if (input.lastFrameChainingStatus === "blocked") {
  issues.push({
    severity: "block",
    code: "last_frame_chaining_requested_without_last_frame_output",
    message: "The selected workflow needs last-frame chaining but returnLastFrame is disabled.",
    repair: "Enable settings.returnLastFrame or change the workflow to an approved single-clip/reference-only mode."
  });
}
```

Đánh giá: logic chọn strategy hợp lý. Với multishot prompt-only hoặc sequence_bible, chaining có thể required. Với source/reference guided multishot, chaining recommended.

## 1.4 Render scheduler có ép sequential không?

Có. Khi strategy báo required/recommended, `DirectorAgent.strategySequentialReasons()` thêm `strategy_last_frame_chaining`.

Code trong `src/agents/director-agent.ts:732-752`:

```ts
private strategySequentialReasons(plan: VideoRenderStrategyPlan): readonly RenderScheduleSequentialReason[] {
  if (!plan.requiresSequentialRender) {
    return [];
  }
  const reasons: RenderScheduleSequentialReason[] = [];
  if (plan.lastFrameChaining.status === "required" || plan.lastFrameChaining.status === "recommended") {
    reasons.push("strategy_last_frame_chaining");
  }
  return [...new Set(reasons)].sort();
}
```

Render scheduler chạy tuần tự khi item có sequential reasons.

Code trong `src/core/render-scheduler.ts:133-152`:

```ts
public async run<TInput, TOutput>(
  items: readonly RenderScheduleItem<TInput>[],
  worker: (item: RenderScheduleItem<TInput>) => Promise<TOutput>
): Promise<readonly RenderScheduleResult<TOutput>[]> {
  const results: RenderScheduleResult<TOutput>[] = [];
  for (const batch of this.createSchedule(items)) {
    if (batch.mode === "sequential") {
      const scheduled = batch.items[0];
      results.push({
        index: scheduled.item.index,
        value: await worker(scheduled.item)
      });
    } else {
      await this.flushParallelBatch(batch.items.map((scheduled) => scheduled.item), worker, results);
    }
  }
  return results.sort((left, right) => left.index - right.index);
}
```

Đánh giá: phần orchestration để shot sau đợi shot trước là có thật và đúng.

## 1.5 Lấy last frame từ render output như thế nào?

Code nằm trong `src/core/endpoint-frame-chain.ts`.

Code chính tại `src/core/endpoint-frame-chain.ts:17-56`:

```ts
export function selectLastFrameReference(input: {
  readonly renderedShot: RenderedShot;
  readonly targetShotId: string;
}): EndpointFrameReferenceSelection | undefined {
  const candidates = input.renderedShot.prediction.outputUrls
    .map((url, index) => ({ url, index, preferred: PREFERRED_LAST_FRAME_PATTERN.test(url) }))
    .filter((candidate) => isImageOutputUrl(candidate.url));
  const selected = [...candidates].sort((left, right) => {
    if (left.preferred !== right.preferred) {
      return left.preferred ? -1 : 1;
    }
    return right.index - left.index;
  })[0];
  if (!selected) {
    return undefined;
  }

  const sourceShotId = input.renderedShot.compiledPrompt.shotId;
  return {
    sourceShotId,
    targetShotId: input.targetShotId,
    outputIndex: selected.index,
    outputUrlSha256: sha256(selected.url),
    reference: {
      role: "first_frame",
      label: `Continuity frame from ${sourceShotId}`,
      providerReference: {
        kind: "image",
        uri: selected.url,
        label: `Continuity frame from ${sourceShotId}`,
        role: "first_frame"
      },
      priority: "primary",
      selection: { sourceShotId, authorized: true }
    }
  };
}
```

`isImageOutputUrl()` chỉ nhận URL ảnh hoặc URL có query kiểu `format=png`.

Code tại `src/core/endpoint-frame-chain.ts:58-84`:

```ts
export function isImageOutputUrl(value: string): boolean {
  const parsed = outputUrl(value);
  if (!parsed) {
    return false;
  }
  if (hasImageExtension(parsed.pathname)) {
    return true;
  }
  for (const key of ["filename", "file", "name", "download", "response-content-disposition"]) {
    const queryValue = parsed.searchParams.get(key);
    if (queryValue && hasImageExtension(queryValue)) {
      return true;
    }
  }
  const format = parsed.searchParams.get("format") ?? parsed.searchParams.get("ext") ?? parsed.searchParams.get("type");
  if (format && IMAGE_EXTENSIONS.has(`.${format.toLowerCase().replace(/^image\//, "")}`)) {
    return true;
  }
  return PREFERRED_LAST_FRAME_PATTERN.test(parsed.pathname) &&
    !/\.(?:mp4|mov|webm|m4v)(?:$|[?#])/i.test(parsed.pathname);
}
```

Đánh giá quan trọng:

- `selectLastFrameReference()` vẫn là nhánh ưu tiên vì sidecar image từ provider là nhanh nhất và ít tốn xử lý nhất.
- Nếu provider trả ảnh cuối đúng pattern, hệ thống không cần mở video.
- Nếu provider chỉ trả video, nhánh mới `selectOrExtractLastFrameReference()` sẽ thử fallback extract ảnh cuối bằng ffmpeg.

Kết luận: last-frame selection hiện tại có hai tầng: ưu tiên sidecar URL, sau đó fallback extract từ video output nếu có `workDirectory`.

## 1.6 Có tự động extract last frame bằng ffmpeg không?

Có, sau vòng nâng cấp mới nhất. Function `selectOrExtractLastFrameReference()` trong `src/core/endpoint-frame-chain.ts` thử chọn image sidecar trước, nếu không có thì chọn video output và gọi `extractLastFrameImage()`.

Code mới trong `src/core/endpoint-frame-chain.ts`:

```ts
export async function selectOrExtractLastFrameReference(input: {
  readonly renderedShot: RenderedShot;
  readonly targetShotId: string;
  readonly workDirectory?: string;
  readonly signal?: AbortSignal;
}): Promise<EndpointFrameReferenceSelection | undefined> {
  const providerSidecar = selectLastFrameReference(input);
  if (providerSidecar) {
    return providerSidecar;
  }
  if (!input.workDirectory) {
    return undefined;
  }

  const selectedVideo = selectVideoOutput(input.renderedShot);
  if (!selectedVideo) {
    return undefined;
  }

  const outputPath = join(input.workDirectory, "endpoint-frames", "...jpg");
  await extractLastFrameImage(selectedVideo.url, outputPath, input.signal);
  return { extracted: true, reference: { role: "first_frame", providerReference: { kind: "image", uri: outputPath } } };
}
```

Code extract thật:

```ts
const ENDPOINT_FRAME_EXTRACTION_OFFSETS_SECONDS = [0.1, 0.3, 0.6, 1] as const;

async function extractBestLastFrameImage(input): Promise<ExtractedEndpointFrameCandidate | undefined> {
  for (const offsetSeconds of ENDPOINT_FRAME_EXTRACTION_OFFSETS_SECONDS) {
    await extractLastFrameImage(input.sourceUrlOrPath, outputPath, offsetSeconds, input.signal);
    const fileSizeBytes = (await stat(outputPath)).size;
    candidates.push({ outputPath, offsetSeconds, fileSizeBytes, score: endpointFrameScore(fileSizeBytes, offsetSeconds) });
  }
  return candidates.sort((left, right) => right.score - left.score)[0];
}
```

Đánh giá:

- Đây là cải thiện quan trọng vì workflow `required` không còn chỉ phụ thuộc image sidecar.
- Fallback hiện thử nhiều mốc gần cuối clip, bỏ frame quá nhỏ, chọn frame có score tốt hơn dựa trên độ lớn file và độ gần endpoint.
- Fallback vẫn cần ffmpeg đọc được `sourceUrlOrPath`. Nếu provider trả URL có token hết hạn, stream không seek được, hoặc môi trường thiếu `workDirectory`, function sẽ trả `undefined` và để logic required/recommended xử lý như trước.
- Smoke test `scripts/run-last-frame-chaining-smoke.mjs` đã có case tạo MP4 synthetic bằng ffmpeg và xác nhận fallback tạo ảnh local role `first_frame`, có `qualityStrategy=ffmpeg_multi_offset`, candidate count và quality score.

## 1.7 Shot sau được inject last frame như thế nào?

Luồng nằm trong `DirectorAgent.prepareChainedRenderItem()`.

Code `src/agents/director-agent.ts:802-891`:

```ts
private prepareChainedRenderItem<TValue>(input: {
  readonly item: RenderScheduleItem<TValue>;
  readonly previousRenderedShot: RenderedShot | undefined;
  readonly videoRenderStrategyPlan: VideoRenderStrategyPlan;
  readonly settings: FlexibleSeedanceSettings;
  readonly modelId: string;
  readonly continuityLedger: ReturnType<ContinuityLedgerBuilder["build"]>;
}) {
  if (!this.shouldApplyLastFrameChaining(input.videoRenderStrategyPlan)) {
    return { shot: input.item.shot, compiledPrompt: this.renderItemCompiledPrompt(input.item), preflight: this.renderItemPreflight(input.item) };
  }
  if (input.item.index === 0) {
    return { shot: input.item.shot, compiledPrompt: this.renderItemCompiledPrompt(input.item), preflight: this.renderItemPreflight(input.item) };
  }
  if (!input.previousRenderedShot) {
    throw new Error("Last-frame chaining expected a previous rendered shot before provider spend.");
  }

  const selection = await selectOrExtractLastFrameReference({
    renderedShot: input.previousRenderedShot,
    targetShotId: input.item.shot.shotId,
    workDirectory: input.workDirectory
  });
  if (!selection) {
    if (input.videoRenderStrategyPlan.lastFrameChaining.status === "required") {
      throw new Error(
        `Last-frame chaining required for ${input.item.shot.shotId}, but previous shot ${input.previousRenderedShot.compiledPrompt.shotId} returned no usable image sidecar or extractable endpoint frame.`
      );
    }
    return { shot: input.item.shot, compiledPrompt: this.renderItemCompiledPrompt(input.item), preflight: this.renderItemPreflight(input.item) };
  }

  const chainedShot: ShotContract = {
    ...shotWithoutSelectionPlan,
    references: [
      selection.reference,
      ...input.item.shot.references.filter((reference) => reference.role !== "first_frame")
    ],
    continuity: {
      ...input.item.shot.continuity,
      previousShotEndState: input.item.shot.continuity.previousShotEndState ??
        runtimeContinuityBridge
    },
    metadata: {
      ...(input.item.shot.metadata ?? {}),
      chainedFromShotId: selection.sourceShotId,
      chainReferenceRole: "first_frame",
      chainReferenceUrlSha256: selection.outputUrlSha256,
      chainReferenceExtracted: selection.extracted ? "true" : "false",
      chainRuntimeContinuityBridge: runtimeContinuityBridge
    }
  };
  const compiledPrompt = this.promptCompiler.compile({ shot: chainedShot, settings: input.settings, modelId: input.modelId, provider: "atlascloud" });
  const preflight = this.consistencyGuardian.preflight({ shot: chainedShot, prompt: compiledPrompt.prompt, negativePrompt: compiledPrompt.negativePrompt, bindingPlan: compiledPrompt.bindingPlan, ledger: input.continuityLedger });
}
```

Đánh giá:

- Shot 1 không chain.
- Shot 2 trở đi lấy previousRenderedShot.
- Nếu chọn được image sidecar, nó biến image đó thành reference role `first_frame`.
- Nó xóa các `first_frame` cũ để tránh conflict, rồi inject reference mới vào đầu danh sách.
- Metadata chỉ lưu hash URL, không leak raw URL vào báo cáo public.
- Sau inject, prompt được compile lại và Guardian preflight chạy lại.

## 1.8 Prompt sau khi inject có đủ câu continuation không?

Có tương đối nhiều câu continuation trong prompt compiler. Chúng không phải hardcode template theo niche, mà là contract chung cho continuity.

Code `src/prompt_compiler/prompt-compiler.ts:58-79` cho thấy prompt gồm các section về reference, continuity, pacing, motion continuity, inter-shot bridge, boundary choreography, final frame:

```ts
const sections = [
  this.buildReferenceHandlePrelude(bindingPlan, providerMode),
  `Shot ${shot.shotId}, ${shot.durationSeconds}s.`,
  `Intent: ${shot.intent}.`,
  this.buildReferenceSection(bindingPlan),
  this.buildProviderModeContractSection(providerMode, bindingPlan),
  this.buildContinuitySection(shot),
  this.buildPacingSection(shot),
  this.buildMotionContinuitySection(shot, bindingPlan),
  this.buildInterShotBridgeSection(shot),
  this.buildBoundaryChoreographySection(shot, bindingPlan),
  ...
  this.buildFinalFrameSection(shot, bindingPlan),
  "Keep the result cinematic, coherent, and physically plausible."
];
```

Khi có first_frame/last_frame, prompt có endpoint priority.

Code `src/prompt_compiler/prompt-compiler.ts:132-136`:

```ts
roles.has("first_frame") || roles.has("last_frame")
  ? "Endpoint priority: first-frame and last-frame references define the clip handles for chaining; motion must move between them without warping identity or product details."
  : undefined
```

Prompt có inter-shot bridge.

Code `src/prompt_compiler/prompt-compiler.ts:288-299`:

```ts
private buildInterShotBridgeSection(shot: ShotContract): string {
  const previousState = shot.continuity.previousShotEndState;
  const nextState = shot.continuity.nextShotStartState;
  const bridgeLines = [
    "Inter-shot bridge: this clip must cut together with adjacent clips as one continuous film, not as a disconnected standalone generation.",
    previousState ? `Start by matching the prior clip endpoint: ${previousState}.` : "Start with a clean readable handle that can accept a prior xfade or first-frame chain.",
    nextState ? `End by preparing the next clip start: ${nextState}.` : "End with a clean readable handle that can accept xfade, cut, or last-frame chaining.",
    "Keep screen direction, camera momentum, subject scale, lighting color, room tone, and action state consistent across the edit boundary."
  ];
}
```

Prompt có boundary choreography.

Code `src/prompt_compiler/prompt-compiler.ts:317-331`:

```ts
"Boundary choreography: stage this ... clip so the first frame, action middle, and final frame can assemble without a visible reset.",
hasPreviousState
  ? "Entry: match the prior endpoint before introducing new motion; keep the same screen direction, lens distance, subject scale, lighting color, and product/KOL state."
  : "Entry: open on a stable readable first frame before the camera or subject starts moving.",
"Exit: hold the final 0.5s as a clean review/delivery handle with no unresolved whip, blur, blink, or cropped product.",
"Do not rely on postproduction crossfade to hide inconsistent generated endpoints; the generated frames themselves must already match the edit plan."
```

Đánh giá:

- Prompt đủ mạnh ở mức prose.
- Có nhấn mạnh identity, product, lighting, screen direction, camera momentum, endpoint.
- Tuy nhiên, đây là prompt-only control. Không có post-render visual verification per boundary để đảm bảo model thật làm đúng.

## 1.9 Flow diagram last-frame chaining hiện tại

```text
User request
  -> normalize settings, returnLastFrame mặc định true
  -> StoryArchitect tạo storyPlan
  -> ShotPlanner chia beat thành shot 4-15s, thêm previousShotEndState / nextShotStartState
  -> VideoRenderStrategyPlanner quyết định lastFrameChaining = required / recommended / blocked / not_needed
  -> RenderScheduler ép sequential nếu cần chaining
  -> Render shot 1
       -> RenderProducer gọi Atlas
       -> Prediction.outputUrls nhận video URL + có thể có image sidecar
       -> ConsistencyGuardian.inspectRender chỉ check status/outputUrls/latency
  -> Render shot 2
       -> prepareChainedRenderItem(previousRenderedShot=shot1)
       -> selectOrExtractLastFrameReference(shot1.outputUrls, workDirectory)
           -> nếu có URL ảnh last/final/end frame: tạo PromptReference role first_frame
           -> nếu không có sidecar nhưng có video output đọc được: ffmpeg extract ảnh cuối vào endpoint-frames/*.jpg
           -> nếu không có:
              - required: throw, block trước provider spend shot 2
              - recommended: fallback prompt cũ, render không chain
       -> promptCompiler.compile(chainedShot)
       -> ConsistencyGuardian.preflight(chainedShot)
       -> RenderProducer gọi Atlas bằng image_to_video/reference mode
  -> Lặp cho shot kế tiếp
  -> AssemblyEngine ghép clip
  -> Optional semantic visual inspection sau assembly nếu request bật
```

## 1.10 Độ robust khi scale video dài

Mạnh:

- Strategy biết khi nào phải chain.
- Scheduler biết ép sequential.
- Prompt compiler có continuation prose tốt.
- Có fallback ffmpeg để tự tạo ảnh endpoint khi provider chỉ trả video output.
- Smoke test `scripts/run-last-frame-chaining-smoke.mjs` xác nhận shot 2+ nhận `first_frame`, mode chuyển `image_to_video`, có chain metadata và fallback extract ảnh cuối hoạt động.

Bằng chứng smoke `scripts/run-last-frame-chaining-smoke.mjs:75-93`:

```js
provider.requests.length === 3
publicRequests[0]?.hasFirstFrameReference === false &&
  publicRequests.slice(1).every((request) => request.hasFirstFrameReference)
publicRequests.slice(1).every((request) => request.mode === "image_to_video")
result.renderSchedulePlan.sequentialItemCount === 3
```

Yếu:

- Nếu Atlas trả URL video không đọc/seek được, hoặc môi trường không có `workDirectory`, fallback extract vẫn không thể chạy.
- Không có boundary visual QA từng cặp shot.
- Quality score hiện là deterministic/lightweight, chưa phải visual semantic QA để hiểu frame bị blur, blink, crop sản phẩm, lệch mặt, hay sai identity.
- Recommended mode fallback im lặng sang prompt-only nếu sidecar và ffmpeg fallback đều thiếu. Điều này có thể làm video dài drift mà user không biết.

---

# 2. Global Consistency Bible & Cross-Chunk Continuity

## 2.1 Có Global Character Bible / Style Bible không?

Có, nhưng implementation hiện là ledger trước render, không phải global bible động sau render.

Code `src/core/continuity-ledger-builder.ts:11-22`:

```ts
export class ContinuityLedgerBuilder {
  public build(input: {
    readonly intake: IntakeResult;
    readonly storyPlan: StoryPlan;
  }): ContinuityLedger {
    const beats = input.storyPlan.scenes.flatMap((scene) => scene.beats);
    return {
      characters: this.buildCharacterBibles(beats, input.intake),
      styles: this.buildStyleBibles(beats),
      approvedShotIds: []
    };
  }
}
```

Character bible lấy identity từ beat continuity và identity references.

Code `src/core/continuity-ledger-builder.ts:24-39`:

```ts
private buildCharacterBibles(beats: readonly BeatPlan[], intake: IntakeResult): readonly CharacterBible[] {
  const identityReferenceLabels = intake.references
    .filter((reference) => reference.role === "identity")
    .map((reference) => reference.label);
  const identities = this.unique(
    beats
      .map((beat) => beat.continuity.identity)
      .filter((identity): identity is string => Boolean(identity?.trim()))
  );

  return identities.map((identity) => ({
    characterId: identity,
    identityDescription: identity,
    requiredReferenceLabels: identityReferenceLabels
  }));
}
```

Style bible lấy style từ beat.

Code `src/core/continuity-ledger-builder.ts:41-56`:

```ts
private buildStyleBibles(beats: readonly BeatPlan[]): readonly StyleBible[] {
  const styleValues = this.unique(
    beats
      .flatMap((beat) => [beat.style, beat.continuity.style])
      .filter((style): style is string => Boolean(style?.trim()))
  );

  return styleValues.map((style) => ({
    styleId: style,
    visualRules: [style],
    prohibitedDrift: [
      "change visual style",
      "unrelated visual style",
      "inconsistent style"
    ]
  }));
}
```

Đánh giá:

- Có character/style bible ở mức deterministic ledger.
- Bible này không có ảnh canonical mới sinh sau render.
- Không có lighting bible riêng biệt, lighting nằm trong shot/beat text.
- Không có product bible type riêng trong `ContinuityLedgerBuilder`, product chỉ nằm trong shot continuity và long-form anchors.

## 2.2 Có LongFormContinuityPlan / sequence bible không?

Có. `LongFormContinuityPlanner` gom anchors theo sequence, global anchors, bridge intent.

Code `src/core/long-form-continuity-planner.ts:33-97`:

```ts
public build(input: {
  readonly projectId: string;
  readonly storyPlan: StoryPlan;
  readonly shots: readonly ShotContract[];
  readonly references?: readonly PromptReference[];
  readonly sourceVideoAnalysis?: SourceVideoDeconstruction;
}): LongFormContinuityPlan {
  const groups = this.sequencePlanner.plan({ projectId: input.projectId, storyPlan: input.storyPlan });
  const sequencesWithoutBridges = groups.map((group) => {
    const sceneIds = group.scenes.map((scene) => scene.sceneId);
    const beats = group.scenes.flatMap((scene) => scene.beats);
    const shots = input.shots.filter((shot) => shot.sceneId && sceneIds.includes(shot.sceneId));
    const anchors = this.sequenceAnchors(beats, shots, input.references ?? []);
    const riskCodes = uniqueValues(shots.flatMap((shot) => shot.risks));
    return { ..., anchors, riskCodes, renderModeRecommendation: this.renderModeRecommendation(riskCodes, anchors) };
  });
  const globalAnchors = mergeAnchors(sequences.map((sequence) => sequence.anchors));
  return { ..., globalAnchors, sequences };
}
```

Sequence anchors gom identity/product/environment/style/source-video scene IDs.

Code `src/core/long-form-continuity-planner.ts:99-134`:

```ts
private sequenceAnchors(...): LongFormContinuityAnchors {
  const references = [...projectReferences, ...shots.flatMap((shot) => shot.references)];
  return {
    identity: uniqueValues([...beats.map((beat) => beat.continuity.identity), ...shots.map((shot) => shot.continuity.identity), ...references.filter((reference) => reference.role === "identity" || reference.role === "wardrobe").map((reference) => reference.label)]),
    product: uniqueValues([...beats.map((beat) => beat.continuity.product), ...shots.map((shot) => shot.continuity.product), ...references.filter((reference) => reference.role === "product").map((reference) => reference.label)]),
    environment: uniqueValues([...]),
    style: uniqueValues([...]),
    sourceVideoSceneIds: uniqueValues(references.filter((reference) => reference.role === "source_video_structure").map((reference) => reference.selection?.sourceSceneId))
  };
}
```

Bridge giữa sequence có mô tả continuity.

Code `src/core/long-form-continuity-planner.ts:150-171`:

```ts
private bridge(current, next): LongFormSequenceBridge {
  const sharedAnchors = sharedAnchorLabels(current.anchors, next.anchors);
  const requiredAnchors = sharedAnchors.length > 0 ? sharedAnchors : uniqueValues([...]).slice(0, 4);
  return {
    nextSequenceId: next.sequenceId,
    bridgeIntent: [
      `${current.closingBeat} -> ${next.openingBeat}`,
      "Preserve shared anchors, screen direction, camera momentum, lighting color, room tone, product/KOL scale, and endpoint action state so the sequence cut feels continuous."
    ].join(". ").slice(0, 420),
    requiredAnchors
  };
}
```

Đánh giá:

- Có sequence-level continuity plan.
- Có global anchors và bridge intent.
- Nhưng plan này chủ yếu dùng cho readiness/timeline/review evidence, không được truyền trực tiếp vào `SeedancePromptCompiler.compile()` như một Bible object toàn cục.

## 2.3 Bible có được inject vào mọi prompt không?

Không theo nghĩa "inject toàn bộ Global Bible". Prompt compiler chỉ nhận `ShotContract`, không nhận `LongFormContinuityPlan`.

Bằng chứng `src/prompt_compiler/prompt-compiler.ts:19-31`:

```ts
export class SeedancePromptCompiler {
  public compile(input: PromptCompilerInput): CompiledPrompt {
    const referencesForBinding = input.shot.referenceSelectionPlan?.selectedReferences ?? input.shot.references;
    const bindingPlan = buildPromptBindingPlan({ references: referencesForBinding, risks: input.shot.risks, ... });
    const providerMode = this.resolveMode(bindingPlan);
    const prompt = this.buildPrompt(input.shot, bindingPlan, providerMode);
    ...
  }
}
```

`PromptCompilerInput` không có `continuityPlan` hay `globalBible`. Prompt được build từ:

- `shot.continuity`
- `shot.references`
- `shot.timeline`
- `shot.transitionIntent`
- `bindingPlan`

Shot continuity được thêm bởi `ShotPlanner.withAdjacentContinuityStates()`.

Code `src/core/shot-planner.ts:103-123`:

```ts
private withAdjacentContinuityStates(shots: readonly ShotContract[]): readonly ShotContract[] {
  return shots.map((shot, index) => {
    const previous = shots[index - 1];
    const next = shots[index + 1];
    return {
      ...shot,
      continuity: {
        ...shot.continuity,
        ...(previous && !shot.continuity.previousShotEndState ? { previousShotEndState: this.endpointState(previous, "end") } : {}),
        ...(next && !shot.continuity.nextShotStartState ? { nextShotStartState: this.endpointState(next, "start") } : {})
      }
    };
  });
}
```

Đánh giá:

- Mọi prompt có shot-level continuity.
- Nhưng Global Bible không được serialize và inject đầy đủ vào từng prompt.
- Nếu một anchor chỉ tồn tại trong `longFormContinuityPlan.globalAnchors` nhưng không nằm trong từng `shot.continuity` hoặc `shot.references`, prompt compiler không tự thấy anchor đó.

## 2.4 Có reconcile / cập nhật bible sau render thành công không?

Không tìm thấy. `ContinuityLedgerBuilder` chạy trước render trong `DirectorAgent.run()`.

Code `src/agents/director-agent.ts:207-229`:

```ts
const preparedRequest = await this.prepareRequestForIntake(request, signal);
const intake = this.intakeDirector.intake(preparedRequest);
const storyPlan = await this.storyArchitect.plan(intake, signal);
const continuityLedger = this.continuityLedgerBuilder.build({ intake, storyPlan });
const plannedShots = this.shotPlanner.plan(...);
const shots = this.referenceSelectionPlanner.planForShots({ shots: plannedShots });
const longFormContinuityPlan = this.longFormContinuityPlanner.build({ projectId, storyPlan, shots, references: intake.references, ... });
```

Sau render, `ProductionGraphRunRecorder.record()` chỉ ghi evidence.

Code `src/core/production-graph-run-recorder.ts:19-75`:

```ts
public record(input: {
  readonly graph: ProductionGraphSnapshot;
  readonly renderedShots: readonly RenderedShot[];
  readonly deliverable?: AssembledDeliverable;
  readonly settings: FlexibleSeedanceSettings;
}): ProductionGraphSnapshot {
  const nodes: ProductionGraphNode[] = [...input.graph.nodes];
  const edges: ProductionGraphEdge[] = [...input.graph.edges];
  for (const renderedShot of input.renderedShots) {
    const shotId = renderedShot.compiledPrompt.shotId;
    const preflightNode = this.inspectionNode(shotId, renderedShot.preflight);
    nodes.push(preflightNode);
    ...
  }
  return { nodes, edges };
}
```

Không có hàm cập nhật `continuityLedger`, `longFormContinuityPlan`, hoặc `shot.continuity` sau khi có visual inspection/render output.

Đánh giá: Bible hiện là planned bible, không phải live bible. Nó chưa học lại từ render thật.

## 2.5 ConsistencyGuardian có check cross-shot / cross-chunk không?

Một phần trước render, không phải bằng hình ảnh sau render.

Guardian preflight gọi:

Code `src/core/consistency-guardian.ts:35-45`:

```ts
public preflight(input: PreflightInput): GuardianReport {
  const findings: GuardianFinding[] = [
    ...this.validateShotBasics(input.shot),
    ...this.validateReferences(input.shot, input.bindingPlan),
    ...this.validateBindingPlan(input.bindingPlan),
    ...this.validateContinuity(input),
    ...this.validatePromptDensity(input.prompt, input.negativePrompt),
    ...this.validateTimeline(input.shot)
  ];
  return this.toReport(input.shot.shotId, "preflight", findings);
}
```

`validateContinuity()` check character required reference labels và style prohibited drift.

Code `src/core/consistency-guardian.ts:379-415`:

```ts
private validateContinuity(input: PreflightInput): readonly GuardianFinding[] {
  const findings: GuardianFinding[] = [];
  for (const character of input.ledger.characters) {
    const requiresCharacter = input.shot.continuity.identity?.includes(character.characterId);
    if (!requiresCharacter) continue;
    const labels = new Set(input.shot.references.map((reference) => reference.label));
    const missingLabels = character.requiredReferenceLabels.filter((label) => !labels.has(label));
    if (missingLabels.length > 0) {
      findings.push({ checkpoint: "character_bible_reference", ... });
    }
  }
  for (const style of input.ledger.styles) {
    const violatesRule = style.prohibitedDrift.some((rule) => input.prompt.toLowerCase().includes(rule.toLowerCase()));
    if (violatesRule) {
      findings.push({ checkpoint: "style_bible_drift", ... });
    }
  }
  return findings;
}
```

Đánh giá:

- Có check một shot so với ledger toàn cục.
- Không so sánh frame shot N với frame shot N+1.
- Không check product/lighting/environment bằng vision.
- Không check cross-chunk identity drift sau render.

Production Graph có hàm `repairAffectedNodes()` để tìm downstream nodes.

Code `src/core/production-graph.ts:75-94`:

```ts
public repairAffectedNodes(nodeId: string): readonly ProductionGraphNode[] {
  this.requireNode(nodeId);
  const visited = new Set<string>();
  const queue = [nodeId];
  while (queue.length > 0) {
    const current = queue.shift();
    visited.add(current);
    for (const edge of this.listEdges().filter((candidate) => candidate.fromNodeId === current)) {
      if (edge.type === "depends_on" || edge.type === "transitions_to" || edge.type === "requires_repair") {
        queue.push(edge.toNodeId);
      }
    }
  }
  return [...visited].map((id) => this.getNode(id));
}
```

Nhưng runtime render loop không gọi hàm này để rebuild/rerender downstream. Recorder chỉ thêm repair_action evidence.

---

# 3. Visual Semantic Inspection

## 3.1 SemanticVisualInspector implement như thế nào?

Nó có thật và dùng multimodal LLM qua `image_url` data URL.

Code `src/core/semantic-visual-inspector.ts:51-126`:

```ts
public async inspect(
  frames: readonly FrameSample[],
  options: SemanticVisualInspectionOptions,
  signal?: AbortSignal
): Promise<SemanticVisualInspectionReport> {
  if (!options.enabled) {
    return { status: "pass", frameCount: 0, findings: [], reviewedFrames: [] };
  }
  const reviewedFrames = frames.slice(0, options.maxFrames);
  if (reviewedFrames.length === 0) {
    return { status: "warn", frameCount: 0, findings: [{ checkpoint: "frame_samples", ... }], reviewedFrames };
  }

  const frameParts = await Promise.all(
    reviewedFrames.map(async (frame) => ({
      type: "image_url" as const,
      image_url: { url: await this.toDataUrl(frame.path) }
    }))
  );

  const response = await this.llmProvider.structured<VisualInspectionJson, typeof VISUAL_INSPECTION_SCHEMA>(
    {
      modelId: options.modelId ?? this.defaultModelId,
      instruction: "Review sampled video frames for commercial delivery quality...",
      schema: VISUAL_INSPECTION_SCHEMA,
      messages: [...]
    },
    signal
  );

  return {
    status: response.value.status,
    frameCount: reviewedFrames.length,
    findings: response.value.findings,
    reviewedFrames
  };
}
```

Nó check theo system prompt:

```ts
"Check identity drift, product distortion, temporal coherence, visual artifacts, composition, and delivery blockers."
```

Đánh giá: implementation có khả năng gọi LLM vision thật nếu provider LLM hỗ trợ image_url/data URL.

## 3.2 Tại sao optional?

Vì request phải truyền `semanticVisualInspectionOptions.enabled=true`, và phải có `frameSamplingOptions` để assembly tạo frame samples.

Type request trong `src/types/agent.ts:49-52`:

```ts
readonly frameSamplingOptions?: FrameSamplingOptions;
readonly semanticVisualInspectionOptions?: SemanticVisualInspectionOptions;
readonly sourceVideoAnalysis?: SourceVideoDeconstruction;
```

Assembly chỉ sample frames nếu request có `frameSamplingOptions`.

Code `src/core/assembly-engine.ts:180-183`:

```ts
const frameSamples = input.frameSamplingOptions
  ? await this.mediaInspector.sampleFrames(outputPath, input.frameSamplingOptions, signal)
  : undefined;
```

DirectorAgent chỉ gọi semantic inspector khi deliverable có samples và option enabled.

Code `src/agents/director-agent.ts:659-666`:

```ts
const semanticVisualInspection =
  deliverable?.frameSamples && preparedRequest.semanticVisualInspectionOptions?.enabled
    ? await this.requireSemanticVisualInspector().inspect(
        deliverable.frameSamples,
        preparedRequest.semanticVisualInspectionOptions,
        signal
      )
    : undefined;
```

Đánh giá: mặc dù `SemanticVisualInspector` được wire trong factory, nó không tự chạy. Nó là opt-in request-level.

## 3.3 ConsistencyGuardian có gọi visual inspection không?

Không. `ConsistencyGuardian.inspectRender()` chỉ check deterministic provider status, output URL và latency.

Code `src/core/consistency-guardian.ts:215-251`:

```ts
public inspectRender(input: RenderInspectionInput): GuardianReport {
  const findings: GuardianFinding[] = [];

  if (input.prediction.status !== "succeeded") {
    findings.push({ checkpoint: "provider_status", status: "rerender", ... });
  }

  if (input.prediction.outputUrls.length === 0) {
    findings.push({ checkpoint: "output_presence", status: "block", ... });
  }

  if (input.prediction.latencyMs && input.prediction.latencyMs > 20 * 60 * 1000) {
    findings.push({ checkpoint: "latency", status: "warn", ... });
  }

  return this.toReport(input.shot.shotId, "render", findings);
}
```

Không có frame, image, pixel, identity, product distortion, motion coherence, audio-sync check trong Guardian render stage.

## 3.4 Nếu không bật visual inspection, hệ thống dựa vào gì?

Trong default runtime:

1. Preflight trước render:
   - Shot duration 4-15s.
   - Reference binding.
   - Character/style ledger.
   - Prompt density.
   - Timeline bounds.

2. Render inspection sau provider:
   - Provider status.
   - Có output URL không.
   - Latency.

3. Assembly delivery:
   - FFprobe kiểm video stream, duration, width/height, audio stream.

Code delivery media inspection `src/core/media-inspector.ts:67-91`:

```ts
public inspectDelivery(metadata: MediaMetadata): DeliveryInspectionReport {
  const findings: string[] = [];
  const videoStream = metadata.streams.find((stream) => stream.type === "video");
  const audio = this.inspectAudio(metadata);

  if (!videoStream) findings.push("No video stream detected.");
  if (!metadata.durationSeconds || metadata.durationSeconds <= 0) findings.push("Media duration is missing or zero.");
  if (videoStream && (!videoStream.width || !videoStream.height)) findings.push("Video stream is missing width or height.");
  if (audio.findings.length > 0) findings.push(...audio.findings);

  return { status: findings.some(...) ? "fail" : findings.length > 0 ? "warn" : "pass", findings };
}
```

Đánh giá: nếu không bật semantic visual inspection, hệ thống có thể giao một clip "file hợp lệ" nhưng mặt KOL lệch, sản phẩm méo, nhịp diễn sai, hoặc cảnh không tự nhiên mà backend không biết.

## 3.5 Rủi ro khi visual inspection không bật mặc định

Rủi ro cao cho thương mại:

- Candidate selection chọn theo Guardian deterministic, không theo chất lượng hình ảnh.
- Repair loop sửa theo provider status/output/latency, không sửa drift/méo/không tự nhiên.
- Long-form 5-10 phút tích lũy lỗi qua nhiều clip, nhưng visual inspection sau assembly nếu bật cũng quá muộn để chọn candidate từng shot.
- Không có cross-boundary visual QA: frame cuối shot N và frame đầu shot N+1 có khớp không.

---

# 4. Source Video Analysis & Enrichment

## 4.1 Logic phân tích source video nằm ở đâu?

Các file:

- `src/core/source-video-auto-analyzer.ts`
- `src/core/source-video-media-metrics-analyzer.ts`
- `src/agents/source-video-analyst.ts`
- `src/agents/source-video-reference-metadata-enricher.ts`
- `src/agents/intake-director.ts`
- `src/agents/story-architect.ts`

## 4.2 Auto analysis được bật như thế nào?

Mặc định tắt.

Code `src/config/runtime-config.ts:212-231`:

```ts
export function loadSourceVideoAutoAnalysisSettings(env: NodeJS.ProcessEnv = process.env): SourceVideoAutoAnalysisSettings {
  return {
    enabled: optionalBooleanEnv("CINEJELLY_ENABLE_SOURCE_VIDEO_AUTO_ANALYSIS", env, false),
    workDirectory: optionalPathEnv("CINEJELLY_SOURCE_VIDEO_ANALYSIS_WORK_DIR", env) ?? DEFAULT_SOURCE_VIDEO_ANALYSIS_WORK_DIR,
    frameIntervalSeconds: optionalIntegerEnv("CINEJELLY_SOURCE_VIDEO_ANALYSIS_FRAME_INTERVAL_SECONDS", env, DEFAULT_SOURCE_VIDEO_ANALYSIS_FRAME_INTERVAL_SECONDS),
    maxFrames: optionalIntegerEnv("CINEJELLY_SOURCE_VIDEO_ANALYSIS_MAX_FRAMES", env, DEFAULT_SOURCE_VIDEO_ANALYSIS_MAX_FRAMES),
    failOnError: optionalBooleanEnv("CINEJELLY_SOURCE_VIDEO_ANALYSIS_FAIL_ON_ERROR", env, false)
  };
}
```

Factory chỉ tạo analyzer khi enabled.

Code `src/application/director-factory.ts:42-48`:

```ts
const sourceVideoAutoAnalyzer = settings.sourceVideoAutoAnalysis.enabled
  ? new SourceVideoAutoAnalyzer({
      llmProvider: atlasProvider,
      defaultModelId: settings.atlasCloud.models.llmModel
    })
  : undefined;
```

DirectorAgent chỉ prepare request nếu analyzer tồn tại và settings enabled.

Code `src/agents/director-agent.ts:992-1000`:

```ts
private async prepareRequestForIntake(request: CineJellyProjectRequest, signal: AbortSignal | undefined): Promise<CineJellyProjectRequest> {
  if (!this.sourceVideoAutoAnalyzer || !this.sourceVideoAutoAnalysisSettings?.enabled) {
    return request;
  }
  return this.sourceVideoAutoAnalyzer.prepareRequest(request, this.sourceVideoAutoAnalysisSettings, signal);
}
```

Đánh giá: đây là opt-in env-level feature, không phải default behavior.

## 4.3 Auto analyzer làm được gì?

Code `src/core/source-video-auto-analyzer.ts:98-155`:

```ts
public async prepareRequest(
  request: CineJellyProjectRequest,
  settings: SourceVideoAutoAnalysisSettings,
  signal?: AbortSignal
): Promise<CineJellyProjectRequest> {
  if (!settings.enabled || request.sourceVideoAnalysis) {
    return request;
  }

  const sourceReference = this.sourceVideoReference(request.references ?? []);
  if (!sourceReference) return request;

  const sourceUri = this.safeHttpsSourceUri(sourceReference);
  if (!sourceUri) return request;

  try {
    const [frames, mediaMetrics] = await Promise.all([
      this.mediaInspector.sampleFrames(sourceUri, { enabled: true, outputDirectory: settings.workDirectory, intervalSeconds: settings.frameIntervalSeconds, maxFrames: settings.maxFrames }, signal),
      this.safeAnalyzeMediaMetrics(sourceUri, settings, signal)
    ]);
    if (frames.length === 0) throw new Error("Source-video auto analysis produced no frame samples.");

    const analysis = await this.analyzeFrames({ userInput: request.userInput, sourceReference, frames: frames.slice(0, settings.maxFrames), mediaMetrics, signal });
    const normalized = this.sourceVideoAnalyst.normalize({ ...analysis, mediaMetrics }, request.references ?? []);
    if (!normalized || !this.hasUsableAnalysis(normalized)) throw new Error("Source-video auto analysis returned no usable deconstruction content.");
    this.assertNoFrameLeakage(normalized, frames);
    return { ...request, sourceVideoAnalysis: normalized };
  } catch (error) {
    if (settings.failOnError) throw error;
    return request;
  }
}
```

LLM structured output yêu cầu scene/keyframe/pacing/style/structural beats/safety.

Trước khi gọi LLM, `SourceVideoMediaMetricsAnalyzer` dùng `ffprobe` để lấy duration, bitrate, format, video width/height/fps, audio stream; sau đó dùng `ffmpeg` scene detection bounded window để ước lượng cut density và rhythm label.

Code mới trong `src/core/source-video-media-metrics-analyzer.ts`:

```ts
export class SourceVideoMediaMetricsAnalyzer {
  public async analyze(sourceUri: string, signal?: AbortSignal): Promise<SourceVideoMediaMetrics> {
    const metadata = await this.mediaInspector.probe(sourceUri, signal);
    const sceneCutTimestampsSeconds = await this.detectSceneCuts(sourceUri, signal);
    return this.toMetrics(sourceUri, metadata, sceneCutTimestampsSeconds, true);
  }
}
```

Code `src/core/source-video-auto-analyzer.ts:173-208`:

```ts
const response = await this.llmProvider.structured<SourceVideoAnalysisJson, typeof SOURCE_VIDEO_ANALYSIS_SCHEMA>(
  {
    modelId: this.defaultModelId,
    instruction:
      "Return bounded source-video deconstruction JSON only. Build a beat-map style analysis: timeline beats, cut rhythm, camera grammar, performance beats, audio energy, retention mechanics, and replacement/safety constraints. Do not include local frame paths, data URLs, signed URLs, or copied transcript wording.",
    schema: SOURCE_VIDEO_ANALYSIS_SCHEMA,
    messages: [...]
  },
  input.signal
);
```

Đánh giá:

- Có frame sampling thật bằng ffmpeg.
- Có media metrics thật bằng ffprobe/ffmpeg: duration/fps/aspect/audio presence/cut-density estimate/rhythm label.
- Có LLM vision-ish structured analysis nếu provider hỗ trợ image_url.
- Có leakage guard không cho data URL/local frame path lọt vào output.
- Có safe HTTPS URL guard.

## 4.4 Giới hạn của source-video analysis

`safeHttpsSourceUri()` chỉ cho HTTPS sạch, không nhận local path hay URL nội bộ.

Code `src/core/source-video-auto-analyzer.ts:262-279`:

```ts
private safeHttpsSourceUri(reference: PromptReference): string | undefined {
  let parsed: URL;
  try { parsed = new URL(reference.providerReference.uri); } catch { return undefined; }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || isBlockedHostname(parsed.hostname)) {
    return undefined;
  }
  for (const [key, value] of parsed.searchParams.entries()) {
    if (SECRET_QUERY_TEXT_PATTERN.test(key) || SECRET_QUERY_TEXT_PATTERN.test(value)) {
      return undefined;
    }
  }
  parsed.hash = "";
  return parsed.toString();
}
```

`SourceVideoAnalyst.normalize()` normalize caller/LLM-supplied deconstruction và giữ lại `mediaMetrics` đã được backend tạo/validate.

Code `src/agents/source-video-analyst.ts:19-53`:

```ts
export class SourceVideoAnalyst {
  public normalize(value: SourceVideoDeconstruction | undefined, references: readonly PromptReference[]): SourceVideoDeconstruction | undefined {
    if (!value) return undefined;
    const sourceReferenceLabel = this.sourceReferenceLabel(value.sourceReferenceLabel, references);
    const transformationIntent = this.cleanOptionalText(value.transformationIntent, "transformationIntent");
    const transcript = this.normalizeTranscript(value.transcript);
    const scenes = this.normalizeScenes(value.scenes);
    const mediaMetrics = this.normalizeMediaMetrics(value.mediaMetrics);
    const pacingNotes = this.normalizeNotes(value.pacingNotes, "pacingNotes");
    ...
    if (!this.hasUsableAnalysis(normalized)) {
      throw new Error("sourceVideoAnalysis must include at least one ...");
    }
    return normalized;
  }
}
```

Không có audio transcription thật. `transcript` chỉ là field trong JSON, không có Whisper/ASR pipeline trong source-video auto analyzer. Không có OCR/caption detection thật. Scene/cut analysis hiện là deterministic estimate từ ffmpeg scene threshold, không phải hiểu semantic shot-boundary hay motion vectors sâu. Phần hình ảnh vẫn dựa vào LLM nhìn sampled frames.

## 4.5 Có tự động extract reference từ source video không?

Không theo nghĩa tạo asset/keyframe mới. Enricher chỉ gắn metadata vào references đã tồn tại.

Code `src/agents/source-video-reference-metadata-enricher.ts:31-71`:

```ts
export class SourceVideoReferenceMetadataEnricher {
  public enrich(input: SourceVideoReferenceMetadataEnrichmentInput): readonly PromptReference[] {
    const scenes = input.sourceVideoAnalysis?.scenes ?? [];
    if (scenes.length === 0) {
      return input.references;
    }

    const keyframesByUri = this.keyframesByUri(scenes);
    return input.references.map((reference) =>
      this.enrichReference({ reference, sourceVideoAnalysis: input.sourceVideoAnalysis, scenes, keyframesByUri })
    );
  }

  private enrichReference(input): PromptReference {
    const exactKeyframe = input.keyframesByUri.get(input.reference.providerReference.uri);
    if (exactKeyframe) {
      return this.mergeSelection(input.reference, this.selectionFromKeyframe(input.reference, exactKeyframe));
    }
    if (input.reference.role === "source_video_structure" && input.sourceVideoAnalysis?.sourceReferenceLabel && input.reference.label === input.sourceVideoAnalysis.sourceReferenceLabel) {
      const firstScene = input.scenes[0];
      if (firstScene) {
        return this.mergeSelection(input.reference, this.selectionFromScene(firstScene, 0));
      }
    }
    return input.reference;
  }
}
```

Đánh giá:

- Nếu analysis keyframe có URI trùng với một reference đã có, metadata được enrich.
- Nếu source video reference label match, nó gắn scene đầu.
- Không tự extract frame image từ source video thành `PromptReference`.
- Không upload extracted keyframes lên Atlas asset library.

## 4.6 Source video đi vào story planning như thế nào?

`IntakeDirector` normalize sourceVideoAnalysis và enrich references.

Code `src/agents/intake-director.ts:37-55`:

```ts
const references = this.referenceLibrarian.normalize({ projectId, references: request.references ?? [] });
const sourceVideoAnalysis = this.sourceVideoAnalyst.normalize(request.sourceVideoAnalysis, references);
const enrichedReferences = this.sourceVideoReferenceMetadataEnricher.enrich({
  references,
  ...(sourceVideoAnalysis ? { sourceVideoAnalysis } : {})
});
return { ..., references: enrichedReferences, ...(sourceVideoAnalysis ? { sourceVideoAnalysis } : {}) };
```

`StoryArchitect` đưa source video brief vào LLM.

Code `src/agents/story-architect.ts:82-114`:

```ts
public async plan(intake: IntakeResult, signal?: AbortSignal): Promise<StoryPlan> {
  const response = await this.llmProvider.structured(
    {
      instruction:
        "Create a production-ready video scene plan... If sourceVideoAnalysis is present, use it only for original pacing, structure, camera grammar, and style transformation; do not copy exact shots, transcript wording, likenesses, logos, or protected expression.",
      messages: [
        { role: "system", content: "..." },
        {
          role: "user",
          content: JSON.stringify({
            userInput: intake.userInput,
            settings: intake.settings,
            referenceCount: intake.references.length,
            ...(intake.sourceVideoAnalysis ? { sourceVideoAnalysis: this.sourceVideoBrief(intake.sourceVideoAnalysis) } : {})
          })
        }
      ]
    },
    signal
  );
}
```

`sourceVideoBrief()` cắt scenes/transcript/notes giới hạn.

Code `src/agents/story-architect.ts:366-395`:

```ts
private sourceVideoBrief(value: SourceVideoDeconstruction): Record<string, unknown> {
  return {
    sceneCount: value.scenes?.length ?? 0,
    transcriptCueCount: value.transcript?.length ?? 0,
    scenes: (value.scenes ?? []).slice(0, 80).map((scene) => ({ sceneId, startSecond, endSecond, summary, pacing, camera, audio, visualStyle, keyframes: ... })),
    transcript: (value.transcript ?? []).slice(0, 160).map((cue) => ({ startSecond, endSecond, text: cue.text })),
    pacingNotes: (value.pacingNotes ?? []).slice(0, 60),
    styleNotes: (value.styleNotes ?? []).slice(0, 60),
    structuralBeats: (value.structuralBeats ?? []).slice(0, 80),
    safetyNotes: (value.safetyNotes ?? []).slice(0, 60)
  };
}
```

Đánh giá: source video ảnh hưởng planning thật. Chất lượng hiện dựa vào caller-supplied analysis hoặc opt-in auto analysis gồm frame sampling, deterministic media metrics, và LLM frame analysis.

---

# 5. Tổng Hợp Đánh Giá Và Chứng Minh

## 5.1 Những điểm yếu báo cáo trước nêu có đúng không?

Có. Đối chiếu code:

1. Last-frame fidelity trước đây yếu, hiện đã được nâng cấp:
   - `selectLastFrameReference()` vẫn chọn URL ảnh từ `prediction.outputUrls` trước.
   - `selectOrExtractLastFrameReference()` bổ sung fallback ffmpeg extract last frame từ video output.
   - Required chain chỉ block khi cả sidecar lẫn fallback extraction đều không có usable frame.

2. Visual QA chưa mặc định:
   - `SemanticVisualInspector` có implement LLM vision, nhưng `DirectorAgent` chỉ gọi khi có `deliverable.frameSamples` và `semanticVisualInspectionOptions.enabled`.
   - `ConsistencyGuardian.inspectRender()` không nhìn frame.

3. Bible chưa sống:
   - `ContinuityLedgerBuilder` và `LongFormContinuityPlanner` build trước render.
   - Không thấy code reconcile/update sau render.
   - Prompt compiler không nhận `LongFormContinuityPlan` trực tiếp.

4. Source-video remake chưa thật sự "clone học 100%":
   - Có frame sampling, media metrics và LLM beat-map, nhưng opt-in.
   - Có duration/fps/audio presence/cut-density estimate, nhưng chưa có audio ASR/OCR/semantic shot-boundary/motion-vector extraction thực.
   - Không tự tạo keyframe references.

## 5.2 Mức sẵn sàng cho video dài 5-10 phút

Đánh giá theo layer:

- Planning/story/shot chunking: 78-85%. Có StoryArchitect, ShotPlanner, timeline 3 phase, duration 4-15s, story arc metadata.
- Sequential orchestration/chaining: 80-87%. Có required/recommended strategy, scheduler sequential, prompt recompile, sidecar-first, ffmpeg fallback và endpoint-frame score nhẹ. Yếu còn lại là chưa có semantic visual score theo identity/product/blur/crop.
- Prompt continuity: 82-88%. Prompt compiler có reference handles, endpoint priority, runtime continuity bridge, boundary choreography, final frame.
- Cross-render visual consistency: 45-55%. Có optional semantic visual after assembly, nhưng chưa per-shot/cross-shot/default.
- Source-video understanding: 62-72%. Có frame-based LLM analysis opt-in, deterministic duration/fps/audio/cut-density metrics, nhưng chưa ASR/OCR/semantic shot-boundary/motion-vector/reference extraction.
- Commercial long-form runtime: 64-72%. Có nhiều gates, evidence và automatic endpoint extraction fallback, nhưng thiếu live media QA + live continuity bible + repair propagation thật.

Kết luận: nếu chỉ dùng backend hiện tại cho 5-10 phút, nên coi là "có nền tảng tốt nhưng cần operator review và benchmark live", không nên gọi là tự động tuyệt đối kiểu Topview/Higgsfield-level.

## 5.3 Top 5 điểm yếu nghiêm trọng nhất và hướng sửa code-level

### Điểm yếu 1: Endpoint-frame score đã có, nhưng chưa có semantic endpoint QA

Ảnh hưởng:

- Chaining không còn sidecar-only và đã có score nhẹ, nhưng score hiện dựa trên file size + recency, không hiểu nội dung ảnh.
- Nếu frame cuối bị motion blur, blink, crop sản phẩm, lệch mặt, hoặc ánh sáng sai, shot kế tiếp vẫn có thể kế thừa lỗi nếu file vẫn hợp lệ.

Fix đề xuất:

Mở rộng service hiện tại thành semantic endpoint selector:

```ts
export class SemanticEndpointFrameSelector {
  public async selectBestEndpoint(input: {
    readonly renderedShot: RenderedShot;
    readonly workDirectory: string;
  }): Promise<PromptReference | undefined> {
    // 1. dùng sidecar/fallback candidates hiện có
    // 2. sample thêm endpoint alternatives nếu cần
    // 3. optional vision/image QA: blur, crop, visible product, face/identity, lighting continuity
    // 4. chọn frame đủ rõ và hợp continuity nhất
    // 5. trả PromptReference role first_frame kind image + semantic score metadata
  }
}
```

Chỗ nối:

- Mở rộng `selectOrExtractLastFrameReference()` để nhận optional semantic inspector.
- Ghi thêm `chainEndpointFrameSemanticScore` và reason codes vào metadata.
- Nếu workflow `required` và semantic score dưới ngưỡng, block/rerender shot trước thay vì chain từ frame xấu.

### Điểm yếu 2: Visual semantic inspection không chạy per candidate

Ảnh hưởng:

- Candidate selection có thể chọn clip hợp lệ về file nhưng xấu về hình.
- Repair loop không sửa identity/product drift.

Fix đề xuất:

Tạo `RenderedCandidateMediaInspector`:

```ts
export class RenderedCandidateMediaInspector {
  public async inspectCandidate(input: {
    readonly candidate: RenderCandidate;
    readonly shot: ShotContract;
    readonly compiledPrompt: CompiledPrompt;
    readonly workDirectory: string;
    readonly semanticOptions: SemanticVisualInspectionOptions;
  }): Promise<GuardianReport> {
    // materialize video output
    // sample frames: first/middle/last hoặc interval
    // SemanticVisualInspector.inspect(frames, expectations)
    // map SemanticVisualFinding -> GuardianFinding
  }
}
```

Chỗ nối:

- Trong `DirectorAgent.renderCandidate()`, sau `inspectRender()`, merge deterministic Guardian + semantic Guardian.
- `selectBestCandidate()` sẽ chọn theo semantic status/severity.
- Repair prompt lấy recommendation từ visual findings.

### Điểm yếu 3: Continuity Bible không được cập nhật sau render

Ảnh hưởng:

- Nếu clip 1 thực tế lệch ánh sáng/pose, clip 2 vẫn dùng planned bible, không biết trạng thái thật.
- Long-form càng dài càng drift.

Fix đề xuất:

Tạo `ContinuityStateTracker`:

```ts
export interface RenderedContinuityState {
  shotId: string;
  firstFrameSummary?: string;
  lastFrameSummary?: string;
  identityState?: string;
  productState?: string;
  lightingState?: string;
  environmentState?: string;
  confidence: number;
}

export class ContinuityStateTracker {
  public updateFromVisualInspection(...): RenderedContinuityState;
  public nextShotContinuityPatch(previous: RenderedContinuityState): Partial<ShotContinuity>;
}
```

Chỗ nối:

- Sau render candidate selected, visual inspector tóm tắt first/last frame.
- Trước `prepareChainedRenderItem()` compile shot kế tiếp, merge `previousShotEndState` bằng actual state, không chỉ planned state.

### Điểm yếu 4: Source-video analysis chưa có ASR/OCR/audio-energy/semantic boundary thực

Ảnh hưởng:

- Remake đã có cut-density/rhythm estimate, nhưng chưa hiểu lời thoại, caption/on-screen text, audio energy curve, motion vectors, hoặc semantic shot boundary.
- LLM nhìn vài frame cộng media metrics vẫn chưa đủ để học toàn bộ performance/edit rhythm như một video-understanding stack chuyên dụng.

Fix đề xuất:

Mở rộng `SourceVideoAutoAnalyzer` từ metrics extractor hiện tại thành pipeline nhiều extractor:

```ts
export class SourceVideoMediaAnalyzer {
  public async analyze(input: { uri: string; workDirectory: string }): Promise<SourceVideoDeconstruction> {
    // đã có: ffprobe duration/fps/audio streams
    // đã có: ffmpeg scene detection: select='gt(scene,0.35)'
    // cần thêm: audio energy extraction: astats hoặc ffprobe audio frames
    // optional ASR provider: transcript cues
    // optional OCR provider: captions/on-screen text
    // keyframe export + asset registration
  }
}
```

Chỗ nối:

- `SourceVideoAutoAnalyzer.prepareRequest()` hiện đã gọi media metrics analyzer trước LLM.
- Mở rộng để LLM nhận thêm audio energy, OCR/ASR, semantic boundary, motion-vector summaries.
- `SourceVideoReferenceMetadataEnricher` tự tạo `PromptReference` cho extracted keyframes nếu operator approves.

### Điểm yếu 5: Production Graph chưa điều khiển repair propagation runtime

Ảnh hưởng:

- Có graph và repair_action evidence, nhưng runtime chưa dùng graph để rebuild only affected downstream nodes.
- Auto rerender hiện local ở candidate/shot, không graph-aware theo sequence.

Fix đề xuất:

Tạo `GraphRepairOrchestrator`:

```ts
export class GraphRepairOrchestrator {
  public planRepair(input: {
    graph: ProductionGraph;
    failedNodeId: string;
    guardianReport: GuardianReport;
  }): RepairExecutionPlan {
    const affected = graph.repairAffectedNodes(failedNodeId);
    // classify: prompt-only, reference-rebind, shot-replan, downstream-rerender
  }
}
```

Chỗ nối:

- Khi Guardian/SemanticVisualInspector trả repair/rerender/block, gọi graph repair plan.
- Với downstream nodes bị ảnh hưởng bởi `transitions_to`, recompile prompts và rerender theo minimal set.
- Lưu repair plan vào `ProductionGraphRunRecorder` và `ReviewPacketBuilder`.

---

# 6. Kết Luận Cuối

Backend hiện tại không phải template cứng. Nó đã có nhiều phần đúng hướng: chiến lược multishot, return last frame, ffmpeg fallback extraction, endpoint-frame score nhẹ, sequential rendering, reference binding, prompt bridge, continuity ledger, long-form continuity plan, source-video media metrics + LLM frame analysis opt-in, semantic visual inspector opt-in, assembly/ffprobe validation và production graph evidence.

Nhưng để đạt mức "siêu tự động, mọi niche, long-form 5-10 phút, remake video bám rất sát, thương mại mạnh", phần còn thiếu không nằm ở việc thêm nhiều prompt nữa. Điểm nghẽn thật trong code là:

- thiếu semantic endpoint-frame QA trước khi dùng làm continuity frame;
- thiếu visual QA per-shot/per-candidate/per-boundary;
- thiếu live continuity bible được cập nhật từ output thật;
- thiếu source-video analysis sâu gồm ASR/OCR/audio-energy/motion-vector/semantic boundary;
- thiếu repair orchestration dựa trên graph để sửa đúng node và downstream.

Nói ngắn: kiến trúc đã có xương sống tốt, nhưng fidelity engine còn chưa đủ sâu. Muốn lên đẳng cấp thương mại thật, cần biến các evidence/planning module hiện tại thành vòng lặp media-aware: render -> inspect visual/audio thật -> update continuity state -> repair/rerender targeted -> mới assemble/deliver.
