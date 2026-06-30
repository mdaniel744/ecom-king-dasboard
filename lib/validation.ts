import "server-only";
import { z, ZodError } from "zod";

export class ValidationError extends Error {}

export const uuidSchema = z.string().uuid("Invalid ID");

/**
 * Validates an already-assembled plain object (not raw FormData — several
 * actions need to pull multi-value fields via formData.getAll() first,
 * which a generic FormData->Zod adapter can't do) and throws a clean,
 * single-line ValidationError instead of letting a malformed/missing field
 * crash with a raw TypeError further down.
 */
export function validate<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ValidationError(formatZodError(result.error));
  }
  return result.data;
}

function formatZodError(error: ZodError): string {
  return error.issues.map((issue) => `${issue.path.join(".") || "value"}: ${issue.message}`).join("; ");
}

export function validateId(id: string): string {
  return validate(uuidSchema, id);
}
