export type RuntimeEnvironment = "development" | "test" | "production";

type EnvSource = Readonly<Record<string, string | undefined>>;

export function readRuntimeEnvironment(source: EnvSource): RuntimeEnvironment {
  const value = source.NODE_ENV ?? "development";
  if (value === "development" || value === "test" || value === "production") return value;
  throw new Error(`Invalid NODE_ENV: ${value}`);
}

export function readPort(source: EnvSource, key: string, fallback: number): number {
  const raw = source[key];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`${key} must be an integer between 1 and 65535.`);
  }
  return value;
}

export function readUrl(source: EnvSource, key: string, fallback?: string): string | undefined {
  const raw = source[key] ?? fallback;
  if (raw === undefined || raw.trim() === "") return undefined;
  try {
    return new URL(raw).toString();
  } catch {
    throw new Error(`${key} must be a valid URL.`);
  }
}

export function readString(source: EnvSource, key: string, fallback?: string): string | undefined {
  const raw = source[key] ?? fallback;
  const value = raw?.trim();
  return value ? value : undefined;
}
