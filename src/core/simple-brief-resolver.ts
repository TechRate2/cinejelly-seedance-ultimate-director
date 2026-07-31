/**
 * Simple brief resolver.
 *
 * The backend contract for a beginner-proof UI: a user who knows nothing about AI video
 * provides at most an idea, optional reference media (their face / KOL / product), an
 * optional platform, and an optional voice language. Everything else resolves to smart,
 * quality-first defaults — and every default is explained in plain language so the UI can
 * show "what we chose for you". Power users can override anything through `advanced`,
 * which always wins over defaults.
 *
 * Pure and no-spend: the resolved brief feeds the normal planning/review/render gates.
 */

import type { PromptReference, ReferenceRole } from "../types/prompt.js";
import type { AspectRatio, FlexibleSeedanceSettings } from "../types/settings.js";

export type SimplePlatform =
  | "tiktok"
  | "douyin"
  | "reels"
  | "shorts"
  | "facebook"
  | "youtube";

export type SimpleMediaKind = "face" | "product" | "environment" | "style";

export interface SimpleMediaReference {
  readonly kind: SimpleMediaKind;
  /** Clean https:// or asset:// URI of the uploaded image. */
  readonly uri: string;
  readonly label?: string;
}

/** Marks a pasted user script inside userInput so the story stage keeps it verbatim. */
export const USER_SCRIPT_OPEN_MARKER = "<<<USER_SCRIPT";
export const USER_SCRIPT_CLOSE_MARKER = "USER_SCRIPT>>>";

export interface SimpleBriefInput {
  /** The only required field: what the user wants, in their own words. */
  readonly idea: string;
  /** Optional finished script pasted by the user; used verbatim, never rewritten. */
  readonly script?: string;
  readonly platform?: string;
  readonly mediaReferences?: readonly SimpleMediaReference[];
  readonly voice?: { readonly language?: string };
  readonly durationSeconds?: number;
  /** Optional expert overrides; every provided key wins over the defaults. */
  readonly advanced?: Partial<FlexibleSeedanceSettings>;
}

export interface ResolvedSimpleBrief {
  readonly userInput: string;
  readonly platform: SimplePlatform;
  readonly settings: Partial<FlexibleSeedanceSettings>;
  readonly references: readonly PromptReference[];
  readonly voiceLanguage?: string;
  /** Plain-language explanations of every default the backend chose (for the UI). */
  readonly appliedDefaults: readonly string[];
  readonly advancedOverrides: readonly string[];
}

interface PlatformDefaults {
  readonly ratio: AspectRatio;
  readonly durationSeconds: number;
  readonly note: string;
}

const PLATFORM_DEFAULTS: Record<SimplePlatform, PlatformDefaults> = {
  tiktok: { ratio: "9:16", durationSeconds: 27, note: "TikTok vertical feed; 21-34s is the completion-rate sweet spot" },
  douyin: { ratio: "9:16", durationSeconds: 27, note: "Douyin vertical feed; fast-hook 21-34s pacing" },
  reels: { ratio: "9:16", durationSeconds: 22, note: "Instagram Reels favors tight 15-30s loops" },
  shorts: { ratio: "9:16", durationSeconds: 34, note: "YouTube Shorts rewards a fuller 30-45s arc" },
  facebook: { ratio: "9:16", durationSeconds: 30, note: "Facebook Reels vertical, ~30s" },
  youtube: { ratio: "16:9", durationSeconds: 120, note: "YouTube landscape long-form baseline" }
};

const MEDIA_KIND_TO_ROLE: Record<SimpleMediaKind, ReferenceRole> = {
  face: "identity",
  product: "product",
  environment: "environment",
  style: "style"
};

const MIN_DURATION_SECONDS = 15;
const MAX_DURATION_SECONDS = 480;

