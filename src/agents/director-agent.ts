/**
 * Director Agent orchestrates the first runnable render-level pipeline:
 * input -> story plan -> shot planning -> prompt compile -> preflight -> Seedance render -> render inspection.
 */

import {
  candidateCountForQuality,
  MAX_CLIP_DURATION_SECONDS,
  PROVIDER_FAILURE_RETRY_ATTEMPTS,
  repairAttemptCountForQuality,
  SEEDANCE_TEST_TAKE_DURATION_SECONDS,
  resolveSeedanceModelId,
  seedanceResolutionHeight,
  usesTestTakesForQuality
} from "../config/seedance-settings.js";
import { countSpeechUnits, planDurationCompensation, TALKING_WORDS_PER_SECOND } from "../core/duration-scripting.js";
import { DURATION_SHORT_BLOCK_TOLERANCE } from "../core/delivery-gate.js";
import { DEFAULT_TRANSITION_SETTINGS } from "../core/transition-engine.js";
import type { TransitionSettings } from "../types/transition.js";
import { AssemblyEngine } from "../core/assembly-engine.js";
import { selectAssemblyClipsForRenderedShots } from "../core/assembly-output-selector.js";
import { ConsistencyGuardian } from "../core/consistency-guardian.js";
import { ContinuityLedgerBuilder } from "../core/continuity-ledger-builder.js";
import { DeliveryGate } from "../core/delivery-gate.js";
import { isImageOutputUrl, selectOrExtractLastFrameReference, type EndpointFrameQualityEvidence } from "../core/endpoint-frame-chain.js";
import {
  bindCharacterAnchorsToShots,
  bindKeyframesToShots,
  bindPortraitsToCast,
  normalizeCharacterKey,
  narrowShotReferencesToCast,
  planCastPortraitRequests,
  type PortraitView,
  planCharacterAnchors,
  planKeyframeRequests,
  type CharacterAnchorPlan,
  type PortraitCastMember
} from "../core/keyframe-first-planner.js";
import { avatarOutputResolution, buildAvatarPrompt, decideAvatarShot } from "../core/avatar-shot-planner.js";
import { containsVietnameseDiacritics } from "../core/spoken-language.js";
import type { CreativeBriefAnalyst } from "./creative-brief-analyst.js";
import { planSocialPublishingMetadata } from "../core/social-publishing-planner.js";
import { LongFormAgentReviewPlanner } from "../core/long-form-agent-review-planner.js";
import { LongFormContinuityPlanner } from "../core/long-form-continuity-planner.js";
import { LongFormCreativeIntelligencePlanner } from "../core/long-form-creative-intelligence-planner.js";
import { LongFormReadinessPlanner } from "../core/long-form-readiness-planner.js";
import { LongFormTimelinePlanner } from "../core/long-form-timeline-planner.js";
import { ProductionGraphBuilder } from "../core/production-graph-builder.js";
import { ProductionGraphRunRecorder } from "../core/production-graph-run-recorder.js";
import { ProductionStagePlanner } from "../core/production-stage-planner.js";
import { PostproductionAssetPlanner } from "../core/postproduction-asset-planner.js";
import { GeneratedAudioOutputBatchValidator } from "../core/generated-audio-output-batch-validator.js";
import { GeneratedAudioProviderExecutionRunner } from "../core/generated-audio-provider-execution-runner.js";
import { ReferenceSelectionPlanner } from "../core/reference-selection-planner.js";
import { MaterialSourcingPlanner } from "../core/material-sourcing-planner.js";
import { MaterialSourceValidator } from "../core/material-source-validator.js";
import { DEFAULT_POSTPRODUCTION_SETTINGS } from "../core/postproduction-engine.js";
import { RenderCostGate } from "../core/render-cost-gate.js";
import {
  mergeGuardianReports,
  RenderedCandidateVisualInspector,
  type CandidateVisualCuration
} from "../core/rendered-candidate-visual-inspector.js";
import {
  RenderScheduler,
  type RenderScheduleItem,
  type RenderSchedulePlan,
  type RenderScheduleResult,
  type RenderScheduleSequentialReason
} from "../core/render-scheduler.js";
import { SemanticVisualInspector } from "../core/semantic-visual-inspector.js";
import { ImageAnchorVerifier } from "../core/image-anchor-verifier.js";
import { ShotPlanner } from "../core/shot-planner.js";
import { StoryboardApprovalGate } from "../core/storyboard-approval-gate.js";
import { SourceVideoAutoAnalyzer } from "../core/source-video-auto-analyzer.js";
import { StoryboardPlanner } from "../core/storyboard-planner.js";
import { VideoRenderStrategyPlanner } from "../core/video-render-strategy-planner.js";
import { productionStageSourcePatternOrigins } from "../core/private-source-pattern-registry.js";
import type {
  AtlasCloudRuntimeSettings,
  FlexibleSeedanceSettings,
  Resolution,
  SourceVideoAutoAnalysisSettings
} from "../types/settings.js";
import type { CineJellyProjectRequest, DirectorRunResult, IntakeResult, RenderCandidate, RenderedShot } from "../types/agent.js";
import type { GuardianReport, GuardianSeverity, GuardianStatus } from "../types/guardian.js";
import type { LongFormAgentReviewPlan } from "../types/long-form-agent-review.js";
import type { LongFormCreativeIntelligencePlan } from "../types/long-form-creative-intelligence.js";
import type { LongFormReadinessPlan } from "../types/long-form-readiness.js";
import type {
  MaterialCandidate,
  MaterialSource,
  MaterialSourceAdapter,
  MaterialSourceValidationReport
} from "../types/material.js";
import type { AudioMixOptions, AudioMixTrack, GeneratedAudioIntent } from "../types/audio.js";
import type { PostproductionSettings } from "../types/media.js";
import type { PostproductionAssetPlan } from "../types/postproduction-assets.js";
import type { CompiledPrompt, ShotContract } from "../types/prompt.js";
import type { AudioGenerationCapability, Prediction, ProviderMetadata } from "../types/provider.js";
import type { ReviewApprovalReport } from "../types/review-approval.js";
import type { VideoRenderStrategyPlan } from "../types/video-render-strategy.js";
import type { AudioProvider, ImageProvider, SpeechSynthesisProvider } from "../providers/contracts.js";
import type {
  ProductionStageEvidenceValue,
  ProductionStageName,
  ProductionStageProgressReporter,
  ProductionStageStatus
} from "../types/stage.js";
import { PRODUCTION_STAGE_ORDER } from "../types/stage.js";
import { asProviderError } from "../utils/errors.js";
import { createStableId } from "../utils/ids.js";
import { redactUnknown } from "../utils/redaction.js";
import { SeedancePromptCompiler } from "../prompt_compiler/prompt-compiler.js";
import { IntakeDirector } from "./intake-director.js";
import { RenderProducer } from "./render-producer.js";
import { StoryArchitect, isScriptFirstRequest } from "./story-architect.js";
import { CustomerActionableError } from "../core/customer-actionable-error.js";
import { ScriptEnhancer } from "./script-enhancer.js";
import { ReferenceVisionAnalyst, reconcileReferenceRoles } from "./reference-vision-analyst.js";

/**
 * Minimal structural view of MediaInspector — just enough to measure a synthesized voice track.
 * Structural (not a class import) so tests can hand in a stub and the director never depends on
 * ffprobe being present: every caller treats a missing prober as "measurement unavailable".
 */
/**
 * Turnaround views generated for every recurring character. The front view stays the primary
 * identity anchor; the other two exist so a shot that turns the character has real evidence to
 * follow instead of the video model inventing a profile.
 */
const CHARACTER_PORTRAIT_VIEWS: readonly PortraitView[] = ["front", "three_quarter", "side"];

/**
 * True when the provider gave back nothing usable — a failed/canceled prediction, or a "succeeded"
 * one carrying no output URL. Both mean the render did not happen, as opposed to happening badly.
 */
function isProviderRenderFailure(candidate: { readonly prediction: Prediction }): boolean {
  return candidate.prediction.status !== "succeeded" || candidate.prediction.outputUrls.length === 0;
}

/** Per-track deadline for measuring a synthesized voice file; the shared runner's default is 30 min. */
const VOICE_TRACK_PROBE_TIMEOUT_MS = 15_000;
/** How many voice tracks are measured at once — enough to hide latency, few enough to stay polite. */
const VOICE_TRACK_PROBE_CONCURRENCY = 6;

export interface SpeechDurationProber {
  probe(pathOrUrl: string, signal?: AbortSignal): Promise<{ readonly durationSeconds?: number }>;
}

export class DirectorAgent {
  private readonly intakeDirector: IntakeDirector;
  private readonly storyArchitect: StoryArchitect;
  private readonly shotPlanner: ShotPlanner;
  private readonly storyboardPlanner: StoryboardPlanner;
  private readonly storyboardApprovalGate: StoryboardApprovalGate;
  private readonly videoRenderStrategyPlanner: VideoRenderStrategyPlanner;
  private readonly continuityLedgerBuilder: ContinuityLedgerBuilder;
  private readonly longFormContinuityPlanner: LongFormContinuityPlanner;
  private readonly longFormAgentReviewPlanner: LongFormAgentReviewPlanner;
  private readonly longFormTimelinePlanner: LongFormTimelinePlanner;
  private readonly longFormCreativeIntelligencePlanner: LongFormCreativeIntelligencePlanner;
  private readonly longFormReadinessPlanner: LongFormReadinessPlanner;
  private readonly productionGraphBuilder: ProductionGraphBuilder;
  private readonly productionGraphRunRecorder: ProductionGraphRunRecorder;
  private readonly productionStagePlanner: ProductionStagePlanner;
  private readonly postproductionAssetPlanner: PostproductionAssetPlanner;
  private readonly generatedAudioOutputBatchValidator: GeneratedAudioOutputBatchValidator;
  private readonly generatedAudioExecutionRunner: GeneratedAudioProviderExecutionRunner;
  private readonly referenceSelectionPlanner: ReferenceSelectionPlanner;
  private readonly materialSourcingPlanner: MaterialSourcingPlanner;
  private readonly materialPlanningOptions: MaterialPlanningOptions;
  private readonly materialSourceAdapters: readonly MaterialSourceAdapter[];
  private readonly materialSourceValidator: MaterialSourceValidator;
  private readonly renderCostGate: RenderCostGate;
  private readonly promptCompiler: SeedancePromptCompiler;
  private readonly consistencyGuardian: ConsistencyGuardian;
  private readonly renderProducer: RenderProducer;
  private readonly renderScheduler: RenderScheduler;
  private readonly assemblyEngine: AssemblyEngine;
  private readonly deliveryGate: DeliveryGate;
  private readonly semanticVisualInspector: SemanticVisualInspector | undefined;
  private readonly imageAnchorVerifier: ImageAnchorVerifier | undefined;
  private readonly renderedCandidateVisualInspector: RenderedCandidateVisualInspector | undefined;
  /**
   * Measures real media duration (ffprobe). Optional so unit paths stay pure; when present it turns
   * the talking-shot duration check from an ESTIMATE into a MEASUREMENT before the expensive stage.
   */
  private readonly speechDurationProber: SpeechDurationProber | undefined;
  private readonly sourceVideoAutoAnalyzer: SourceVideoAutoAnalyzer | undefined;
  private readonly sourceVideoAutoAnalysisSettings: SourceVideoAutoAnalysisSettings | undefined;
  private readonly audioGenerationCapabilities: readonly AudioGenerationCapability[];
  private readonly audioProvider: AudioProvider | undefined;
  private readonly imageProvider: ImageProvider | undefined;
  private readonly speechProvider: SpeechSynthesisProvider | undefined;
  private readonly creativeBriefAnalyst: CreativeBriefAnalyst | undefined;
  private readonly referenceVisionAnalyst: ReferenceVisionAnalyst | undefined;
  private readonly scriptEnhancer: ScriptEnhancer | undefined;
  private readonly stageProgressReporter: ProductionStageProgressReporter | undefined;
  private readonly atlasSettings: AtlasCloudRuntimeSettings;
  private stageProgressSequence = 0;

  public constructor(input: {
    readonly storyArchitect: StoryArchitect;
    readonly renderProducer: RenderProducer;
    readonly atlasSettings: AtlasCloudRuntimeSettings;
    readonly intakeDirector?: IntakeDirector;
    readonly shotPlanner?: ShotPlanner;
    readonly storyboardPlanner?: StoryboardPlanner;
    readonly storyboardApprovalGate?: StoryboardApprovalGate;
    readonly videoRenderStrategyPlanner?: VideoRenderStrategyPlanner;
    readonly continuityLedgerBuilder?: ContinuityLedgerBuilder;
    readonly longFormContinuityPlanner?: LongFormContinuityPlanner;
    readonly longFormAgentReviewPlanner?: LongFormAgentReviewPlanner;
    readonly longFormTimelinePlanner?: LongFormTimelinePlanner;
    readonly longFormCreativeIntelligencePlanner?: LongFormCreativeIntelligencePlanner;
    readonly longFormReadinessPlanner?: LongFormReadinessPlanner;
    readonly productionGraphBuilder?: ProductionGraphBuilder;
    readonly productionGraphRunRecorder?: ProductionGraphRunRecorder;
    readonly productionStagePlanner?: ProductionStagePlanner;
    readonly postproductionAssetPlanner?: PostproductionAssetPlanner;
    readonly generatedAudioOutputBatchValidator?: GeneratedAudioOutputBatchValidator;
    readonly generatedAudioExecutionRunner?: GeneratedAudioProviderExecutionRunner;
    readonly referenceSelectionPlanner?: ReferenceSelectionPlanner;
    readonly materialSourcingPlanner?: MaterialSourcingPlanner;
    readonly materialPlanningOptions?: MaterialPlanningOptions;
    readonly materialSourceAdapters?: readonly MaterialSourceAdapter[];
    readonly materialSourceValidator?: MaterialSourceValidator;
    readonly renderCostGate?: RenderCostGate;
    readonly promptCompiler?: SeedancePromptCompiler;
    readonly consistencyGuardian?: ConsistencyGuardian;
    readonly renderConcurrency?: number;
    readonly assemblyEngine?: AssemblyEngine;
    readonly deliveryGate?: DeliveryGate;
    readonly semanticVisualInspector?: SemanticVisualInspector;
    /** Optional pre-video-spend image check (ViMax economy): verify portraits/keyframes for cents before dollars render on them. */
    readonly imageAnchorVerifier?: ImageAnchorVerifier;
    readonly renderedCandidateVisualInspector?: RenderedCandidateVisualInspector;
    readonly speechDurationProber?: SpeechDurationProber;
    readonly sourceVideoAutoAnalyzer?: SourceVideoAutoAnalyzer;
    readonly sourceVideoAutoAnalysisSettings?: SourceVideoAutoAnalysisSettings;
    readonly audioGenerationCapabilities?: readonly AudioGenerationCapability[];
    readonly audioProvider?: AudioProvider;
    readonly imageProvider?: ImageProvider;
    readonly speechProvider?: SpeechSynthesisProvider;
    readonly creativeBriefAnalyst?: CreativeBriefAnalyst;
    readonly referenceVisionAnalyst?: ReferenceVisionAnalyst;
    readonly scriptEnhancer?: ScriptEnhancer;
    readonly stageProgressReporter?: ProductionStageProgressReporter;
  }) {
    this.intakeDirector = input.intakeDirector ?? new IntakeDirector();
    this.storyArchitect = input.storyArchitect;
    this.shotPlanner = input.shotPlanner ?? new ShotPlanner();
    this.storyboardPlanner = input.storyboardPlanner ?? new StoryboardPlanner();
    this.storyboardApprovalGate = input.storyboardApprovalGate ?? new StoryboardApprovalGate();
    this.videoRenderStrategyPlanner = input.videoRenderStrategyPlanner ?? new VideoRenderStrategyPlanner();
    this.continuityLedgerBuilder = input.continuityLedgerBuilder ?? new ContinuityLedgerBuilder();
    this.longFormContinuityPlanner = input.longFormContinuityPlanner ?? new LongFormContinuityPlanner();
    this.longFormAgentReviewPlanner = input.longFormAgentReviewPlanner ?? new LongFormAgentReviewPlanner();
    this.longFormTimelinePlanner = input.longFormTimelinePlanner ?? new LongFormTimelinePlanner();
    this.longFormCreativeIntelligencePlanner = input.longFormCreativeIntelligencePlanner ?? new LongFormCreativeIntelligencePlanner();
    this.longFormReadinessPlanner = input.longFormReadinessPlanner ?? new LongFormReadinessPlanner();
    this.productionGraphBuilder = input.productionGraphBuilder ?? new ProductionGraphBuilder();
    this.productionGraphRunRecorder = input.productionGraphRunRecorder ?? new ProductionGraphRunRecorder();
    this.productionStagePlanner = input.productionStagePlanner ?? new ProductionStagePlanner();
    this.postproductionAssetPlanner = input.postproductionAssetPlanner ?? new PostproductionAssetPlanner();
    this.generatedAudioOutputBatchValidator = input.generatedAudioOutputBatchValidator ?? new GeneratedAudioOutputBatchValidator();
    this.generatedAudioExecutionRunner = input.generatedAudioExecutionRunner ?? new GeneratedAudioProviderExecutionRunner();
    this.referenceSelectionPlanner = input.referenceSelectionPlanner ?? new ReferenceSelectionPlanner();
    this.materialSourcingPlanner = input.materialSourcingPlanner ?? new MaterialSourcingPlanner();
    this.materialPlanningOptions = input.materialPlanningOptions ?? {};
    this.materialSourceAdapters = input.materialSourceAdapters ?? [];
    this.materialSourceValidator = input.materialSourceValidator ?? new MaterialSourceValidator();
    this.renderCostGate = input.renderCostGate ?? new RenderCostGate({ costBufferMultiplier: 1 });
    this.promptCompiler = input.promptCompiler ?? new SeedancePromptCompiler();
    this.consistencyGuardian = input.consistencyGuardian ?? new ConsistencyGuardian();
    this.renderProducer = input.renderProducer;
    this.renderScheduler = new RenderScheduler(input.renderConcurrency ?? 1);
    this.assemblyEngine = input.assemblyEngine ?? new AssemblyEngine();
    this.deliveryGate = input.deliveryGate ?? new DeliveryGate();
    this.semanticVisualInspector = input.semanticVisualInspector;
    this.imageAnchorVerifier = input.imageAnchorVerifier;
    this.renderedCandidateVisualInspector = input.renderedCandidateVisualInspector;
    this.speechDurationProber = input.speechDurationProber;
    this.sourceVideoAutoAnalyzer = input.sourceVideoAutoAnalyzer;
    this.sourceVideoAutoAnalysisSettings = input.sourceVideoAutoAnalysisSettings;
    this.audioGenerationCapabilities = input.audioGenerationCapabilities ?? [];
    this.audioProvider = input.audioProvider;
    this.imageProvider = input.imageProvider;
    this.speechProvider = input.speechProvider;
    this.creativeBriefAnalyst = input.creativeBriefAnalyst;
    this.referenceVisionAnalyst = input.referenceVisionAnalyst;
    this.scriptEnhancer = input.scriptEnhancer;
    this.stageProgressReporter = input.stageProgressReporter;
    this.atlasSettings = input.atlasSettings;
  }

