// Stub for future Valkey (Redis-compatible) integration
// Will be used for caching AI responses and rate limiting

export async function getCached(key: string): Promise<string | null> {
  // TODO: Connect to Valkey cluster
  return null;
}

export async function setCached(
  key: string,
  value: string,
  ttlSeconds?: number
): Promise<void> {
  // TODO: Connect to Valkey cluster
}
