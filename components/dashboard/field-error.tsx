export function FieldError({ name, errors }: { name: string; errors?: Record<string, string> }) {
  const message = errors?.[name];
  if (!message) return null;
  return <p className="mt-1 text-xs text-destructive">{message}</p>;
}
