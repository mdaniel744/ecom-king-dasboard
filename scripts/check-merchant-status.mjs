/**
 * Diagnostic: fetches the processed products from Google Merchant Center and
 * prints each one's post-review status and item-level issues (the real
 * approval verdict, which arrives after submission is accepted).
 * Usage: node scripts/check-merchant-status.mjs [merchantCenterId]
 */
import { JWT } from "google-auth-library";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const MERCHANT_CENTER_ID = process.argv[2] ?? "5812889569";

const envPath = join(__dirname, "../.env");
const envContent = readFileSync(envPath, "utf8");
const env = {};
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx === -1) continue;
  env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
}

const raw = env.GOOGLE_MERCHANT_SERVICE_ACCOUNT_KEY;
if (!raw) throw new Error("GOOGLE_MERCHANT_SERVICE_ACCOUNT_KEY not found in .env");
const decoded = raw.trimStart().startsWith("{")
  ? raw
  : Buffer.from(raw.trim(), "base64").toString("utf8");
const credentials = JSON.parse(decoded);

const client = new JWT({
  email: credentials.client_email,
  key: credentials.private_key,
  scopes: ["https://www.googleapis.com/auth/content"],
});

console.log(`Fetching processed products for Merchant Center account ${MERCHANT_CENTER_ID}...\n`);

let pageToken = undefined;
let count = 0;
do {
  const url = new URL(
    `https://merchantapi.googleapis.com/products/v1/accounts/${MERCHANT_CENTER_ID}/products`
  );
  url.searchParams.set("pageSize", "250");
  if (pageToken) url.searchParams.set("pageToken", pageToken);

  let res;
  try {
    res = await client.request({ url: url.toString(), method: "GET" });
  } catch (err) {
    console.error("✗ Request failed:");
    console.error(JSON.stringify(err?.response?.data ?? err?.message ?? err, null, 2));
    process.exit(1);
  }

  const products = res.data.products ?? [];
  for (const p of products) {
    count++;
    const title = p.productAttributes?.title ?? p.attributes?.title ?? "(no title)";
    console.log(`── ${title}`);
    console.log(`   offerId: ${p.offerId}`);

    const status = p.productStatus;
    if (!status) {
      console.log("   (no status yet — Google may still be processing)");
      continue;
    }

    for (const dest of status.destinationStatuses ?? []) {
      const approved = (dest.approvedCountries ?? []).join(",");
      const pending = (dest.pendingCountries ?? []).join(",");
      const disapproved = (dest.disapprovedCountries ?? []).join(",");
      console.log(
        `   [${dest.reportingContext}] approved: ${approved || "—"} | pending: ${pending || "—"} | disapproved: ${disapproved || "—"}`
      );
    }

    const issues = status.itemLevelIssues ?? [];
    if (issues.length === 0) {
      console.log("   no item-level issues ✓");
    }
    for (const issue of issues) {
      console.log(`   ⚠ [${issue.severity}] ${issue.code}: ${issue.description}`);
      if (issue.detail) console.log(`     detail: ${issue.detail}`);
      if (issue.documentation) console.log(`     docs: ${issue.documentation}`);
    }
    console.log();
  }

  pageToken = res.data.nextPageToken;
} while (pageToken);

console.log(`${count} product(s) found.`);
