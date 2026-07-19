#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultOutput = "assets/output_deliverables/business-readiness/short-mvp-ui-contract-smoke-report.json";
const defaultStyleStorePath = "assets/output_deliverables/business-readiness/short-mvp-ui-contract-smoke/channel-styles.json";
const defaultSessionStorePath = "assets/output_deliverables/business-readiness/short-mvp-ui-contract-smoke/sessions.json";
const defaultShortStudioOutputDir = "assets/output_deliverables/business-readiness/short-mvp-ui-contract-smoke/default-storage";

function parseArgs(args) {
  const options = {
    outputPath: defaultOutput,
    styleStorePath: defaultStyleStorePath,
    sessionStorePath: defaultSessionStorePath,
    writeReport: true
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--no-output") {
      options.writeReport = false;
      continue;
    }
    if (arg === "--output") {
      options.outputPath = readRequiredValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--style-store") {
      options.styleStorePath = readRequiredValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--session-store") {
      options.sessionStorePath = readRequiredValue(args, index, arg);
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function readRequiredValue(args, index, flag) {
  const value = args[index + 1];
  if (!value) {
    throw new Error(`Expected a value after ${flag}.`);
  }
  return value;
}

function assertRepoRelativeJsonPath(path, flag) {
  if (extname(path).toLowerCase() !== ".json") {
    throw new Error(`${flag} must point to a JSON file.`);
  }
  if (isAbsolute(path)) {
    throw new Error(`${flag} must be repo-relative so smoke setup cannot remove or write outside the workspace.`);
  }
  const absolutePath = resolve(repoRoot, path);
  const relativePath = relative(repoRoot, absolutePath);
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new Error(`${flag} must stay inside the repository workspace.`);
  }
}

const options = parseArgs(process.argv.slice(2));
assertRepoRelativeJsonPath(options.outputPath, "--output");
assertRepoRelativeJsonPath(options.styleStorePath, "--style-store");
assertRepoRelativeJsonPath(options.sessionStorePath, "--session-store");
assertSmokeStorePath(options.styleStorePath, "--style-store", dirname(defaultStyleStorePath));
assertSmokeStorePath(options.sessionStorePath, "--session-store", dirname(defaultSessionStorePath));

const styleStorePath = resolve(repoRoot, options.styleStorePath);
const sessionStorePath = resolve(repoRoot, options.sessionStorePath);
rmSync(dirname(styleStorePath), { recursive: true, force: true });
mkdirSync(dirname(styleStorePath), { recursive: true });

function assertSmokeStorePath(path, flag, allowedDir) {
  const absolutePath = resolve(repoRoot, path);
  const parentDir = dirname(absolutePath);
  const absoluteAllowedDir = resolve(repoRoot, allowedDir);
  const relativeToAllowedDir = relative(absoluteAllowedDir, parentDir);
  if (relativeToAllowedDir && (relativeToAllowedDir.startsWith("..") || isAbsolute(relativeToAllowedDir))) {
    throw new Error(`${flag} parent directory must stay inside ${allowedDir} so smoke cleanup cannot remove unrelated files.`);
  }
}

const clientAKey = "client-a-short-mvp-ui-key-2026";
const clientBKey = "client-b-short-mvp-ui-key-2026";
const port = 22_000 + Math.floor(Math.random() * 4_000);

const { readShortChannelStyleLibraryPath } = await import("../dist/api/short-channel-style-library-store.js");
const { readShortPipelineSessionStorePath } = await import("../dist/api/short-pipeline-session-store.js");
const derivedDefaultStyleStorePath = readShortChannelStyleLibraryPath({
  CINEJELLY_OUTPUT_DIR: defaultShortStudioOutputDir
});
const derivedDefaultSessionStorePath = readShortPipelineSessionStorePath({
  CINEJELLY_OUTPUT_DIR: defaultShortStudioOutputDir
});
const normalizedDerivedDefaultStyleStorePath = derivedDefaultStyleStorePath.replace(/\\/g, "/");
const normalizedDerivedDefaultSessionStorePath = derivedDefaultSessionStorePath.replace(/\\/g, "/");

process.env.PORT = String(port);
process.env.CINEJELLY_SHORT_CHANNEL_STYLE_LIBRARY_PATH = styleStorePath;
process.env.CINEJELLY_SHORT_PIPELINE_SESSION_STORE_PATH = sessionStorePath;
process.env.CINEJELLY_DISABLE_API_RATE_LIMIT = "true";
process.env.CINEJELLY_API_CLIENTS_JSON = JSON.stringify([
  { clientId: "client_a", keySha256: sha256(clientAKey), enabled: true },
  { clientId: "client_b", keySha256: sha256(clientBKey), enabled: true }
]);

const { startServer } = await import("../dist/api/server.js");
const server = startServer(port);
const baseUrl = `http://127.0.0.1:${port}`;
const clientAHeaders = {
  "Content-Type": "application/json",
  "X-CineJelly-Api-Key": clientAKey
};
const clientBHeaders = {
  "Content-Type": "application/json",
  "X-CineJelly-Api-Key": clientBKey
};
const requestSafeVisualBibleModes = new Set(["auto", "off", "reference_board", "storyboard_board", "production_bible"]);

let report;
try {
  await waitForHealth(baseUrl);

  const createPage = await fetch(`${baseUrl}/short/create`);
  const createPageHtml = await createPage.text();
  const unauthorizedSessions = await fetch(`${baseUrl}/v1/short-pipeline/conversation-sessions`);
  const videoPipeCatalog = await getJson(`${baseUrl}/v1/short-pipeline/video-pipes`, clientAHeaders);
  const savedStyle = await postJson(`${baseUrl}/v1/short-pipeline/channel-styles`, clientAHeaders, channelStyleBody());
  const profileId = savedStyle.body.channelStyle?.profileId;
  const listA = await getJson(`${baseUrl}/v1/short-pipeline/channel-styles`, clientAHeaders);
  const detailA = await getJson(`${baseUrl}/v1/short-pipeline/channel-styles/${encodeURIComponent(profileId)}`, clientAHeaders);
  const detailB = await getJson(`${baseUrl}/v1/short-pipeline/channel-styles/${encodeURIComponent(profileId)}`, clientBHeaders);
  const uiContract = await postJson(`${baseUrl}/v1/short-pipeline/ui-contract`, clientAHeaders, planBody(profileId));
  const remakeUiContract = await postJson(`${baseUrl}/v1/short-pipeline/ui-contract`, clientAHeaders, remakePlanBody(profileId));
  const visualBibleUiContract = await postJson(`${baseUrl}/v1/short-pipeline/ui-contract`, clientAHeaders, {
    ...planBody(profileId),
    mediaReferences: [],
    visualBible: {
      mode: "reference_board",
      imageProviderPolicy: "provider_neutral",
      requireBeforeRender: true
    }
  });
  const productionBibleUiContract = await postJson(`${baseUrl}/v1/short-pipeline/ui-contract`, clientAHeaders, {
    ...planBody(profileId),
    requestId: "req_short_mvp_ui_production_bible_001",
    userPrompt: "Create a 90 second branded mini sequence for Glow Focus Serum with recurring Mina host identity, product proof beats, stable audio rhythm, and a clear ending payoff.",
    targetDurationSeconds: 90,
    visualBible: {
      mode: "production_bible",
      imageProviderPolicy: "provider_neutral",
      requireBeforeRender: true
    }
  });
  const bothStyleSources = await postJson(`${baseUrl}/v1/short-pipeline/ui-contract`, clientAHeaders, {
    ...planBody(profileId),
    channelStyle: channelStyleBody()
  });
  const clientBPlan = await postJson(`${baseUrl}/v1/short-pipeline/ui-contract`, clientBHeaders, planBody(profileId));
  const createdSession = await postJson(
    `${baseUrl}/v1/short-pipeline/conversation-sessions`,
    clientAHeaders,
    conversationBody(profileId)
  );
  const invalidRequestIdSession = await postJson(
    `${baseUrl}/v1/short-pipeline/conversation-sessions`,
    clientAHeaders,
    {
      ...conversationBody(profileId),
      requestId: "strict_runtime_ui_audit_without_req_prefix"
    }
  );
  const sessionId = createdSession.body.session?.sessionId;
  const sessionUi = await getJson(
    `${baseUrl}/v1/short-pipeline/conversation-sessions/${encodeURIComponent(sessionId)}/ui-contract`,
    clientAHeaders
  );
  const rawStyleStore = readFileSync(styleStorePath, "utf8");
  const rawSessionStore = readFileSync(sessionStorePath, "utf8");
  const createPageLeakDetected = containsAny(createPageHtml, [
    clientAKey,
    clientBKey,
    "C:\\Users\\Admin",
    "ATLASCLOUD_API_KEY",
    "sk-secret",
    "Bearer secret"
  ]);
  const createPageHasFiveCreationModeWiring = [
    'data-mode-button="short_video"',
    'data-mode-button="product_kol_ugc"',
    'data-mode-button="storyboard_multishot"',
    'data-mode-button="video_remake"',
    'data-mode-button="production_bible"'
  ].every((needle) => createPageHtml.includes(needle));
  const createPageHasRealPayloadWiring =
    createPageHtml.includes("function preferredTemplateIdPayload()") &&
    createPageHtml.includes("function visualBiblePayload()") &&
    createPageHtml.includes("preferredTemplateId") &&
    createPageHtml.includes("visualBible") &&
    createPageHtml.includes('max="480"') &&
    createPageHtml.includes("production_bible_story");
  const createPageRealModeClean =
    !/--(?:asset|template|beat)-img\s*:\s*url\(\s*["']https?:\/\//iu.test(createPageHtml) &&
    !/\$21\.38|fake\s+balance|demo\s+balance/i.test(createPageHtml) &&
    !/<textarea\b(?=[^>]*\bid="prompt\b)[^>]*>\s*(?!<\/textarea>)\S[\s\S]*?<\/textarea>/iu.test(createPageHtml) &&
    !/<input\b(?=[^>]*\bid="(?:product-title|category|claim)\b)[^>]*\bvalue=/iu.test(createPageHtml) &&
    !/class="template-card\s+active"/iu.test(createPageHtml);
  const createPagePatternStarterLanguageClean =
    !/>\s*Templates\s*<|>\s*Template source intake\s*<|>\s*Template structure summary\s*<|Template loaded:|template intake|template\/video structure/iu.test(createPageHtml);
  // The 3-step wizard is plan-first: the primary action of step 2 (id="create-session") builds the
  // plan + price WITHOUT provider spend ("Xem giá & kế hoạch"), and paid rendering is a separate,
  // explicit step-3 action (id="wz-create" "🎬 Tạo video"). So the first action is still NOT an
  // immediate paid generate — the review-gated intent holds under the new self-serve wizard.
  const createPageReviewGatedActionLanguage =
    !/id="create-session"[^>]*>\s*(?:Generate Video|Tạo video|Create video)\s*<\/button>|>\s*Estimated cost\s*</iu.test(createPageHtml) &&
    createPageHtml.includes('data-i18n="wz.buildPlan"') &&
    createPageHtml.includes('id="wz-create"');
  const createPageSecurityHeadersPassed = htmlSecurityHeadersPass(createPage.headers);
  const rawLeakDetected = containsAny(`${rawStyleStore}\n${rawSessionStore}`, [
    "C:\\Users\\Admin",
    "api_key=secret",
    "token=secret",
    "sk-secret",
    "Bearer secret"
  ]);
  const ui = uiContract.body.uiContract;
  const remakeUi = remakeUiContract.body.uiContract;
  const visualBibleUi = visualBibleUiContract.body.uiContract;
  const productionBibleUi = productionBibleUiContract.body.uiContract;
  const sessionUiContract = sessionUi.body.uiContract;
  const catalogPipes = Array.isArray(videoPipeCatalog.body?.pipes) ? videoPipeCatalog.body.pipes : [];
  const catalogProductionPipe = catalogPipes.find((pipe) => pipe.mode === "production_bible");
  const catalogVideoRemakePipe = catalogPipes.find((pipe) => pipe.mode === "video_remake");
  const catalogHasPipeCapabilityPolicy = catalogPipes.length === 5 &&
    catalogPipes.every((pipe, index) =>
      pipe.uiLayout?.displayStyle === "navigation_tab" &&
      pipe.uiLayout?.navigationOrder === index + 1 &&
      Array.isArray(pipe.uiLayout?.primarySettingIds) &&
      pipe.uiLayout.primarySettingIds.includes("duration_seconds") &&
      pipe.uiLayout.primarySettingIds.includes("resolution") &&
      pipe.uiLayout.primarySettingIds.includes("review_before_spend") &&
      pipe.capabilityPolicy?.providerClipMaxSeconds === 15 &&
      pipe.capabilityPolicy?.autoRouteProviderMode === true &&
      pipe.capabilityPolicy?.userCannotPickRawProviderModel === true &&
      pipe.capabilityPolicy?.requiresReviewBeforeSpend === true &&
      Array.isArray(pipe.capabilityPolicy?.providerModes) &&
      pipe.capabilityPolicy.providerModes.includes(pipe.defaultSeedanceMode) &&
      Array.isArray(pipe.capabilityPolicy?.modelTierOptions) &&
      pipe.capabilityPolicy.modelTierOptions.includes(pipe.preferredTier) &&
      Array.isArray(pipe.capabilityPolicy?.resolutionOptions) &&
      pipe.capabilityPolicy.resolutionOptions.includes("720p")
    );
  const catalogHasPipeSettingMetadata = catalogPipes.length === 5 &&
    catalogPipes.every((pipe) =>
      pipe.settings.some((setting) =>
        setting.settingId === "resolution" &&
        setting.group === "render" &&
        setting.control === "select" &&
        setting.scope === "primary" &&
        Array.isArray(setting.options) &&
        setting.options.some((option) => option.value === "720p" && option.recommended === true)
      ) &&
      pipe.settings.some((setting) =>
        setting.settingId === "provider_mode" &&
        setting.group === "model" &&
        setting.control === "backend_auto" &&
        setting.scope === "backend_only" &&
        setting.backendManaged === true
      ) &&
      pipe.settings.some((setting) =>
        setting.settingId === "review_before_spend" &&
        setting.group === "review" &&
        setting.control === "review_gate" &&
        setting.value === true
      )
    );
  const catalogNavigationGroups = catalogPipes.map((pipe) => pipe.uiLayout?.navigationGroup ?? "missing");
  const uiPipeCapabilityPolicyPresent = ui?.pipeNavigation?.length === 5 &&
    ui.pipeNavigation.every((pipe) =>
      pipe.uiLayout?.displayStyle === "navigation_tab" &&
      pipe.capabilityPolicy?.autoRouteProviderMode === true &&
      pipe.capabilityPolicy?.userCannotPickRawProviderModel === true &&
      pipe.capabilityPolicy?.providerClipMaxSeconds === 15
    );
  const uiFacingSurfaceJson = JSON.stringify({
    videoPipeCatalog: videoPipeCatalog.body,
    ui,
    remakeUi,
    visualBibleUi,
    productionBibleUi,
    sessionUiContract
  });
  const privateSourcePatternLineageLeakDetected = await containsPrivateSourcePatternTextForSmoke(uiFacingSurfaceJson);
  const checks = [
    createPage.status === 200 &&
      String(createPage.headers.get("content-type") ?? "").includes("text/html") &&
      createPageHtml.includes('data-video-pipes-endpoint="/v1/short-pipeline/video-pipes"') &&
      createPageHtml.includes('data-session-endpoint="/v1/short-pipeline/conversation-sessions"') &&
      createPageHtml.includes('data-session-ui-endpoint="/v1/short-pipeline/conversation-sessions/{sessionId}/ui-contract"') &&
      createPageHtml.includes('data-render-endpoint="/v1/short-pipeline/conversation-sessions/{sessionId}/render-jobs"') &&
      createPageHtml.includes("Create Short") &&
      createPageHtml.includes("Review Checkpoints") &&
      createPageHtml.includes("Seedance Routing") &&
      createPageHtml.includes("Media References") &&
      createPageHtml.includes("Creative Ideas") &&
      createPageHtml.includes("Video Remake") &&
      createPageHtml.includes("workflow-mode") &&
      createPageHtml.includes("reference-remake") &&
      createPageHtml.includes("seedance-routing") &&
      createPageHtml.includes("media-references") &&
      createPageHtml.includes("kol-reference") &&
      createPageHtml.includes("product-reference") &&
      createPageHtml.includes("creative-ideas") &&
      createPageHtml.includes("approval-packet") &&
      !createPageLeakDetected
      ? pass("short_create_page_available", "First-party Short create/review page shell is served without embedded credentials, local paths, or launch evidence.")
      : fail("short_create_page_available", "Expected Short create page to expose safe endpoint wiring and no credential residue."),
    createPageHasFiveCreationModeWiring &&
      createPageHasRealPayloadWiring
      ? pass("short_create_page_real_mode_wiring_available", "Short create shell wires all five creation modes into backend-safe pattern-starter, visual-bible, and 480s production-bible payload controls.")
      : fail("short_create_page_real_mode_wiring_available", "Expected Short create shell to wire five creation modes into preferredTemplateId, visualBible, and production-bible duration controls."),
    createPageRealModeClean
      ? pass("short_create_page_no_preview_data", "Short create shell serves real-mode controls without external placeholder images, fake balance, auto-prefilled brief/product/claim, or preselected pattern starter.")
      : fail("short_create_page_no_preview_data", "Expected Short create shell to start from user-provided real inputs and avoid preview data in served HTML."),
    createPagePatternStarterLanguageClean
      ? pass("short_create_page_pattern_starter_language", "Short create shell presents reusable ideas as pattern starters and source patterns instead of fixed hardcoded templates.")
      : fail("short_create_page_pattern_starter_language", "Expected served Short create HTML to avoid user-facing hardcoded-template wording."),
    createPageReviewGatedActionLanguage
      ? pass("short_create_page_review_gated_action_language", "Short create first action is labeled as review-gated planning instead of immediate provider generation.")
      : fail("short_create_page_review_gated_action_language", "Expected Short create first action to avoid immediate-generate wording before approval."),
    createPageSecurityHeadersPassed
      ? pass("short_create_page_security_headers", "Short create HTML is served with no-store, nosniff, frame-deny, no-referrer, permissions-policy, and self-only CSP guardrails.")
      : fail("short_create_page_security_headers", "Expected Short create HTML route to include strict browser security headers."),
    unauthorizedSessions.status === 401
      ? pass("short_create_data_requires_client_auth", "Short create shell is public, but protected session data still requires a client API key.")
      : fail("short_create_data_requires_client_auth", "Expected unauthenticated short-pipeline session list to return 401."),
    videoPipeCatalog.statusCode === 200 &&
      videoPipeCatalog.body?.schemaVersion === "cinejelly.short-video-pipe-catalog.v1" &&
      videoPipeCatalog.body?.noSpend === true &&
      videoPipeCatalog.body?.providerCallsMade === false &&
      videoPipeCatalog.body?.pipeCount === 5 &&
      videoPipeCatalog.body?.defaultResolution === "720p" &&
      videoPipeCatalog.body?.defaultAudioMode === "hybrid" &&
      videoPipeCatalog.body?.defaultReturnLastFrame === true &&
      videoPipeCatalog.body?.releaseGateSummary?.canSubmitToProviderNow === false &&
      videoPipeCatalog.body?.pipes?.map((pipe) => pipe.mode).join("|") === "smart_short|product_kol_ugc|storyboard_multishot|video_remake|production_bible" &&
      catalogHasPipeCapabilityPolicy &&
      catalogHasPipeSettingMetadata &&
      catalogNavigationGroups.join("|") === "short|short|short|remake|production" &&
      videoPipeCatalog.body.pipes.every((pipe) =>
        pipe.backendPipe !== "reference_board_pipe" &&
        pipe.settings.some((setting) => setting.settingId === "resolution" && setting.value === "720p") &&
        pipe.settings.some((setting) => setting.settingId === "audio_mode" && setting.value === "hybrid") &&
        pipe.settings.some((setting) => setting.settingId === "provider_mode" && setting.backendManaged === true) &&
        pipe.settings.some((setting) =>
          setting.settingId === "visual_bible_mode" &&
          requestSafeVisualBibleModes.has(String(setting.value))
        )
      ) &&
      catalogProductionPipe?.backendPipe === "long_sequence_bible_pipe" &&
      catalogProductionPipe?.durationSupport?.maxSeconds === 480 &&
      catalogProductionPipe?.durationSupport?.supportsLongSequence === true &&
      catalogProductionPipe?.capabilityPolicy?.durationClass === "production_sequence" &&
      catalogProductionPipe?.capabilityPolicy?.supportsProductionSequence === true &&
      catalogVideoRemakePipe?.defaultSeedanceMode === "reference_to_video" &&
      catalogVideoRemakePipe?.requiredInputs?.includes("rights_cleared_source_video") &&
      catalogVideoRemakePipe?.capabilityPolicy?.supportsSourceVideoLearning === true
      ? pass("video_pipe_catalog_endpoint_available", "Backend exposes a no-spend five-pipe catalog endpoint for future UI navigation without frontend hardcoding.")
      : fail("video_pipe_catalog_endpoint_available", "Expected video pipe catalog endpoint to publish five canonical pipes, settings, duration bands, and no-spend release gates."),
    savedStyle.statusCode === 201 &&
      savedStyle.body.persisted === true &&
      savedStyle.body.channelStyle?.status === "ready" &&
      savedStyle.body.storedChannelStyle?.canReuseAcrossScripts === true
      ? pass("channel_style_saved", "API stores a ready reusable channel style profile for the authenticated client.")
      : fail("channel_style_saved", "Expected channel style profile to persist as ready."),
    listA.body.channelStyles?.length === 1 &&
      detailA.statusCode === 200 &&
      detailB.statusCode === 404
      ? pass("channel_style_client_isolation", "Client-scoped style list/detail prevents another client from reading the profile.")
      : fail("channel_style_client_isolation", "Expected client B to receive 404 for client A profile."),
    uiContract.statusCode === 200 &&
      ui?.schemaVersion === "cinejelly.short-mvp-ui-contract.v1" &&
      ui?.channelStyle?.profileId === profileId &&
      ui?.duration?.recommendedWorkflowMode === "storyboard_multishot" &&
      ui?.render?.canCreateRenderJob === true &&
      ui?.render?.canSubmitToProviderNow === false &&
      ui?.backendManagedSteps?.some((step) => step.actionId === "final_mp4_assembly" && step.status === "ready") &&
      ui?.backendManagedSteps?.some((step) => step.actionId === "media_reference_binding" && step.status === "ready") &&
      ui?.backendManagedSteps?.some((step) => step.actionId === "seedance_model_routing" && step.status === "ready")
      ? pass("ui_contract_hydrates_style_profile", "UI contract hydrates channelStyleProfileId, recommends storyboard for 28s, and keeps provider spend disabled.")
      : fail("ui_contract_hydrates_style_profile", "Expected UI contract to hydrate profileId and expose safe render controls."),
    ui?.pipeNavigation?.length === 5 &&
      ui.pipeSelection?.selectedMode === "product_kol_ugc" &&
      ui.pipeSelection?.selectedBackendPipe === "product_kol_reference_pipe" &&
      Number(ui.pipeSelection?.selectionReasonCodes?.length ?? 0) > 0 &&
      ui.pipeNavigation.map((pipe) => pipe.mode).join("|") === "smart_short|product_kol_ugc|storyboard_multishot|video_remake|production_bible" &&
      ui.pipeNavigation.some((pipe) => pipe.mode === "product_kol_ugc" && pipe.recommended === true && pipe.backendPipe === "product_kol_reference_pipe") &&
      ui.pipeNavigation.some((pipe) => pipe.mode === "video_remake" && pipe.backendPipe === "video_remake_pipe" && pipe.requiredInputs.includes("rights_cleared_source_video")) &&
      ui.pipeNavigation.some((pipe) => pipe.mode === "production_bible" && pipe.durationSupport.supportsLongSequence === true && pipe.durationSupport.maxSeconds >= 180) &&
      uiPipeCapabilityPolicyPresent &&
      ui.pipeNavigation.every((pipe) =>
        pipe.settings.some((setting) => setting.settingId === "resolution" && setting.value === "720p") &&
        pipe.settings.some((setting) => setting.settingId === "audio_mode" && setting.value === "hybrid") &&
        pipe.settings.some((setting) => setting.settingId === "provider_mode" && setting.control === "backend_auto") &&
        pipe.settings.some((setting) => setting.settingId === "review_before_spend" && setting.control === "review_gate")
      )
      ? pass("five_pipe_navigation_contract_available", "UI contract exposes five product-level video pipes with per-pipe settings and backend-owned routing.")
      : fail("five_pipe_navigation_contract_available", "Expected five product-level pipe navigation items with settings, recommendations, and long-sequence support."),
      ui?.seedanceRouting?.routingId?.startsWith("short_seedance_routing_") &&
      ui.seedanceRouting.recommendedProviderMode === "reference_to_video" &&
      ui.seedanceRouting.preferredTier === "standard" &&
      ui.seedanceRouting.resolution === "720p" &&
      ui.seedanceRouting.superResolution === false &&
      ui.seedanceRouting.bitrateMode === "high" &&
      ui.seedanceRouting.returnLastFrame === true &&
      ui.seedanceRouting.referenceTagCount >= 3 &&
      ui.seedanceRouting.promptRecipe?.name === "reference_board_to_video_sequence" &&
      ui.visualBible?.status === "recommended" &&
      ui.visualBible?.recommendedPipe === "product_kol_reference_pipe" &&
      ui.visualBible?.boardCount >= 1 &&
      ui.visualBible?.targetClipCount >= 2 &&
      ui.visualBible?.blocksRenderUntilAssetsApproved === false &&
      ui.mediaReferences?.length >= 3 &&
      ui.mediaReferences.every((reference) => !JSON.stringify(reference).includes("https://cdn.example.com")) &&
      ui.mediaReferences.some((reference) => reference.promptTag === "@image1" && reference.promptRole === "identity") &&
      ui.mediaReferences.some((reference) => reference.promptRole === "product" && reference.includeInProviderHandoff === true) &&
      ui.review.checkpoints.some((checkpoint) => checkpoint.label.includes("Approve media reference") && checkpoint.canApproveInUi === true)
      ? pass("seedance_routing_media_references_available", "UI contract exposes auto Seedance reference routing, visual-bible planning, and role-scoped media references without raw URL leakage.")
      : fail("seedance_routing_media_references_available", "Expected Seedance routing, visual-bible planning, and media reference summaries with @image tags and provider handoff evidence."),
    ui?.creativePatternLearning?.learningId?.startsWith("short_pattern_learning_") &&
      ui.creativePatternLearning.patternCount >= 8 &&
      ui.creativePatternLearning.candidateCount >= 8 &&
      ui.creativePatternLearning.topCandidates?.length >= 3 &&
      Boolean(ui.creativePatternLearning.selectedIdeaLabel) &&
      Number(ui.creativePatternLearning.selectedIdeaScore ?? 0) >= 0.65
      ? pass("creative_pattern_learning_controls_available", "UI contract exposes selected creative-pattern idea and top candidates for operator review.")
      : fail("creative_pattern_learning_controls_available", "Expected UI contract to expose creative pattern learning summary and top ideas."),
    visualBibleUiContract.statusCode === 200 &&
      visualBibleUi?.visualBible?.status === "required" &&
      visualBibleUi.visualBible.requestedMode === "reference_board" &&
      visualBibleUi.visualBible.recommendedPipe === "reference_board_pipe" &&
      visualBibleUi.pipeSelection?.visualBibleAlignmentStatus === "reference_board_asset_workflow" &&
      Number(visualBibleUi.pipeSelection?.selectionReasonCodes?.length ?? 0) > 0 &&
      visualBibleUi.pipeNavigation?.length === 5 &&
      ["product_kol_ugc", "storyboard_multishot"].includes(visualBibleUi.pipeNavigation.find((pipe) => pipe.recommended)?.mode ?? "") &&
      ["product_kol_reference_pipe", "storyboard_board_pipe"].includes(visualBibleUi.pipeNavigation.find((pipe) => pipe.recommended)?.backendPipe ?? "") &&
      visualBibleUi.pipeNavigation.every((pipe) => pipe.backendPipe !== "reference_board_pipe") &&
      visualBibleUi.visualBible.blocksRenderUntilAssetsApproved === true &&
      visualBibleUi.render?.canCreateRenderJob === false &&
      visualBibleUi.userRequiredActions?.some((action) => action.actionId === "approve_visual_bible_assets") &&
      visualBibleUi.seedanceRouting?.promptRecipe?.name === "reference_board_to_video_sequence"
      ? pass("visual_bible_reference_board_contract_available", "Explicit reference-board workflow blocks render until required board assets are generated or approved while keeping navigation on canonical product/storyboard pipes.")
      : fail("visual_bible_reference_board_contract_available", "Expected explicit reference-board mode to produce required visual-bible evidence and block render until assets are approved."),
    productionBibleUiContract.statusCode === 200 &&
      productionBibleUi?.duration?.targetSeconds === 90 &&
      productionBibleUi.duration.commercialMaxSeconds === 60 &&
      productionBibleUi.duration.selectedPipeMaxSeconds === 480 &&
      productionBibleUi.duration.selectedPipeSupportsLongSequence === true &&
      productionBibleUi.duration.withinSelectedPipeDurationRange === true &&
      productionBibleUi.pipeSelection?.selectedMode === "production_bible" &&
      productionBibleUi.pipeSelection?.selectedBackendPipe === "long_sequence_bible_pipe" &&
      productionBibleUi.pipeNavigation?.find((pipe) => pipe.recommended)?.mode === "production_bible" &&
      productionBibleUi.visualBible?.recommendedPipe === "long_sequence_bible_pipe" &&
      productionBibleUi.visualBible?.durationBand === "midform_sequence_60_180"
      ? pass("production_bible_duration_contract_available", "90s production-bible UI contract keeps commercial short guidance separate from selected pipe duration support up to 480s.")
      : fail("production_bible_duration_contract_available", "Expected production-bible contract to expose selected-pipe duration support, long-sequence capability, and 90s validity."),
    ui?.workflowControls?.some((control) => control.mode === "video_remake" && control.enabled === true) &&
      ui.workflowControls.map((control) => control.mode).includes("source_video_guided") &&
      remakeUiContract.statusCode === 200 &&
      remakeUi?.referenceRemake?.userFacingModeLabel === "Video Remake" &&
      remakeUi.referenceRemake.mode === "structure_remake" &&
      remakeUi.referenceRemake.status === "ready" &&
      remakeUi.referenceRemake.replacementSlots?.includes("KOL/creator") &&
      Number(remakeUi.referenceRemake.lockedElements?.length ?? 0) >= 4 &&
      Number(remakeUi.referenceRemake.remakeGuardrails?.length ?? 0) >= 4 &&
      remakeUi.seedanceRouting?.recommendedProviderMode === "reference_to_video" &&
      remakeUi.seedanceRouting?.promptRecipe?.name === "reference_to_video_remake_blueprint" &&
      remakeUi.mediaReferences?.some((reference) => reference.inputRole === "source_video") &&
      remakeUi.userRequiredActions?.some((action) => action.actionId === "approve_video_remake_blueprint" && action.required === true)
      ? pass("video_remake_contract_available", "UI contract exposes Video Remake workflow control and a reviewable remake blueprint with replacement slots and guardrails.")
      : fail("video_remake_contract_available", "Expected Video Remake control, referenceRemake summary, replacement slots, guardrails, and user review action."),
    ui?.director?.directorId?.startsWith("short_director_") &&
      ui?.director?.recommendedWorkflowMode === ui?.duration?.recommendedWorkflowMode &&
      ui?.director?.reviewPauseBeforeProviderSpend === true &&
      ui?.director?.sourceVideoControlsStructureOnly === true &&
      Number(ui?.director?.hookWindowSeconds ?? 0) > 0 &&
      Number(ui?.director?.targetBeatCount ?? 0) > 0
      ? pass("short_director_guidance_available", "UI contract exposes Short Director workflow, hook, pacing, reference, and review gate guidance.")
      : fail("short_director_guidance_available", "Expected UI contract to expose Short Director guidance without frontend reimplementation."),
    ui?.audioControls?.options?.map((option) => option.optionId).join("|") === "off|english|vietnamese|chinese" &&
      ui?.audioControls?.selectedOptionId === "english" &&
      ui?.outputContract?.audioMode === "hybrid" &&
      ui?.outputContract?.audioLanguage === "en" &&
      ui?.visualTextPolicy?.noOnScreenText === true &&
      ui?.visualTextPolicy?.noCaptions === true &&
      ui?.visualTextPolicy?.noCtaCards === true &&
      ui?.outputContract?.captionsCanBeBurnedIn === false &&
      ui?.outputContract?.visibleTextAllowed === false
      ? pass("audio_and_no_visible_text_controls", "UI contract exposes off/en/vi/zh audio choices and locks no visible text/caption burn-in by default.")
      : fail("audio_and_no_visible_text_controls", "Expected UI contract to expose audio options and no-visible-text output contract."),
    Array.isArray(ui?.review?.checkpoints) &&
      ui.review.checkpoints.length === ui.review.checkpointCount &&
      ui.review.checkpoints.length > 0 &&
      new Set(ui.review.checkpoints.map((checkpoint) => checkpoint.surface)).size >= 4 &&
      ui.review.checkpoints.every((checkpoint) =>
        checkpoint.reviewerRequiredForApproval === true &&
        checkpoint.reviewedAtRequiredForApproval === true &&
        typeof checkpoint.canApproveInUi === "boolean" &&
        Number.isInteger(checkpoint.evidenceKeyCount) &&
        !containsAny(JSON.stringify(checkpoint), ["https://shop.example.com", "C:\\Users\\Admin", "api_key=secret"])
      ) &&
      ui.review.approvalPayloadContract?.gate === "pre_render" &&
      ui.review.approvalPayloadContract?.confirmRenderSubmissionDefault === false &&
      ui.review.approvalPayloadContract?.canQueueProviderSpendFromContractAlone === false
      ? pass("review_checkpoint_controls_available", "UI contract exposes safe scene/audio/caption/claim checkpoints plus a no-spend approval payload contract.")
      : fail("review_checkpoint_controls_available", "Expected UI contract to expose safe approval checkpoint controls without provider-spend authority."),
    bothStyleSources.statusCode === 400 &&
      String(bothStyleSources.body.error ?? "").includes("either channelStyle or channelStyleProfileId")
      ? pass("ambiguous_style_source_blocked", "Backend rejects requests that send both inline channelStyle and channelStyleProfileId.")
      : fail("ambiguous_style_source_blocked", "Expected ambiguous style source request to be rejected."),
    clientBPlan.statusCode === 404
      ? pass("cross_client_profile_use_blocked", "Client B cannot use client A channelStyleProfileId in plan/UI contract creation.")
      : fail("cross_client_profile_use_blocked", "Expected cross-client profile use to be blocked."),
    normalizedDerivedDefaultStyleStorePath === `${defaultShortStudioOutputDir}/short-channel-styles.json` &&
      normalizedDerivedDefaultSessionStorePath === `${defaultShortStudioOutputDir}/short-pipeline-sessions.json`
      ? pass("short_studio_default_storage_paths_available", "Short Studio session/style stores derive durable defaults from CINEJELLY_OUTPUT_DIR without extra operator config.")
      : fail("short_studio_default_storage_paths_available", "Expected Short Studio default session/style paths to derive from CINEJELLY_OUTPUT_DIR."),
    invalidRequestIdSession.statusCode === 400 &&
      String(invalidRequestIdSession.body.error ?? "").includes("requestId")
      ? pass("short_session_rejects_invalid_body_request_id", "Short session API rejects invalid body requestId before the durable session store.")
      : fail("short_session_rejects_invalid_body_request_id", "Expected invalid short session body requestId to return a 400 admission error instead of a 500 store error."),
    createdSession.statusCode === 201 &&
      sessionUi.statusCode === 200 &&
      sessionUiContract?.channelStyle?.profileId === profileId &&
      sessionUiContract?.outputContract?.finalMp4AssemblyManagedByBackend === true
      ? pass("session_ui_contract_available", "Stored conversation session exposes a UI contract with channel style and final assembly contract.")
      : fail("session_ui_contract_available", "Expected stored session UI contract to be available."),
    !rawLeakDetected
      ? pass("library_and_session_store_no_secret_leak", "Style/session stores do not contain local paths or secret-like values.")
      : fail("library_and_session_store_no_secret_leak", "Expected stores to remain free of local paths and secret-like values."),
    !privateSourcePatternLineageLeakDetected
      ? pass("ui_contract_hides_private_source_pattern_lineage", "UI-facing short catalog and contracts do not expose private source-pattern repo, platform, or upstream workflow labels.")
      : fail("ui_contract_hides_private_source_pattern_lineage", "Expected UI-facing short catalog and contracts to hide private source-pattern lineage.")
  ];

  report = {
    schemaVersion: "cinejelly.short-mvp-ui-contract-smoke.v1",
    generatedAt: new Date().toISOString(),
    status: checks.every((check) => check.status === "pass") ? "pass" : "fail",
    noSpend: true,
    localHttpCallsMade: true,
    networkCallsMade: false,
    providerCallsMade: false,
    sourcePatternOrigins: [
      "hereandnowai/master-langgraph-workflows-in-python-20-real-world-agent-projects-by-hereandnow-ai",
      "nirdiamant/genai_agents:ContentIntelligence",
      "gswithjeff/autogen-multi-agent-workflow",
      "YouMind-OpenLab/awesome-seedance-2-prompts",
      "ZeroLu/awesome-seedance",
      "calesthio/OpenMontage",
      "vericontext/vibeframe"
    ],
    checkedInputs: {
      outputPath: options.outputPath,
      styleStorePath: options.styleStorePath,
      sessionStorePath: options.sessionStorePath,
      derivedDefaultStyleStorePath,
      derivedDefaultSessionStorePath,
      endpointPaths: [
        "GET /short/create",
        "GET /v1/short-pipeline/video-pipes",
        "POST /v1/short-pipeline/channel-styles",
        "GET /v1/short-pipeline/channel-styles",
        "GET /v1/short-pipeline/channel-styles/{profileId}",
        "POST /v1/short-pipeline/ui-contract",
        "GET /v1/short-pipeline/conversation-sessions/{sessionId}/ui-contract"
      ],
      createPageStatusCode: createPage.status,
      videoPipeCatalogStatusCode: videoPipeCatalog.statusCode,
      unauthorizedSessionsStatusCode: unauthorizedSessions.status,
      profileId,
      sessionId,
      createPageEndpointCheckPassed: !createPageLeakDetected && createPageHtml.includes("/v1/short-pipeline/conversation-sessions"),
      htmlSecurityHeadersCheckPassed: createPageSecurityHeadersPassed,
      invalidRequestIdStatusCode: invalidRequestIdSession.statusCode,
      clientIsolationCheckPassed: detailB.statusCode === 404 && clientBPlan.statusCode === 404,
      secretLeakCheckPassed: !rawLeakDetected
    },
    scenarios: {
      videoPipeCatalog: {
        pipeCount: videoPipeCatalog.body?.pipeCount ?? 0,
        pipeModes: videoPipeCatalog.body?.pipes?.map((pipe) => pipe.mode) ?? [],
        defaultResolution: videoPipeCatalog.body?.defaultResolution,
        defaultAudioMode: videoPipeCatalog.body?.defaultAudioMode,
        defaultReturnLastFrame: videoPipeCatalog.body?.defaultReturnLastFrame,
        pipeNavigationGroups: catalogNavigationGroups,
        pipeNavigationOrders: catalogPipes.map((pipe) => pipe.uiLayout?.navigationOrder),
        pipeCapabilityPolicyPresent: catalogHasPipeCapabilityPolicy,
        pipeSettingMetadataPresent: catalogHasPipeSettingMetadata,
        backendAutoRouteProviderMode: catalogPipes.every((pipe) => pipe.capabilityPolicy?.autoRouteProviderMode === true),
        userCannotPickRawProviderModel: catalogPipes.every((pipe) => pipe.capabilityPolicy?.userCannotPickRawProviderModel === true),
        productionBibleMaxSeconds: catalogProductionPipe?.durationSupport?.maxSeconds,
        productionBibleSupportsLongSequence: catalogProductionPipe?.durationSupport?.supportsLongSequence,
        productionBibleDurationClass: catalogProductionPipe?.capabilityPolicy?.durationClass,
        productionBibleResolutionOptions: catalogProductionPipe?.capabilityPolicy?.resolutionOptions ?? [],
        videoRemakeDefaultMode: catalogVideoRemakePipe?.defaultSeedanceMode,
        videoRemakeSupportsSourceVideoLearning: catalogVideoRemakePipe?.capabilityPolicy?.supportsSourceVideoLearning,
        videoRemakeVisualBibleMode: catalogVideoRemakePipe
          ?.settings?.find((setting) => setting.settingId === "visual_bible_mode")?.value,
        requestSafeVisualBibleModeSettings: videoPipeCatalog.body?.pipes?.every((pipe) =>
          pipe.settings?.some((setting) =>
            setting.settingId === "visual_bible_mode" &&
            requestSafeVisualBibleModes.has(String(setting.value))
          )
        ) ?? false,
        canSubmitToProviderNow: videoPipeCatalog.body?.releaseGateSummary?.canSubmitToProviderNow
      },
      savedStyle: {
        profileId,
        status: savedStyle.body.channelStyle?.status,
        anchorCount: savedStyle.body.channelStyle?.styleAnchors?.length ?? 0,
        canReuseAcrossScripts: savedStyle.body.channelStyle?.memoryPolicy?.canReuseAcrossScripts,
        requiresRightsReview: savedStyle.body.channelStyle?.memoryPolicy?.requiresRightsReview
      },
      uiContract: {
        targetSeconds: ui?.duration?.targetSeconds,
        commercialMaxSeconds: ui?.duration?.commercialMaxSeconds,
        selectedPipeMaxSeconds: ui?.duration?.selectedPipeMaxSeconds,
        selectedPipeSupportsLongSequence: ui?.duration?.selectedPipeSupportsLongSequence,
        withinSelectedPipeDurationRange: ui?.duration?.withinSelectedPipeDurationRange,
        recommendedWorkflowMode: ui?.duration?.recommendedWorkflowMode,
        workflowControlCount: ui?.workflowControls?.length ?? 0,
        workflowControlModes: ui?.workflowControls?.map((control) => control.mode) ?? [],
        pipeSelectionMode: ui?.pipeSelection?.selectedMode,
        pipeSelectionBackendPipe: ui?.pipeSelection?.selectedBackendPipe,
        pipeSelectionReasonCodeCount: ui?.pipeSelection?.selectionReasonCodes?.length ?? 0,
        pipeSelectionVisualBibleAlignmentStatus: ui?.pipeSelection?.visualBibleAlignmentStatus,
        pipeNavigationCount: ui?.pipeNavigation?.length ?? 0,
        pipeNavigationModes: ui?.pipeNavigation?.map((pipe) => pipe.mode) ?? [],
        pipeNavigationGroups: ui?.pipeNavigation?.map((pipe) => pipe.uiLayout?.navigationGroup) ?? [],
        pipeCapabilityPolicyPresent: uiPipeCapabilityPolicyPresent,
        pipeBackendAutoRouteProviderMode: ui?.pipeNavigation?.every((pipe) => pipe.capabilityPolicy?.autoRouteProviderMode === true) ?? false,
        pipeUserCannotPickRawProviderModel: ui?.pipeNavigation?.every((pipe) => pipe.capabilityPolicy?.userCannotPickRawProviderModel === true) ?? false,
        recommendedPipeNavigationMode: ui?.pipeNavigation?.find((pipe) => pipe.recommended)?.mode,
        productionBibleSupportsLongSequence: ui?.pipeNavigation?.some((pipe) =>
          pipe.mode === "production_bible" && pipe.durationSupport?.supportsLongSequence === true
        ) ?? false,
        videoRemakeWorkflowControlPresent: ui?.workflowControls?.some((control) => control.mode === "video_remake") ?? false,
        directorPlanIdPresent: Boolean(ui?.director?.directorId),
        directorStatus: ui?.director?.status,
        directorCreativeMode: ui?.director?.creativeMode,
        hookWindowSeconds: ui?.director?.hookWindowSeconds,
        targetBeatCount: ui?.director?.targetBeatCount,
        directorFindingCount: ui?.director?.findingCount,
        sourceVideoControlsStructureOnly: ui?.director?.sourceVideoControlsStructureOnly,
        reviewPauseBeforeProviderSpend: ui?.director?.reviewPauseBeforeProviderSpend,
        audioControlOptions: ui?.audioControls?.options?.map((option) => option.optionId) ?? [],
        selectedAudioOptionId: ui?.audioControls?.selectedOptionId,
        visibleTextAllowed: ui?.outputContract?.visibleTextAllowed,
        creativePatternLearningIdPresent: Boolean(ui?.creativePatternLearning?.learningId),
        creativePatternCandidateCount: ui?.creativePatternLearning?.candidateCount ?? 0,
        creativePatternTopCandidateCount: ui?.creativePatternLearning?.topCandidates?.length ?? 0,
        selectedCreativeIdeaPresent: Boolean(ui?.creativePatternLearning?.selectedIdeaLabel),
        mediaReferenceCount: ui?.mediaReferences?.length ?? 0,
        mediaReferenceProviderHandoffCount: (ui?.mediaReferences ?? []).filter((reference) => reference.includeInProviderHandoff).length,
        mediaReferencePromptTags: ui?.mediaReferences?.map((reference) => reference.promptTag) ?? [],
        seedanceRecommendedProviderMode: ui?.seedanceRouting?.recommendedProviderMode,
        seedancePreferredTier: ui?.seedanceRouting?.preferredTier,
        seedanceResolution: ui?.seedanceRouting?.resolution,
        seedanceReturnLastFrame: ui?.seedanceRouting?.returnLastFrame,
        seedancePromptRecipeName: ui?.seedanceRouting?.promptRecipe?.name,
        seedanceReferenceTagCount: ui?.seedanceRouting?.referenceTagCount ?? 0,
        visualBibleStatus: ui?.visualBible?.status,
        visualBibleMode: ui?.visualBible?.requestedMode,
        visualBibleRecommendedPipe: ui?.visualBible?.recommendedPipe,
        visualBibleDurationBand: ui?.visualBible?.durationBand,
        visualBibleAssetPlanCount: ui?.visualBible?.assetPlanCount ?? 0,
        visualBibleRequiredAssetPlanCount: ui?.visualBible?.requiredAssetPlanCount ?? 0,
        visualBibleBoardCount: ui?.visualBible?.boardCount ?? 0,
        visualBibleTargetClipCount: ui?.visualBible?.targetClipCount ?? 0,
        visualBibleBlocksRender: ui?.visualBible?.blocksRenderUntilAssetsApproved,
        reviewCheckpointCount: ui?.review?.checkpoints?.length ?? 0,
        reviewCheckpointSurfaceCount: new Set((ui?.review?.checkpoints ?? []).map((checkpoint) => checkpoint.surface)).size,
        approvalPayloadContractGate: ui?.review?.approvalPayloadContract?.gate,
        approvalPayloadCanQueueProviderSpend: ui?.review?.approvalPayloadContract?.canQueueProviderSpendFromContractAlone,
        backendManagedStepCount: ui?.backendManagedSteps?.length ?? 0,
        userRequiredActionCount: ui?.userRequiredActions?.length ?? 0,
        canCreateRenderJob: ui?.render?.canCreateRenderJob,
        canSubmitToProviderNow: ui?.render?.canSubmitToProviderNow,
        finalMp4AssemblyManagedByBackend: ui?.outputContract?.finalMp4AssemblyManagedByBackend
      },
      remakeUiContract: {
        statusCode: remakeUiContract.statusCode,
        referenceRemakePresent: Boolean(remakeUi?.referenceRemake?.blueprintId),
        referenceRemakeMode: remakeUi?.referenceRemake?.mode,
        referenceRemakeStatus: remakeUi?.referenceRemake?.status,
        replacementSlotCount: remakeUi?.referenceRemake?.replacementSlots?.length ?? 0,
        lockedElementCount: remakeUi?.referenceRemake?.lockedElements?.length ?? 0,
        guardrailCount: remakeUi?.referenceRemake?.remakeGuardrails?.length ?? 0,
        canUseAfterReview: remakeUi?.referenceRemake?.canUseAfterReview,
        visualBibleRecommendedPipe: remakeUi?.visualBible?.recommendedPipe,
        visualBibleStatus: remakeUi?.visualBible?.status,
        seedanceRecommendedProviderMode: remakeUi?.seedanceRouting?.recommendedProviderMode,
        seedancePromptRecipeName: remakeUi?.seedanceRouting?.promptRecipe?.name,
        mediaReferenceCount: remakeUi?.mediaReferences?.length ?? 0,
        sourceVideoReferencePresent: remakeUi?.mediaReferences?.some((reference) => reference.inputRole === "source_video") ?? false,
        userActionPresent: remakeUi?.userRequiredActions?.some((action) => action.actionId === "approve_video_remake_blueprint") ?? false
      },
      visualBibleUiContract: {
        statusCode: visualBibleUiContract.statusCode,
        visualBibleStatus: visualBibleUi?.visualBible?.status,
        visualBibleMode: visualBibleUi?.visualBible?.requestedMode,
        visualBibleRecommendedPipe: visualBibleUi?.visualBible?.recommendedPipe,
        visualBibleDurationBand: visualBibleUi?.visualBible?.durationBand,
        assetPlanCount: visualBibleUi?.visualBible?.assetPlanCount ?? 0,
        requiredAssetPlanCount: visualBibleUi?.visualBible?.requiredAssetPlanCount ?? 0,
        boardCount: visualBibleUi?.visualBible?.boardCount ?? 0,
        targetClipCount: visualBibleUi?.visualBible?.targetClipCount ?? 0,
        blocksRenderUntilAssetsApproved: visualBibleUi?.visualBible?.blocksRenderUntilAssetsApproved,
        pipeSelectionMode: visualBibleUi?.pipeSelection?.selectedMode,
        pipeSelectionBackendPipe: visualBibleUi?.pipeSelection?.selectedBackendPipe,
        pipeSelectionReasonCodeCount: visualBibleUi?.pipeSelection?.selectionReasonCodes?.length ?? 0,
        pipeSelectionVisualBibleAlignmentStatus: visualBibleUi?.pipeSelection?.visualBibleAlignmentStatus,
        pipeNavigationCount: visualBibleUi?.pipeNavigation?.length ?? 0,
        recommendedPipeNavigationMode: visualBibleUi?.pipeNavigation?.find((pipe) => pipe.recommended)?.mode,
        recommendedPipeNavigationBackendPipe: visualBibleUi?.pipeNavigation?.find((pipe) => pipe.recommended)?.backendPipe,
        pipeNavigationBackendPipes: visualBibleUi?.pipeNavigation?.map((pipe) => pipe.backendPipe) ?? [],
        canCreateRenderJob: visualBibleUi?.render?.canCreateRenderJob,
        userActionPresent: visualBibleUi?.userRequiredActions?.some((action) => action.actionId === "approve_visual_bible_assets") ?? false,
        promptRecipeName: visualBibleUi?.seedanceRouting?.promptRecipe?.name
      },
      productionBibleUiContract: {
        statusCode: productionBibleUiContract.statusCode,
        targetSeconds: productionBibleUi?.duration?.targetSeconds,
        commercialMaxSeconds: productionBibleUi?.duration?.commercialMaxSeconds,
        selectedPipeMinSeconds: productionBibleUi?.duration?.selectedPipeMinSeconds,
        selectedPipeMaxSeconds: productionBibleUi?.duration?.selectedPipeMaxSeconds,
        selectedPipeIdealRangeSeconds: productionBibleUi?.duration?.selectedPipeIdealRangeSeconds,
        selectedPipeSupportsLongSequence: productionBibleUi?.duration?.selectedPipeSupportsLongSequence,
        withinSelectedPipeDurationRange: productionBibleUi?.duration?.withinSelectedPipeDurationRange,
        pipeSelectionMode: productionBibleUi?.pipeSelection?.selectedMode,
        pipeSelectionBackendPipe: productionBibleUi?.pipeSelection?.selectedBackendPipe,
        recommendedPipeNavigationMode: productionBibleUi?.pipeNavigation?.find((pipe) => pipe.recommended)?.mode,
        visualBibleRecommendedPipe: productionBibleUi?.visualBible?.recommendedPipe,
        visualBibleDurationBand: productionBibleUi?.visualBible?.durationBand,
        targetClipCount: productionBibleUi?.visualBible?.targetClipCount ?? 0,
        canCreateRenderJob: productionBibleUi?.render?.canCreateRenderJob
      },
      sessionUiContract: {
        sessionId,
        profileId: sessionUiContract?.channelStyle?.profileId,
        readyForUiMvpIntegration: sessionUiContract?.releaseGateSummary?.readyForUiMvpIntegration,
        canReleaseToCustomerTraffic: sessionUiContract?.releaseGateSummary?.canReleaseToCustomerTraffic
      }
    },
    checks,
    releaseGateSummary: {
      shortMvpUiContractSmokePass: checks.every((check) => check.status === "pass"),
      canUseAsNoSpendBackendEvidence: checks.every((check) => check.status === "pass"),
      readyForUiMvpIntegration: ui?.releaseGateSummary?.readyForUiMvpIntegration === true,
      canReleaseToCustomerTraffic: false,
      releaseBlocker: "Short MVP UI contract is backend integration evidence only; paid Short render validation, artifact validation, manual media review, billing/workspace controls, and release approval remain separate gates."
    },
    nextActions: [
      "Capture accepted live reviewer operation evidence and production UI QA for the first-party Short create/review shell.",
      "Use channelStyleProfileId for channel-building workflows with recurring characters, voice, setting, visual rhythm, and editing style.",
      "Run one paid 30-45s Short multishot validation after UI review wiring is ready."
    ]
  };
} finally {
  await new Promise((resolveClose) => server.close(resolveClose));
}

if (options.writeReport) {
  writeJson(options.outputPath, report);
}
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exit(report.status === "pass" ? 0 : 1);

function channelStyleBody() {
  return {
    channelId: "glow_lab_tiktok",
    channelName: "Glow Lab TikTok",
    seriesName: "Morning Proof Desk",
    audience: "busy skincare buyers who want credible quick routines",
    niche: "beauty ecommerce UGC ads",
    positioning: "premium but warm proof-led product explainers",
    contentPillars: ["ingredient clarity", "routine proof", "buyer objections"],
    visualStyle: "clean macro skincare table, soft highlights, product visible in first second",
    editingRhythm: "fast hook, proof close-up, calm demo, one CTA",
    captionStyle: "short premium captions with one proof idea per beat",
    musicStyle: "soft upbeat lo-fi pulse under narration",
    characters: [
      {
        characterId: "mina_host",
        name: "Mina",
        role: "trusted skincare reviewer",
        visualDescription: "late-20s creator with neat black bob, cream cardigan, warm direct eye contact",
        personality: "calm, precise, friendly",
        wardrobe: "cream cardigan and simple gold earrings",
        mustPreserve: ["black bob", "cream cardigan", "calm proof-led delivery"],
        avoid: ["overexcited hype", "medical claims"],
        referenceAssetIds: ["asset://channel/glow-lab/mina-face"]
      }
    ],
    voices: [
      {
        voiceId: "voice_mina_warm_en",
        label: "Mina warm English",
        language: "en",
        voiceStyle: "warm calm UGC narration",
        pacing: "quick but trustworthy",
        catchphrases: ["proof, not hype"],
        doNotSay: ["cures", "guaranteed"],
        referenceAssetIds: ["asset://channel/glow-lab/mina-voice"]
      }
    ],
    settings: [
      {
        settingId: "morning_vanity",
        label: "morning vanity desk",
        visualDescription: "bright bathroom vanity with clean product tray and soft daylight",
        lighting: "soft morning side light",
        colorMood: "warm white, clean peach, charcoal text",
        recurringProps: ["glass tray", "white towel", "small mirror"],
        referenceAssetIds: ["asset://channel/glow-lab/vanity-set"]
      }
    ],
    reusableAssets: [
      {
        assetId: "asset://channel/glow-lab/mina-face",
        uri: "asset://channel/glow-lab/mina-face",
        kind: "character_reference",
        label: "Mina face reference",
        rightsStatus: "operator_approved"
      },
      {
        assetId: "asset://channel/glow-lab/vanity-set",
        uri: "asset://channel/glow-lab/vanity-set",
        kind: "setting_reference",
        label: "Vanity set",
        rightsStatus: "operator_approved"
      }
    ],
    styleRules: ["Product appears in first second", "Keep proof specific and claim-reviewed"],
    doNotChange: ["Mina host identity", "warm proof-led tone", "morning vanity setting"],
    avoidPatterns: ["hard-sell countdowns", "medical promises", "generic stock footage"]
  };
}

function planBody(profileId) {
  return {
    projectId: "short_mvp_ui_contract_smoke",
    requestId: "req_short_mvp_ui_contract_001",
    userPrompt: "Create a 28 second TikTok UGC review ad for Glow Focus Serum. Keep it custom, proof-led, and easy to approve in UI.",
    product: {
      productUrl: "https://shop.example.com/products/glow-focus-serum",
      snapshot: {
        productTitle: "Glow Focus Serum",
        category: "beauty",
        metaDescription: "A lightweight serum that visibly improves dull-looking skin and supports a smoother morning routine.",
        priceText: "$39",
        imageUrls: ["https://cdn.example.com/glow-focus-serum/front.jpg"],
        benefits: ["Visibly improves dull-looking skin in daily routines"],
        claims: ["Visibly improves dull-looking skin"],
        targetBuyer: "busy skincare buyers",
        cta: "Shop now"
      }
    },
    brandKit: {
      brandId: "glow_lab",
      brandName: "Glow Lab",
      tone: "premium but warm",
      language: "en",
      visualStyle: "clean macro beauty",
      allowedClaims: ["visibly improves dull-looking skin"],
      forbiddenClaims: ["cures acne overnight"],
      ctaRules: ["Use one CTA only"]
    },
    channelStyleProfileId: profileId,
    mediaReferences: [
      {
        role: "kol",
        kind: "image",
        uri: "asset://short-smoke/mina-kol",
        label: "Mina KOL reference",
        rightsStatus: "operator_approved",
        priority: "primary",
        description: "Preserve approved creator identity, hair, expression energy, and face continuity only."
      },
      {
        role: "product",
        kind: "image",
        uri: "asset://short-smoke/glow-focus-serum-pack",
        label: "Glow Focus Serum product pack",
        rightsStatus: "operator_approved",
        priority: "primary",
        description: "Preserve packaging geometry, label placement, material, and hero-object continuity only."
      },
      {
        role: "background",
        kind: "image",
        uri: "asset://short-smoke/morning-vanity-set",
        label: "Morning vanity background",
        rightsStatus: "operator_approved",
        priority: "supporting",
        description: "Preserve bright vanity layout and soft morning light only."
      }
    ],
    targetPlatform: "tiktok",
    targetDurationSeconds: 28
  };
}

function remakePlanBody(profileId) {
  return {
    ...planBody(profileId),
    requestId: "req_short_mvp_ui_video_remake_001",
    userPrompt: "Create a TikTok Video Remake for Glow Focus Serum using the reference as edit rhythm, acting beats, camera language, and payoff timing while replacing creator, product, background, voice, audio, and claims.",
    referenceVideoLearning: {
      sourceLabel: "rights-cleared desk proof reference",
      sourceUrl: "https://media.example.com/reference/desk-proof-remake",
      summary: "Creator opens on a chaotic desk, snaps to a clean product moment, shows a satisfying close-up proof beat, then ends with a calm payoff.",
      hook: "The desk feels messy until one small routine step changes the whole scene.",
      durationSeconds: 28,
      sceneCount: 5,
      pacing: "fast problem hook, snap-clean transition, macro proof, creator reaction, soft payoff",
      cameraStyle: "handheld desk POV, macro product close-up, quick reaction angle, calm final frame",
      captionStyle: "visual rhythm only; no visible captions or labels",
      audioStyle: "quick beat accents with guided original narration",
      retentionPattern: "delay the clean payoff until the macro proof beat lands",
      ctaStyle: "quiet routine payoff using approved claim language",
      visualMotifs: ["messy desk", "macro texture", "clean payoff"],
      doNotCopy: true
    },
    mediaReferences: [
      ...planBody(profileId).mediaReferences,
      {
        role: "source_video",
        kind: "video",
        uri: "https://media.example.com/reference/desk-proof-remake",
        label: "Desk proof remake structure",
        rightsStatus: "operator_approved",
        priority: "supporting",
        description: "Learn pacing, acting beats, camera grammar, and payoff structure only."
      }
    ]
  };
}

function conversationBody(profileId) {
  return {
    ...planBody(profileId),
    messages: [
      {
        role: "user",
        text: "Make this a proof-led UGC review with our recurring Mina host and morning vanity setup."
      }
    ]
  };
}

async function waitForHealth(baseUrl) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Retry until the local server listener is ready.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error("Local API server did not become ready for short MVP UI contract smoke.");
}

async function postJson(url, headers, body) {
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
  return {
    statusCode: response.status,
    body: await response.json()
  };
}

async function getJson(url, headers) {
  const response = await fetch(url, { headers });
  return {
    statusCode: response.status,
    body: await response.json()
  };
}

const PRIVATE_SOURCE_PATTERN_FALLBACK_FORBIDDEN_FRAGMENTS = [
  "Topview",
  "Higgsfield",
  "OpenMontage",
  "VideoAgent",
  "ViMax",
  "vibeframe",
  "YouMind-OpenLab",
  "ZeroLu",
  "Emily2040",
  "higgsfield-ai",
  "OSideMedia",
  "calesthio/",
  "HKUDS/",
  "video-db/",
  "vericontext/",
  "harry0703/",
  "MoneyPrinterTurbo",
  "moneyprinterturbo",
  "jiaminchen-1031/",
  "DirectorBench",
  "directorbench",
  "nirdiamant/",
  "gswithjeff/",
  "Shubhamsaboo/",
  "hereandnowai/",
  "Anil-matcha/"
];

async function containsPrivateSourcePatternTextForSmoke(value) {
  try {
    const registry = await import("../dist/core/private-source-pattern-registry.js");
    if (typeof registry.containsPrivateSourcePatternText === "function") {
      return registry.containsPrivateSourcePatternText(value);
    }
  } catch {
    // A clean checkout may run this script before build output exists.
  }
  const lowered = value.toLowerCase();
  return PRIVATE_SOURCE_PATTERN_FALLBACK_FORBIDDEN_FRAGMENTS.some((fragment) =>
    lowered.includes(fragment.toLowerCase())
  );
}

function containsAny(value, needles) {
  return needles.some((needle) => value.includes(needle));
}

function htmlSecurityHeadersPass(headers) {
  const csp = String(headers.get("content-security-policy") ?? "");
  return String(headers.get("cache-control") ?? "").toLowerCase().includes("no-store") &&
    String(headers.get("x-content-type-options") ?? "").toLowerCase() === "nosniff" &&
    String(headers.get("x-frame-options") ?? "").toUpperCase() === "DENY" &&
    String(headers.get("referrer-policy") ?? "").toLowerCase() === "no-referrer" &&
    String(headers.get("permissions-policy") ?? "").includes("camera=()") &&
    csp.includes("default-src 'none'") &&
    csp.includes("connect-src 'self'") &&
    csp.includes("frame-ancestors 'none'") &&
    csp.includes("form-action 'self'");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function pass(name, message) {
  return { name, status: "pass", message };
}

function fail(name, message) {
  return { name, status: "fail", message };
}

function writeJson(path, value) {
  const absolutePath = resolve(repoRoot, path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
