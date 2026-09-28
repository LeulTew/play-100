export type JsonObject = Record<string, unknown>;

export function isRecord(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function nullableObject(value: unknown): JsonObject | null {
  return isRecord(value) ? value : null;
}

export function requireObject(
  value: unknown,
  reject: () => never = () => {
    throw new Error('Expected a JSON object.');
  },
): JsonObject {
  return isRecord(value) ? value : reject();
}

export function labelledObject(value: unknown, label: string): JsonObject {
  return requireObject(value, () => {
    throw new Error(`Invalid ${label}: expected an object.`);
  });
}

// Build metadata historically permits arrays and treats primitives as missing fields.
export function objectOrEmpty(value: unknown): JsonObject {
  return value !== null && typeof value === 'object' ? (value as JsonObject) : {};
}

export function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function nullableText(value: unknown): string | null {
  return hasText(value) ? value.trim() : null;
}

export function requireText(
  value: unknown,
  reject: () => never = () => {
    throw new Error('Expected a non-empty string.');
  },
  max = Infinity,
  nonempty = true,
): string {
  return typeof value === 'string' && value.length <= max && (!nonempty || value.trim()) ? value : reject();
}

export function labelledText(
  value: unknown,
  label: string,
  limit: number,
  nonempty: boolean,
  reject: (message: string) => never,
): string {
  return requireText(
    value,
    () => reject(`${label} must be ${nonempty ? 'nonempty ' : ''}text of at most ${limit} characters.`),
    limit,
    nonempty,
  );
}
