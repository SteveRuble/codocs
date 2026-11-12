import { AppError } from "../errors";

// Query/path values are always strings (or undefined). Convert them deliberately.
export function parsePositiveInt(value: unknown, fallback: number): number {
  if (typeof value !== "string" || value === "") return fallback;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export function parseId(value: string | undefined): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new AppError(400, "id must be a positive integer");
  return n;
}

export function requireString(body: Record<string, unknown>, field: string): string {
  const v = body[field];
  if (typeof v !== "string" || v.trim() === "") throw new AppError(400, `${field} is required`);
  return v.trim();
}

export function requireInt(body: Record<string, unknown>, field: string, min = 0): number {
  const v = body[field];
  if (typeof v !== "number" || !Number.isInteger(v) || v < min) {
    throw new AppError(400, `${field} must be an integer >= ${min}`);
  }
  return v;
}