export function resolveSimpleBrief(input: SimpleBriefInput): ResolvedSimpleBrief {
  const idea = input.idea?.trim();
  if (!idea) {
    throw new Error("An idea is required — one sentence about the video is enough.");
  }
  const appliedDefaults: string[] = [];
  const advancedOverrides: string[] = [];

  const platform = normalizePlatform(input.platform);
  if (!input.platform?.trim()) {
    appliedDefaults.push("Platform defaulted to TikTok (vertical 9:16), the highest-reach short-video feed.");
  }
  const platformDefaults = PLATFORM_DEFAULTS[platform];

  const durationSeconds = resolveDuration(input.durationSeconds, platformDefaults, appliedDefaults);
  const references = buildReferences(input.mediaReferences ?? []);
  if (references.length === 0) {
    appliedDefaults.push(
      "No reference images supplied; the video will be generated from the idea alone. Adding a face/KOL or product photo locks identity and boosts realism."
    );
  }

  const voiceLanguage = input.voice?.language?.trim() || undefined;
  if (!voiceLanguage) {
    appliedDefaults.push("Voice language not set; narration planning defaults to Vietnamese (vi).");
  }

  const defaultSettings: Partial<FlexibleSeedanceSettings> = {
    durationTargetSeconds: durationSeconds,
    ratio: platformDefaults.ratio,
    resolution: "1080p",
    qualityMode: "standard",
    audioMode: "hybrid",
    bitrateMode: "high",
    watermark: false,
    returnLastFrame: true,
    tier: "standard"
  };
  appliedDefaults.push(
    `Aspect ratio ${platformDefaults.ratio} and ~${durationSeconds}s runtime chosen for ${platform}: ${platformDefaults.note}.`,
    "Resolution defaulted to 1080p with high bitrate so the clip holds up on full-screen mobile feeds.",
    "Quality mode 'standard' renders two takes per shot and keeps the better one; raise to high/ultimate in advanced options for more takes.",
    "Audio mode 'hybrid' lets the model create natural ambience while keeping the narration script ready for a voice API.",
    "Last-frame chaining stays on so multi-shot videos flow as one continuous film."
  );

  const settings: Partial<FlexibleSeedanceSettings> = { ...defaultSettings };
  for (const [key, value] of Object.entries(input.advanced ?? {})) {
    if (value === undefined) {
      continue;
    }
    (settings as Record<string, unknown>)[key] = value;
    advancedOverrides.push(`Advanced override: ${key} = ${String(value)}.`);
  }

  const script = input.script?.trim();
  const userInput = script
    ? `${idea}\n${USER_SCRIPT_OPEN_MARKER}\n${script}\n${USER_SCRIPT_CLOSE_MARKER}`
    : idea;
  if (script) {
    appliedDefaults.push(
      "Script-first mode: your pasted script is used verbatim — scenes, order, and lines are preserved; only the visual staging is planned around it."
    );
  }

  return {
    userInput,
    platform,
    settings,
    references,
    ...(voiceLanguage ? { voiceLanguage } : {}),
    appliedDefaults,
    advancedOverrides
  };
}

function normalizePlatform(value: string | undefined): SimplePlatform {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (normalized.includes("douyin")) return "douyin";
  // Facebook wins before the generic "reel" test so "Facebook Reels" gets Facebook defaults.
  if (normalized.includes("facebook") || normalized.includes("fb")) return "facebook";
  if (normalized.includes("reel") || normalized.includes("instagram")) return "reels";
  if (normalized.includes("short")) return "shorts";
  if (normalized.includes("youtube") || normalized.includes("long")) return "youtube";
  return "tiktok";
}

function resolveDuration(
  requested: number | undefined,
  platformDefaults: PlatformDefaults,
  appliedDefaults: string[]
): number {
  if (requested === undefined) {
    return platformDefaults.durationSeconds;
  }
  if (!Number.isFinite(requested)) {
    appliedDefaults.push("Requested duration was not a number; platform default applied.");
    return platformDefaults.durationSeconds;
  }
  const clamped = Math.min(MAX_DURATION_SECONDS, Math.max(MIN_DURATION_SECONDS, Math.round(requested)));
  if (clamped !== Math.round(requested)) {
    appliedDefaults.push(`Duration adjusted to ${clamped}s (supported range ${MIN_DURATION_SECONDS}-${MAX_DURATION_SECONDS}s).`);
  }
  return clamped;
}

function buildReferences(media: readonly SimpleMediaReference[]): readonly PromptReference[] {
  return media.map((item, index) => {
    const uri = item.uri?.trim();
    if (!uri || !/^(https:\/\/|asset:\/\/)/.test(uri)) {
      throw new Error(`Reference ${index + 1} (${item.kind}) must be a clean https:// or asset:// URI.`);
    }
    if (!Object.hasOwn(MEDIA_KIND_TO_ROLE, item.kind)) {
      throw new Error(`Reference ${index + 1} has unsupported kind "${item.kind}".`);
    }
    const role = MEDIA_KIND_TO_ROLE[item.kind];
    const label = item.label?.trim() || `${item.kind}_reference_${index + 1}`;
    return {
      role,
      label,
      providerReference: { kind: "image", uri, label, role },
      priority: role === "identity" || role === "product" ? "primary" : "supporting"
    };
  });
}
