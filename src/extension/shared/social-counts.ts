const COUNT_SUFFIX_MULTIPLIER = {
  k: 1_000,
  m: 1_000_000,
} as const;

export function parseSocialCount(rawText: string | null | undefined) {
  const compactText = (rawText ?? '')
    .replace(/followers?/gi, '')
    .replace(/following/gi, '')
    .replace(/\s+/g, '')
    .replace(/,/g, '')
    .trim();

  if (!compactText) {
    return null;
  }

  const normalized = compactText.toLowerCase();
  const matched = normalized.match(/^(\d+(?:\.\d+)?)([km])?$/);
  if (!matched) {
    return null;
  }

  const numericValue = Number(matched[1]);
  if (!Number.isFinite(numericValue)) {
    return null;
  }

  const suffix = matched[2] as keyof typeof COUNT_SUFFIX_MULTIPLIER | undefined;
  const multiplier = suffix ? COUNT_SUFFIX_MULTIPLIER[suffix] : 1;
  return Math.round(numericValue * multiplier);
}
