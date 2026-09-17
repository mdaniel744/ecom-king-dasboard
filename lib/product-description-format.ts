function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatListItem(value: string): string {
  const escaped = escapeHtml(value.trim()).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  if (escaped.includes("<strong>")) return escaped;

  const separator = escaped.indexOf(":");
  if (separator > 0 && separator <= 80) {
    return `<strong>${escaped.slice(0, separator + 1)}</strong>${escaped.slice(separator + 1)}`;
  }
  return escaped;
}

/** Converts the AI writer's safe plain-text outline into storefront-ready HTML. */
export function productDescriptionTextToHtml(text: string): string {
  const output: string[] = [];
  let listItems: string[] = [];

  function flushList() {
    if (listItems.length === 0) return;
    output.push(`<ul>${listItems.map((item) => `<li>${formatListItem(item)}</li>`).join("")}</ul>`);
    listItems = [];
  }

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      flushList();
      continue;
    }

    const bullet = line.match(/^[-*•]\s+(.+)$/);
    if (bullet) {
      listItems.push(bullet[1]);
      continue;
    }

    flushList();
    const escaped = escapeHtml(line);
    const looksLikeHeading = line.length <= 80 && /:$/.test(line) && !/[.!?]\s*$/.test(line);
    output.push(looksLikeHeading ? `<h3>${escaped}</h3>` : `<p>${escaped}</p>`);
  }

  flushList();
  return output.join("");
}
