/**
 * Agentic short-pipeline conversation layer.
 * It turns natural-language chat turns into a safe, review-gated short-pipeline plan
 * without storing raw transcript text in public evidence.
 */

import { createHash } from "node:crypto";
import { ShortPipelinePlanner } from "./short-pipeline-planner.js";
import type {
  ShortPipelineConversationAnalysis,
  ShortPipelineConversationInput,
  ShortPipelineConversationMessageInput,
  ShortPipelineConversationRole,
  ShortPipelineConversationSession,
  ShortPipelineConversationTurn,
  ShortPipelineTemplatePreference,
  ShortPipelineUserReviewState
} from "../types/short-pipeline.js";
import { createStableId } from "../utils/ids.js";
import {
  internalSourcePatternOrigins,
  SHORT_CORE_SOURCE_PATTERN_IDS
} from "./private-source-pattern-registry.js";

const SOURCE_PATTERN_ORIGINS = internalSourcePatternOrigins(SHORT_CORE_SOURCE_PATTERN_IDS);

const MAX_TURNS = 24;
const MAX_MESSAGE_LENGTH = 1_600;
const RAW_URL_PATTERN = /\bhttps?:\/\/[^\s)>,"]+/gi;
// Redact the credential keyword AND the value that follows it (`key: value`, `key=value`,
// `Bearer value`), plus known high-entropy token prefixes — not just the keyword token.
const CREDENTIAL_PATTERN =
  /\b(?:bearer|basic)\s+[^\s"',]+|\b(?:api[_-]?key|access[_-]?key|secret[_-]?key|private[_-]?key|token|secret|password|passwd|pwd|authorization|credential)["']?\s*[:=]\s*["']?[^"',\s&}]+|\b(?:sk-[A-Za-z0-9_\-]{8,}|gh[oprsu]_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[A-Z0-9]{12,})\b/gi;
const LOCAL_PATH_PATTERN = /[A-Za-z]:\\[^\s]+|\\\\[^\s]+|(?:^|\s)\/(?:Users|home|tmp|var|mnt|opt|work|workspace|private|etc)\/[^\s]+/gi;

export class ShortPipelineConversationEngine {
  private readonly planner: ShortPipelinePlanner;

  public constructor(options: { readonly planner?: ShortPipelinePlanner } = {}) {
    this.planner = options.planner ?? new ShortPipelinePlanner();
  }

  public buildSession(input: ShortPipelineConversationInput): ShortPipelineConversationSession {
    const generatedAt = dateFrom(input.generatedAt);
    const messages = normalizeMessages(input.messages);
    if (!input.projectId.trim()) {
      throw new Error("projectId is required for short-pipeline conversation.");
    }
    if (messages.length === 0) {
      throw new Error("Short-pipeline conversation requires at least one user or operator message.");
    }

    const prompt = promptFrom(messages);
    const templatePreference = templatePreferenceFrom(messages);
    const allowTemplateSuggestions = input.allowTemplateSuggestions ?? templatePreference !== "user_rejected_templates";
    const plan = this.planner.buildPlan({
      projectId: input.projectId,
      ...(input.requestId ? { requestId: input.requestId } : {}),
      userPrompt: prompt,
      ...(input.product ? { product: input.product } : {}),
      ...(input.brandKit ? { brandKit: input.brandKit } : {}),
      ...(input.channelStyle ? { channelStyle: input.channelStyle } : {}),
      ...(input.mediaReferences ? { mediaReferences: input.mediaReferences } : {}),
      ...(input.referenceVideoLearning ? { referenceVideoLearning: input.referenceVideoLearning } : {}),
      ...(input.preferredTemplateId ? { preferredTemplateId: input.preferredTemplateId } : {}),
      allowTemplateSuggestions,
      ...(input.targetPlatform ? { targetPlatform: input.targetPlatform } : {}),
      ...(input.targetDurationSeconds !== undefined ? { targetDurationSeconds: input.targetDurationSeconds } : {}),
      ...(input.targetAspectRatio ? { targetAspectRatio: input.targetAspectRatio } : {}),
      ...(input.audio ? { audio: input.audio } : {}),
      ...(input.seedanceSettings ? { seedanceSettings: input.seedanceSettings } : {}),
      ...(input.visualBible ? { visualBible: input.visualBible } : {}),
      generatedAt
    });
    const turns = messages.map((message, index) => turnFrom(message, index));
    const userReviewState = userReviewStateFrom(messages);
    const requestedChanges = requestedChangesFrom(messages);
    const riskSignals = riskSignalsFrom(messages, plan);
    const analysis: ShortPipelineConversationAnalysis = {
      schemaVersion: "cinejelly.short-pipeline-conversation-analysis.v1",
      businessGoal: plan.intent.businessGoal,
      audience: plan.intent.audience,
      platform: plan.intent.platform,
      emotion: plan.intent.emotion,
      templatePreference,
      userReviewState,
      requestedChanges,
      constraints: constraintsFrom(messages, plan),
      riskSignals,
      missingInputs: [
        ...plan.intent.missingInputs,
        ...(userReviewState === "approval_intent_detected" && plan.reviewApproval.status !== "approved"
          ? ["formal_checkpoint_approval_evidence"]
          : [])
      ],
      sourcePatternOrigins: SOURCE_PATTERN_ORIGINS
    };
    const sessionId = createStableId(
      "short_session",
      [
        input.projectId,
        input.requestId ?? "",
        turns.map((turn) => turn.messageSha256).join("|"),
        plan.planId
      ].join(":")
    );
    const canUseAsNoSpendConversationEvidence = plan.status !== "blocked" && turns.every((turn) => !unsafePublicText(turn.publicSummary));
    return {
      schemaVersion: "cinejelly.short-pipeline-conversation-session.v1",
      sessionId,
      projectId: input.projectId,
      ...(input.requestId ? { requestId: input.requestId } : {}),
      generatedAt,
      noSpend: true,
      networkCallsMade: false,
      providerCallsMade: false,
      rawTranscriptStored: false,
      sourcePatternOrigins: SOURCE_PATTERN_ORIGINS,
      turns,
      analysis,
      plan,
      releaseGateSummary: {
        canUseAsNoSpendConversationEvidence,
        canRenderAfterFormalApproval: plan.releaseGateSummary.canRenderAfterApproval && plan.reviewApproval.status === "approved",
        canReleaseToCustomerTraffic: false,
        releaseBlocker: releaseBlockerFor(plan.status, plan.reviewApproval.status, userReviewState)
      },
      nextActions: nextActionsFor(plan.status, userReviewState, templatePreference, requestedChanges.length)
    };
  }
}

function normalizeMessages(messages: readonly ShortPipelineConversationMessageInput[]): readonly Required<ShortPipelineConversationMessageInput>[] {
  if (!Array.isArray(messages) || messages.length === 0) {
    return [];
  }
  return messages
    .map((message) => {
      if (!message || typeof message !== "object" || Array.isArray(message)) {
        throw new Error("Conversation messages must be objects.");
      }
      return {
        role: roleFrom(message.role),
        text: cleanText(message.text, MAX_MESSAGE_LENGTH) ?? "",
        createdAt: dateFrom(message.createdAt)
      };
    })
    // Drop non-participant and empty turns BEFORE requiring text, so an empty assistant
    // placeholder (common in streamed chat logs) does not crash session building.
    .filter((message) => (message.role === "user" || message.role === "operator") && message.text.length > 0)
    .slice(-MAX_TURNS);
}

function roleFrom(role: ShortPipelineConversationRole | undefined): ShortPipelineConversationRole {
  return role === "assistant" || role === "operator" || role === "user" ? role : "user";
}

function dateFrom(value: unknown): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return new Date("2026-06-19T00:00:00.000Z");
}

