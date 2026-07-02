/**
 * Social publishing metadata planner.
 *
 * Every finished deliverable ships with platform-ready publishing metadata — title,
 * description, hashtags, and a call to action — so a creator can post the video the moment
 * it renders instead of writing packaging by hand. Deterministic and zero-spend by design:
 * it derives everything from the premise/user input that already exists in the run, works
 * offline, and never blocks delivery.
 */

export type SocialPlatform = "tiktok" | "reels" | "shorts" | "generic";

export interface SocialPublishingMetadata {
  readonly platform: SocialPlatform;
  readonly title: string;
  readonly description: string;
  readonly hashtags: readonly string[];
  readonly callToAction: string;
}

const MAX_TITLE_LENGTH = 70;
const DEFAULT_MAX_HASHTAGS = 6;

const STOPWORDS = new Set([
  // English
  "the", "a", "an", "and", "or", "but", "with", "for", "from", "into", "onto", "over",
  "this", "that", "these", "those", "is", "are", "was", "were", "be", "being", "been",
  "of", "in", "on", "at", "to", "by", "as", "it", "its", "their", "your", "our", "his",
  "her", "then", "than", "so", "very", "just", "about", "after", "before", "while",
  // Vietnamese
  "và", "hoặc", "nhưng", "với", "cho", "từ", "này", "kia", "đó", "là", "của", "trong",
  "trên", "dưới", "một", "các", "những", "được", "có", "không", "rất", "cũng", "khi",
  "để", "vào", "ra", "lên", "xuống", "bạn", "tôi", "chúng", "mình", "nhé", "ạ"
]);

const PLATFORM_TAGS: Record<SocialPlatform, readonly string[]> = {
  tiktok: ["fyp", "tiktok"],
  reels: ["reels", "instagram"],
  shorts: ["shorts", "youtube"],
  generic: []
};

const CALL_TO_ACTIONS: Record<"vi" | "en", Record<SocialPlatform, string>> = {
  vi: {
    tiktok: "Theo dõi để xem phần tiếp theo!",
    reels: "Lưu lại và chia sẻ cho bạn bè nhé!",
    shorts: "Đăng ký kênh để không bỏ lỡ video mới!",
    generic: "Theo dõi để xem thêm nội dung như thế này!"
  },
  en: {
    tiktok: "Follow for part two!",
    reels: "Save this and share it with a friend!",
    shorts: "Subscribe so you never miss the next one!",
    generic: "Follow for more like this!"
  }
};

export function planSocialPublishingMetadata(input: {
  readonly premise: string;
  readonly userInput?: string;
  readonly platform?: string;
  readonly niche?: string;
  readonly language?: string;
  readonly maxHashtags?: number;
}): SocialPublishingMetadata {
  const platform = normalizePlatform(input.platform);
  const language: "vi" | "en" = input.language?.toLowerCase().startsWith("vi") ? "vi" : "en";
  const premise = input.premise.trim() || input.userInput?.trim() || "";
  const title = buildTitle(premise);
  const callToAction = CALL_TO_ACTIONS[language][platform];
  const description = premise
    ? `${clampText(premise, 180)} ${callToAction}`
    : callToAction;
  const hashtags = buildHashtags({
    texts: [premise, input.userInput ?? "", input.niche ?? ""],
    platform,
    language,
    maxHashtags: input.maxHashtags ?? DEFAULT_MAX_HASHTAGS
  });
  return { platform, title, description, hashtags, callToAction };
}

function normalizePlatform(value: string | undefined): SocialPlatform {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (normalized.includes("tiktok")) {
    return "tiktok";
  }
  if (normalized.includes("reel") || normalized.includes("instagram")) {
    return "reels";
  }
  if (normalized.includes("short") || normalized.includes("youtube")) {
    return "shorts";
  }
  return "generic";
}

function buildTitle(premise: string): string {
  if (!premise) {
    return "New video";
  }
  const firstSentence = premise.split(/(?<=[.!?…])\s+/u)[0] ?? premise;
  return clampText(firstSentence.replace(/[.。]+$/u, ""), MAX_TITLE_LENGTH);
}

function clampText(value: string, maxLength: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  const cut = trimmed.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > maxLength * 0.6 ? lastSpace : maxLength).trimEnd()}…`;
}

function buildHashtags(input: {
  readonly texts: readonly string[];
  readonly platform: SocialPlatform;
  readonly language: "vi" | "en";
  readonly maxHashtags: number;
}): readonly string[] {
  const counts = new Map<string, number>();
  for (const text of input.texts) {
    for (const raw of text.split(/[^\p{L}\p{N}]+/u)) {
      const word = raw.trim().toLowerCase();
      if (word.length < 3 || word.length > 24 || STOPWORDS.has(word) || /^\d+$/.test(word)) {
        continue;
      }
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  }
  const keywords = [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || right[0].length - left[0].length || left[0].localeCompare(right[0]))
    .map(([word]) => word);
  // Platform/trend tags are reserved first — they are the reach levers; keywords fill the rest.
  const platformTags = [
    ...PLATFORM_TAGS[input.platform],
    ...(input.language === "vi" ? ["xuhuong"] : ["viral"])
  ];
  const merged: string[] = [];
  for (const tag of [...platformTags, ...keywords]) {
    const hashtag = `#${stripDiacritics(tag)}`;
    if (!merged.includes(hashtag)) {
      merged.push(hashtag);
    }
    if (merged.length >= input.maxHashtags) {
      break;
    }
  }
  return merged;
}

function stripDiacritics(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/gu, "")
    .replace(/đ/gu, "d")
    .replace(/Đ/gu, "D");
}
