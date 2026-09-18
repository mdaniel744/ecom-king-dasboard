import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { KARIV_GLAMOUR_STORE_ID } from "@/lib/tenant-ids";
import { PRODUCT_CONTENT_FIELDS } from "@/lib/product-content-language";
import { syncProductTranslations } from "@/lib/product-translation-workflow";
import type { Product, Store } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const bodySchema = z.object({
  storeId: z.string().uuid(),
  productId: z.string().uuid(),
  operation: z.enum(["create", "update"]).default("create"),
  changedFields: z.array(z.enum(PRODUCT_CONTENT_FIELDS)).default([]),
});

function validSecret(candidate: string | null): boolean {
  const expected = process.env.PRODUCT_TRANSLATION_WEBHOOK_SECRET;
  if (!candidate || !expected) return false;
  const left = Buffer.from(candidate);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Trusted callback for Kariv dealer/storefront product submissions. It reuses
 * the dashboard's translation workflow and never accepts product content in
 * the request, so callers cannot translate or mutate another tenant's data.
 */
export async function POST(request: NextRequest) {
  if (!validSecret(request.headers.get("x-product-translation-secret"))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid translation request." }, { status: 400 });
  }
  if (parsed.data.storeId !== KARIV_GLAMOUR_STORE_ID) {
    return NextResponse.json({ error: "This callback is enabled for Kariv only." }, { status: 403 });
  }

  const [{ data: store, error: storeError }, { data: product, error: productError }] = await Promise.all([
    supabaseAdmin.from("stores").select("*").eq("id", KARIV_GLAMOUR_STORE_ID).single(),
    supabaseAdmin
      .from("products")
      .select("*")
      .eq("id", parsed.data.productId)
      .eq("store_id", KARIV_GLAMOUR_STORE_ID)
      .single(),
  ]);
  if (storeError || !store || productError || !product) {
    return NextResponse.json({ error: "Kariv product not found." }, { status: 404 });
  }

  const summary = await syncProductTranslations(store as Store, product as Product, {
    onlyMissing: true,
    sourceChangedFields: parsed.data.operation === "update" ? parsed.data.changedFields : [],
  });
  return NextResponse.json({
    ok: summary.failures.length === 0,
    attempted: summary.attempted,
    succeeded: summary.succeeded,
    skipped: summary.skipped,
    failed: summary.failures.length,
  }, { status: summary.failures.length === 0 ? 200 : 207 });
}