function promptFrom(messages: readonly Required<ShortPipelineConversationMessageInput>[]): string {
  return messages
    .map((message, index) => `Turn ${index + 1} (${message.role}): ${safePlanningText(message.text)}`)
    .join("\n")
    .slice(0, 4_000);
}

function turnFrom(message: Required<ShortPipelineConversationMessageInput>, index: number): ShortPipelineConversationTurn {
  return {
    turnId: createStableId("short_turn", `${index}:${message.role}:${message.createdAt.toISOString()}:${sha256(message.text)}`),
    role: message.role,
    createdAt: message.createdAt,
    messageSha256: sha256(message.text),
    publicSummary: safeSummary(message.text),
    rawMessageStored: false
  };
}

function templatePreferenceFrom(messages: readonly Required<ShortPipelineConversationMessageInput>[]): ShortPipelineTemplatePreference {
  const combined = messages.map((message) => message.text).join(" ").toLowerCase();
  if (/\b(no|without|skip|avoid)\s+(template|templates)|custom workflow|from scratch|natural language only/.test(combined)) {
    return "user_rejected_templates";
  }
  if (/\b(use|select|pick|choose)\s+(a\s+)?template|tiktok product ad|ugc ad|explainer|cinematic reveal/.test(combined)) {
    return "user_requested_template";
  }
  return "suggest_optional";
}

function userReviewStateFrom(messages: readonly Required<ShortPipelineConversationMessageInput>[]): ShortPipelineUserReviewState {
  const latest = messages[messages.length - 1]?.text.toLowerCase() ?? "";
  if (/\b(approve|approved|ok to render|looks good|confirm|confirmed)\b/.test(latest)) {
    return "approval_intent_detected";
  }
  if (/\b(change|revise|rewrite|adjust|make it|remove|avoid|less|more|different)\b/.test(latest)) {
    return "revision_requested";
  }
  return "needs_review";
}

function requestedChangesFrom(messages: readonly Required<ShortPipelineConversationMessageInput>[]): readonly string[] {
  const changes: string[] = [];
  for (const message of messages.slice(-6)) {
    const text = message.text;
    const parts = text
      .split(/[.;!?]\s+/)
      .map((part) => cleanText(part, 180))
      .filter((part): part is string => Boolean(part && /\b(change|revise|rewrite|adjust|make it|remove|avoid|less|more|different)\b/i.test(part)));
    changes.push(...parts);
  }
  return uniqueClean(changes.map((item) => safeSummary(item)), 8, 180);
}

