/** Shared by storefront descriptions, Google overrides, and correction requests. */
export const PRODUCT_DESCRIPTION_WRITING_GUIDE = [
  "Write an informative product story in plain text, normally 150–250 words when the supplied facts support it. The reader already has an attributes table: add understanding instead of turning that table into sentences or a long list.",
  "Use exactly two developed narrative paragraphs, roughly 70–95 words each when the facts support it, followed by a brief Technical Specifications section. At least two thirds of the description should be narrative prose. Separate paragraphs and the final section with blank lines.",
  "Paragraph 1 — overview and concept: introduce the exact product and its primary role within the first 50 words, naturally including the supplied brand or model. Establish a concrete context of use and the intended user when supported by the product type or supplied facts. Explain the relationship between its design, construction, and purpose without inventing the manufacturer's design philosophy.",
  "Paragraph 2 — practical experience and design: explain how the meaningful features work together during use. Connect each discussed feature to a defensible practical implication instead of merely repeating its value. Discuss layout, operation, space, handling, visual character, material feel, or versatility where supported; combine related features into a coherent account rather than giving one sentence per attribute.",
  "Ground benefits in direct physical or functional consequences. For example, explicitly adjustable shelves allow the interior arrangement to change; supplied external dimensions help a reader plan placement. A case diameter alone does not establish comfort or wrist fit, and a material name alone does not establish a finish, low weight, scratch resistance, or a particular durability rating. Avoid subjective benefits such as effortless, comfortable, or superior unless substantiated by the input.",
  "Do not invent specifications, performance, craftsmanship, provenance, certifications, compatibility, care instructions, waterproofing, or lifespan. Describe tactile qualities or ergonomics only when the supplied construction or texture supports them. Freestanding does not establish that anchoring is unnecessary or that an item is stable or safe under load; a colour does not identify a coating or surface treatment. If a feature has no substantiated benefit, state it neutrally or reserve it for the short technical summary. Use everyday context appropriate to the product without claiming unprovided capabilities.",
  "End with the heading 'Technical Specifications:' translated into the requested output language, then 3–5 concise bullets (fewer when facts are sparse) formatted '- Feature: value'. Select only essential exact parameters such as dimensions, material, care, or compatibility that were actually supplied. Do not reproduce the complete attribute list or repeat the prose word for word.",
  "Use natural search terminology and concrete explanation. Avoid filler adjectives, promotional claims, keyword stuffing, repeated claims, a concluding sales pitch, or padding to reach the word count. Keep the result shorter if the evidence is sparse. Existing descriptions are source material, not a structure to copy; explicit attributes take precedence over conflicting prose. Return only the body, without a title, introduction label, Markdown heading markers, code fences, or HTML.",
].join(" ");

export const PRODUCT_DESCRIPTION_FACT_REVIEW = [
  "Review and revise the draft against the original product facts before returning it. Check every factual clause, including benefit claims; remove any assertion that is not an explicit input fact or a direct, well-established consequence of the stated mechanism or layout.",
  "In particular, do not infer comfortable or universal fit from dimensions; stable construction, weight capacity, or no need for anchoring from steel or freestanding; a coating from a colour; specific operating duration from a movement type; or a hand finish, texture, certification, or quality grade from material alone. Remove unprovided installation and care advice. Hedging with 'can' or 'may' does not make an unsupported capability acceptable.",
  "Preserve useful explanations such as the arrangement enabled by adjustable shelves, access through explicitly open sides, the visual contrast of supplied colours, or the function of a specified mechanism. Describe ordinary use contexts as examples without claiming unprovided performance. Keep the narrative specific and informative rather than replacing it with an attributes list.",
  "Keep two narrative paragraphs followed by a short Technical Specifications section, aiming for 150–250 words in total, in the requested language. Retain exact supplied numbers, units, brand names, and model identifiers; translate generic product names and section headings. Avoid repeating the same claim across paragraphs. Keep the promotional-content restrictions. Return only the revised description, without a review report.",
].join(" ");

function wordCount(text: string): number {
  return text.trim().match(/\S+/g)?.length ?? 0;
}

/** Detect list-dominated output so the writer gets one focused revision. */
export function productDescriptionRevisionReasons(text: string): string[] {
  const lines = text.trim().split(/\r?\n/);
  const firstBullet = lines.findIndex((line) => /^\s*(?:[-*•]|\d+[.)])\s+/.test(line));
  const introduction = (firstBullet < 0 ? lines : lines.slice(0, firstBullet)).join("\n");
  const paragraphs = introduction
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter((block) => block && !/^[^\n]{1,100}:$/.test(block));
  const bullets = lines.filter((line) => /^\s*(?:[-*•]|\d+[.)])\s+/.test(line));
  const totalWords = wordCount(text);
  const narrativeWords = wordCount(paragraphs.join(" "));
  const reasons: string[] = [];

  if (paragraphs.length !== 2 || narrativeWords < totalWords * (2 / 3)) {
    reasons.push("Lead with two developed paragraphs that explain the product's purpose and practical experience. At least two thirds of the text should be narrative prose, before the short technical summary.");
  }
  if (bullets.length === 0 || bullets.length > 5) {
    reasons.push("End with a Technical Specifications section containing only 3–5 essential factual bullets, or fewer if fewer parameters were supplied.");
  }
  if (totalWords < 150 || totalWords > 250) {
    reasons.push("Aim for 150–250 words by explaining supported feature relationships and use context. If the input is sparse, remain shorter; do not repeat, invent facts, or add unsupported benefits to reach the length.");
  }

  return reasons;
}
