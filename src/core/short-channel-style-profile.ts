/**
 * Channel style profile for repeatable short-video identity.
 * This stores structured channel memory, not model fine-tuning: recurring
 * characters, voice, setting, visual grammar, captions, and editing rules.
 */

import type {
  ShortChannelAssetInput,
  ShortChannelCharacterInput,
  ShortChannelSettingInput,
  ShortChannelStyleAnchor,
  ShortChannelStyleIssue,
  ShortChannelStyleProfile,
  ShortChannelStyleProfileInput,
  ShortChannelVoiceInput
} from "../types/short-channel-style.js";
import { createStableId } from "../utils/ids.js";
import {
  internalSourcePatternOrigins,
  SHORT_CHANNEL_STYLE_SOURCE_PATTERN_IDS
} from "./private-source-pattern-registry.js";

const SOURCE_PATTERN_ORIGINS = internalSourcePatternOrigins(SHORT_CHANNEL_STYLE_SOURCE_PATTERN_IDS);

const UNSAFE_URI_PATTERN =
  /[A-Za-z]:\\|\\\\|(^|\s)\/(?:Users|home|tmp|var|mnt|opt|work|workspace|private|etc)\/|data:|bearer\s+|api[_-]?key|secret|token|password|authorization/i;
const UNSAFE_QUERY_PATTERN = /token|signature|sig|key|apikey|api_key|secret|password|auth|credential|expires|policy/i;

export class ShortChannelStyleProfileEvaluator {
  public evaluate(input: ShortChannelStyleProfileInput | undefined): ShortChannelStyleProfile | undefined {
    if (!input) {
      return undefined;
    }
    const channelName = cleanText(input.channelName, 120);
    const seriesName = cleanText(input.seriesName, 140);
    const audience = cleanText(input.audience, 180);
    const niche = cleanText(input.niche, 120);
    const positioning = cleanText(input.positioning, 240);
    const contentPillars = uniqueClean(input.contentPillars ?? [], 12, 120);
    const visualStyle = cleanText(input.visualStyle, 240);
    const editingRhythm = cleanText(input.editingRhythm, 200);
    const captionStyle = cleanText(input.captionStyle, 200);
    const musicStyle = cleanText(input.musicStyle, 160);
    const styleRules = uniqueClean(input.styleRules ?? [], 16, 180);
    const doNotChange = uniqueClean(input.doNotChange ?? [], 16, 180);
    const avoidPatterns = uniqueClean(input.avoidPatterns ?? [], 16, 180);
    const reusableAssets = input.reusableAssets ?? [];
    const issues = this.issues(input, {
      channelName,
      contentPillars,
      visualStyle,
      editingRhythm,
      captionStyle,
      reusableAssets
    });
    const anchors = this.anchors({
      input,
      channelName,
      seriesName,
      contentPillars,
      visualStyle,
      editingRhythm,
      captionStyle,
      musicStyle
    });
    const status = issues.some((issue) => issue.severity === "block")
      ? "blocked"
      : issues.length > 0
        ? "review_required"
        : "ready";
    const approvedAssetCount = reusableAssets.filter((asset) => asset.rightsStatus === "operator_approved").length;
    const profileId = createStableId(
      "short_channel_style",
      [
        input.channelId ?? "",
        channelName ?? "",
        seriesName ?? "",
        contentPillars.join("|"),
        anchors.map((anchor) => anchor.anchorId).join("|")
      ].join(":")
    );

    return {
      schemaVersion: "cinejelly.short-channel-style-profile.v1",
      profileId,
      status,
      ...(channelName ? { channelName } : {}),
      ...(seriesName ? { seriesName } : {}),
      ...(audience ? { audience } : {}),
      ...(niche ? { niche } : {}),
      ...(positioning ? { positioning } : {}),
      contentPillars,
      ...(visualStyle ? { visualStyle } : {}),
      ...(editingRhythm ? { editingRhythm } : {}),
      ...(captionStyle ? { captionStyle } : {}),
      ...(musicStyle ? { musicStyle } : {}),
      characterCount: input.characters?.length ?? 0,
      voiceCount: input.voices?.length ?? 0,
      settingCount: input.settings?.length ?? 0,
      reusableAssetCount: reusableAssets.length,
      approvedAssetCount,
      styleAnchors: anchors,
      styleRules,
      doNotChange,
      avoidPatterns,
      issues,
      memoryPolicy: {
        mode: "structured_style_memory_not_model_finetune",
        canReuseAcrossScripts: status !== "blocked",
        canBindReferenceAssets: approvedAssetCount > 0,
        requiresRightsReview: reusableAssets.some((asset) => asset.rightsStatus !== "operator_approved"),
        rawReferenceMediaStored: false
      },
      sourcePatternOrigins: SOURCE_PATTERN_ORIGINS
    };
  }

