/**
 * Content screen — one rule, deliberately.
 *
 * POLICY (owner decision, 2026-07-29): moderation belongs to the model provider, not to a keyword
 * list in this repository. Whatever the customer types, if the provider is willing to render it, the
 * platform renders it. Adult content, nudity, violence, weapons, drugs, dark or disturbing themes,
 * political content, anything else — all of it now passes this gate untouched and is answered by
 * whatever Atlas Cloud / Seedance / the TTS provider decide when the request reaches them.
 *
 * That is the right call on the merits, not just an owner preference. A keyword blocklist cannot
 * judge intent and gets the common cases wrong in both directions: it blocked ordinary Vietnamese
 * cosmetics and children's-clothing briefs because "nude" is a colour name here, while a single
 * comma walked genuinely prohibited text straight past it. The provider's own classifier sees the
 * actual prompt and the actual frames, and it is the one that can refuse mid-render.
 *
 * WHAT SURVIVED, AND WHY IT IS NOT NEGOTIABLE: sexual content involving minors. This is not a taste
 * or brand rule. It is criminal liability for the person whose name is on the service and whose
 * payment account funds the render, in Vietnam and effectively everywhere else. The provider will
 * refuse it too, so the only thing this gate changes is WHERE the refusal happens — here, for free,
 * before any charge, instead of after the customer's credits are spent. Removing it protects no
 * legitimate customer and exposes the owner personally.
 *
 * Pure and deterministic: no network, no spend, no model call. Vietnamese-first plus English,
 * diacritic-insensitive.
 */

export type ContentSafetyCategory = "minor_sexual";

export interface ContentSafetyVerdict {
  readonly allowed: boolean;
  readonly category?: ContentSafetyCategory;
  /** Plain-Vietnamese reason shown to the customer when blocked. */
  readonly reason?: string;
  /** The concrete phrase that triggered the block (for the operator audit log; never a false secret). */
  readonly matched?: string;
}

interface CategoryRule {
  readonly category: ContentSafetyCategory;
  readonly reason: string;
  readonly patterns: readonly RegExp[];
}

/**
 * "Nude" is a COLOUR NAME in Vietnamese beauty and fashion copy — "màu nude", "tông nude", "son
 * nude" all mean beige. It produced the single worst false positive this gate has ever had: an
 * ordinary brief for children's clothing in a beige colourway was refused and labelled as a request
 * for child sexual content. The colour sense is neutralised before matching, and only where it
 * unambiguously names a colour.
 */
const NUDE_AS_COLOUR = /\b(?:mau|tong|tone|gam|sac|nen|son|phan|ao|vay|do)\s+nude\b|\bnude\s+(?:color|colour|tone|beige)\b/gu;

/**
 * Punctuation is flattened to spaces before matching. The proximity rule below bridges its two
 * signals with a character budget, and while that budget allowed only word characters a single
 * comma broke the match — so "tre em, khoa than" sailed through while "tre em khoa than" was
 * caught. Vietnamese prose is comma-heavy, which made the bypassing spelling the common one.
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(NUDE_AS_COLOUR, "beige");
}

const MINOR = "(?:tre em|tre nho|em be|thieu nhi|vi thanh nien|duoi 18|child|children|minor|underage|kid|teen(?:age)?|schoolgirl|schoolboy)";
const SEXUAL = "(?:sex|tinh duc|khoa than|khieu dam|lam tinh|quan he tinh|nude|naked|porn|pornographic|explicit sexual|erotic|thoa man tinh)";
/** Up to ~40 characters between the two signals, in either order. */
const PROXIMITY = "(?:.{0,40})";

const RULES: readonly CategoryRule[] = [
  {
    category: "minor_sexual",
    reason:
      "Yêu cầu này ghép nội dung tình dục với trẻ em / người chưa thành niên. Đây là điều duy nhất hệ thống từ chối, " +
      "và cũng là điều nhà cung cấp model sẽ từ chối. Nếu bạn đang mô tả người lớn, hãy ghi rõ độ tuổi trưởng thành " +
      "trong mô tả rồi gửi lại. Yêu cầu này KHÔNG bị tính phí.",
    patterns: [
      new RegExp(`${MINOR}${PROXIMITY}${SEXUAL}`, "su"),
      new RegExp(`${SEXUAL}${PROXIMITY}${MINOR}`, "su")
    ]
  }
];

export interface ContentSafetyScreenInput {
  readonly userInput?: string;
  readonly referenceLabels?: readonly string[];
  readonly spokenLines?: readonly string[];
  /** Extra free-text fields (product title, claims) worth screening. */
  readonly extraText?: readonly string[];
}

/**
 * Screen a brief. Returns allowed:true for everything except sexual content involving minors —
 * see the file header for why that one rule stayed when the rest were removed.
 */
export function screenContentSafety(input: ContentSafetyScreenInput): ContentSafetyVerdict {
  const combined = normalize(
    [
      input.userInput ?? "",
      ...(input.referenceLabels ?? []),
      ...(input.spokenLines ?? []),
      ...(input.extraText ?? [])
    ].join(" \n ")
  );
  if (!combined) {
    return { allowed: true };
  }
  for (const rule of RULES) {
    for (const pattern of rule.patterns) {
      const match = pattern.exec(combined);
      if (match) {
        return {
          allowed: false,
          category: rule.category,
          reason: rule.reason,
          matched: match[0].slice(0, 80)
        };
      }
    }
  }
  return { allowed: true };
}

/**
 * The plain-Vietnamese message shown to the customer when a brief is refused. The rule's `reason`
 * already carries the whole explanation — what was refused, what to do next, and that nothing was
 * charged — so this is a thin accessor kept for the one call site in the admission path.
 */
export function contentSafetyBlockMessage(verdict: ContentSafetyVerdict): string {
  return verdict.reason ?? "Yêu cầu này không thể tạo video. Vui lòng chỉnh lại mô tả rồi gửi lại.";
}
