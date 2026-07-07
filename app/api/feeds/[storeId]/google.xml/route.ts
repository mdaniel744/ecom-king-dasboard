import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Product } from "@/lib/types";

export const dynamic = "force-dynamic";

function escapeXml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function cdata(str: string): string {
  return `<![CDATA[${str.replace(/\]\]>/g, "]]]]><![CDATA[>")}]]>`;
}

function formatPrice(amount: number, currency: string): string {
  return `${amount.toFixed(2)} ${currency}`;
}

function buildLink(domain: string, slug: string): string {
  const base = domain.startsWith("http") ? domain : `https://${domain}`;
  return `${base.replace(/\/$/, "")}/products/${slug}`;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ storeId: string }> }
) {
  const { storeId } = await params;

  const { data: store } = await supabaseAdmin
    .from("stores")
    .select("id, name, domain")
    .eq("id", storeId)
    .maybeSingle();

  if (!store || !store.domain) {
    return new Response("Store not found or has no domain configured.", {
      status: 404,
      headers: { "Content-Type": "text/plain" },
    });
  }

  const { data: products } = await supabaseAdmin
    .from("products")
    .select("*")
    .eq("store_id", storeId)
    .eq("status", "active")
    .not("price", "is", null)
    .order("created_at", { ascending: false });

  const { data: categories } = await supabaseAdmin
    .from("categories")
    .select("id, name, parent_id")
    .eq("store_id", storeId);

  const categoryMap = new Map((categories ?? []).map((c) => [c.id, c]));

  function breadcrumb(categoryId: string | null): string | null {
    if (!categoryId) return null;
    const cat = categoryMap.get(categoryId);
    if (!cat) return null;
    if (!cat.parent_id) return cat.name;
    const parent = categoryMap.get(cat.parent_id);
    return parent ? `${parent.name} > ${cat.name}` : cat.name;
  }

  const storeUrl = store.domain.startsWith("http")
    ? store.domain
    : `https://${store.domain}`;

  const items = (products ?? [])
    .filter((p: Product) => p.images?.length > 0)
    .map((p: Product) => {
      const link = buildLink(store.domain!, p.slug);
      const hasIdentifier = Boolean(p.brand && p.mpn);
      const productType = breadcrumb(p.category_id);
      const additionalImages = (p.images ?? []).slice(1, 10);

      return `
  <item>
    <g:id>${escapeXml(p.id)}</g:id>
    <g:title>${cdata(p.name)}</g:title>
    <g:description>${cdata(p.description ?? p.name)}</g:description>
    <g:item_group_id>${escapeXml(p.id)}</g:item_group_id>
    <link>${escapeXml(link)}</link>
    <g:product_type>${productType ? cdata(productType) : ""}</g:product_type>
    ${p.google_product_category ? `<g:google_product_category>${cdata(p.google_product_category)}</g:google_product_category>` : "<g:google_product_category/>"}
    <g:image_link>${escapeXml(p.images[0])}</g:image_link>
    <g:condition>${p.condition}</g:condition>
    <g:availability>${p.status === "active" ? "in_stock" : "out_of_stock"}</g:availability>
    <g:price>${escapeXml(formatPrice(p.price!, p.currency))}</g:price>
    ${p.sale_price ? `<g:sale_price>${escapeXml(formatPrice(p.sale_price, p.currency))}</g:sale_price>` : ""}
    ${p.mpn ? `<g:mpn>${escapeXml(p.mpn)}</g:mpn>` : "<g:mpn/>"}
    ${p.brand ? `<g:brand>${escapeXml(p.brand)}</g:brand>` : ""}
    <g:canonical_link>${escapeXml(link)}</g:canonical_link>
    ${additionalImages.map((img: string) => `<g:additional_image_link>${escapeXml(img)}</g:additional_image_link>`).join("\n    ")}
    <g:identifier_exists>${hasIdentifier ? "yes" : "no"}</g:identifier_exists>
  </item>`;
    });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:g="http://base.google.com/ns/1.0" xmlns:c="http://base.google.com/cns/1.0" version="2.0">
<channel>
<title>${cdata(store.name)}</title>
<link>${cdata(storeUrl)}</link>
<description>${cdata(`Product feed for ${store.name}`)}</description>
${items.join("")}
</channel>
</rss>`;

  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