  private issues(input: ShortChannelStyleProfileInput, normalized: {
    readonly channelName: string | undefined;
    readonly contentPillars: readonly string[];
    readonly visualStyle: string | undefined;
    readonly editingRhythm: string | undefined;
    readonly captionStyle: string | undefined;
    readonly reusableAssets: readonly ShortChannelAssetInput[];
  }): readonly ShortChannelStyleIssue[] {
    const issues: ShortChannelStyleIssue[] = [];
    if (!normalized.channelName) {
      issues.push(issue("missing_channel_name", "warn", "Channel name is missing.", "Add channelName so UI/library entries are stable."));
    }
    if (!normalized.visualStyle && !normalized.editingRhythm && !normalized.captionStyle && !input.characters?.length && !input.voices?.length && !input.settings?.length) {
      issues.push(issue("missing_style_anchor", "warn", "Channel style has no reusable visual, voice, setting, or character anchor.", "Add at least one style anchor so future videos keep the same identity."));
    }
    if (normalized.contentPillars.length === 0) {
      issues.push(issue("missing_content_pillars", "warn", "Channel content pillars are missing.", "Add 2-5 content pillars to help the agent choose angles across the channel."));
    }
    for (const character of input.characters ?? []) {
      if (!cleanText(character.name, 120) && !cleanText(character.visualDescription, 240)) {
        issues.push(issue("missing_character_identity", "warn", "A recurring character is missing name and visual identity.", "Add character name or visualDescription.", character.characterId));
      }
    }
    for (const voice of input.voices ?? []) {
      if (!cleanText(voice.label, 120) && !cleanText(voice.voiceStyle, 200) && !cleanText(voice.voiceId, 120)) {
        issues.push(issue("missing_voice_identity", "warn", "A recurring voice is missing label, style, or voiceId.", "Add voice label, voiceStyle, or provider voiceId.", voice.voiceId));
      }
    }
    for (const setting of input.settings ?? []) {
      if (!cleanText(setting.label, 120) && !cleanText(setting.visualDescription, 240)) {
        issues.push(issue("missing_setting_identity", "warn", "A recurring setting is missing label and visual description.", "Add setting label or visualDescription.", setting.settingId));
      }
    }
    for (const asset of normalized.reusableAssets) {
      const uri = cleanText(asset.uri, 500);
      if (uri && !safeAssetUri(uri)) {
        issues.push(issue("unsafe_asset_uri", "block", "Reusable channel asset URI is unsafe.", "Use asset:// IDs or clean HTTPS URLs without credentials/query secrets.", asset.assetId ?? asset.label));
      }
      if (asset.rightsStatus !== "operator_approved") {
        issues.push(issue("unapproved_reusable_asset", "warn", "Reusable channel asset is not operator approved.", "Approve reusable channel assets before binding them to render prompts.", asset.assetId ?? asset.label));
      }
    }
    return issues;
  }

  private anchors(input: {
    readonly input: ShortChannelStyleProfileInput;
    readonly channelName: string | undefined;
    readonly seriesName: string | undefined;
    readonly contentPillars: readonly string[];
    readonly visualStyle: string | undefined;
    readonly editingRhythm: string | undefined;
    readonly captionStyle: string | undefined;
    readonly musicStyle: string | undefined;
  }): readonly ShortChannelStyleAnchor[] {
    const anchors: ShortChannelStyleAnchor[] = [];
    if (input.channelName || input.seriesName || input.contentPillars.length > 0) {
      anchors.push(anchor(
        "channel",
        input.seriesName ?? input.channelName ?? "channel identity",
        `Keep the channel identity consistent: ${[
          input.channelName,
          input.seriesName,
          input.contentPillars.length ? `pillars=${input.contentPillars.join(", ")}` : undefined
        ].filter(Boolean).join("; ")}.`,
        []
      ));
    }
    for (const character of input.input.characters ?? []) {
      anchors.push(characterAnchor(character));
    }
    for (const voice of input.input.voices ?? []) {
      anchors.push(voiceAnchor(voice));
    }
    for (const setting of input.input.settings ?? []) {
      anchors.push(settingAnchor(setting));
    }
    if (input.visualStyle) {
      anchors.push(anchor("visual_style", "visual style", input.visualStyle, assetIdsForKind(input.input.reusableAssets ?? [], "style_reference")));
    }
    if (input.editingRhythm) {
      anchors.push(anchor("editing", "editing rhythm", input.editingRhythm, []));
    }
    if (input.captionStyle) {
      anchors.push(anchor("caption", "caption style", input.captionStyle, []));
    }
    if (input.musicStyle) {
      anchors.push(anchor("music", "music style", input.musicStyle, assetIdsForKind(input.input.reusableAssets ?? [], "music_reference")));
    }
    return anchors.slice(0, 24);
  }
}

