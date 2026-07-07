/**
 * One-time script: registers the GCP project with a Merchant Center account.
 * Run once per Merchant Center account you onboard.
 * Usage: node scripts/register-merchant-gcp.mjs
 */
import { JWT } from "google-auth-library";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Config ────────────────────────────────────────────────────────────────────
const MERCHANT_CENTER_ID = "5812889569"; // change per account being registered
const DEVELOPER_EMAIL = "glassonion512@gmail.com";
// ──────────────────────────────────────────────────────────────────────────────

// Parse .env manually (no dotenv dependency needed)
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

console.log(`Registering GCP project with Merchant Center account ${MERCHANT_CENTER_ID}...`);
console.log(`Developer email: ${DEVELOPER_EMAIL}`);
console.log(`Service account: ${credentials.client_email}\n`);

try {
  const res = await client.request({
    url: `https://merchantapi.googleapis.com/accounts/v1/accounts/${MERCHANT_CENTER_ID}/developerRegistration:registerGcp`,
    method: "POST",
    data: { developerEmail: DEVELOPER_EMAIL },
  });
  console.log("✓ Registration successful:");
  console.log(JSON.stringify(res.data, null, 2));
} catch (err) {
  const body = err?.response?.data ?? err?.message ?? err;
  console.error("✗ Registration failed:");
  console.error(JSON.stringify(body, null, 2));
  process.exit(1);
}
