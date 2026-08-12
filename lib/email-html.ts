/**
 * Converts rich-text HTML from the Tiptap editor into email-safe HTML by
 * inlining styles on the handful of tags Tiptap can actually produce
 * (table/th/td, img, mark, blockquote). Email clients don't load our app's
 * stylesheet (`.rich-text-content .tiptap` rules in globals.css) or even
 * respect a `<style>` block reliably — Outlook in particular renders via
 * Word's engine, which only trusts inline `style` attributes. Without this,
 * a table would show as plain unstyled rows and a highlight would show as
 * plain text in most inboxes.
 */
export function makeEmailSafeHtml(html: string): string {
  return html
    .replace(/<table(\s[^>]*)?>/g, '<table$1 style="border-collapse:collapse;width:100%;margin:12px 0;">')
    .replace(
      /<th(\s[^>]*)?>/g,
      '<th$1 style="border:1px solid #ddd;padding:8px 10px;background:#f4f4f4;text-align:left;">'
    )
    .replace(/<td(\s[^>]*)?>/g, '<td$1 style="border:1px solid #ddd;padding:8px 10px;">')
    .replace(/<img(\s[^>]*)?>/g, '<img$1 style="max-width:100%;border-radius:6px;">')
    .replace(/<mark(\s[^>]*)?>/g, '<mark$1 style="background-color:#fef08a;padding:0 2px;">')
    .replace(
      /<blockquote(\s[^>]*)?>/g,
      '<blockquote$1 style="border-left:3px solid #ccc;margin:12px 0;padding:6px 0 6px 12px;color:#555;">'
    );
}
