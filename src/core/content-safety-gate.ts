/**
 * Content-safety gate — a deterministic, no-spend pre-render screen for clearly-prohibited content.
 *
 * WHY (MVP audit, launch blocker): the production template ships CINEJELLY_CUSTOMER_AUTO_RUN=true, so a
 * customer's brief renders and spends money with NO operator review and NO other moderation. A platform
 * taking real money in Vietnam must not generate illegal/harmful video on the owner's Atlas account
 * (legal liability + provider-ToS breach + wasted spend). This gate blocks the highest-liability
 * categories BEFORE any charge, regardless of the auto-run setting.
 *
 * DESIGN — high precision, protective, not a nanny:
 *  - It targets only clearly-prohibited categories (sexual content involving minors, explicit sexual
 *    content, extreme graphic violence/gore, terrorism / mass-harm how-to, illegal-goods trafficking,
 *    self-harm promotion). Legitimate commercial content — skincare, food, fashion, fitness, revenge
 *    DRAMA, product ads — must pass untouched, so patterns require category-specific STRONG signals
 *    (usually a subject term AND a prohibited-act term), never a single ambiguous word.
 *  - Vietnamese-first (primary market) plus English, diacritic-insensitive.
 *  - Pure + deterministic: the caller feeds the brief text + reference labels + spoken lines; this
 *    returns allow/block + the matched category + a plain-Vietnamese reason. No network, no spend. An
 *    optional stronger LLM moderation pass can be layered on top by the caller; this is the always-on
 *    floor that works even when no model is configured.
 */

export type ContentSafetyCategory =
  | "minor_sexual"
  | "sexual_explicit"
  | "graphic_violence"
  | "terror_mass_harm"
  | "illegal_goods"
  | "self_harm";

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
  /**
   * Blocks when ANY listed pattern matches the normalized text. Each pattern is deliberately
   * multi-signal (e.g. a minor term NEAR a sexual term) so ordinary commercial briefs never trip it.
   */
  readonly patterns: readonly RegExp[];
}

/**
 * Lowercase + strip Vietnamese diacritics so "trẻ em" and "tre em" both match, then flatten ALL
 * punctuation to a single space.
 *
 * The punctuation step is load-bearing, not cosmetic. The proximity rules bridge two signals with
 * `[\s\w]{0,40}`, which admits only ASCII word characters and whitespace — so a single comma broke
 * the match and walked the brief straight past the ABSOLUTE minor-safety prohibition. Measured
 * before this line existed: "tre em khoa than" was blocked, while "tre em, khoa than",
 * "tre em: khoa than", "tre em - khoa than", "tre em. khoa than" and "tre em (khoa than)" were all
 * admitted into the paid pipeline. Vietnamese prose is comma-heavy, so the bypassing form was the
 * COMMON one. Flattening here fixes every rule at once instead of patching each pattern.
 *
 * Deliberately fail-closed: collapsing sentence punctuation lets the proximity window reach across
 * a full stop, so a legitimate brief that names both signals within ~40 characters is now refused.
 * For a prohibition that exists to keep child sexual content out of a commercial render pipeline,
 * an occasional refused brief the operator can review is the correct side to err on. `\p{L}\p{N}`
 * rather than `a-z0-9` so non-Latin scripts survive normalization instead of being blanked.
 */
/**
 * "Nude" is a COLOUR NAME in Vietnamese beauty and fashion copy — "màu nude", "tông nude", "son
 * nude", "nền nude" all mean beige/skin-tone and are everyday commercial vocabulary. Left in the
 * sexual signal list it produced the worst possible false positive: an ordinary brief for children's
 * clothing in a beige colourway was refused and labelled MINOR_SEXUAL, i.e. the platform accused a
 * paying customer of requesting child sexual content over a colour swatch.
 *
 * The colour sense is neutralised before matching, and only in the shapes where it unambiguously
 * names a colour (preceded by màu/tông/gam/sắc/nền/son, or followed by a colour noun). Bare "nude"
 * on its own is untouched and still matches, so this narrows a false positive without opening a
 * bypass — "video khỏa thân" and "nude video" are unaffected.
 */
