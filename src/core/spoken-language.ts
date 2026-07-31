/**
 * Spoken-language helpers shared by the analyst, the prompt compiler, and the TTS stage —
 * ONE definition of "is this Vietnamese?" and one language-code normalizer, so the stages can
 * never disagree about the same line (cross-review: the diacritic regex was copy-pasted 3x).
 */

// Vietnamese-DISTINCTIVE letters only: horn (ơ ư), breve (ă), stroke-d (đ), and the Latin Extended
// Additional block U+1EA0–U+1EF9 (Vietnamese dot-below / hook-above / horn tone vowels). This
// deliberately does NOT include the plain grave/acute/circumflex/tilde accents à á â ã è é ê ì í ò ó
// ô õ ù ú ñ ç ü (U+00C0–U+00FF) that Vietnamese SHARES with Spanish/French/Portuguese/German/Italian/
// Turkish — matching those made EVERY accented European line falsely read as Vietnamese and voiced with
// a Vietnamese TTS model (wrong pronunciation). Real Vietnamese text almost always carries a horn/breve/
// đ or a dot-below/hook tone; a rare line with only shared accents falls through to the analyst's
// language decision (full-brief context) instead of forcing "vi".
const VIETNAMESE_DIACRITICS = /[ăĂđĐơƠưƯẠ-ỹ]/u;

/**
 * Both detectors below normalize to NFC first, because the characters above are the PRECOMPOSED
 * forms. Vietnamese text reaches us decomposed often enough that this is a mainstream case, not an
 * edge one: Unikey's "Unicode tổ hợp" mode, and anything typed or copied on macOS/iOS, arrive as a
 * base letter plus combining marks — which match none of these ranges. Nothing earlier in the
 * request path normalizes, so a decomposed brief read as non-Vietnamese, the analyst's fallback
 * labelled the job "en", and that label went into the scriptwriter's prompt: the customer got a
 * video whose dialogue was written AND voiced in English. Normalizing at the detector makes the two
 * spellings of the same sentence indistinguishable from here on.
 */
export function containsVietnameseDiacritics(text: string | undefined): boolean {
  return Boolean(text && VIETNAMESE_DIACRITICS.test(text.normalize("NFC")));
}

/**
 * Frequent LLM confusion: a COUNTRY code where a language code belongs. Corrected before the
 * code-like passthrough so "VN" never reaches TTS as an invalid language_code.
 */
const COUNTRY_TO_LANGUAGE: Record<string, string> = {
  vn: "vi", jp: "ja", kr: "ko", cn: "zh", tw: "zh", hk: "zh"
};

const NAME_TO_CODE: Record<string, string> = {
  vietnamese: "vi", "tiếng việt": "vi", english: "en", spanish: "es", french: "fr",
  german: "de", portuguese: "pt", italian: "it", japanese: "ja", korean: "ko",
  chinese: "zh", mandarin: "zh", cantonese: "zh", thai: "th", indonesian: "id",
  malay: "ms", hindi: "hi", arabic: "ar", russian: "ru", turkish: "tr",
  dutch: "nl", polish: "pl", tagalog: "tl", filipino: "tl"
};

/**
 * Normalize a free-text spoken-language answer to a short lowercase code the TTS layer can use
 * directly ("vi", "es", "ja"). Country-code confusions are corrected, full names map through the
 * table, code-like values pass through; anything unrecognized returns undefined so callers keep
 * their own fallback.
 */
export function normalizeSpokenLanguageCode(value: string | undefined): string | undefined {
  if (!value?.trim()) {
    return undefined;
  }
  // NFC before the table lookup: "tiếng việt" typed in decomposed form is a different string to the
  // precomposed key above and would silently fall through to undefined.
  const raw = value.trim().toLowerCase().normalize("NFC");
  const codeLike = raw.match(/^([a-z]{2,3})(?:[-_][a-z0-9]{2,8})?$/i);
  if (codeLike?.[1]) {
    const code = codeLike[1];
    return COUNTRY_TO_LANGUAGE[code] ?? code;
  }
  const firstWord = raw.split(/[\s(,/]+/)[0] ?? raw;
  return NAME_TO_CODE[raw] ?? NAME_TO_CODE[firstWord];
}