  public async run(request: CineJellyProjectRequest, signal?: AbortSignal): Promise<DirectorRunResult> {
    this.reportStageProgress("plan", "running", "Preparing intake, story plan, shot plan, and reference selection.");
    const preparedRequest = await this.prepareRequestForIntake(request, signal);
    const baseIntakeRaw = this.intakeDirector.intake(preparedRequest);
    // Reference vision grounding (#1 upgrade): LOOK at the uploaded product/face/scene images and
    // attach short visual descriptors, so the analyst decides palette/style/visual-world from the
    // REAL asset, not just its label. Fail-open + only runs when https image refs exist (text-only
    // briefs pay nothing extra).
    // A vision call is MADE (and billed) whenever an https image reference exists — count on that,
    // not on whether descriptors came back, so the cost estimate reflects the call even when the
    // vision pass fails open to [] (cross-audit LOW #1).
    const visionEligible = Boolean(
      this.referenceVisionAnalyst &&
      baseIntakeRaw.references.some(
        (reference) =>
          reference.providerReference.kind === "image" &&
          typeof reference.providerReference.uri === "string" &&
          /^https:\/\//i.test(reference.providerReference.uri)
      )
    );
    // Budget hard-cap for the planning phase (openmontage estimate->reserve pattern): the LLM
    // calls below (vision, analyst, architect, enhancer) spend BEFORE the full pre-render cost gate
    // runs, so bound them by maxCostUsd HERE — a cap too small to even cover planning must block
    // before the first provider call, not after it. Same count the full gate uses (hoisted so both
    // stay in sync); this blocks a subset of what the full gate would block, just earlier, so no
    // currently-passing run newly fails.
    // The architect counts as TWO, not one. When the scheduled speech falls short of the ordered
    // runtime it makes a second, bounded call to continue the script (story-architect.ts, the
    // talking-fill and long-form paths) — which is the common case on talking or >=120s orders, not
    // an exotic one. Counting it as a single call understated the only ceiling that runs before any
    // provider is touched, and the same expression feeds both this early cap and the full gate
    // below, so the undercount applied twice.
    const plannedLlmPlanCallCount =
      2 +
      (this.creativeBriefAnalyst ? 1 : 0) +
      (this.scriptEnhancer ? 1 : 0) +
      (visionEligible ? 1 : 0);
    this.renderCostGate.assertPlanningWithinBudget({
      plannedLlmPlanCallCount,
      ...(baseIntakeRaw.settings.maxCostUsd !== undefined ? { maxCostUsd: baseIntakeRaw.settings.maxCostUsd } : {})
    });
    const referenceVisualDescriptors = visionEligible
      ? await this.referenceVisionAnalyst!.describe(baseIntakeRaw.references, baseIntakeRaw.metadata, signal)
      : [];
    // Content-based reference-role check BEFORE any keyframe/video spend (input-audit + ViMax pattern):
    // the vision analyst just looked at the pixels, so catch a mis-slotted upload — a product in the
    // KOL slot, a face in the product slot — and HALT here (only the cheap planning calls have run;
    // the job fails and refunds per policy) instead of paying to render the wrong asset as the face.
    // High-confidence only; fail-open when vision could not run, so a legit render is never blocked.
    const roleMismatches = reconcileReferenceRoles(baseIntakeRaw.references, referenceVisualDescriptors);
    if (roleMismatches.length > 0) {
      // CustomerActionableError: the API's customer job summary exposes THIS message as
      // customerGuidance (plain-VN fix-your-upload copy) — a generic "failed" would trap the
      // customer in an identical-retry loop (deep-audit: guard message never reached the customer).
      throw new CustomerActionableError(roleMismatches.map((mismatch) => mismatch.message).join(" "));
    }
    const baseIntake = referenceVisualDescriptors.length > 0
      ? { ...baseIntakeRaw, referenceVisualDescriptors }
      : baseIntakeRaw;
    // Deep brief understanding (Topview-class analyst stage): one structured LLM call decides
    // register/story-engine/style DNA BEFORE scripting. Fail-open — the analyst's own fallback is
    // deterministic, and an absent analyst leaves legacy behavior untouched.
    const creativeIntent = this.creativeBriefAnalyst
      ? await this.creativeBriefAnalyst.analyze(baseIntake, signal)
      : undefined;
    // The analyst's spoken-language decision becomes shot metadata under its OWN key
    // (analystVoiceLanguage) so the talking-shot TTS stage can voice Spanish as "es" (audit #6)
    // WITHOUT outranking either an explicit request language or the per-line Vietnamese-diacritic
    // detection — the analyst may be a fail-open whole-video guess, so per-line evidence wins
    // (cross-review: stamping voiceLanguage directly regressed EN briefs with VN dialogue).
    const analystVoiceLanguage =
      creativeIntent?.language?.trim() &&
      typeof baseIntake.metadata?.shortAudioLanguage !== "string" &&
      typeof baseIntake.metadata?.voiceLanguage !== "string"
        ? creativeIntent.language.trim()
        : undefined;
    const intake = creativeIntent
      ? {
          ...baseIntake,
          creativeIntent,
          ...(analystVoiceLanguage
            ? { metadata: { ...(baseIntake.metadata ?? {}), analystVoiceLanguage } }
            : {})
        }
      : baseIntake;
    if (creativeIntent) {
      this.reportStageProgress("plan", "running", "Creative intent resolved before scripting.", {
        register: creativeIntent.register,
        genre: creativeIntent.genre,
        language: creativeIntent.language
      });
    }
    const rawStoryPlan = await this.storyArchitect.plan(intake, signal);
    // Pre-render script polish (#2 quality upgrade): tighten continuity + naturalize dialogue +
    // firm up each emotional turn WITHOUT changing structure, before a single provider dollar is
    // spent. Fail-open — an absent enhancer or any error leaves the plan exactly as written.
    const storyPlan = this.scriptEnhancer
      ? await this.scriptEnhancer.enhance(
          rawStoryPlan,
          intake,
          isScriptFirstRequest(intake.userInput, intake.metadata),
          signal
        )
      : rawStoryPlan;
    const continuityLedger = this.continuityLedgerBuilder.build({
      intake,
      storyPlan
    });
    const plannedShots = this.withDurationCompensation(
      this.shotPlanner.plan({
        projectId: intake.projectId,
        scenes: storyPlan.scenes,
        settings: intake.settings,
        ...(intake.metadata ? { metadata: intake.metadata } : {})
      }),
      intake.settings,
      preparedRequest.transitionSettings
    );
    // Narrow each shot's identity references to the character(s) the beat actually casts BEFORE
    // reference-selection and keyframe planning. The architect stamps every beat with the FULL uploaded
    // roster and sets continuity.identity to the matching label(s); without narrowing, a shot cast as
    // "Linh" still carries Mai's uploaded face, so the keyframe/render conditions on BOTH faces and
    // blends them. Fail-safe: only narrows when 2+ identity refs need disambiguating AND the cast labels
    // actually match, otherwise the shot is left untouched (never drop a face on a guess).
    const shots = this.referenceSelectionPlanner.planForShots({
      shots: plannedShots.map((shot) => narrowShotReferencesToCast(shot))
    });
    const longFormContinuityPlan = this.longFormContinuityPlanner.build({
      projectId: intake.projectId,
      storyPlan,
      shots,
      references: intake.references,
      ...(intake.sourceVideoAnalysis ? { sourceVideoAnalysis: intake.sourceVideoAnalysis } : {})
    });
    const longFormAgentReview = this.longFormAgentReviewPlanner.build({
      projectId: intake.projectId,
      storyPlan,
      shots,
      continuityPlan: longFormContinuityPlan,
      ...(intake.sourceVideoAnalysis ? { sourceVideoAnalysis: intake.sourceVideoAnalysis } : {})
    });
    if (longFormAgentReview.status === "blocked") {
      this.reportStageProgress("plan", "blocked", "Long-form agentic review blocked prompt compilation.", {
        longFormAgentReviewFindingCount: longFormAgentReview.findingCount,
        longFormAgentReviewBlockingFindingCount: longFormAgentReview.blockingFindingCount
      });
      throw new Error(this.describeLongFormAgentReviewBlock(longFormAgentReview));
    }
    const videoRenderStrategyPlan = this.videoRenderStrategyPlanner.build({
      projectId: intake.projectId,
      request: this.videoRenderStrategyRequest(preparedRequest, intake),
      storyPlan,
      shots
    });
    if (!videoRenderStrategyPlan.releaseGateSummary.canProceedToRender) {
      this.reportStageProgress("plan", "blocked", "Video render strategy blocked provider spend.", {
        workflowMode: videoRenderStrategyPlan.workflowMode,
        continuityMode: videoRenderStrategyPlan.continuityMode,
        strategyBlockingIssueCount: videoRenderStrategyPlan.blockingIssueCount
      });
      throw new Error(this.describeVideoRenderStrategyBlock(videoRenderStrategyPlan));
    }
    this.reportStageProgress("plan", "succeeded", "Planning completed.", {
      sceneCount: storyPlan.scenes.length,
      shotCount: shots.length,
      workflowMode: videoRenderStrategyPlan.workflowMode,
      continuityMode: videoRenderStrategyPlan.continuityMode,
      strategyRequiresSequentialRender: videoRenderStrategyPlan.requiresSequentialRender,
      strategyRequiresStoryboardApproval: videoRenderStrategyPlan.requiresStoryboardApproval,
      longFormSequenceCount: longFormContinuityPlan.sequenceCount,
      highRiskSequenceCount: longFormContinuityPlan.highRiskSequenceCount,
      longFormAgentReviewStatus: longFormAgentReview.status,
      longFormAgentReviewFindingCount: longFormAgentReview.findingCount,
      longFormAgentReviewBlockingFindingCount: longFormAgentReview.blockingFindingCount,
      targetDurationSeconds: storyPlan.targetDurationSeconds,
      referenceCount: intake.references.length
    });
    this.reportStageProgress("storyboard", "running", "Planning storyboard panels and running storyboard preflight.");
    const storyboard = this.storyboardPlanner.plan({
      projectId: intake.projectId,
      storyPlan,
      shots
    });
    const storyboardPreflight = this.consistencyGuardian.inspectStoryboard({
      storyboard,
      shots
    });
    this.reportStageProgress(
      "storyboard",
      this.guardianStageStatus(storyboardPreflight.status),
      "Storyboard preflight completed.",
      {
        storyboardPanelCount: storyboard.panels.length,
        storyboardPreflightStatus: storyboardPreflight.status,
        findingCount: storyboardPreflight.findings.length
      }
    );
    if (storyboardPreflight.status === "block" || storyboardPreflight.status === "repair") {
      throw new Error(this.describeStoryboardBlock(storyboardPreflight));
    }
    const storyboardApprovalReport = this.storyboardApprovalGate.evaluate({
      projectId: intake.projectId,
      request: this.videoRenderStrategyRequest(preparedRequest, intake),
      storyboard,
      strategy: videoRenderStrategyPlan
    });
    if (storyboardApprovalReport) {
      const approvalEvidence = this.storyboardApprovalEvidence(storyboardApprovalReport);
      if (!storyboardApprovalReport.releaseGateSummary.canRenderAfterReview) {
        this.reportStageProgress(
          "storyboard",
          "blocked",
          "Storyboard approval gate blocked provider spend.",
          approvalEvidence
        );
        throw new Error(this.describeStoryboardApprovalBlock(storyboardApprovalReport));
      }
      this.reportStageProgress(
        "storyboard",
        "succeeded",
        "Storyboard approval gate passed before provider spend.",
        approvalEvidence
      );
    }
    const modelId = resolveSeedanceModelId(intake.settings, this.atlasSettings, intake.modelPreferences);
    const providerSupportedReferenceKinds = this.renderProducer.supportedReferenceKinds(modelId);
    this.reportStageProgress("prompt", "running", "Compiling provider-ready prompts and binding references.");
    const compiledPrompts = shots.map((shot) =>
      this.promptCompiler.compile({
        shot,
        settings: intake.settings,
        modelId,
        provider: "atlascloud",
        ...(providerSupportedReferenceKinds ? { providerSupportedReferenceKinds } : {})
      })
    );
    if (compiledPrompts.length === 0) {
      this.reportStageProgress("prompt", "failed", "Prompt compilation produced no renderable prompts.");
      throw new Error("Story planning produced no renderable shots. Regenerate the story plan before rendering.");
    }
    this.reportStageProgress("prompt", "succeeded", "Prompt compilation completed.", {
      compiledPromptCount: compiledPrompts.length,
      providerReferenceCount: compiledPrompts.reduce((sum, prompt) => sum + prompt.references.length, 0)
    });
    this.validateProviderCapabilities(compiledPrompts);
    const plannedTestTakeCount = shots.filter((shot) => this.shouldRunTestTake(shot, intake.settings)).length;
    const keyframeFirstEnabled = this.keyframeFirstEnabled(providerSupportedReferenceKinds);
    // Character anchors: invented characters that recur but have no uploaded face get ONE shared
    // portrait each so their identity stays stable across the video (final-audit gap #2). Bounded,
    // and counted into the cost gate BEFORE spend — this can only raise the estimate (the safe
    // direction: the gate blocks sooner, never overspends). Uploaded-face requests plan zero anchors.
    // Map each scripted character's appearance sheet (storyPlan.cast) to its normalized key so the
    // anchor portrait uses a clean, specific face description instead of the scene subject line.
    const castAppearance = new Map<string, string>();
    for (const member of storyPlan.cast ?? []) {
      const key = normalizeCharacterKey(member.label);
      if (key && member.appearance.trim()) {
        castAppearance.set(key, member.appearance.trim());
      }
    }
    const characterAnchors = keyframeFirstEnabled && this.imageProvider && this.atlasSettings.models.imageModel?.trim()
      ? planCharacterAnchors(shots, undefined, castAppearance)
      : [];
    // Talking-shot spend (TTS + audio-driven avatar renders) is counted into the SAME pre-spend
    // gate as everything else (audit #9: it previously executed after the only budget assert and
    // was absent from the cost model, so maxCostUsd did not bound it). Counting is an upper bound
    // over PLAUSIBLE routes: a spoken shot can only reach the avatar model with a character image,
    // which exists either because keyframe-first will mint one or the shot already carries an
    // HTTPS identity/first-frame reference. Shots with no possible image path cost $0 here —
    // counting them would hard-block runs whose avatar spend is provably zero (cross-review).
    const talkingRoutingConfigured = Boolean(
      this.atlasSettings.models.avatarModel?.trim() &&
      this.atlasSettings.models.ttsModel?.trim() &&
      this.speechProvider
    );
    const plannedTalkingShots = talkingRoutingConfigured
      ? shots.filter((shot) =>
          Boolean(shot.spokenLine?.trim()) && (keyframeFirstEnabled || decideAvatarShot(shot).talking)
        )
      : [];
    // The image-anchor verifier costs a VISION call per generated image, plus one more to re-verify
    // each regeneration — entirely absent from the old estimate (cost-architecture audit: 11 real
    // LLM calls vs 3 estimated). Upper bound = 2 per planned base image.
    const plannedVerifierVisionCallCount = keyframeFirstEnabled && this.imageAnchorVerifier
      ? (shots.length + characterAnchors.length) * 2
      : 0;
    // Best-of-N curation now runs automatically whenever more than one candidate is paid for, so its
    // vision calls must be in the estimate too. REPAIR takes are curated as well, so the bound is
    // candidates PLUS repair attempts — counting only the originals understated the worst case by
    // (shots x repairAttempts) calls and could let a job whose ceiling sits just under maxCostUsd
    // slip past the only budget check that runs before any money is spent. This is the same
    // candidate+repair shape the render cost gate already uses for the video side.
    const curationTakesPerShot =
      candidateCountForQuality(intake.settings.qualityMode) > 1
        ? candidateCountForQuality(intake.settings.qualityMode) + repairAttemptCountForQuality(intake.settings.qualityMode)
        : 0;
    const plannedCandidateCurationVisionCallCount =
      this.renderedCandidateVisualInspector ? shots.length * curationTakesPerShot : 0;
    // PRE-SPEND DELIVERABLE-DURATION ASSERT (cost-architecture audit). An avatar-routed shot's clip
    // lasts exactly its spoken line, so the DELIVERED runtime is knowable right here — and this is
    // the first point that knows WHICH shots will actually be avatar-routed (plannedTalkingShots),
    // which the story architect cannot know. The delivery gate rejects anything under 90% of the
    // order, but only AFTER every image, voice, clip and the assembly are paid for: the real
    // incident burned $2.77 per attempt to learn what this arithmetic knows for the price of the
    // planning calls already made. Same tolerance as the delivery gate, so it can only stop what
    // delivery would have stopped anyway.
    this.assertDeliverableDurationBeforeSpend(
      shots,
      plannedTalkingShots,
      intake.settings.durationTargetSeconds,
      preparedRequest.transitionSettings
    );
    const costEstimate = this.renderCostGate.estimate({
      compiledPrompts,
      settings: intake.settings,
      plannedTestTakeCount,
      plannedTestTakeRenderSeconds: plannedTestTakeCount * SEEDANCE_TEST_TAKE_DURATION_SECONDS,
      // Count the VERIFIER's regenerations too (cost-architecture audit): every generated keyframe
      // and anchor portrait is checked by the image-anchor verifier and a failing one is regenerated
      // ONCE — so the real worst case is 2x the base image count, and the real incident paid for 8
      // images while the gate estimated 4. An estimate that omits half the images makes maxCostUsd a
      // decorative number instead of a ceiling; count the upper bound so the gate can only block
      // sooner, never overspend.
      // Each recurring character now costs one image PER TURNAROUND VIEW, not one image total, so
      // the character term is multiplied by the view count. Undercounting here would make maxCostUsd
      // decorative in exactly the case it matters most — a series with a large cast.
      plannedKeyframeImageCount: keyframeFirstEnabled
        ? (shots.length + characterAnchors.length * CHARACTER_PORTRAIT_VIEWS.length) *
          (this.imageAnchorVerifier ? 2 : 1)
        : 0,
      plannedTalkingShotCount: plannedTalkingShots.length,
      plannedAvatarRenderSeconds: plannedTalkingShots.reduce((sum, shot) => sum + shot.durationSeconds, 0),
      // Architect + analyst + enhancer + vision (hoisted above for the planning-phase hard cap) PLUS
      // the verifier's own vision call per generated image (~2 per image worst case: verify, then
      // re-verify the regeneration) — 11 real calls vs 3 estimated in the incident.
      plannedLlmPlanCallCount: plannedLlmPlanCallCount + plannedVerifierVisionCallCount + plannedCandidateCurationVisionCallCount
    });
    this.renderCostGate.assertWithinBudget(costEstimate);

    const preflightReports = compiledPrompts.map((compiledPrompt) => {
      const shot = shots.find((candidate) => candidate.shotId === compiledPrompt.shotId);
      if (!shot) {
        throw new Error(`Compiled prompt has no matching shot: ${compiledPrompt.shotId}`);
      }
      return this.consistencyGuardian.preflight({
        shot,
        prompt: compiledPrompt.prompt,
        negativePrompt: compiledPrompt.negativePrompt,
        bindingPlan: compiledPrompt.bindingPlan,
        ledger: continuityLedger
      });
    });
    const videoConsistencyReport = this.consistencyGuardian.inspectVideoConsistency({
      projectId: intake.projectId,
      shots: [...shots]
    });
    const blockingPreflightReports = [...preflightReports, videoConsistencyReport].filter(
      (report) => report.status === "block" || report.status === "repair"
    );
    if (blockingPreflightReports.length > 0) {
      this.reportStageProgress("prompt", "blocked", "Prompt and reference preflight blocked render spend.", {
        blockingPreflightCount: blockingPreflightReports.length
      });
      throw new Error(this.describePreflightBlock(blockingPreflightReports));
    }

    // ---- PRE-SPEND FAIL-CLOSED GATES (deep-audit HIGH + validate-before-spend pattern) ----
    // The long-form timeline/creative/readiness gates are fail-closed and their own messages say
    // "before provider spend" — so they MUST run before the keyframe-image and TTS provider calls
    // below. They are computed here from a PRE-keyframe render schedule (built from `shots`); the
    // schedule is rebuilt from the keyframe-bound shots after the spend, for the actual render.
    const postproductionAssetPlan = this.postproductionAssetPlanner.plan({
      projectId: intake.projectId,
      ...(preparedRequest.captionCues ? { captionCues: preparedRequest.captionCues } : {}),
      ...(preparedRequest.captionOptions ? { captionOptions: preparedRequest.captionOptions } : {}),
      ...(preparedRequest.audioTracks ? { audioTracks: preparedRequest.audioTracks } : {}),
      ...(preparedRequest.audioMixOptions ? { audioMixOptions: preparedRequest.audioMixOptions } : {}),
      ...(preparedRequest.generatedAudioIntents ? { generatedAudioIntents: preparedRequest.generatedAudioIntents } : {}),
      audioGenerationCapabilities: this.audioGenerationCapabilities,
      generatedAudioExecutionMode: this.canExecuteGeneratedAudio(preparedRequest) ? "execute" : "planned_only"
    });
    const candidateCount = candidateCountForQuality(intake.settings.qualityMode);
    const repairAttemptCount = repairAttemptCountForQuality(intake.settings.qualityMode);
    const strategySequentialReasons = this.strategySequentialReasons(videoRenderStrategyPlan);
    const buildRenderScheduleItems = (scheduleShots: readonly ShotContract[]): readonly RenderScheduleItem<{
      readonly compiledPrompt: CompiledPrompt;
      readonly preflight: GuardianReport;
      readonly shouldRunTestTake: boolean;
    }>[] => compiledPrompts.map((compiledPrompt, promptIndex) => {
      const shot = scheduleShots.find((candidate) => candidate.shotId === compiledPrompt.shotId);
      const preflight = preflightReports[promptIndex];
      if (!shot) {
        throw new Error(`Compiled prompt has no matching shot: ${compiledPrompt.shotId}`);
      }
      if (!preflight) {
        throw new Error(`Missing preflight report for compiled prompt: ${compiledPrompt.shotId}`);
      }
      return {
        index: promptIndex,
        shot,
        ...(strategySequentialReasons.length > 0 ? { forceSequentialReasons: strategySequentialReasons } : {}),
        value: {
          compiledPrompt,
          preflight,
          shouldRunTestTake: this.shouldRunTestTake(shot, intake.settings)
        }
      };
    });
    // Build + fail-closed-assert the three long-form release gates (timeline -> creative
    // intelligence -> readiness) ONCE, after keyframe binding, on the REAL render schedule.
    // (Redundancy-audit R1: the old second pre-keyframe pass could never block anything the
    // earlier agent-review/strategy gates hadn't already thrown on — the gate decision is
    // invariant to keyframe binding — so the double build was pure CPU + three extra dead throw
    // sites on every render. The single authoritative pass keeps the full delivered evidence.)
    const assertLongFormReleaseGates = (
      gateSchedulePlan: ReturnType<typeof this.renderScheduler.plan>,
      spendStage: "pre_spend" | "pre_render"
    ) => {
      const spendLabel = spendStage === "pre_spend" ? "before any provider spend" : "before render spend";
      const timelinePlan = this.longFormTimelinePlanner.build({
        projectId: intake.projectId,
        targetDurationSeconds: storyPlan.targetDurationSeconds,
        shots,
        continuityPlan: longFormContinuityPlan,
        renderSchedulePlan: gateSchedulePlan,
        postproductionAssetPlan,
        ...(preparedRequest.captionCues ? { captionCues: preparedRequest.captionCues } : {}),
        ...(preparedRequest.generatedAudioIntents ? { generatedAudioIntents: preparedRequest.generatedAudioIntents } : {}),
        seedanceSettings: intake.settings
      });
      if (!timelinePlan.releaseGateSummary.canProceedToRender) {
        this.reportStageProgress("render", "blocked", `Long-form timeline blocked render scheduling ${spendLabel}.`, {
          longFormTimelineIssueCount: timelinePlan.issueCount,
          longFormTimelineBlockingIssueCount: timelinePlan.blockingIssueCount
        });
        throw new Error(`Long-form timeline blocked render scheduling ${spendLabel}.`);
      }
      const creativeIntelligencePlan = this.longFormCreativeIntelligencePlanner.build({
        projectId: intake.projectId,
        userInput: preparedRequest.userInput,
        storyPlan,
        shots,
        continuityPlan: longFormContinuityPlan,
        agentReview: longFormAgentReview,
        videoRenderStrategyPlan,
        timelinePlan,
        postproductionAssetPlan,
        ...(intake.sourceVideoAnalysis ? { sourceVideoAnalysis: intake.sourceVideoAnalysis } : {})
      });
      if (!creativeIntelligencePlan.releaseGateSummary.canProceedToRender) {
        this.reportStageProgress("render", "blocked", `Long-form creative intelligence blocked render ${spendLabel}.`, {
          longFormCreativeStatus: creativeIntelligencePlan.status,
          longFormCreativeQualityScore: creativeIntelligencePlan.qualityScore,
          longFormCreativeFindingCount: creativeIntelligencePlan.findingCount,
          longFormCreativeBlockingFindingCount: creativeIntelligencePlan.blockingFindingCount
        });
        throw new Error(this.describeLongFormCreativeIntelligenceBlock(creativeIntelligencePlan));
      }
      const readinessPlan = this.longFormReadinessPlanner.build({
        projectId: intake.projectId,
        userInput: preparedRequest.userInput,
        storyPlan,
        shots,
        continuityPlan: longFormContinuityPlan,
        agentReview: longFormAgentReview,
        videoRenderStrategyPlan,
        timelinePlan,
        creativeIntelligencePlan,
        renderSchedulePlan: gateSchedulePlan,
        postproductionAssetPlan,
        ...(intake.sourceVideoAnalysis ? { sourceVideoAnalysis: intake.sourceVideoAnalysis } : {})
      });
      if (!readinessPlan.releaseGateSummary.canProceedToRender) {
        this.reportStageProgress("render", "blocked", `Long-form readiness blocked render ${spendLabel}.`, {
          longFormReadinessStatus: readinessPlan.status,
          longFormReadinessIntentKind: readinessPlan.intentRoute.intentKind,
          longFormReadinessCoherenceScore: readinessPlan.coherence.overallScore,
          longFormReadinessRepairQueueCount: readinessPlan.repairQueue.length,
          longFormReadinessBlockingRepairCount: readinessPlan.repairQueue.filter((repair) => repair.blocksRender).length
        });
        throw new Error(this.describeLongFormReadinessBlock(readinessPlan));
      }
      return { timelinePlan, creativeIntelligencePlan, readinessPlan };
    };
    // The long-form release battery is FAIL-CLOSED: when it blocks, the job dies. It therefore has
    // to run while dying is still free. It did not. A redundancy pass removed what it called a
    // duplicate second build, but it removed the EARLY one and kept the late one, and left behind a
    // comment further down claiming the gates "already ran fail-closed above, before any
    // keyframe-image or TTS provider spend" — which was false: there was exactly one call site, and
    // it sat after both. Every block was therefore charged for a full set of keyframe images and
    // voice tracks first.
    //
    // Running it here is sound for the reason that same comment gives: keyframe binding only
    // attaches a still reference to a shot, it never changes shot count, duration or ordering, so
    // the wave structure it schedules is identical either way. The post-keyframe pass below is kept
    // — it costs ~80ms and no money — so the delivered evidence still describes the real schedule.
    assertLongFormReleaseGates(this.renderScheduler.plan(buildRenderScheduleItems(shots)), "pre_spend");

    // ---- END PRE-SPEND GATES. From here, provider money may be spent. ----

    // Keyframe-first: generate an approved still opening frame per shot, then flip each
    // bound shot to image-to-video. Runs only after every pre-spend gate above has passed
    // (cost estimate already includes the planned keyframe images) and fails open per shot.
    const renderReadyShots = keyframeFirstEnabled
      ? await this.runKeyframeFirstStage({
          shots,
          compiledPrompts,
          settings: intake.settings,
          modelId,
          characterAnchors,
          ...(castAppearance.size > 0 ? { castAppearance } : {}),
          ...(providerSupportedReferenceKinds ? { providerSupportedReferenceKinds } : {}),
          ...(signal ? { signal } : {})
        })
      : shots;

    // Talking-shot routing (Topview-class architecture): shots with a verbatim spoken line and a
    // character image are voiced FIRST (TTS) and routed to the audio-driven avatar model, so
    // lip-sync, expression, and gesture follow the real speech. B-roll keeps the general model.
    // Fail-open per shot: any TTS failure leaves that shot on its normal video path. The stage as a
    // whole CAN throw, once, and deliberately: it measures the voice tracks it just bought and stops
    // a provably-short video here, where only cents are spent, instead of at the delivery gate after
    // every avatar render is paid for.
    await this.runTalkingShotStage({
      shots: renderReadyShots,
      compiledPrompts,
      settings: intake.settings,
      ...(preparedRequest.transitionSettings ? { transitionSettings: preparedRequest.transitionSettings } : {}),
      ...(signal ? { signal } : {})
    });

    this.reportStageProgress("source_material", "running", "Planning source-material briefs and resolving configured adapters.");
    const materialSourcingPlan = this.materialSourcingPlanner.plan({
      projectId: intake.projectId,
      shots,
      settings: intake.settings,
      ...(this.materialPlanningOptions.allowRemoteSources !== undefined
        ? { allowRemoteSources: this.materialPlanningOptions.allowRemoteSources }
        : {}),
      ...(this.materialPlanningOptions.preferredSources ? { preferredSources: this.materialPlanningOptions.preferredSources } : {}),
      ...(this.materialPlanningOptions.maxCandidatesPerBrief !== undefined
        ? { maxCandidatesPerBrief: this.materialPlanningOptions.maxCandidatesPerBrief }
        : {})
    });
    const materialCandidates = await this.resolveMaterialCandidates(materialSourcingPlan, signal);
    const materialSourceValidation = this.materialSourceValidator.validate({
      plan: materialSourcingPlan,
      candidates: materialCandidates
    });
    this.reportStageProgress(
      "source_material",
      this.materialSourceStageStatus(materialSourceValidation),
      "Source-material planning and validation completed.",
      {
        materialBriefCount: materialSourcingPlan.briefs.length,
        materialCandidateCount: materialSourceValidation.candidateCount,
        selectedMaterialCandidateCount: materialSourceValidation.selectedCandidateCount,
        materialValidationStatus: materialSourceValidation.status
      }
    );
    const productionGraph = this.productionGraphBuilder.build({
      intake,
      storyPlan,
      shots,
      storyboard,
      storyboardPreflight,
      materialSourcingPlan
    });

    // Rebuild the render schedule from the keyframe-bound shots (image-to-video flips). The
    // The pre-spend pass above already ran this battery on the pre-keyframe schedule; this one
    // refreshes the delivered evidence against the schedule actually used to render.
    const renderScheduleItems = buildRenderScheduleItems(renderReadyShots);
    const renderSchedulePlan = this.renderScheduler.plan(renderScheduleItems);
    // Authoritative post-keyframe re-gate on the REAL render schedule: refreshes the delivered
    // long-form evidence to the actual image-to-video scheduling and fails closed before the
    // (largest) render spend if keyframe binding introduced any blocking condition.
    const { timelinePlan: longFormTimelinePlan, creativeIntelligencePlan: longFormCreativeIntelligencePlan, readinessPlan: longFormReadinessPlan } =
      assertLongFormReleaseGates(renderSchedulePlan, "pre_render");
    this.reportStageProgress("render", "running", "Rendering scheduled shots and candidates.", {
      scheduledShotCount: compiledPrompts.length,
      renderScheduleBatchCount: renderSchedulePlan.batchCount,
      renderScheduleParallelBatchCount: renderSchedulePlan.parallelBatchCount,
      renderScheduleSequentialShotCount: renderSchedulePlan.sequentialItemCount,
      longFormTimelineSegmentCount: longFormTimelinePlan.segmentCount,
      longFormTimelineIssueCount: longFormTimelinePlan.issueCount,
      longFormCreativeStatus: longFormCreativeIntelligencePlan.status,
      longFormCreativeQualityScore: longFormCreativeIntelligencePlan.qualityScore,
      longFormCreativeFindingCount: longFormCreativeIntelligencePlan.findingCount,
      longFormCreativeCandidateDirectiveCount: longFormCreativeIntelligencePlan.candidateDirectiveCount,
      longFormCreativeRepairDirectiveCount: longFormCreativeIntelligencePlan.repairDirectiveCount,
      longFormReadinessStatus: longFormReadinessPlan.status,
      longFormReadinessIntentKind: longFormReadinessPlan.intentRoute.intentKind,
      longFormReadinessCoherenceScore: longFormReadinessPlan.coherence.overallScore,
      longFormReadinessRepairQueueCount: longFormReadinessPlan.repairQueue.length,
      longFormReadinessManualShotReviewCount: longFormReadinessPlan.adaptiveShotDecisions.filter((decision) => decision.requiresManualReview).length,
      candidateCount,
      repairAttemptCount
    });
    let renderResults: readonly RenderScheduleResult<RenderedShot>[];
    let previousRenderedShot: RenderedShot | undefined;
    try {
      renderResults = await this.renderScheduler.run(
        renderScheduleItems,
        async (item) => {
          const prepared = await this.prepareChainedRenderItem({
            item,
            previousRenderedShot,
            videoRenderStrategyPlan,
            settings: intake.settings,
            modelId,
            ...(providerSupportedReferenceKinds ? { providerSupportedReferenceKinds } : {}),
            continuityLedger,
            ...(preparedRequest.workDirectory ?? preparedRequest.artifactDirectory
              ? { workDirectory: preparedRequest.workDirectory ?? preparedRequest.artifactDirectory }
              : {}),
            ...(signal ? { signal } : {})
          });
          const visualCuration = this.candidateVisualCurationFor(preparedRequest, candidateCount);
          const renderedShot = await this.renderShot({
            shot: prepared.shot,
            compiledPrompt: prepared.compiledPrompt,
            preflight: prepared.preflight,
            shouldRunTestTake: item.value.shouldRunTestTake,
            candidateCount,
            repairAttemptCount,
            ...(visualCuration ? { visualCuration } : {}),
            signal
          });
          if (this.shouldAbortSequentialRenderAfterFailedShot(item, renderedShot, renderSchedulePlan)) {
            this.reportStageProgress(
              "render",
              "failed",
              "Stopping dependent render sequence after a shot failed inspection.",
              {
                failedShotId: renderedShot.compiledPrompt.shotId,
                failedPredictionStatus: renderedShot.prediction.status,
                failedRenderInspectionStatus: renderedShot.renderInspection.status,
                renderScheduleBatchCount: renderSchedulePlan.batchCount
              }
            );
            throw new Error(this.describeRenderBlock([renderedShot]));
          }
          previousRenderedShot = renderedShot;
          return renderedShot;
        }
      );
    } catch (error) {
      this.reportStageProgress("render", "failed", "Render scheduler failed before producing completed shot evidence.");
      throw error;
    }
    const renderedShots = renderResults.map((result) => result.value);
    this.reportStageProgress("render", this.renderedShotsStageStatus(renderedShots), "Render stage completed.", {
      renderedShotCount: renderedShots.length,
      renderedTestTakeCount: renderedShots.filter((shot) => shot.testTake).length,
      totalCandidateCount: this.totalCandidateCount(renderedShots)
    });
    for (const [index, renderedShot] of renderedShots.entries()) {
      compiledPrompts[index] = renderedShot.compiledPrompt;
    }
    this.reportStageProgress("inspect", "running", "Inspecting rendered shots.");
    // WHAT MAY KILL A FULLY-PAID JOB, AND WHAT MAY NOT.
    //
    // Every clip reaching this point has already been rendered and billed, and its repair budget is
    // spent. The question is no longer "can this be improved" — it is "is this deliverable". Those
    // are different questions and the inspector answers them with different severities:
    //   rerender / block -> the clip is genuinely unusable (no output, wrong duration, broken frame)
    //   repair           -> it could be better
    //
    // This gate used to refuse on ALL THREE, so a single "could be better" verdict on shot 7 of 10
    // destroyed the other nine finished clips and the customer got nothing after paying for
    // everything. That is the worse outcome by every measure: they would rather have the video with
    // one imperfect shot, and they can always run it again if they disagree.
    //
    // So only unusable clips block. A surviving "repair" verdict is recorded as a warning, travels
    // into the delivered evidence, and the video ships. The delivery gate still has the final say on
    // the assembled file — runtime, resolution, missing streams — so a genuinely broken deliverable
    // is still caught downstream.
    const unusableRenderReports = renderedShots.filter((renderedShot) =>
      this.needsTestTakeBlock(renderedShot.renderInspection)
    );
    if (unusableRenderReports.length > 0) {
      this.reportStageProgress("inspect", "blocked", "Rendered shot inspection blocked delivery.", {
        blockingInspectionCount: unusableRenderReports.length
      });
      throw new Error(this.describeRenderBlock(unusableRenderReports));
    }
    const imperfectRenderReports = renderedShots.filter(
      (renderedShot) => renderedShot.renderInspection.status === "repair"
    );
    if (imperfectRenderReports.length > 0) {
      this.reportStageProgress("inspect", "warn", "Delivering with imperfect shots after the repair budget was spent.", {
        imperfectShotCount: imperfectRenderReports.length,
        imperfectShotIds: imperfectRenderReports.map((shot) => shot.compiledPrompt.shotId).join(",")
      });
    }
    this.reportStageProgress("inspect", this.inspectionStageStatus(renderedShots), "Rendered shot inspection completed.", {
      warningInspectionCount: renderedShots.filter((shot) => shot.renderInspection.status === "warn").length,
      imperfectShotCount: imperfectRenderReports.length
    });
    this.reportStageProgress("repair", this.repairStageStatus(renderedShots), "Repair stage completed or skipped.", {
      repairAttemptCount: renderedShots.reduce((sum, shot) => sum + shot.repairAttemptCount, 0)
    });

    const shouldAssemble = Boolean(preparedRequest.outputPath && preparedRequest.workDirectory && renderedShots.length > 0);
    const generatedAudioOutputBatchValidation = shouldAssemble
      ? await this.executeGeneratedAudioIfReady({
          intents: preparedRequest.generatedAudioIntents ?? [],
          postproductionAssetPlan,
          ...(signal ? { signal } : {})
        })
      : undefined;
    const audioTracksForAssembly = this.audioTracksForAssembly(
      preparedRequest.audioTracks,
      generatedAudioOutputBatchValidation?.audioTracks
    );
    const audioMixOptionsForAssembly = this.audioMixOptionsForAssembly(
      preparedRequest.audioMixOptions,
      audioTracksForAssembly
    );
    if (shouldAssemble) {
      this.reportStageProgress("assemble", "running", "Assembling rendered clips into the deliverable.");
    }
    const deliverable = shouldAssemble
      ? await this.assemblyEngine.assemble(
          {
            projectId: intake.projectId,
            outputPath: preparedRequest.outputPath as string,
            workDirectory: preparedRequest.workDirectory as string,
            ...(preparedRequest.captionCues ? { captionCues: preparedRequest.captionCues } : {}),
            ...(preparedRequest.captionOptions ? { captionOptions: preparedRequest.captionOptions } : {}),
            ...(audioTracksForAssembly.length > 0 ? { audioTracks: audioTracksForAssembly } : {}),
            ...(audioMixOptionsForAssembly ? { audioMixOptions: audioMixOptionsForAssembly } : {}),
            ...(preparedRequest.frameSamplingOptions ? { frameSamplingOptions: preparedRequest.frameSamplingOptions } : {}),
            ...(preparedRequest.transitionSettings ? { transitionSettings: preparedRequest.transitionSettings } : {}),
            postproductionSettings: this.postproductionSettingsForDelivery(intake.settings),
            clips: selectAssemblyClipsForRenderedShots(renderedShots)
          },
          signal
        )
      : undefined;
    this.reportStageProgress(
      "assemble",
      deliverable ? "succeeded" : "skipped",
      deliverable ? "Assembly completed." : "Assembly skipped because no deliverable path was requested.",
      {
        hasDeliverable: Boolean(deliverable)
      }
    );
    if (deliverable) {
      this.reportStageProgress("deliver", "running", "Evaluating delivery gate.");
    }
    const deliveryGate = deliverable
      ? this.deliveryGate.evaluate({
          deliverable,
          settings: intake.settings
        })
      : undefined;
    if (deliveryGate) {
      this.reportStageProgress(
        "deliver",
        this.deliveryGateStageStatus(deliveryGate),
        "Delivery gate completed.",
        {
          deliveryGateStatus: deliveryGate.status,
          findingCount: deliveryGate.findings.length
        }
      );
      this.deliveryGate.assertPass(deliveryGate);
    } else {
      this.reportStageProgress("deliver", "skipped", "Delivery skipped because no deliverable was assembled.", {
        deliveryGateStatus: "not_run"
      });
    }
    const semanticVisualInspection =
      deliverable?.frameSamples && preparedRequest.semanticVisualInspectionOptions?.enabled
        ? await this.requireSemanticVisualInspector().inspect(
            deliverable.frameSamples,
            preparedRequest.semanticVisualInspectionOptions,
            signal
          )
        : undefined;
    const finalProductionGraph = this.productionGraphRunRecorder.record({
      graph: productionGraph,
      renderedShots,
      ...(deliverable ? { deliverable } : {}),
      settings: intake.settings
    });
    const stagePlan = this.productionStagePlanner.plan({
      projectId: intake.projectId,
      storyPlan,
      shots,
      storyboard,
      storyboardPreflight,
      ...(storyboardApprovalReport ? { storyboardApprovalReport } : {}),
      materialSourcingPlan,
      materialSourceValidation,
      postproductionAssetPlan,
      compiledPrompts,
      renderedShots,
      deliverablePresent: Boolean(deliverable),
      videoRenderStrategyPlan,
      longFormCreativeIntelligencePlan,
      longFormReadinessPlan,
      ...(deliveryGate ? { deliveryGate } : {}),
      productionGraph: finalProductionGraph
    });

    // Identity portraits bound to this run, keyed per character — Series persists these so episode
    // 2+ reuses episode 1's face. Without it an invented character got a brand-new face every
    // episode (the store already had the slot and already knew how to reuse it; nothing wrote it).
    const boundCharacterAnchors = (() => {
      const byKey = new Map<string, { characterKey: string; label: string; uri: string }>();
      for (const shot of renderReadyShots) {
        for (const reference of shot.references) {
          if (reference.role !== "identity") {
            continue;
          }
          const uri = reference.providerReference.uri;
          const key = normalizeCharacterKey(reference.label);
          if (!key || typeof uri !== "string" || !/^https:\/\//.test(uri) || byKey.has(key)) {
            continue;
          }
          byKey.set(key, { characterKey: key, label: reference.label, uri });
        }
      }
      return [...byKey.values()];
    })();

    return {
      projectId: intake.projectId,
      characterAnchors: boundCharacterAnchors,
      storyPlan,
      storyboard,
      storyboardPreflight,
      ...(storyboardApprovalReport ? { storyboardApprovalReport } : {}),
      productionGraph: finalProductionGraph,
      longFormContinuityPlan,
      longFormAgentReview,
      videoRenderStrategyPlan,
      longFormTimelinePlan,
      longFormCreativeIntelligencePlan,
      longFormReadinessPlan,
      materialSourcingPlan,
      materialSourceValidation,
      postproductionAssetPlan,
      ...(generatedAudioOutputBatchValidation ? { generatedAudioOutputBatchValidation } : {}),
      renderSchedulePlan,
      stagePlan,
      costEstimate,
      compiledPrompts,
      renderedShots,
      ...(deliverable ? { deliverable } : {}),
      ...(deliveryGate ? { deliveryGate } : {}),
      ...(semanticVisualInspection ? { semanticVisualInspection } : {}),
      socialPublishing: planSocialPublishingMetadata({
        premise: storyPlan.premise,
        userInput: intake.userInput,
        ...(intake.metadata?.platform ? { platform: intake.metadata.platform } : {}),
        ...(intake.metadata?.niche ? { niche: intake.metadata.niche } : {}),
        ...(intake.metadata?.voiceLanguage ? { language: intake.metadata.voiceLanguage } : {})
      })
    };
  }

