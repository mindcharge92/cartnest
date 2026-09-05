export const DEFAULT_TEST_TIMEOUT_MS = 10_000;

export function createTestId(prefix = "test"): string {
  return `${prefix}-${crypto.randomUUID()}`;
}
