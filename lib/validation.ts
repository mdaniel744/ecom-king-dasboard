import "server-only";
import { z, ZodError } from "zod";

export class ValidationError extends Error {
  /** field name -> friendly message, for highlighting the exact input that's wrong */
  fieldErrors: Record<string, string>;

  constructor(message: string, fieldErrors: Record<string, string> = {}) {
    super(message);
    this.fieldErrors = fieldErrors;
  }
}

export const uuidSchema = z.string().uuid("Invalid ID");

/**
 * Validates an already-assembled plain object (not raw FormData — several
 * actions need to pull multi-value fields via formData.getAll() first,
 * which a generic FormData->Zod adapter can't do) and throws a
 * ValidationError carrying both a human-readable summary and a per-field
 * map, instead of letting a malformed/missing field crash with a raw
 * TypeError further down. Callers (the exported Server Actions) catch this
 * via lib/action-result.ts's toActionResult and turn it into a friendly
 * inline message — never let it reach the client as a raw thrown error.
 */
export function validate<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const { message, fieldErrors } = formatZodError(result.error);
    throw new ValidationError(message, fieldErrors);
  }
  return result.data;
}

function formatZodError(error: ZodError): { message: string; fieldErrors: Record<string, string> } {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "value";
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  const message = error.issues
    .map((issue) => `${issue.path.join(".") || "value"}: ${issue.message}`)
    .join("; ");
  return { message, fieldErrors };
}

export function validateId(id: string): string {
  return validate(uuidSchema, id);
}

export const clerkUserIdSchema = z.string().regex(/^user_\w+$/, "Invalid user ID");

export function validateClerkId(id: string): string {
  return validate(clerkUserIdSchema, id);
}
