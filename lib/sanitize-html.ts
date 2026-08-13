// No "server-only" guard here deliberately — isomorphic-dompurify runs fine
// client-side too, and this needs to be importable from OrderMessageThread,
// which is rendered inside a "use client" component tree (order-escrow-
// panel.tsx), not a Server Component.
import DOMPurify from "isomorphic-dompurify";

// Same allowlist we've asked every storefront to use when rendering rich
// text from this platform (product descriptions, order messages) — kept
// here too so our own dashboard renders external (buyer/dealer-authored)
// message content exactly as safely as we're asking them to.
const ALLOWED_TAGS = [
  "p", "strong", "em", "u", "mark",
  "h2", "h3", "blockquote",
  "ul", "ol", "li",
  "a",
  "table", "colgroup", "col", "thead", "tbody", "tr", "th", "td",
  "img",
];

const ALLOWED_ATTR = ["href", "target", "rel", "src", "alt", "colspan", "rowspan", "style"];

// "style" is otherwise a free-form CSS injection risk — only these two
// narrow patterns are allowed through, matching the same exception every
// storefront was told to implement (text-align on block elements, min-width
// on table/col from Tiptap's column-resize feature). Everything else in a
// style attribute is stripped, not just left as-is.
const ALLOWED_STYLE = /^(text-align:\s*(left|right|center|justify)|min-width:\s*\d+(px|%))\s*;?\s*$/i;

let hookInstalled = false;
function ensureStyleHook() {
  if (hookInstalled) return;
  DOMPurify.addHook("uponSanitizeAttribute", (_node, data) => {
    if (data.attrName === "style" && !ALLOWED_STYLE.test(data.attrValue.trim())) {
      data.keepAttr = false;
    }
  });
  hookInstalled = true;
}

/**
 * Sanitizes rich-text HTML before rendering with dangerouslySetInnerHTML.
 * Used for message thread content, which — unlike our own RichTextEditor
 * output — may originate from an external, Clerk-authenticated buyer or
 * dealer on the storefront, not just trusted staff input.
 */
export function sanitizeHtml(html: string): string {
  ensureStyleHook();
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR });
}
