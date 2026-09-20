import { createClient } from "@supabase/supabase-js";

try {
  process.loadEnvFile(".env.local");
} catch {
  // Environment variables may already be supplied by the host.
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Add them to .env.local first."
  );
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const PAGE_SIZE = 500;
const candidates = [];

for (let from = 0; ; from += PAGE_SIZE) {
  const { data, error } = await supabase
    .from("products")
    .select("id, reference_number, mpn")
    .not("reference_number", "is", null)
    .order("id")
    .range(from, from + PAGE_SIZE - 1);

  if (error) throw error;

  const page = data ?? [];
  candidates.push(
    ...page.filter(
      (product) => product.reference_number?.trim() && !product.mpn?.trim()
    )
  );

  if (page.length < PAGE_SIZE) break;
}

let updated = 0;
for (let index = 0; index < candidates.length; index += 10) {
  const batch = candidates.slice(index, index + 10);
  const results = await Promise.all(
    batch.map((product) =>
      supabase
        .from("products")
        .update({ mpn: product.reference_number.trim() })
        .eq("id", product.id)
    )
  );

  const failure = results.find((result) => result.error);
  if (failure?.error) throw failure.error;
  updated += batch.length;
}

console.log(
  updated === 0
    ? "No existing products needed an MPN backfill."
    : `Assigned reference numbers as MPNs on ${updated} existing product${updated === 1 ? "" : "s"}.`
);
