export type ShortChannelStyleStatus = "ready" | "review_required" | "blocked";

export type ShortChannelAssetKind =
  | "character_reference"
  | "voice_reference"
  | "setting_reference"
  | "logo"
  | "style_reference"
  | "music_reference";

export interface ShortChannelAssetInput {
  readonly assetId?: string;
  readonly uri?: string;
  readonly kind: ShortChannelAssetKind;
  readonly label?: string;
  readonly rightsStatus?: "operator_approved" | "unverified";
  readonly notes?: string;
}

export interface ShortChannelCharacterInput {
  readonly characterId?: string;
  readonly name?: string;
  readonly role?: string;
  readonly visualDescription?: string;
  readonly personality?: string;
  readonly wardrobe?: string;
  readonly mustPreserve?: readonly string[];
  readonly avoid?: readonly string[];
  readonly referenceAssetIds?: readonly string[];
}

export interface ShortChannelVoiceInput {
  readonly voiceId?: string;
  readonly label?: string;
  readonly language?: string;
  readonly voiceStyle?: string;
  readonly pacing?: string;
  readonly catchphrases?: readonly string[];
  readonly doNotSay?: readonly string[];
  readonly referenceAssetIds?: readonly string[];
}

export interface ShortChannelSettingInput {
  readonly settingId?: string;
  readonly label?: string;
  readonly visualDescription?: string;
  readonly lighting?: string;
  readonly colorMood?: string;
  readonly recurringProps?: readonly string[];
  readonly referenceAssetIds?: readonly string[];
}

export interface ShortChannelStyleProfileInput {
  readonly channelId?: string;
  readonly channelName?: string;
  readonly seriesName?: string;
  readonly audience?: string;
  readonly niche?: string;
  readonly positioning?: string;
  readonly contentPillars?: readonly string[];
  readonly visualStyle?: string;
  readonly editingRhythm?: string;
  readonly captionStyle?: string;
  readonly musicStyle?: string;
  readonly characters?: readonly ShortChannelCharacterInput[];
  readonly voices?: readonly ShortChannelVoiceInput[];
  readonly settings?: readonly ShortChannelSettingInput[];
  readonly reusableAssets?: readonly ShortChannelAssetInput[];
  readonly styleRules?: readonly string[];
  readonly doNotChange?: readonly string[];
  readonly avoidPatterns?: readonly string[];
}

export type ShortChannelStyleIssueCode =
  | "missing_channel_name"
  | "missing_style_anchor"
  | "missing_content_pillars"
  | "unsafe_asset_uri"
  | "unapproved_reusable_asset"
  | "missing_character_identity"
  | "missing_voice_identity"
  | "missing_setting_identity";

export interface ShortChannelStyleIssue {
  readonly code: ShortChannelStyleIssueCode;
  readonly severity: "warn" | "block";
  readonly message: string;
  readonly repair: string;
  readonly subject?: string;
}

export interface ShortChannelStyleAnchor {
  readonly anchorId: string;
  readonly kind: "channel" | "character" | "voice" | "setting" | "visual_style" | "editing" | "caption" | "music";
  readonly label: string;
  readonly instruction: string;
  readonly referenceAssetIds: readonly string[];
}

export interface ShortChannelStyleProfile {
  readonly schemaVersion: "cinejelly.short-channel-style-profile.v1";
  readonly profileId: string;
  readonly status: ShortChannelStyleStatus;
  readonly channelName?: string;
  readonly seriesName?: string;
  readonly audience?: string;
  readonly niche?: string;
  readonly positioning?: string;
  readonly contentPillars: readonly string[];
  readonly visualStyle?: string;
  readonly editingRhythm?: string;
  readonly captionStyle?: string;
  readonly musicStyle?: string;
  readonly characterCount: number;
  readonly voiceCount: number;
  readonly settingCount: number;
  readonly reusableAssetCount: number;
  readonly approvedAssetCount: number;
  readonly styleAnchors: readonly ShortChannelStyleAnchor[];
  readonly styleRules: readonly string[];
  readonly doNotChange: readonly string[];
  readonly avoidPatterns: readonly string[];
  readonly issues: readonly ShortChannelStyleIssue[];
  readonly memoryPolicy: {
    readonly mode: "structured_style_memory_not_model_finetune";
    readonly canReuseAcrossScripts: boolean;
    readonly canBindReferenceAssets: boolean;
    readonly requiresRightsReview: boolean;
    readonly rawReferenceMediaStored: false;
  };
  readonly sourcePatternOrigins: readonly string[];
}
