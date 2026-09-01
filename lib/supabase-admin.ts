import "server-only";
import { createClient } from "@supabase/supabase-js";
import { createLocalDemoClient, isLocalDemoMode } from "@/lib/local-demo";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!isLocalDemoMode && (!supabaseUrl || !serviceRoleKey)) {
  throw new Error(
    "Missing Supabase server environment variables. Check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
  );
}

/** Server-only client used by dashboard reads, writes, and route handlers. */
export const supabaseAdmin = isLocalDemoMode
  ? createLocalDemoClient()
  : createClient(supabaseUrl!, serviceRoleKey!, {
      auth: { persistSession: false },
    });

// Compatibility alias for server code that imported the temporary `supabase`
// name while the environment was being configured.
export const supabase = supabaseAdmin;