function characterAnchor(input: ShortChannelCharacterInput): ShortChannelStyleAnchor {
  const label = cleanText(input.name, 120) ?? cleanText(input.characterId, 120) ?? "recurring character";
  const instruction = [
    input.role ? `role=${cleanText(input.role, 120)}` : undefined,
    input.visualDescription ? `look=${cleanText(input.visualDescription, 240)}` : undefined,
    input.personality ? `personality=${cleanText(input.personality, 160)}` : undefined,
    input.wardrobe ? `wardrobe=${cleanText(input.wardrobe, 160)}` : undefined,
    input.mustPreserve?.length ? `preserve=${uniqueClean(input.mustPreserve, 8, 120).join(", ")}` : undefined,
    input.avoid?.length ? `avoid=${uniqueClean(input.avoid, 8, 120).join(", ")}` : undefined
  ].filter(Boolean).join("; ");
  return anchor("character", label, instruction || `Preserve recurring character ${label}.`, input.referenceAssetIds ?? []);
}

function voiceAnchor(input: ShortChannelVoiceInput): ShortChannelStyleAnchor {
  const label = cleanText(input.label, 120) ?? cleanText(input.voiceId, 120) ?? "recurring voice";
  const instruction = [
    input.language ? `language=${cleanText(input.language, 80)}` : undefined,
    input.voiceStyle ? `voice=${cleanText(input.voiceStyle, 200)}` : undefined,
    input.pacing ? `pacing=${cleanText(input.pacing, 160)}` : undefined,
    input.catchphrases?.length ? `catchphrases=${uniqueClean(input.catchphrases, 8, 100).join(", ")}` : undefined,
    input.doNotSay?.length ? `do_not_say=${uniqueClean(input.doNotSay, 8, 120).join(", ")}` : undefined
  ].filter(Boolean).join("; ");
  return anchor("voice", label, instruction || `Preserve recurring voice ${label}.`, input.referenceAssetIds ?? []);
}

function settingAnchor(input: ShortChannelSettingInput): ShortChannelStyleAnchor {
  const label = cleanText(input.label, 120) ?? cleanText(input.settingId, 120) ?? "recurring setting";
  const instruction = [
    input.visualDescription ? `setting=${cleanText(input.visualDescription, 240)}` : undefined,
    input.lighting ? `lighting=${cleanText(input.lighting, 160)}` : undefined,
    input.colorMood ? `color=${cleanText(input.colorMood, 120)}` : undefined,
    input.recurringProps?.length ? `props=${uniqueClean(input.recurringProps, 8, 100).join(", ")}` : undefined
  ].filter(Boolean).join("; ");
  return anchor("setting", label, instruction || `Preserve recurring setting ${label}.`, input.referenceAssetIds ?? []);
}

function anchor(
  kind: ShortChannelStyleAnchor["kind"],
  label: string,
  instruction: string,
  referenceAssetIds: readonly string[]
): ShortChannelStyleAnchor {
  return {
    anchorId: createStableId("short_style_anchor", `${kind}:${label}:${instruction}:${referenceAssetIds.join("|")}`),
    kind,
    label: cleanText(label, 120) ?? kind,
    instruction: cleanText(instruction, 500) ?? `Preserve ${kind}.`,
    referenceAssetIds: uniqueClean(referenceAssetIds, 12, 160)
  };
}

function issue(
  code: ShortChannelStyleIssue["code"],
  severity: ShortChannelStyleIssue["severity"],
  message: string,
  repair: string,
  subject?: string
): ShortChannelStyleIssue {
  return {
    code,
    severity,
    message,
    repair,
    ...(subject ? { subject } : {})
  };
}

function assetIdsForKind(assets: readonly ShortChannelAssetInput[], kind: ShortChannelAssetInput["kind"]): readonly string[] {
  return assets
    .filter((asset) => asset.kind === kind && asset.rightsStatus === "operator_approved")
    .map((asset) => asset.assetId ?? asset.label)
    .filter((value): value is string => Boolean(value));
}

function safeAssetUri(value: string): boolean {
  if (UNSAFE_URI_PATTERN.test(value)) {
    return false;
  }
  if (value.startsWith("asset://")) {
    return !value.includes("?") && !value.includes("#");
  }
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || isLocalHost(parsed.hostname)) {
      return false;
    }
    return [...parsed.searchParams.entries()].every(([key, item]) => !UNSAFE_QUERY_PATTERN.test(key) && !UNSAFE_QUERY_PATTERN.test(item));
  } catch {
    return false;
  }
}

function isLocalHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return lower === "localhost" || lower === "127.0.0.1" || lower === "::1" || lower.endsWith(".local");
}

function cleanText(value: string | undefined, maxLength = 240): string | undefined {
  const normalized = value?.replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, maxLength) : undefined;
}

function uniqueClean(values: readonly (string | undefined)[], limit: number, maxLength: number): readonly string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const normalized = cleanText(value, maxLength);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(normalized);
    if (output.length >= limit) break;
  }
  return output;
}
