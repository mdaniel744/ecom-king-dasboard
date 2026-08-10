/**
 * Converts rich-text HTML (from the product description editor) into plain,
 * readable text — for anywhere that must NOT receive markup, e.g. Google
 * Merchant's description field (both the API-push path and the XML feed
 * pull from this), which expects plain text, not `<p>`/`<table>` tags.
 */
export function stripHtml(html: string): string {
  if (!html) return "";
  return html
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/\n?<img[^>]*>\n?/gi, "\n") // inline images have no plain-text form to keep
    .replace(/<\/(p|li|h[1-6]|blockquote|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