function constraintsFrom(
  messages: readonly Required<ShortPipelineConversationMessageInput>[],
  plan: ReturnType<ShortPipelinePlanner["buildPlan"]>
): readonly string[] {
  const combined = messages.map((message) => message.text).join(" ");
  const constraints = [
    `${plan.intent.targetDurationSeconds}s target duration`,
    `${plan.intent.platform} platform`,
    plan.templatePolicy === "none" ? "no template accelerator selected" : "template accelerator remains optional",
    ...matches(combined, /\b(?:must|need|keep|avoid|no|without)\s+([^,.!?]{3,80})/gi)
  ];
  return uniqueClean(constraints.map((item) => safeSummary(item)), 8, 140);
}

function riskSignalsFrom(
  messages: readonly Required<ShortPipelineConversationMessageInput>[],
  plan: ReturnType<ShortPipelinePlanner["buildPlan"]>
): readonly string[] {
  const combined = messages.map((message) => message.text).join(" ");
  const signals = [
    ...(/\b(cure|medical|clinical|guarantee|guaranteed|100%|income|profit|investment|overnight|#1|best)\b/i.test(combined)
      ? ["high-risk commercial claim language detected in conversation"]
      : []),
    ...(plan.productBrief?.claimInventory.some((claim) => claim.substantiationRequired)
      ? ["product claims require substantiation review"]
      : []),
    ...(plan.brandKitEvaluation?.status === "blocked"
      ? ["brand-kit policy blocks current plan"]
      : []),
    ...(plan.productBrief?.images.some((image) => image.rightsStatus !== "operator_approved")
      ? ["product media rights still need operator approval"]
      : [])
  ];
  return uniqueClean(signals, 8, 160);
}

function releaseBlockerFor(
  planStatus: string,
  reviewStatus: string,
  userReviewState: ShortPipelineUserReviewState
): string {
  if (planStatus === "blocked") {
    return "Conversation plan is blocked by unsafe URL, product, brand-kit, or review evidence.";
  }
  if (userReviewState === "approval_intent_detected" && reviewStatus !== "approved") {
    return "User approval intent was detected, but formal scene/audio/no-visible-text/claim checkpoint evidence is still required before render.";
  }
  return "Conversation session is no-spend planning evidence only; render requires formal checkpoint approval, quota/cost gates, artifact validation, and commercial-readiness evidence.";
}

function nextActionsFor(
  planStatus: string,
  userReviewState: ShortPipelineUserReviewState,
  templatePreference: ShortPipelineTemplatePreference,
  requestedChangeCount: number
): readonly string[] {
  if (planStatus === "blocked") {
    return [
      "Resolve blocked product, brand, URL, or review evidence before continuing the conversation toward render.",
      "Regenerate the conversation plan after unsafe evidence is removed."
    ];
  }
  return [
    requestedChangeCount > 0
      ? "Apply the requested conversational revisions and regenerate review checkpoints before render."
      : "Present concept, script, scene plan, audio, no-visible-text, and claim checkpoints for human review.",
    userReviewState === "approval_intent_detected"
      ? "Convert approval intent into formal checkpoint decisions with reviewer and timestamp evidence."
      : "Collect explicit scene/audio/no-visible-text/claim decisions before render spend.",
    templatePreference === "user_rejected_templates"
      ? "Continue with dynamic custom workflow planning; do not force template selection."
      : "Keep template suggestions as optional accelerators that the user can ignore or replace."
  ];
}

function matches(value: string, pattern: RegExp): readonly string[] {
  const output: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value)) !== null) {
    output.push(match[1] ?? match[0]);
  }
  return output;
}

function safeSummary(value: string): string {
  return safePlanningText(value).slice(0, 240) || "[empty]";
}

function safePlanningText(value: string): string {
  const redacted = value
    .replace(RAW_URL_PATTERN, "[redacted-url]")
    .replace(CREDENTIAL_PATTERN, "[redacted-secret]")
    .replace(LOCAL_PATH_PATTERN, " [redacted-local-path]")
    .replace(/\s+/g, " ")
    .trim();
  return redacted.slice(0, MAX_MESSAGE_LENGTH) || "[empty]";
}

function unsafePublicText(value: string): boolean {
  return containsPattern(RAW_URL_PATTERN, value) ||
    containsPattern(CREDENTIAL_PATTERN, value) ||
    containsPattern(LOCAL_PATH_PATTERN, value);
}

function containsPattern(pattern: RegExp, value: string): boolean {
  pattern.lastIndex = 0;
  return pattern.test(value);
}

function cleanText(value: string | undefined, maxLength: number): string | undefined {
  const normalized = value?.replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, maxLength) : undefined;
}

function uniqueClean(values: readonly (string | undefined)[], limit: number, maxLength: number): readonly string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const normalized = cleanText(value, maxLength);
    if (!normalized) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(normalized);
    if (output.length >= limit) {
      break;
    }
  }
  return output;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
