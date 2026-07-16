/**
 * Spoken-language helpers shared by the analyst, the prompt compiler, and the TTS stage —
 * ONE definition of "is this Vietnamese?" and one language-code normalizer, so the stages can
 * never disagree about the same line (cross-review: the diacritic regex was copy-pasted 3x).
 */

const VIETNAMESE_DIACRITICS = /[ăâđêôơưà-ỹĂÂĐÊÔƠƯÀ-Ỹ]/u;

export function containsVietnameseDiacritics(text: string | undefined): boolean {
  return Boolean(text && VIETNAMESE_DIACRITICS.test(text));
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
  const raw = value.trim().toLowerCase();
  const codeLike = raw.match(/^([a-z]{2,3})(?:[-_][a-z0-9]{2,8})?$/i);
  if (codeLike?.[1]) {
    const code = codeLike[1];
    return COUNTRY_TO_LANGUAGE[code] ?? code;
  }
  const firstWord = raw.split(/[\s(,/]+/)[0] ?? raw;
  return NAME_TO_CODE[raw] ?? NAME_TO_CODE[firstWord];
}
