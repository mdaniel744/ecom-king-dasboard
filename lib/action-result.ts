import "server-only";
import { ValidationError } from "@/lib/validation";

export type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors: Record<string, string> };

export function ok<T = undefined>(data?: T): ActionResult<T> {
  return { success: true, data: data as T };
}

// Postgres error codes worth a friendly, specific message instead of the
// generic fallback. Extend this rather than leaking raw DB error text to
// the user (see the security audit note on error message hygiene).
const KNOWN_DB_ERRORS: Record<string, string> = {
  "23505": "Something with this name or value already exists — try a different one.",
};

/**
 * Converts a caught error (ValidationError from lib/validation.ts, a
 * Postgrest/DB error, or anything else) into a friendly ActionResult.
 *
 * IMPORTANT: never call this inside the same try/catch block that also
 * contains a Next.js redirect() call — redirect() works by throwing a
 * special internal signal, and this function would misinterpret it as a
 * real error and swallow the navigation. Keep redirect() outside the
 * try/catch, only reached after a successful, non-error code path.
 */
export function toActionResult(err: unknown): ActionResult<never> {
  if (err instanceof ValidationError) {
    return { success: false, error: err.message, fieldErrors: err.fieldErrors };
  }

  const code = (err as { code?: string } | null | undefined)?.code;
  if (code && KNOWN_DB_ERRORS[code]) {
    return { success: false, error: KNOWN_DB_ERRORS[code], fieldErrors: {} };
  }

  return {
    success: false,
    error: "Something went wrong saving this. Please try again.",
    fieldErrors: {},
  };
}