const NUDE_AS_COLOUR = /\b(?:mau|tong|tone|gam|sac|nen|son|phan|ao|vay|do)\s+nude\b|\bnude\s+(?:color|colour|tone|beige)\b/gu;

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

// Sub-signals reused across proximity patterns (already diacritic-stripped to match normalize()).
const MINOR = "(?:tre em|tre nho|em be|thieu nhi|vi thanh nien|duoi 18|child|children|minor|underage|kid|teen(?:age)?|schoolgirl|schoolboy)";
const SEXUAL = "(?:sex|tinh duc|khoa than|khieu dam|lam tinh|quan he tinh|nude|naked|porn|pornographic|explicit sexual|erotic|thoa man tinh|cornerchd)";
const PROXIMITY = "(?:[\\s\\w]{0,40})"; // up to ~40 chars/words between the two signals

const RULES: readonly CategoryRule[] = [
  {
    category: "minor_sexual",
    reason: "Nội dung tình dục liên quan trẻ em/trẻ vị thành niên bị cấm tuyệt đối.",
    patterns: [
      new RegExp(`${MINOR}${PROXIMITY}${SEXUAL}`),
      new RegExp(`${SEXUAL}${PROXIMITY}${MINOR}`)
    ]
  },
  {
    category: "sexual_explicit",
    reason: "Nội dung khiêu dâm / tình dục lộ liễu không được phép trên nền tảng này.",
    patterns: [
      /\b(?:phim sex|clip sex|khieu dam|khoa than hoan toan|canh lam tinh|hardcore porn|pornographic|explicit sex scene|full nude|deepfake sex|xxx video)\b/,
      /\b(?:co gai|nguoi mau|nu than|woman|girl|model)\b[\s\w]{0,25}\b(?:khoa than|nude|naked|topless|thoat y)\b/
    ]
  },
  {
    category: "graphic_violence",
    reason: "Nội dung bạo lực đẫm máu / hành quyết / tra tấn chi tiết không được phép.",
    patterns: [
      /\b(?:chat dau|chem dau|hanh quyet|tra tan da man|mo bung|lot da nguoi|dam mau be bet|xac chet ghe ron|behead|decapitat|dismember|gore|graphic torture|execution video)\b/
    ]
  },
  {
    category: "terror_mass_harm",
    reason: "Nội dung khủng bố / hướng dẫn gây sát thương hàng loạt bị cấm.",
    patterns: [
      /\b(?:che tao bom|huong dan lam bom|danh bom|khung bo|xa sung|thanh chien|build a bomb|make a bomb|mass shooting|terror attack|bioweapon|nerve agent|chemical attack)\b/
    ]
  },
  {
    category: "illegal_goods",
    reason: "Quảng bá / mua bán hàng cấm (ma túy, vũ khí, giấy tờ giả...) không được phép.",
    patterns: [
      /\b(?:ban ma tuy|mua ma tuy|buon ma tuy|ban vu khi trai phep|ban sung lau|giay to gia|bang gia|ho chieu gia|the tin dung chua|sell drugs|buy cocaine|buy heroin|methamphetamine for sale|illegal firearms for sale|counterfeit passport|stolen credit card)\b/
    ]
  },
  {
    category: "self_harm",
    reason: "Nội dung cổ vũ tự tử / tự gây hại bị cấm.",
    patterns: [
      /\b(?:huong dan tu tu|cach tu tu|cach tu sat|co vu tu tu|how to commit suicide|ways to kill yourself|pro-?ana|encourage self-?harm|glorify suicide)\b/
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
 * Screen a brief for clearly-prohibited content. Returns allowed:true for the overwhelming majority of
 * legitimate commercial briefs; allowed:false only on a strong category match.
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

/** The customer-facing message for a blocked brief (Vietnamese, no internal detail). */
export function contentSafetyBlockMessage(verdict: ContentSafetyVerdict): string {
  return `Yêu cầu bị từ chối vì vi phạm chính sách nội dung: ${verdict.reason ?? "nội dung không được phép."} Vui lòng chỉnh sửa mô tả và thử lại.`;
}