  private videoRenderStrategyRequest(request: CineJellyProjectRequest, intake: IntakeResult): CineJellyProjectRequest {
    return {
      userInput: request.userInput,
      settings: intake.settings,
      references: intake.references,
      ...(intake.modelPreferences ? { modelPreferences: intake.modelPreferences } : {}),
      ...(intake.metadata ? { metadata: intake.metadata } : {}),
      ...(intake.sourceVideoAnalysis ? { sourceVideoAnalysis: intake.sourceVideoAnalysis } : {})
    };
  }

  private strategySequentialReasons(plan: VideoRenderStrategyPlan): readonly RenderScheduleSequentialReason[] {
    if (!plan.requiresSequentialRender) {
      return [];
    }
    const reasons: RenderScheduleSequentialReason[] = [];
    if (plan.workflowMode === "reference_locked_multishot") {
      reasons.push("strategy_reference_lock");
    }
    if (plan.workflowMode === "source_video_guided") {
      reasons.push("strategy_source_video");
    }
    if (plan.workflowMode === "sequence_bible") {
      reasons.push("strategy_sequence_bible");
    }
    if (plan.workflowMode === "manual_storyboard") {
      reasons.push("strategy_manual_storyboard");
    }
    if (plan.lastFrameChaining.status === "required" || plan.lastFrameChaining.status === "recommended") {
      reasons.push("strategy_last_frame_chaining");
    }
    return [...new Set(reasons)].sort();
  }

