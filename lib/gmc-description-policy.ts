export type GmcDescriptionValidation = {
  isValid: boolean;
  flaggedTerms: string[];
  cleanedText: string;
};

export const GMC_FORBIDDEN_DESCRIPTION_PATTERNS = [
  {
    category: "Promotional CTAs",
    pattern:
      /\b(buy now|for sale|order today|shop now|add to cart|click here|limited offer|special deal)\b/gi,
  },
  {
    category: "Pricing or discount terms",
    pattern:
      /\b(cheap|discount|discounted|best price|lowest price|sale price|bargain|save \d+%?)\b/gi,
  },
  {
    category: "Guarantees",
    pattern:
      /\b(guarantee|guaranteed|money-back|satisfaction guaranteed|risk-free|100% money back)\b/gi,
  },
  {
    category: "Shipping or returns claims",
    pattern:
      /\b(free shipping|fast delivery|express shipping|easy returns|30-day return)\b/gi,
  },
] as const;

function freshPattern(pattern: RegExp): RegExp {
  return new RegExp(pattern.source, pattern.flags);
}

function cleanDescription(text: string): string {
  // The required pricing regex intentionally ends in a word boundary. When
  // the optional percent sign is present, that boundary can make the engine
  // stop immediately before "%". Remove the complete phrase first so the
  // sanitizer never leaves an orphaned percent sign in the sentence.
  let cleaned = text.replace(/\bsave \d+%?\b%?/gi, "");

  for (const rule of GMC_FORBIDDEN_DESCRIPTION_PATTERNS) {
    cleaned = cleaned.replace(freshPattern(rule.pattern), "");
  }

  return cleaned
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([,.;:!?])/g, "$1")
    .replace(/([,;:]){2,}/g, "$1")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Checks product description copy against the GMC wording rules used by the
 * AI writer. The returned cleanedText keeps the original formatting while
 * removing every forbidden match, so it can also power the UI Auto-Fix.
 */
export function validateProductDescription(text: string): GmcDescriptionValidation {
  const flaggedByKey = new Map<string, string>();

  for (const rule of GMC_FORBIDDEN_DESCRIPTION_PATTERNS) {
    for (const match of text.matchAll(freshPattern(rule.pattern))) {
      const term = match[0];
      const trailingPercent =
        /^save \d+$/i.test(term) && text[(match.index ?? 0) + term.length] === "%" ? "%" : "";
      const displayedTerm = `${term}${trailingPercent}`;
      const key = displayedTerm.toLocaleLowerCase();
      if (!flaggedByKey.has(key)) flaggedByKey.set(key, displayedTerm);
    }
  }

  const flaggedTerms = [...flaggedByKey.values()];
  return {
    isValid: flaggedTerms.length === 0,
    flaggedTerms,
    cleanedText: flaggedTerms.length === 0 ? text : cleanDescription(text),
  };
}