  private describeVideoRenderStrategyBlock(plan: VideoRenderStrategyPlan): string {
    const details = plan.issues
      .filter((issue) => issue.severity === "block")
      .slice(0, 5)
      .map((issue) => `${issue.code} - ${issue.repair}`)
      .join("; ");
    return details || "Video render strategy blocked provider spend.";
  }

  private describeLongFormCreativeIntelligenceBlock(plan: LongFormCreativeIntelligencePlan): string {
    const details = plan.findings
      .filter((finding) => finding.severity === "block")
      .slice(0, 5)
      .map((finding) => `${finding.code} - ${finding.repair}`)
      .join("; ");
    return details || "Long-form creative intelligence blocked provider spend.";
  }

  private describeLongFormReadinessBlock(plan: LongFormReadinessPlan): string {
    const details = plan.repairQueue
      .filter((repair) => repair.blocksRender)
      .slice(0, 5)
      .map((repair) => `${repair.trigger} - ${repair.action}`)
      .join("; ");
    return details || plan.releaseGateSummary.releaseBlocker || "Long-form readiness blocked provider spend.";
  }

  private storyboardApprovalEvidence(report: ReviewApprovalReport): Record<string, ProductionStageEvidenceValue> {
    return {
      storyboardApprovalStatus: report.status,
      storyboardApprovalCheckpointCount: report.summary.checkpointCount,
      storyboardApprovalApprovedRequiredCount: report.summary.approvedRequiredCount,
      storyboardApprovalPendingRequiredCount: report.summary.pendingRequiredCount,
      storyboardApprovalIssueCount: report.summary.issueCount,
      storyboardApprovalCanRender: report.releaseGateSummary.canRenderAfterReview
    };
  }

  private describeStoryboardApprovalBlock(report: ReviewApprovalReport): string {
    const unresolved = report.checkpoints
      .filter((checkpoint) => checkpoint.required && checkpoint.decision !== "approved")
      .slice(0, 5)
      .map((checkpoint) => `${checkpoint.subjectId ?? checkpoint.checkpointId}: ${checkpoint.decision}`)
      .join("; ");
    return `Storyboard approval gate blocked provider spend. Status=${report.status}. ${unresolved}`;
  }

  private async prepareChainedRenderItem<TValue>(input: {
    readonly item: RenderScheduleItem<TValue>;
    readonly previousRenderedShot: RenderedShot | undefined;
    readonly videoRenderStrategyPlan: VideoRenderStrategyPlan;
    readonly settings: FlexibleSeedanceSettings;
    readonly modelId: string;
    readonly providerSupportedReferenceKinds?: readonly import("../types/provider.js").ReferenceKind[];
    readonly continuityLedger: ReturnType<ContinuityLedgerBuilder["build"]>;
    readonly workDirectory?: string;
    readonly signal?: AbortSignal;
  }): Promise<{
    readonly shot: ShotContract;
    readonly compiledPrompt: CompiledPrompt;
    readonly preflight: GuardianReport;
  }> {
    if (!this.shouldApplyLastFrameChaining(input.videoRenderStrategyPlan)) {
      return {
        shot: input.item.shot,
        compiledPrompt: this.renderItemCompiledPrompt(input.item),
        preflight: this.renderItemPreflight(input.item)
      };
    }
    if (input.item.index === 0) {
      return {
        shot: input.item.shot,
        compiledPrompt: this.renderItemCompiledPrompt(input.item),
        preflight: this.renderItemPreflight(input.item)
      };
    }
    // A shot already routed to the AVATAR model renders ONLY from its avatarPlan (keyframe image +
    // TTS audio): render() never reads the compiled prompt, references, or a chained first-frame on
    // that branch, and has no general-path fallback. The sidecar selection + recompile +
    // re-preflight below were pure dead weight for it — worse, their two throw sites (chaining
    // "required" with no sidecar; re-preflight block) fired AFTER earlier shots were already paid,
    // the worst mid-spend failure mode on an all-talking short (redundancy-audit R2/R9). Skip
    // straight to the already-approved prompt; non-avatar shots keep full chaining.
    const preChainCompiled = this.renderItemCompiledPrompt(input.item);
    if (preChainCompiled.avatarPlan) {
      return {
        shot: input.item.shot,
        compiledPrompt: preChainCompiled,
        preflight: this.renderItemPreflight(input.item)
      };
    }
    if (!input.previousRenderedShot) {
      throw new Error("Last-frame chaining expected a previous rendered shot before provider spend.");
    }

    const selection = await selectOrExtractLastFrameReference({
      renderedShot: input.previousRenderedShot,
      targetShotId: input.item.shot.shotId,
      ...(input.workDirectory ? { workDirectory: input.workDirectory } : {}),
      ...(input.signal ? { signal: input.signal } : {})
    });
    if (!selection) {
      if (input.videoRenderStrategyPlan.lastFrameChaining.status === "required") {
        throw new Error(
          `Last-frame chaining required for ${input.item.shot.shotId}, but previous shot ${input.previousRenderedShot.compiledPrompt.shotId} returned no usable image sidecar or extractable endpoint frame.`
        );
      }
      return this.preparePromptOnlyChainFallback({
        item: input.item,
        previousRenderedShot: input.previousRenderedShot,
        settings: input.settings,
        modelId: input.modelId,
        ...(input.providerSupportedReferenceKinds ? { providerSupportedReferenceKinds: input.providerSupportedReferenceKinds } : {}),
        continuityLedger: input.continuityLedger
      });
    }

    const { referenceSelectionPlan: _referenceSelectionPlan, ...shotWithoutSelectionPlan } = input.item.shot;
    const runtimeContinuityBridge = this.runtimeContinuityBridge(input.previousRenderedShot, selection.sourceShotId);
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
        ...(selection.quality ? this.endpointFrameMetadata(selection.quality) : {}),
        chainSourceRenderStatus: input.previousRenderedShot.renderInspection.status,
        chainSourceSelectedCandidateIndex: String(input.previousRenderedShot.selectedCandidateIndex),
        chainRuntimeContinuityBridge: runtimeContinuityBridge
      }
    };
    const compiledPrompt = this.promptCompiler.compile({
      shot: chainedShot,
      settings: input.settings,
      modelId: input.modelId,
      provider: "atlascloud",
      ...(input.providerSupportedReferenceKinds ? { providerSupportedReferenceKinds: input.providerSupportedReferenceKinds } : {})
    });
    const preflight = this.consistencyGuardian.preflight({
      shot: chainedShot,
      prompt: compiledPrompt.prompt,
      negativePrompt: compiledPrompt.negativePrompt,
      bindingPlan: compiledPrompt.bindingPlan,
      ledger: input.continuityLedger
    });
    if (preflight.status === "block" || preflight.status === "repair") {
      throw new Error(this.describePreflightBlock([preflight]));
    }

    // Carry the already-PAID avatar routing (TTS+image) onto the recompiled prompt — the compiler
    // never re-emits avatarPlan, so without this a talking shot that is also last-frame-chained would
    // discard its voiced avatar and render on the stiff general path (deep-audit MEDIUM).
    const chainedAvatarPlan = this.renderItemCompiledPrompt(input.item).avatarPlan;
    return {
      shot: chainedShot,
      compiledPrompt: chainedAvatarPlan ? { ...compiledPrompt, avatarPlan: chainedAvatarPlan } : compiledPrompt,
      preflight
    };
  }

  private preparePromptOnlyChainFallback<TValue>(input: {
    readonly item: RenderScheduleItem<TValue>;
    readonly previousRenderedShot: RenderedShot;
    readonly settings: FlexibleSeedanceSettings;
    readonly modelId: string;
    readonly providerSupportedReferenceKinds?: readonly import("../types/provider.js").ReferenceKind[];
    readonly continuityLedger: ReturnType<ContinuityLedgerBuilder["build"]>;
  }): {
    readonly shot: ShotContract;
    readonly compiledPrompt: CompiledPrompt;
    readonly preflight: GuardianReport;
  } {
    const sourceShotId = input.previousRenderedShot.compiledPrompt.shotId;
    const runtimeContinuityBridge = this.runtimeContinuityBridge(input.previousRenderedShot, sourceShotId);
    const fallbackShot: ShotContract = {
      ...input.item.shot,
      continuity: {
        ...input.item.shot.continuity,
        previousShotEndState: input.item.shot.continuity.previousShotEndState ?? runtimeContinuityBridge
      },
      metadata: {
        ...(input.item.shot.metadata ?? {}),
        chainedFromShotId: sourceShotId,
        chainReferenceRole: "first_frame",
        chainReferenceMissing: "true",
        chainFallbackMode: "prompt_only_continuity",
        chainFallbackReason: "no_usable_image_sidecar_or_extractable_endpoint_frame",
        chainSourceRenderStatus: input.previousRenderedShot.renderInspection.status,
        chainSourceSelectedCandidateIndex: String(input.previousRenderedShot.selectedCandidateIndex),
        chainRuntimeContinuityBridge: runtimeContinuityBridge
      }
    };
    const compiledPrompt = this.promptCompiler.compile({
      shot: fallbackShot,
      settings: input.settings,
      modelId: input.modelId,
      provider: "atlascloud",
      ...(input.providerSupportedReferenceKinds ? { providerSupportedReferenceKinds: input.providerSupportedReferenceKinds } : {})
    });
    const preflight = this.consistencyGuardian.preflight({
      shot: fallbackShot,
      prompt: compiledPrompt.prompt,
      negativePrompt: compiledPrompt.negativePrompt,
      bindingPlan: compiledPrompt.bindingPlan,
      ledger: input.continuityLedger
    });
    // Preserve the already-paid avatar routing across the recompile (deep-audit MEDIUM).
    const fallbackAvatarPlan = this.renderItemCompiledPrompt(input.item).avatarPlan;
    return {
      shot: fallbackShot,
      compiledPrompt: fallbackAvatarPlan ? { ...compiledPrompt, avatarPlan: fallbackAvatarPlan } : compiledPrompt,
      preflight
    };
  }

  private shouldApplyLastFrameChaining(plan: VideoRenderStrategyPlan): boolean {
    return plan.lastFrameChaining.status === "required" || plan.lastFrameChaining.status === "recommended";
  }

  private shouldAbortSequentialRenderAfterFailedShot(
    item: RenderScheduleItem<unknown>,
    renderedShot: RenderedShot,
    renderSchedulePlan: RenderSchedulePlan
  ): boolean {
    if (!this.needsRenderRepair(renderedShot.renderInspection)) {
      return false;
    }
    return renderSchedulePlan.items.some((planItem) =>
      planItem.index === item.index && planItem.mode === "sequential"
    );
  }

  private endpointFrameMetadata(quality: EndpointFrameQualityEvidence): ProviderMetadata {
    return {
      chainEndpointFrameStrategy: quality.strategy,
      chainEndpointFrameCandidateCount: quality.candidateCount,
      ...(quality.selectedOffsetSeconds !== undefined ? { chainEndpointFrameSelectedOffsetSeconds: quality.selectedOffsetSeconds } : {}),
      ...(quality.selectedFileSizeBytes !== undefined ? { chainEndpointFrameSelectedFileSizeBytes: quality.selectedFileSizeBytes } : {}),
      ...(quality.score !== undefined ? { chainEndpointFrameQualityScore: quality.score } : {})
    };
  }

  private runtimeContinuityBridge(renderedShot: RenderedShot, sourceShotId: string): string {
    const metadata = renderedShot.compiledPrompt.videoRequest.metadata ?? {};
    const storyArcRole = typeof metadata.storyArcRole === "string" ? metadata.storyArcRole : undefined;
    const storyArcPosition = typeof metadata.storyArcPosition === "string" ? metadata.storyArcPosition : undefined;
    return [
      `Start from endpoint continuity frame of ${sourceShotId}`,
      `selected candidate ${renderedShot.selectedCandidateIndex}`,
      `source render inspection ${renderedShot.renderInspection.status}`,
      storyArcRole ? `prior story role ${storyArcRole}` : undefined,
      storyArcPosition ? `prior arc position ${storyArcPosition}` : undefined,
      "preserve visible subject/product state, screen direction, camera momentum, lighting color, room tone, and final action result before introducing new motion"
    ].filter((line): line is string => Boolean(line)).join("; ") + ".";
  }

  private renderItemCompiledPrompt<TValue>(item: RenderScheduleItem<TValue>): CompiledPrompt {
    const value = item.value as {
      readonly compiledPrompt?: CompiledPrompt;
    };
    if (!value.compiledPrompt) {
      throw new Error("Render schedule item is missing a compiled prompt.");
    }
    return value.compiledPrompt;
  }

  private renderItemPreflight<TValue>(item: RenderScheduleItem<TValue>): GuardianReport {
    const value = item.value as {
      readonly preflight?: GuardianReport;
    };
    if (!value.preflight) {
      throw new Error("Render schedule item is missing a preflight report.");
    }
    return value.preflight;
  }

  private describeLongFormAgentReviewBlock(review: LongFormAgentReviewPlan): string {
    const details = review.findings
      .filter((finding) => finding.severity === "block")
      .slice(0, 5)
      .map((finding) => `${finding.role}:${finding.code} - ${finding.repairDirective}`)
      .join("; ");
    return `Long-form agentic review blocked prompt compilation before provider spend. ${details}`;
  }

  private canExecuteGeneratedAudio(request: CineJellyProjectRequest): boolean {
    return Boolean(
      this.audioProvider &&
      request.outputPath &&
      request.workDirectory &&
      (request.generatedAudioIntents?.length ?? 0) > 0
    );
  }

  private async executeGeneratedAudioIfReady(input: {
    readonly intents: readonly GeneratedAudioIntent[];
    readonly postproductionAssetPlan: PostproductionAssetPlan;
    readonly signal?: AbortSignal;
  }): Promise<ReturnType<GeneratedAudioOutputBatchValidator["validate"]> | undefined> {
    const executionPlan = input.postproductionAssetPlan.generatedAudio.executionPlan;
    if (!this.audioProvider || executionPlan.readyCount === 0) {
      return undefined;
    }

    this.reportStageProgress("assemble", "running", "Executing generated-audio provider requests before audio mix.", {
      generatedAudioReadyIntentCount: executionPlan.readyCount,
      generatedAudioBlockedIntentCount: executionPlan.blockedCount
    });
    const run = await this.generatedAudioExecutionRunner.run({
      executionPlan,
      audioProvider: this.audioProvider,
      ...(input.signal ? { signal: input.signal } : {})
    });
    this.reportStageProgress(
      "assemble",
      run.status === "succeeded" ? "succeeded" : "warn",
      "Generated-audio provider execution completed.",
      {
        generatedAudioExecutionStatus: run.status,
        generatedAudioAttemptedCount: run.attemptedCount,
        generatedAudioSucceededCount: run.succeededCount,
        generatedAudioFailedCount: run.failedCount,
        generatedAudioTimeoutCount: run.timeoutCount,
        generatedAudioCanceledCount: run.canceledCount
      }
    );
    return this.generatedAudioOutputBatchValidator.validate({
      intents: input.intents,
      executionPlan,
      results: run.results
    });
  }

  private audioTracksForAssembly(
    suppliedTracks: readonly AudioMixTrack[] | undefined,
    generatedTracks: readonly AudioMixTrack[] | undefined
  ): readonly AudioMixTrack[] {
    return [...(suppliedTracks ?? []), ...(generatedTracks ?? [])];
  }

  private audioMixOptionsForAssembly(
    options: AudioMixOptions | undefined,
    tracks: readonly AudioMixTrack[]
  ): AudioMixOptions | undefined {
    if (tracks.length === 0) {
      return undefined;
    }
    return options;
  }

  private async prepareRequestForIntake(
    request: CineJellyProjectRequest,
    signal: AbortSignal | undefined
  ): Promise<CineJellyProjectRequest> {
    if (!this.sourceVideoAutoAnalyzer || !this.sourceVideoAutoAnalysisSettings?.enabled) {
      return request;
    }
    return this.sourceVideoAutoAnalyzer.prepareRequest(request, this.sourceVideoAutoAnalysisSettings, signal);
  }

  private reportStageProgress(
    stage: ProductionStageName,
    status: ProductionStageStatus,
    message: string,
    evidence?: Readonly<Record<string, ProductionStageEvidenceValue>>
  ): void {
    if (!this.stageProgressReporter) {
      return;
    }
    try {
      this.stageProgressReporter({
        sequence: ++this.stageProgressSequence,
        stage,
        order: PRODUCTION_STAGE_ORDER.indexOf(stage),
        status,
        recordedAt: new Date(),
        message,
        sourcePatternOrigins: productionStageSourcePatternOrigins(stage),
        ...(evidence ? { evidence } : {})
      });
    } catch {
      // Progress telemetry must not change render behavior.
    }
  }

  private guardianStageStatus(status: GuardianStatus): ProductionStageStatus {
    switch (status) {
      case "pass":
        return "succeeded";
      case "warn":
        return "warn";
      case "repair":
      case "rerender":
      case "block":
        return "blocked";
    }
  }

  private materialSourceStageStatus(report: MaterialSourceValidationReport): ProductionStageStatus {
    switch (report.status) {
      case "rejected":
        return "blocked";
      case "review_required":
        return "warn";
      case "approved":
      case "planned_only":
        return "succeeded";
    }
  }

  private renderedShotsStageStatus(renderedShots: readonly RenderedShot[]): ProductionStageStatus {
    if (renderedShots.length === 0) {
      return "failed";
    }
    return renderedShots.some((shot) => shot.prediction.status !== "succeeded") ? "failed" : "succeeded";
  }

  private inspectionStageStatus(renderedShots: readonly RenderedShot[]): ProductionStageStatus {
    if (renderedShots.length === 0) {
      return "skipped";
    }
    return renderedShots.some((shot) => shot.renderInspection.status === "warn") ? "warn" : "succeeded";
  }

  private repairStageStatus(renderedShots: readonly RenderedShot[]): ProductionStageStatus {
    const repairAttemptCount = renderedShots.reduce((sum, shot) => sum + shot.repairAttemptCount, 0);
    return repairAttemptCount > 0 ? "succeeded" : "skipped";
  }

  private deliveryGateStageStatus(deliveryGate: NonNullable<DirectorRunResult["deliveryGate"]>): ProductionStageStatus {
    switch (deliveryGate.status) {
      case "pass":
        return "succeeded";
      case "warn":
        return "warn";
      case "block":
        return "blocked";
    }
  }

  private totalCandidateCount(renderedShots: readonly RenderedShot[]): number {
    return renderedShots.reduce((sum, shot) => sum + shot.candidates.length, 0);
  }

  private validateProviderCapabilities(compiledPrompts: readonly CompiledPrompt[]): void {
    for (const compiledPrompt of compiledPrompts) {
      this.renderProducer.validateCapability(compiledPrompt);
    }
  }

  private async resolveMaterialCandidates(
    materialSourcingPlan: ReturnType<MaterialSourcingPlanner["plan"]>,
    signal: AbortSignal | undefined
  ): Promise<readonly MaterialCandidate[]> {
    if (this.materialSourceAdapters.length === 0) {
      return [];
    }
    const candidateGroups = await Promise.all(
      this.materialSourceAdapters.map((adapter) =>
        adapter.resolve({
          plan: materialSourcingPlan,
          ...(signal ? { signal } : {})
        })
      )
    );
    return candidateGroups.flat();
  }

  private postproductionSettingsForDelivery(settings: FlexibleSeedanceSettings): PostproductionSettings {
    return {
      ...DEFAULT_POSTPRODUCTION_SETTINGS,
      targetHeight: this.targetHeight(settings.resolution),
      targetRatio: settings.ratio
    };
  }

  private targetHeight(resolution: Resolution): 480 | 720 | 1080 | 1440 {
    return seedanceResolutionHeight(resolution);
  }

  private shouldRunTestTake(shot: ShotContract, settings: FlexibleSeedanceSettings): boolean {
    if (!usesTestTakesForQuality(settings.qualityMode) || shot.durationSeconds <= SEEDANCE_TEST_TAKE_DURATION_SECONDS) {
      return false;
    }
    const referenceRoles = new Set(shot.references.map((reference) => reference.role));
    return (
      shot.risks.some((risk) => ["face", "product_logo", "audio_sync", "transition", "multi_character_blocking"].includes(risk)) ||
      referenceRoles.has("motion") ||
      referenceRoles.has("camera") ||
      referenceRoles.has("audio_tempo") ||
      referenceRoles.has("voice") ||
      referenceRoles.has("source_video_structure")
    );
  }

  /**
   * Restore the full requested runtime before prompts compile: crossfade assembly consumes
   * transition overlap at every clip boundary and planning can undershoot the target, so
   * distribute whole-second duration additions (last shot first) across shots that still
   * have headroom under the per-clip maximum. Extends the final timeline segment so the
   * time-coded plan keeps covering the whole clip.
   */
  private withDurationCompensation(
    shots: readonly ShotContract[],
    settings: FlexibleSeedanceSettings,
    transitionSettings: TransitionSettings | undefined
  ): readonly ShotContract[] {
    if (shots.length === 0) {
      return shots;
    }
    const effectiveTransitions = transitionSettings ?? DEFAULT_TRANSITION_SETTINGS;
    const transitionOverlapSeconds = shots.length > 1 && effectiveTransitions.enabled
      ? effectiveTransitions.durationSeconds
      : 0;
    const additions = planDurationCompensation({
      shotDurations: shots.map((shot) => shot.durationSeconds),
      targetDurationSeconds: settings.durationTargetSeconds,
      transitionOverlapSeconds,
      maxClipSeconds: MAX_CLIP_DURATION_SECONDS
    });
    if (additions.every((addition) => addition === 0)) {
      return shots;
    }
    const newDurations = shots.map((shot, index) => shot.durationSeconds + (additions[index] ?? 0));
    const newTargetDurationSeconds = newDurations.reduce((sum, duration) => sum + duration, 0);
    let arcCursorSeconds = 0;
    return shots.map((shot, index) => {
      const addition = additions[index] ?? 0;
      const durationSeconds = newDurations[index] ?? shot.durationSeconds;
      const arcStartSecond = arcCursorSeconds;
      arcCursorSeconds += durationSeconds;
      // Scale timeline segments proportionally (instead of dumping all added seconds into
      // the final settle beat) and pin the last segment to the exact new duration.
      const timeline = addition > 0 && shot.timeline && shot.timeline.length > 0
        ? shot.timeline.map((segment, segmentIndex) => {
            const scale = durationSeconds / shot.durationSeconds;
            const isLast = segmentIndex === (shot.timeline?.length ?? 0) - 1;
            return {
              ...segment,
              startSecond: Math.round(segment.startSecond * scale * 10) / 10,
              endSecond: isLast ? durationSeconds : Math.round(segment.endSecond * scale * 10) / 10
            };
          })
        : shot.timeline;
      const hasArcMetadata = typeof shot.metadata?.storyArcStartSecond === "number";
      if (addition <= 0 && !hasArcMetadata) {
        return shot;
      }
      return {
        ...shot,
        durationSeconds,
        ...(timeline ? { timeline } : {}),
        metadata: {
          ...(shot.metadata ?? {}),
          ...(addition > 0 ? { durationCompensationSeconds: addition } : {}),
          // Keep whole-video arc labels consistent with the compensated durations.
          ...(hasArcMetadata
            ? {
                storyArcStartSecond: arcStartSecond,
                storyArcEndSecond: arcStartSecond + durationSeconds,
                storyArcTargetDurationSeconds: newTargetDurationSeconds
              }
            : {})
        }
      };
    });
  }

  /**
   * Visual curation for BEST-OF-N. The customer is billed per candidate (quality modes render 2-4
   * takes of every shot), but candidate selection only ranks by inspection status/severity/output
   * and then falls through to LATENCY — so without curation the extra takes they paid for buy
   * "reject a broken render", and among the good ones the FASTEST provider response wins rather
   * than the best-looking one. No product route ever set semanticVisualInspectionOptions, so this
   * was every multi-candidate render.
   *
   * Now: an explicit request option still wins; otherwise curation turns ON automatically as soon
   * as more than one candidate is being paid for. The cost is a couple of cheap vision calls per
   * shot against $1.50+ per extra candidate clip (~3% overhead) — and it is what makes the money
   * already spent actually buy quality. Single-candidate (economy) renders are untouched: with one
   * take there is nothing to choose between, so no vision call is made.
   */
  private candidateVisualCurationFor(
    request: CineJellyProjectRequest,
    candidateCount: number
  ): CandidateVisualCuration | undefined {
    const workDirectory = request.workDirectory ?? request.artifactDirectory;
    if (!this.renderedCandidateVisualInspector || !workDirectory) {
      return undefined;
    }
    const explicit = request.semanticVisualInspectionOptions;
    if (explicit?.enabled) {
      return { options: explicit, workDirectory };
    }
    if (explicit && explicit.enabled === false) {
      // Explicit opt-out is honored (acceptance harnesses use it to isolate the render path).
      return undefined;
    }
    if (candidateCount <= 1) {
      return undefined;
    }
    return {
      options: {
        enabled: true,
        expectations: [],
        maxFrames: 2
      },
      workDirectory,
      maxFramesPerCandidate: 2,
      // ADVISORY, because the customer did not ask for visual QC — the pipeline volunteered it.
      // The vision model routinely returns an overall "pass" with a cosmetic S2 note ("framing sits
      // slightly left"); treated as a repair that note buys another render, and if it recurs on the
      // retry the whole job is failed AFTER every clip is paid for, with refunds handled by hand.
      // Turning a quality nicety into a way to lose a paid render is not a trade worth making
      // silently. Ranking still uses every finding; S0/S1 defects still trigger repair as before.
      advisoryOnly: true
    };
  }

  private async renderShot(input: {
    readonly shot: ShotContract;
    readonly compiledPrompt: CompiledPrompt;
    readonly preflight: GuardianReport;
    readonly shouldRunTestTake: boolean;
    readonly candidateCount: number;
    readonly repairAttemptCount: number;
    readonly visualCuration?: CandidateVisualCuration;
    readonly signal: AbortSignal | undefined;
  }): Promise<RenderedShot> {
    let compiledPrompt = input.compiledPrompt;
    const testTake = input.shouldRunTestTake
      ? await this.renderTestTake({
          shot: input.shot,
          compiledPrompt,
          signal: input.signal
        })
      : undefined;
    if (testTake && this.needsTestTakeBlock(testTake.renderInspection)) {
      throw new Error(this.describeTestTakeBlock(input.shot, testTake.renderInspection));
    }
    if (testTake && testTake.renderInspection.status === "repair") {
      compiledPrompt = this.compileTestTakeRepair({
        compiledPrompt,
        report: testTake.renderInspection
      });
    }
    const candidates = await this.renderCandidates({
      shot: input.shot,
      compiledPrompt,
      candidateCount: input.candidateCount,
      repairAttemptCount: input.repairAttemptCount,
      ...(input.visualCuration ? { visualCuration: input.visualCuration } : {}),
      signal: input.signal
    });
    const selectedCandidate = this.selectBestCandidate(candidates);

    return {
      compiledPrompt: selectedCandidate.compiledPrompt,
      preflight: input.preflight,
      prediction: selectedCandidate.prediction,
      renderInspection: selectedCandidate.renderInspection,
      ...(testTake ? { testTake } : {}),
      candidates,
      selectedCandidateIndex: selectedCandidate.candidateIndex,
      repairAttemptCount: candidates.filter((candidate) => candidate.repairAttempt !== undefined).length
    };
  }

  private async renderTestTake(input: {
    readonly shot: ShotContract;
    readonly compiledPrompt: CompiledPrompt;
    readonly signal: AbortSignal | undefined;
  }): Promise<RenderCandidate> {
    const compiledPrompt = this.compileTestTakePrompt(input.compiledPrompt);
    const renderResult = await this.renderProducer.render(compiledPrompt, input.signal);
    const renderInspection = this.consistencyGuardian.inspectTestTake({
      shot: input.shot,
      prediction: renderResult.prediction
    });

    return {
      candidateIndex: 0,
      testTake: true,
      compiledPrompt: renderResult.compiledPrompt,
      prediction: renderResult.prediction,
      renderInspection
    };
  }

  private compileTestTakePrompt(compiledPrompt: CompiledPrompt): CompiledPrompt {
    const prompt = [
      compiledPrompt.prompt,
      "",
      `Render a ${SEEDANCE_TEST_TAKE_DURATION_SECONDS}-second test take for production validation.`,
      "Prioritize identity, product geometry, motion feasibility, audio sync feasibility, and transition handles over final pacing."
    ].join("\n");
    const metadata = {
      ...(compiledPrompt.videoRequest.metadata ?? {}),
      testTake: true
    };

    return {
      ...compiledPrompt,
      prompt,
      videoRequest: {
        ...compiledPrompt.videoRequest,
        prompt,
        metadata,
        settings: {
          ...compiledPrompt.videoRequest.settings,
          durationSeconds: SEEDANCE_TEST_TAKE_DURATION_SECONDS
        }
      }
    };
  }

  private compileTestTakeRepair(input: {
    readonly compiledPrompt: CompiledPrompt;
    readonly report: GuardianReport;
  }): CompiledPrompt {
    const directives = this.repairDirectives(input.compiledPrompt, input.report);
    const repairBlock = [
      "Apply targeted repair from the approved test take before full render.",
      "Preserve all approved references, duration, camera language, lighting, and continuity.",
      ...directives.map((directive) => `- ${directive}`)
    ].join("\n");
    const prompt = `${input.compiledPrompt.prompt}\n\n${repairBlock}`;
    const metadata = {
      ...(input.compiledPrompt.videoRequest.metadata ?? {}),
      testTakeRepair: true,
      testTakeSourceStatus: input.report.status,
      testTakeSourceNodeId: input.report.nodeId
    };

    return {
      ...input.compiledPrompt,
      prompt,
      repairHints: directives,
      videoRequest: {
        ...input.compiledPrompt.videoRequest,
        prompt,
        metadata
      }
    };
  }

  private async renderCandidates(input: {
    readonly shot: ShotContract;
    readonly compiledPrompt: CompiledPrompt;
    readonly candidateCount: number;
    readonly repairAttemptCount: number;
    readonly visualCuration?: CandidateVisualCuration;
    readonly signal: AbortSignal | undefined;
  }): Promise<readonly RenderCandidate[]> {
    const candidates: RenderCandidate[] = [];
    let preparedPrompt = input.compiledPrompt;

    for (let candidateIndex = 1; candidateIndex <= input.candidateCount; candidateIndex += 1) {
      const candidate = await this.renderCandidate({
        shot: input.shot,
        compiledPrompt: preparedPrompt,
        candidateIndex,
        ...(input.visualCuration ? { visualCuration: input.visualCuration } : {}),
        signal: input.signal
      });
      candidates.push(candidate);
      preparedPrompt = candidate.compiledPrompt;
    }

    let selectedCandidate = this.selectBestCandidate(candidates);

    // PROVIDER FAILURE IS NOT A CONTENT PROBLEM, and it is not the customer's to absorb.
    //
    // The repair loop below re-renders with a CORRECTED prompt, and its budget is a quality choice:
    // economy buys zero repairs because the customer accepted the first take. But when Atlas returns
    // a failed prediction, or returns success with no usable output, there is nothing to correct —
    // the render simply did not happen. Charging that to the repair budget meant an economy order
    // (zero repairs) died on the first provider hiccup, and one dead shot kills the whole job at the
    // inspection gate, discarding every other clip already paid for.
    //
    // So a provider failure gets its own small budget, granted in every quality mode, and re-submits
    // the SAME prompt — there is no correction to make. Bounded at a few attempts so a genuine Atlas
    // outage fails fast instead of spinning through the customer's balance; counted in the budget
    // estimate so maxCostUsd still holds.
    for (
      let providerRetry = 1;
      providerRetry <= PROVIDER_FAILURE_RETRY_ATTEMPTS && isProviderRenderFailure(selectedCandidate);
      providerRetry += 1
    ) {
      this.reportStageProgress("render", "warn", "Provider returned no usable clip; re-rendering this shot.", {
        shotId: input.shot.shotId,
        providerRetryAttempt: providerRetry,
        providerStatus: selectedCandidate.prediction.status
      });
      const retryCandidate = await this.renderCandidate({
        shot: input.shot,
        compiledPrompt: selectedCandidate.compiledPrompt,
        candidateIndex: candidates.length + 1,
        ...(input.visualCuration ? { visualCuration: input.visualCuration } : {}),
        signal: input.signal
      });
      candidates.push(retryCandidate);
      selectedCandidate = this.selectBestCandidate(candidates);
    }

    for (
      let repairAttempt = 1;
      repairAttempt <= input.repairAttemptCount && this.needsRenderRepair(selectedCandidate.renderInspection);
      repairAttempt += 1
    ) {
      const repairCompiledPrompt = this.compileRepairAttempt({
        compiledPrompt: selectedCandidate.compiledPrompt,
        report: selectedCandidate.renderInspection,
        repairAttempt
      });
      const repairCandidate = await this.renderCandidate({
        shot: input.shot,
        compiledPrompt: repairCompiledPrompt,
        candidateIndex: candidates.length + 1,
        repairAttempt,
        ...(input.visualCuration ? { visualCuration: input.visualCuration } : {}),
        signal: input.signal
      });
      candidates.push(repairCandidate);
      selectedCandidate = this.selectBestCandidate(candidates);
    }

    return candidates;
  }

  private compileRepairAttempt(input: {
    readonly compiledPrompt: CompiledPrompt;
    readonly report: GuardianReport;
    readonly repairAttempt: number;
  }): CompiledPrompt {
    const directives = this.repairDirectives(input.compiledPrompt, input.report);
    const repairBlock = [
      `Targeted repair attempt ${input.repairAttempt}.`,
      "Preserve all approved shot intent, references, duration, camera language, lighting, and continuity.",
      "Repair only the failed checkpoints from the previous render:",
      ...directives.map((directive) => `- ${directive}`)
    ].join("\n");
    const prompt = `${input.compiledPrompt.prompt}\n\n${repairBlock}`;
    const metadata = {
      ...(input.compiledPrompt.videoRequest.metadata ?? {}),
      repairAttempt: input.repairAttempt,
      repairSourceStatus: input.report.status,
      repairSourceNodeId: input.report.nodeId
    };

    return {
      ...input.compiledPrompt,
      prompt,
      repairHints: directives,
      videoRequest: {
        ...input.compiledPrompt.videoRequest,
        prompt,
        metadata
      }
    };
  }

  private repairDirectives(compiledPrompt: CompiledPrompt, report: GuardianReport): readonly string[] {
    const directives = new Set<string>();
    for (const finding of report.findings) {
      if (finding.repair.trim()) {
        directives.add(finding.repair.trim());
      }
    }
    for (const hint of compiledPrompt.repairHints) {
      if (hint.trim()) {
        directives.add(hint.trim());
      }
    }
    if (directives.size === 0) {
      directives.add("Rerender only this shot with a simpler directorial prompt and the same reference bindings.");
    }
    return [...directives].slice(0, 6);
  }

  private async renderCandidate(input: {
    readonly shot: ShotContract;
    readonly compiledPrompt: CompiledPrompt;
    readonly candidateIndex: number;
    readonly repairAttempt?: number;
    readonly visualCuration?: CandidateVisualCuration;
    readonly signal: AbortSignal | undefined;
  }): Promise<RenderCandidate> {
    const submittedAt = new Date();

    try {
      const renderResult = await this.renderProducer.render(input.compiledPrompt, input.signal);
      let renderInspection = this.consistencyGuardian.inspectRender({
        shot: input.shot,
        prediction: renderResult.prediction
      });
      if (
        input.visualCuration &&
        this.renderedCandidateVisualInspector &&
        renderResult.prediction.status === "succeeded" &&
        renderResult.prediction.outputUrls.length > 0
      ) {
        const visualInspection = await this.renderedCandidateVisualInspector.inspectCandidate({
          shot: input.shot,
          compiledPrompt: renderResult.compiledPrompt,
          prediction: renderResult.prediction,
          candidateIndex: input.candidateIndex,
          ...(input.repairAttempt !== undefined ? { repairAttempt: input.repairAttempt } : {}),
          curation: input.visualCuration,
          ...(input.signal ? { signal: input.signal } : {})
        });
        renderInspection = mergeGuardianReports(renderInspection, visualInspection);
      }
      return {
        candidateIndex: input.candidateIndex,
        ...(input.repairAttempt !== undefined ? { repairAttempt: input.repairAttempt } : {}),
        compiledPrompt: renderResult.compiledPrompt,
        prediction: renderResult.prediction,
        renderInspection
      };
    } catch (error: unknown) {
      if (input.signal?.aborted) {
        throw error;
      }
      const prediction = this.failedPrediction({
        shot: input.shot,
        compiledPrompt: input.compiledPrompt,
        candidateIndex: input.candidateIndex,
        submittedAt,
        error
      });
      return {
        candidateIndex: input.candidateIndex,
        ...(input.repairAttempt !== undefined ? { repairAttempt: input.repairAttempt } : {}),
        compiledPrompt: input.compiledPrompt,
        prediction,
        renderInspection: this.consistencyGuardian.inspectRender({
          shot: input.shot,
          prediction
        })
      };
    }
  }

  private failedPrediction(input: {
    readonly shot: ShotContract;
    readonly compiledPrompt: CompiledPrompt;
    readonly candidateIndex: number;
    readonly submittedAt: Date;
    readonly error: unknown;
  }): Prediction {
    const providerError = asProviderError(String(input.compiledPrompt.videoRequest.provider), input.error);
    const completedAt = new Date();
    const rawError: Record<string, unknown> = {
      code: providerError.code,
      message: providerError.message,
      retryable: providerError.retryable
    };
    if (providerError.statusCode !== undefined) {
      rawError.statusCode = providerError.statusCode;
    }
    if (providerError.details !== undefined) {
      rawError.details = providerError.details;
    }

    return {
      provider: input.compiledPrompt.videoRequest.provider,
      predictionId: createStableId(
        "failed_prediction",
        `${input.shot.shotId}:${input.candidateIndex}:${input.submittedAt.toISOString()}`
      ),
      modelId: input.compiledPrompt.videoRequest.modelId,
      status: "failed",
      outputUrls: [],
      raw: redactUnknown(rawError),
      submittedAt: input.submittedAt,
      completedAt,
      latencyMs: completedAt.getTime() - input.submittedAt.getTime()
    };
  }

  private needsRenderRepair(report: GuardianReport): boolean {
    return report.status === "repair" || report.status === "rerender" || report.status === "block";
  }

  private needsTestTakeBlock(report: GuardianReport): boolean {
    return report.status === "rerender" || report.status === "block";
  }

  private selectBestCandidate(candidates: readonly RenderCandidate[]): RenderCandidate {
    const sortedCandidates = [...candidates].sort((left, right) => this.compareCandidates(left, right));
    const bestCandidate = sortedCandidates[0];
    if (!bestCandidate) {
      throw new Error("No render candidates were produced for shot selection.");
    }
    return bestCandidate;
  }

  private compareCandidates(left: RenderCandidate, right: RenderCandidate): number {
    const statusDifference = this.statusRank(left.renderInspection.status) - this.statusRank(right.renderInspection.status);
    if (statusDifference !== 0) {
      return statusDifference;
    }

    const severityDifference = this.severityPenalty(left.renderInspection) - this.severityPenalty(right.renderInspection);
    if (severityDifference !== 0) {
      return severityDifference;
    }

    const outputDifference = this.outputPenalty(left.prediction) - this.outputPenalty(right.prediction);
    if (outputDifference !== 0) {
      return outputDifference;
    }

    const latencyDifference = (left.prediction.latencyMs ?? Number.MAX_SAFE_INTEGER) - (right.prediction.latencyMs ?? Number.MAX_SAFE_INTEGER);
    if (latencyDifference !== 0) {
      return latencyDifference;
    }

    return left.candidateIndex - right.candidateIndex;
  }

  private statusRank(status: GuardianStatus): number {
    const order: Record<GuardianStatus, number> = {
      pass: 0,
      warn: 1,
      repair: 2,
      rerender: 3,
      block: 4
    };
    return order[status];
  }

  private severityPenalty(report: GuardianReport): number {
    const penalty: Record<GuardianSeverity, number> = {
      S3: 0,
      S2: 1,
      S1: 2,
      S0: 3
    };
    return report.findings.reduce((worstPenalty, finding) => Math.max(worstPenalty, penalty[finding.severity]), 0);
  }

  private outputPenalty(prediction: Prediction): number {
    return prediction.outputUrls.length > 0 ? 0 : 1;
  }

  private requireSemanticVisualInspector(): SemanticVisualInspector {
    if (!this.semanticVisualInspector) {
      throw new Error("Semantic visual inspection was requested but no SemanticVisualInspector is configured.");
    }
    return this.semanticVisualInspector;
  }

  /**
   * Keyframe-first runs only when an image provider + image model are configured AND the
   * selected video model can consume a first-frame anchor — otherwise still generation
   * would be spend with no way to feed the result back into the video request.
   */
  private keyframeFirstEnabled(
    providerSupportedReferenceKinds: readonly import("../types/provider.js").ReferenceKind[] | undefined
  ): boolean {
    if (!this.imageProvider?.supportsImageGeneration()) {
      return false;
    }
    if (!this.atlasSettings.models.imageModel?.trim()) {
      return false;
    }
    return !providerSupportedReferenceKinds || providerSupportedReferenceKinds.includes("first_frame");
  }

  /**
   * Generate one still keyframe per shot and rebind bound shots to image-to-video.
   * Fail-open per shot: a failed still leaves that shot on its original text/reference
   * path, so keyframe infrastructure can never take down a paid render batch.
   */
  private async runKeyframeFirstStage(input: {
    readonly shots: readonly ShotContract[];
    readonly compiledPrompts: CompiledPrompt[];
    readonly settings: FlexibleSeedanceSettings;
    readonly modelId: string;
    readonly characterAnchors?: readonly CharacterAnchorPlan[];
    readonly castAppearance?: ReadonlyMap<string, string>;
    readonly providerSupportedReferenceKinds?: readonly import("../types/provider.js").ReferenceKind[];
    readonly signal?: AbortSignal;
  }): Promise<readonly ShotContract[]> {
    const imageProvider = this.imageProvider;
    const imageModelId = this.atlasSettings.models.imageModel;
    if (!imageProvider || !imageModelId?.trim()) {
      return input.shots;
    }

    // Uploaded-identity QUALITY check (fidelity gap #7 completion): a blurry/multi-person/covered
    // KOL photo poisons the entire video's face anchoring, and today it sails straight into spend.
    // One vision look per UNIQUE uploaded identity URL (cap 4), WARN-only — it is the customer's own
    // photo and the operator review gate sees the warning; "skipped" changes nothing (fail-open).
    if (this.imageAnchorVerifier) {
      const uploadedIdentityUrls = [...new Set(
        input.shots.flatMap((shot) => shot.references)
          .filter((reference) => reference.role === "identity")
          .map((reference) => reference.providerReference.uri)
          .filter((uri): uri is string => typeof uri === "string" && /^https:\/\//.test(uri))
      )].slice(0, 4);
      const badUploads: string[] = [];
      for (const url of uploadedIdentityUrls) {
        const verdict = await this.imageAnchorVerifier.verify(
          {
            imageUrl: url,
            kind: "identity_reference",
            expectation: "One clearly visible, sharp human face usable as the video's identity anchor."
          },
          input.signal
        );
        if (verdict.status === "fail") {
          badUploads.push(verdict.reason);
        }
      }
      if (badUploads.length > 0) {
        this.reportStageProgress("render", "warn",
          "Ảnh nhận diện (KOL) tải lên có vấn đề — mặt trong video có thể không giống hoặc bị trôi. Nên thay bằng 1 ảnh chân dung rõ nét, một người, nhìn thẳng. / Uploaded identity photo issue: " + badUploads.join("; "),
          { identityUploadCheckedCount: uploadedIdentityUrls.length, identityUploadFailedCount: badUploads.length }
        );
      }
    }

    // Character-anchor pass (final-audit gap #2): generate ONE shared portrait per recurring invented
    // character with no uploaded face, then attach it as an identity reference on that character's
    // shots BEFORE per-shot keyframes, so every keyframe and the video model share one canonical face
    // instead of re-inventing (and drifting) the face each shot. Fail-open: any failure leaves the
    // shot exactly as it was. Uploaded-face requests plan zero anchors, so this is inert for them.
    let anchoredShots = input.shots;
    let anchoredShotIds: readonly string[] = [];
    if (input.characterAnchors && input.characterAnchors.length > 0) {
      const anchorUris = await this.generateCharacterAnchorPortraits({
        anchors: input.characterAnchors,
        imageProvider,
        imageModelId,
        ...(input.signal ? { signal: input.signal } : {})
      });
      if (anchorUris.length > 0) {
        const anchored = bindCharacterAnchorsToShots({ shots: input.shots, anchors: anchorUris });
        anchoredShots = anchored.shots;
        anchoredShotIds = anchored.anchoredShotIds;
        this.reportStageProgress("render", "running", "Anchored recurring characters to shared identity portraits.", {
          characterAnchorCount: anchorUris.length,
          anchoredShotCount: anchoredShotIds.length
        });
      }
    }

    this.reportStageProgress("render", "running", "Generating keyframe stills for image-to-video anchoring.", {
      keyframePlannedCount: anchoredShots.length
    });
    const requests = planKeyframeRequests({
      shots: anchoredShots,
      provider: "atlascloud",
      imageModelId,
      settings: input.settings,
      // Restate each character's appearance sheet VERBATIM in every keyframe (identity-lock fix).
      ...(input.castAppearance ? { castAppearance: input.castAppearance } : {})
    });
    const results: { readonly shotId: string; readonly prediction: Prediction }[] = [];
    const batchSize = 3;
    for (let start = 0; start < requests.length; start += batchSize) {
      const batch = requests.slice(start, start + batchSize);
      const settled = await Promise.all(
        batch.map(async (planned) => {
          try {
            const prediction = await imageProvider.generateImage(planned.request, input.signal);
            return { shotId: planned.shotId, prediction };
          } catch (error) {
            // A real user abort must stop the whole stage — swallowing it would keep buying keyframe
            // images for the remaining shots after cancellation (deep-audit: mirror the talking stage).
            if (input.signal?.aborted) {
              throw error;
            }
            return undefined;
          }
        })
      );
      for (const entry of settled) {
        if (entry) {
          results.push(entry);
        }
      }
    }
    // Pre-video-spend keyframe verification (ViMax economy, fidelity gap #2), face-critical shots
    // only (those carrying identity references): the keyframe becomes the video's first frame, so a
    // wrong/blended face here poisons every paid candidate. Fail → regenerate ONCE; fail again →
    // DROP the keyframe (the shot falls back to reference-to-video with the identity refs attached
    // directly — the safe pre-keyframe path) and warn. "skipped" verdicts change nothing (fail-open).
    if (this.imageAnchorVerifier && results.length > 0) {
      const requestByShotId = new Map(requests.map((planned) => [planned.shotId, planned]));
      const shotById = new Map(anchoredShots.map((shot) => [shot.shotId, shot]));
      const droppedShotIds: string[] = [];
      let keyframeVerifiedCount = 0;
      let keyframeRegeneratedCount = 0;
      for (let index = results.length - 1; index >= 0; index -= 1) {
        const entry = results[index]!;
        const shot = shotById.get(entry.shotId);
        const identityUrls = (shot?.references ?? [])
          .filter((reference) => reference.role === "identity")
          .map((reference) => reference.providerReference.uri)
          .filter((uri): uri is string => typeof uri === "string" && /^https:\/\//.test(uri));
        if (!shot || identityUrls.length === 0) {
          continue;
        }
        const imageUrl = entry.prediction.outputUrls.find((url) => isImageOutputUrl(url));
        if (!imageUrl) {
          continue;
        }
        const expectation = [
          `Subject: ${shot.subject}.`,
          this.identityExpectation(shot)
        ].filter((part): part is string => Boolean(part)).join(" ");
        const verdict = await this.imageAnchorVerifier.verify(
          { imageUrl, kind: "shot_keyframe", expectation, identityReferenceUrls: identityUrls },
          input.signal
        );
        keyframeVerifiedCount += 1;
        if (verdict.status !== "fail") {
          continue;
        }
        const plan = requestByShotId.get(entry.shotId);
        let resolved = false;
        if (plan) {
          try {
            // Feedback-injected regeneration (repo-mining round 2, VideoClaw pattern): the retry
            // carries the verifier's CONCRETE failure reason instead of blindly re-rolling the same
            // prompt — the correction converges in one attempt far more often than luck does.
            const retried = await imageProvider.generateImage(
              this.withVerifierCorrection(plan.request, verdict.reason),
              input.signal
            );
            const retriedUrl = retried.outputUrls.find((url) => isImageOutputUrl(url));
            if (retriedUrl) {
              const retryVerdict = await this.imageAnchorVerifier.verify(
                { imageUrl: retriedUrl, kind: "shot_keyframe", expectation, identityReferenceUrls: identityUrls },
                input.signal
              );
              if (retryVerdict.status !== "fail") {
                results[index] = { ...entry, prediction: retried };
                keyframeRegeneratedCount += 1;
                resolved = true;
              }
            }
          } catch (error) {
            if (input.signal?.aborted) {
              throw error;
            }
          }
        }
        if (!resolved) {
          // A confirmed-wrong face as the first frame is WORSE than no keyframe: drop it so the
          // identity references reach the video model directly instead of a poisoned still.
          droppedShotIds.push(entry.shotId);
          results.splice(index, 1);
        }
      }
      if (keyframeVerifiedCount > 0) {
        this.reportStageProgress("render", droppedShotIds.length > 0 ? "warn" : "running",
          droppedShotIds.length > 0
            ? "Some keyframes contradicted their identity references even after one regeneration and were dropped; those shots render from the identity references directly."
            : "Face-critical keyframes verified against identity references before video spend.",
          {
            keyframeVerifiedCount,
            keyframeRegeneratedCount,
            keyframeDroppedCount: droppedShotIds.length
          }
        );
      }
    }
    const binding = bindKeyframesToShots({ shots: anchoredShots, results });
    // Recompile every shot that changed: those bound to a keyframe AND those that only received a
    // character-anchor identity reference (so the anchor still reaches the video request even when
    // that shot's own keyframe was skipped).
    const shotIdsToRecompile = new Set<string>([...binding.boundShotIds, ...anchoredShotIds]);
    for (const shotId of shotIdsToRecompile) {
      const promptIndex = input.compiledPrompts.findIndex((prompt) => prompt.shotId === shotId);
      const updatedShot = binding.shots.find((shot) => shot.shotId === shotId);
      if (promptIndex < 0 || !updatedShot) {
        continue;
      }
      // Strip the stale reference-selection plan before recompiling. reference-selection ran BEFORE
      // the keyframe existed and froze `selectedReferences` to the pre-keyframe set; the compiler
      // binds from `referenceSelectionPlan.selectedReferences` when present, so keeping the plan would
      // silently DROP the freshly-added first_frame keyframe (and character-anchor identity) from the
      // video request — the paid keyframe would never reach the render. Recompiling from the updated
      // `references` (the compiler re-applies the provider reference cap) lets it through, mirroring
      // the last-frame chain path which strips the plan for the same reason.
      const { referenceSelectionPlan: _staleSelectionPlan, ...updatedShotForKeyframe } = updatedShot;
      input.compiledPrompts[promptIndex] = this.promptCompiler.compile({
        shot: updatedShotForKeyframe,
        settings: input.settings,
        modelId: input.modelId,
        provider: "atlascloud",
        ...(input.providerSupportedReferenceKinds
          ? { providerSupportedReferenceKinds: input.providerSupportedReferenceKinds }
          : {})
      });
    }
    // Escalate when a large share of keyframes fell back (final-audit gap #7): fail-open is correct,
    // but silently shipping many shots on the weaker text/reference-to-video path with only an
    // aggregate count is easy to miss — surface a warning so provider health is reviewed.
    const keyframeSkipRatio = anchoredShots.length > 0
      ? binding.skippedShotIds.length / anchoredShots.length
      : 0;
    if (binding.skippedShotIds.length > 0 && keyframeSkipRatio >= 0.5) {
      this.reportStageProgress(
        "render",
        "warn",
        "A large share of keyframe stills failed; those shots fell back to text/reference-to-video (weaker composition and identity). Review image-provider health before relying on this batch.",
        {
          keyframeSkippedCount: binding.skippedShotIds.length,
          keyframePlannedCount: anchoredShots.length,
          keyframeSkippedPercent: Math.round(keyframeSkipRatio * 100)
        }
      );
    }
    this.reportStageProgress("render", "running", "Keyframe still generation completed.", {
      keyframeBoundCount: binding.boundShotIds.length,
      keyframeSkippedCount: binding.skippedShotIds.length
    });
    return binding.shots;
  }

  /**
   * Audio-first voicing for TALKING shots: synthesize each verbatim spoken line via TTS, then stamp
   * an avatarPlan onto the shot's compiled prompt so the render producer routes it to the
   * audio-driven avatar model (image + audio -> lip-synced, emoting clip). Fail-open per shot.
   */
  private async runTalkingShotStage(input: {
    readonly shots: readonly ShotContract[];
    readonly compiledPrompts: CompiledPrompt[];
    readonly settings: FlexibleSeedanceSettings;
    readonly transitionSettings?: TransitionSettings;
    readonly signal?: AbortSignal;
  }): Promise<void> {
    const avatarModel = this.atlasSettings.models.avatarModel?.trim();
    const ttsModel = this.atlasSettings.models.ttsModel?.trim();
    const speechProvider = this.speechProvider;
    if (!avatarModel || !ttsModel || !speechProvider) {
      return;
    }
    const talkingShots = input.shots
      .map((shot) => ({ shot, decision: decideAvatarShot(shot) }))
      .filter((entry) => entry.decision.talking && Boolean(entry.decision.imageUrl));
    if (talkingShots.length === 0) {
      return;
    }
    this.reportStageProgress("render", "running", "Voicing talking shots (audio-first TTS) before avatar generation.", {
      talkingShotCount: talkingShots.length
    });
    let avatarRoutedCount = 0;
    /** shotId -> real spoken length of the voice track we bought (seconds), when measurable. */
    const measuredSpeechSeconds = new Map<string, number>();
    const voiceTracksToMeasure: { readonly shotId: string; readonly audioUrl: string }[] = [];
    for (const { shot, decision } of talkingShots) {
      try {
        const spokenLine = shot.spokenLine?.trim();
        if (!spokenLine) {
          continue;
        }
        // Language precedence: explicit request metadata wins; then PER-LINE Vietnamese-diacritic
        // evidence (this exact line is Vietnamese, whatever the whole video speaks); then the
        // analyst's whole-video language (covers es/ja/... and diacritic-free VN lines). The
        // analyst hint never outranks per-line evidence because its fail-open fallback is a guess.
        const metadataLanguage = typeof shot.metadata?.shortAudioLanguage === "string"
          ? shot.metadata.shortAudioLanguage.trim()
          : typeof shot.metadata?.voiceLanguage === "string" ? shot.metadata.voiceLanguage.trim() : "";
        const analystLanguage = typeof shot.metadata?.analystVoiceLanguage === "string"
          ? shot.metadata.analystVoiceLanguage.trim()
          : "";
        const languageCode = metadataLanguage
          || (containsVietnameseDiacritics(spokenLine) ? "vi" : "")
          || analystLanguage;
        // Expressive delivery for the phone-KOL register (quality scan): the avatar model reads the
        // AUDIO for its facial performance, so a flat TTS default made the whole talking shot read
        // flat. natural_phone_kol gets lower stability (more expressive/animated) than a cinematic/
        // narration voice. Only set when the register is phone-KOL, else leave the provider default.
        const shotRegister = shot.styleDna?.register;
        const ttsStability = shotRegister === "natural_phone_kol" ? 0.3 : undefined;
        const tts = await speechProvider.synthesizeSpeech(
          {
            provider: "atlascloud",
            modelId: ttsModel,
            text: spokenLine,
            ...(this.atlasSettings.models.ttsVoice ? { voice: this.atlasSettings.models.ttsVoice } : {}),
            ...(languageCode ? { languageCode } : {}),
            ...(ttsStability !== undefined ? { stability: ttsStability } : {}),
            metadata: {
              ...(shot.metadata ?? {}),
              shotId: shot.shotId,
              talkingShot: "true"
            }
          },
          input.signal
        );
        const audioUrl = tts.status === "succeeded"
          ? tts.outputUrls.find((url) => /^https:\/\//.test(url))
          : undefined;
        if (!audioUrl) {
          continue;
        }
        const promptIndex = input.compiledPrompts.findIndex((prompt) => prompt.shotId === shot.shotId);
        if (promptIndex < 0) {
          continue;
        }
        const existing = input.compiledPrompts[promptIndex];
        if (!existing) {
          continue;
        }
        input.compiledPrompts[promptIndex] = {
          ...existing,
          avatarPlan: {
            modelId: avatarModel,
            imageUrl: decision.imageUrl as string,
            audioUrl,
            prompt: buildAvatarPrompt(shot),
            outputResolution: avatarOutputResolution(input.settings),
            ...(input.settings.seed !== undefined ? { seed: input.settings.seed } : {})
          }
        };
        avatarRoutedCount += 1;
        // Queue the voice track for measurement AFTER the loop. Probing inline made one network read
        // per shot, strictly serial, inside the stage that is already the slowest part of a render.
        voiceTracksToMeasure.push({ shotId: shot.shotId, audioUrl });
      } catch (error) {
        // A real user abort must stop the whole stage — swallowing it would keep buying TTS
        // for the remaining talking shots after cancellation (cross-audit).
        if (input.signal?.aborted) {
          throw error;
        }
        // Fail-open: this talking shot stays on the general video path.
      }
    }
    this.reportStageProgress(
      "render",
      avatarRoutedCount === talkingShots.length ? "running" : "warn",
      "Talking-shot voicing completed.",
      { talkingShotCount: talkingShots.length, avatarRoutedCount }
    );
    await this.measureVoiceTracks(voiceTracksToMeasure, measuredSpeechSeconds, input.signal);
    this.assertMeasuredSpeechFillsRuntime({
      shots: input.shots,
      talkingShotIds: talkingShots.map((entry) => entry.shot.shotId),
      measuredSpeechSeconds,
      targetDurationSeconds: input.settings.durationTargetSeconds,
      ...(input.transitionSettings ? { transitionSettings: input.transitionSettings } : {})
    });
  }

  /**
   * The money-saving half of the duration contract. `assertDeliverableDurationBeforeSpend` runs on an
   * ESTIMATE (words per second) before anything is bought; this runs on the MEASURED voice tracks, at
   * the last moment where stopping is still cheap — TTS costs cents, the avatar renders that follow
   * cost dollars each, and the delivery gate that used to catch a short video only fires after ALL of
   * it is spent. That ordering is what turned one under-written script into a full-price render with
   * nothing deliverable at the end.
   *
   * Only the short side matters and only beyond the delivery gate's own tolerance: a video that runs
   * long is trimmed at assembly, and blocking inside the tolerance band would reject renders the gate
   * would have passed. Shots that could not be measured are counted at their planned duration, so a
   * missing prober can never manufacture a shortfall.
   */
  /**
   * Measure the voice tracks this render just bought, in bounded parallel with a hard per-track
   * deadline.
   *
   * Every property here is defensive. ffprobe reads the provider's https URL directly, and the
   * shared process runner's default deadline is thirty MINUTES — on a long talking video that is
   * one unbounded network read per shot (an 8-minute video plans dozens), each able to pin the whole
   * job, and with a single worker that stalls every other customer in the queue behind it. A short
   * deadline plus a concurrency cap keeps a slow CDN to a bounded delay instead of an outage.
   *
   * Every failure mode is silent by design: measurement is advisory, and an unmeasured shot is
   * simply counted at its planned duration by the caller, so a missing ffprobe or a flaky CDN can
   * never manufacture a shortfall and reject a paying customer's render.
   */
  private async measureVoiceTracks(
    tracks: readonly { readonly shotId: string; readonly audioUrl: string }[],
    into: Map<string, number>,
    signal?: AbortSignal
  ): Promise<void> {
    const prober = this.speechDurationProber;
    if (!prober || tracks.length === 0) {
      return;
    }
    const measureOne = async (track: { readonly shotId: string; readonly audioUrl: string }): Promise<void> => {
      // An explicit timer rather than AbortSignal.timeout(): that helper's timer is deliberately
      // unref'd, so it cannot hold the process open and a stalled probe would never be cut short in
      // any context where this work is the only thing left running. A plain setTimeout keeps the
      // deadline real and is cleared on every exit path, so it never delays a finished render.
      const controller = new AbortController();
      const abortNow = (): void => controller.abort();
      const timer = setTimeout(abortNow, VOICE_TRACK_PROBE_TIMEOUT_MS);
      signal?.addEventListener("abort", abortNow, { once: true });
      try {
        const measured = (await prober.probe(track.audioUrl, controller.signal)).durationSeconds;
        if (typeof measured === "number" && Number.isFinite(measured) && measured > 0) {
          into.set(track.shotId, measured);
        }
      } catch {
        // Unreadable or too slow: leave it unmeasured. A user abort is handled by the caller, which
        // checks input.signal before it does anything else with the result.
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abortNow);
      }
    };
    for (let start = 0; start < tracks.length; start += VOICE_TRACK_PROBE_CONCURRENCY) {
      if (signal?.aborted) {
        return;
      }
      await Promise.all(tracks.slice(start, start + VOICE_TRACK_PROBE_CONCURRENCY).map(measureOne));
    }
  }

  /**
   * Seconds the finished file LOSES to crossfades. Every boundary overlaps its two clips, so the
   * assembled runtime is the sum of the clips minus one transition per boundary. Any pre-spend
   * duration check that compares a raw sum against the delivery gate's floor is therefore optimistic
   * by exactly this much, and the gap is a band where the check passes, the money is spent, and the
   * gate then rejects the finished video — 0.7s wide on an 18s/3-shot order, 27.65s on a 480s/80-shot
   * one. withDurationCompensation already does this arithmetic; these checks must agree with it.
   */
  private transitionOverlapSecondsFor(shotCount: number, transitionSettings: TransitionSettings | undefined): number {
    const effective = transitionSettings ?? DEFAULT_TRANSITION_SETTINGS;
    return shotCount > 1 && effective.enabled ? (shotCount - 1) * effective.durationSeconds : 0;
  }

  private assertMeasuredSpeechFillsRuntime(input: {
    readonly shots: readonly ShotContract[];
    readonly talkingShotIds: readonly string[];
    readonly measuredSpeechSeconds: ReadonlyMap<string, number>;
    readonly targetDurationSeconds?: number;
    readonly transitionSettings?: TransitionSettings;
  }): void {
    const target = input.targetDurationSeconds;
    if (!Number.isFinite(target) || (target ?? 0) <= 0 || input.measuredSpeechSeconds.size === 0) {
      return;
    }
    const talking = new Set(input.talkingShotIds);
    const clipSecondsTotal = input.shots.reduce((total, shot) => {
      const measured = input.measuredSpeechSeconds.get(shot.shotId);
      return total + (talking.has(shot.shotId) && measured !== undefined ? measured : shot.durationSeconds);
    }, 0);
    const deliverableSeconds = Math.max(
      0,
      clipSecondsTotal - this.transitionOverlapSecondsFor(input.shots.length, input.transitionSettings)
    );
    const floor = (target as number) * (1 - DURATION_SHORT_BLOCK_TOLERANCE);
    if (deliverableSeconds >= floor) {
      return;
    }
    const measuredWholeSeconds = Math.round(deliverableSeconds * 10) / 10;
    throw new CustomerActionableError(
      `Lời thoại đọc ra chỉ dài ${measuredWholeSeconds} giây, không đủ cho video ${target} giây bạn đặt. ` +
        // Deliberately does NOT promise the customer keeps their credits. The charge is taken up
        // front, before the job runs, and what happens to it on a stop like this is decided by the
        // operator's refund policy — the default queues the case for a human rather than returning
        // it automatically. Saying "you were not charged" here would be false under that default,
        // and a false money statement is worse than the failure it accompanies.
        "Hệ thống đã dừng SỚM, trước bước tốn kém nhất, nên phần đó chưa phát sinh chi phí nhà cung cấp. " +
        "Credits của lần tạo này được xử lý theo chính sách hoàn credits ghi ở trang Điều khoản. " +
        "Bạn hãy viết mô tả dài hơn (thêm ý cần nói), hoặc chọn thời lượng ngắn hơn cho vừa nội dung, rồi tạo lại."
    );
  }

  /**
   * Generate one shared identity portrait per recurring invented character (fail-open, batched).
   * Returns only the characters whose front-view portrait succeeded, as {characterKey, name, uri}.
   */
  /** Identity wording for the keyframe check, from the shot's continuity prose when present. */
  /**
   * Stop a job whose plan provably cannot fill the ordered runtime, BEFORE any provider money.
   * Avatar-routed shots deliver their spoken line's length (~4 words/second for Vietnamese TTS);
   * every other shot delivers its planned duration. Fail-closed only below the delivery gate's own
   * short-side tolerance, and only when talking shots actually exist — a pure b-roll plan delivers
   * its planned seconds and is never touched here.
   */
  private assertDeliverableDurationBeforeSpend(
    shots: readonly ShotContract[],
    plannedTalkingShots: readonly ShotContract[],
    targetDurationSeconds: number,
    transitionSettings?: TransitionSettings
  ): void {
    if (!Number.isFinite(targetDurationSeconds) || targetDurationSeconds <= 0 || plannedTalkingShots.length === 0) {
      return;
    }
    const talkingShotIds = new Set(plannedTalkingShots.map((shot) => shot.shotId));
    const estimatedSeconds = shots.reduce((sum, shot) => {
      if (!talkingShotIds.has(shot.shotId)) {
        return sum + shot.durationSeconds;
      }
      // Spoken UNITS, not whitespace tokens: a space-less Chinese or Japanese line counted as one
      // word, so this check estimated seconds of speech as a fraction of a second and hard-refused
      // every CJK talking order — a shipped, sellable option — with a message blaming the customer.
      return sum + countSpeechUnits(shot.spokenLine ?? "") / TALKING_WORDS_PER_SECOND;
    }, 0);
    // Same crossfade subtraction as the measured check — a pre-spend estimate that ignores it is
    // optimistic by one transition per boundary and lets a doomed plan through.
    const deliverableEstimateSeconds = Math.max(
      0,
      estimatedSeconds - this.transitionOverlapSecondsFor(shots.length, transitionSettings)
    );
    if (deliverableEstimateSeconds >= targetDurationSeconds * (1 - DURATION_SHORT_BLOCK_TOLERANCE)) {
      return;
    }
    const estimated = Math.max(1, Math.round(estimatedSeconds));
    this.reportStageProgress("render", "blocked", "Planned runtime cannot fill the ordered duration; stopped before provider spend.", {
      estimatedDeliverableSeconds: estimated,
      targetDurationSeconds: Math.round(targetDurationSeconds),
      talkingShotCount: plannedTalkingShots.length
    });
    throw new CustomerActionableError(
      `Kịch bản chỉ đủ khoảng ${estimated} giây lời thoại, không đủ ${Math.round(targetDurationSeconds)} giây bạn đặt — ` +
        `cảnh có người nói dài đúng bằng câu nói, nên hệ thống DỪNG TRƯỚC KHI tốn tiền dựng ảnh và video (bạn không mất phí render). ` +
        `Hãy thử tạo lại, hoặc chọn thời lượng khoảng ${estimated} giây, hoặc mô tả thêm nội dung để nhân vật có nhiều điều để nói hơn.`
    );
  }

  private identityExpectation(shot: ShotContract): string | undefined {
    const identity = shot.continuity.identity?.trim();
    return identity ? `Named identity to preserve: ${identity}.` : undefined;
  }

  /**
   * Append the anchor verifier's concrete failure reason to a rejected image request's prompt so
   * the ONE retry attacks the actual defect (VideoClaw's feedback-injected regeneration) instead of
   * re-rolling the identical prompt and hoping. Bounded and scoped: everything else in the request
   * (references, size, model) stays byte-identical.
   */
  private withVerifierCorrection<T extends { readonly prompt: string }>(request: T, reason: string | undefined): T {
    const trimmed = reason?.trim();
    if (!trimmed) {
      return request;
    }
    return {
      ...request,
      prompt: `${request.prompt}\nCORRECTION — the previous attempt was rejected by review for exactly this defect: ${trimmed.slice(0, 300)}. Fix that defect; keep the subject, composition, framing, and style otherwise unchanged.`
    };
  }

  private async generateCharacterAnchorPortraits(input: {
    readonly anchors: readonly CharacterAnchorPlan[];
    readonly imageProvider: ImageProvider;
    readonly imageModelId: string;
    readonly signal?: AbortSignal;
  }): Promise<readonly { readonly characterKey: string; readonly name: string; readonly uri: string }[]> {
    const cast: readonly PortraitCastMember[] = input.anchors.map((anchor) => ({
      characterId: anchor.characterKey,
      name: anchor.name,
      description: anchor.description,
      // The scriptwriter's per-character appearance sheet becomes the portrait's "Locked identity
      // anchor" (audit HIGH: without it the anchor was built from the scene line and drifted).
      ...(anchor.staticFeatures ? { staticFeatures: anchor.staticFeatures } : {})
    }));
    const portraitPlans = planCastPortraitRequests({
      cast,
      provider: "atlascloud",
      imageModelId: input.imageModelId,
      // Three-quarter and profile views, not just the front. The turnaround support was written and
      // then never switched on, so every character had exactly ONE reference image — taken head-on.
      // The moment a shot turned that character even slightly, the video model had no evidence for
      // what the side of their face looks like and invented it, which is the drift customers read as
      // "the actor changed". Two extra images per recurring character is a small price for the one
      // thing a series cannot recover from. Counted in the budget estimate below.
      views: CHARACTER_PORTRAIT_VIEWS
    });
    if (portraitPlans.length === 0) {
      return [];
    }
    const portraitResults: { readonly characterId: string; readonly prediction: Prediction; readonly isPrimary: boolean }[] = [];
    const batchSize = 3;
    for (let start = 0; start < portraitPlans.length; start += batchSize) {
      const batch = portraitPlans.slice(start, start + batchSize);
      const settled = await Promise.all(
        batch.map(async (planned) => {
          try {
            const prediction = await input.imageProvider.generateImage(planned.request, input.signal);
            return { characterId: planned.characterId, prediction, isPrimary: planned.isPrimary };
          } catch (error) {
            // Stop portrait spend on a real cancel (deep-audit: mirror the talking/keyframe stages).
            if (input.signal?.aborted) {
              throw error;
            }
            return undefined;
          }
        })
      );
      for (const entry of settled) {
        if (entry) {
          portraitResults.push(entry);
        }
      }
    }
    // Pre-video-spend verification (ViMax economy, fidelity gap #2): one vision look at each PRIMARY
    // portrait against its locked appearance sheet, BEFORE keyframes and video condition on it. A
    // failed portrait is regenerated ONCE; a twice-failed portrait is KEPT with a warning — an
    // imperfect but consistent anchor still beats every shot re-inventing the face, and the operator
    // review sees the warning. "skipped" (verifier unavailable) changes nothing (fail-open).
    if (this.imageAnchorVerifier) {
      const anchorByCharacter = new Map(input.anchors.map((anchor) => [anchor.characterKey, anchor]));
      const planByCharacter = new Map(
        portraitPlans.filter((plan) => plan.isPrimary).map((plan) => [plan.characterId, plan])
      );
      let verifiedCount = 0;
      let regeneratedCount = 0;
      let unresolvedFailures = 0;
      for (let index = 0; index < portraitResults.length; index += 1) {
        const entry = portraitResults[index]!;
        if (!entry.isPrimary) {
          continue;
        }
        const anchor = anchorByCharacter.get(entry.characterId);
        const imageUrl = entry.prediction.outputUrls.find((url) => isImageOutputUrl(url));
        if (!anchor || !imageUrl) {
          continue;
        }
        const expectation = [anchor.name, anchor.description, anchor.staticFeatures]
          .filter((part): part is string => Boolean(part?.trim()))
          .join(" — ");
        const verdict = await this.imageAnchorVerifier.verify(
          { imageUrl, kind: "character_portrait", expectation },
          input.signal
        );
        verifiedCount += 1;
        if (verdict.status !== "fail") {
          continue;
        }
        const plan = planByCharacter.get(entry.characterId);
        if (!plan) {
          unresolvedFailures += 1;
          continue;
        }
        try {
          // Feedback-injected regeneration (VideoClaw pattern): retry with the reviewer's concrete
          // defect appended, not a blind re-roll of the identical prompt.
          const retried = await input.imageProvider.generateImage(
            this.withVerifierCorrection(plan.request, verdict.reason),
            input.signal
          );
          const retriedUrl = retried.outputUrls.find((url) => isImageOutputUrl(url));
          const retryVerdict = retriedUrl
            ? await this.imageAnchorVerifier.verify(
                { imageUrl: retriedUrl, kind: "character_portrait", expectation },
                input.signal
              )
            : undefined;
          if (retriedUrl && retryVerdict?.status !== "fail") {
            portraitResults[index] = { ...entry, prediction: retried };
            regeneratedCount += 1;
          } else {
            // Keep the better of two known-imperfect portraits: the retried one when it exists.
            if (retriedUrl) {
              portraitResults[index] = { ...entry, prediction: retried };
            }
            unresolvedFailures += 1;
          }
        } catch (error) {
          if (input.signal?.aborted) {
            throw error;
          }
          unresolvedFailures += 1;
        }
      }
      if (verifiedCount > 0) {
        this.reportStageProgress("render", unresolvedFailures > 0 ? "warn" : "running",
          unresolvedFailures > 0
            ? "Some character portraits still contradict their appearance sheet after one regeneration; they are kept as the video's single anchor but flagged for operator review."
            : "Character anchor portraits verified against their appearance sheets before video spend.",
          {
            portraitVerifiedCount: verifiedCount,
            portraitRegeneratedCount: regeneratedCount,
            portraitUnresolvedFailureCount: unresolvedFailures
          }
        );
      }
    }
    const nameByKey = new Map(input.anchors.map((anchor) => [anchor.characterKey, anchor.name]));
    return bindPortraitsToCast({ cast, results: portraitResults })
      .filter((member): member is typeof member & { identityReferenceUri: string } =>
        Boolean(member.identityReferenceUri?.trim())
      )
      .map((member) => ({
        characterKey: member.characterId,
        name: nameByKey.get(member.characterId) ?? member.name,
        uri: member.identityReferenceUri
      }));
  }

  private describePreflightBlock(reports: readonly ReturnType<ConsistencyGuardian["preflight"]>[]): string {
    const details = reports
      .slice(0, 5)
      .map((report) => {
        const finding = report.findings.find((candidate) => candidate.status === "block" || candidate.status === "repair");
        return finding
          ? `${report.nodeId}: ${finding.checkpoint} (${finding.severity}) - ${finding.repair}`
          : `${report.nodeId}: ${report.status}`;
      })
      .join("; ");
    return `Consistency Guardian preflight blocked ${reports.length} shot(s). ${details}`;
  }

  private describeStoryboardBlock(report: ReturnType<ConsistencyGuardian["inspectStoryboard"]>): string {
    const details = report.findings
      .slice(0, 5)
      .map((finding) => `${finding.checkpoint} (${finding.severity}) - ${finding.repair}`)
      .join("; ");
    return `Consistency Guardian storyboard preflight blocked production before render spend. ${details}`;
  }

  private describeRenderBlock(renderedShots: readonly RenderedShot[]): string {
    const details = renderedShots
      .slice(0, 5)
      .map((renderedShot) => {
        const finding = renderedShot.renderInspection.findings.find((candidate) =>
          candidate.status === "block" || candidate.status === "repair" || candidate.status === "rerender"
        );
        const providerFailure = this.providerFailureSummary(renderedShot.prediction);
        const providerSuffix = providerFailure ? ` Provider failure: ${providerFailure}.` : "";
        return finding
          ? `${renderedShot.compiledPrompt.shotId}: ${finding.checkpoint} (${finding.severity}) - ${finding.repair}.${providerSuffix}`
          : `${renderedShot.compiledPrompt.shotId}: ${renderedShot.renderInspection.status}.${providerSuffix}`;
      })
      .join("; ");
    return `Consistency Guardian render gate blocked ${renderedShots.length} shot(s) after targeted repair budget. ${details}`;
  }

  private providerFailureSummary(prediction: Prediction): string | undefined {
    if (prediction.status === "succeeded") {
      return undefined;
    }
    const raw = prediction.raw;
    if (!raw || typeof raw !== "object") {
      return `status=${prediction.status}`;
    }
    const record = raw as Record<string, unknown>;
    const code = typeof record.code === "string" ? record.code : undefined;
    const message = typeof record.message === "string" ? record.message : undefined;
    if (!code && !message) {
      return `status=${prediction.status}`;
    }
    return [code ? `code=${code}` : undefined, message].filter(Boolean).join(", ");
  }

  private describeTestTakeBlock(shot: ShotContract, report: GuardianReport): string {
    const finding = report.findings.find((candidate) => candidate.status === "block" || candidate.status === "rerender");
    return finding
      ? `Consistency Guardian test-take gate blocked ${shot.shotId}: ${finding.checkpoint} (${finding.severity}) - ${finding.repair}`
      : `Consistency Guardian test-take gate blocked ${shot.shotId}: ${report.status}`;
  }
}

export interface MaterialPlanningOptions {
  readonly allowRemoteSources?: boolean;
  readonly preferredSources?: readonly MaterialSource[];
  readonly maxCandidatesPerBrief?: number;
}
