export class TtlCache<T> {
  private readonly entries = new Map<string, { expiresAt: number; value: T }>();

  get(key: string) {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.entries.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key: string, value: T, ttlMs: number) {
    this.entries.set(key, { value, expiresAt: Date.now() + ttlMs });
  }
}

const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(key: string, maxRequests: number, windowMs: number) {
  const now = Date.now();
  const bucket = rateLimitStore.get(key);

  if (!bucket || now > bucket.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1 };
  }

  if (bucket.count >= maxRequests) {
    return { allowed: false, remaining: 0, retryAfterMs: bucket.resetAt - now };
  }

  bucket.count += 1;
  rateLimitStore.set(key, bucket);
  return { allowed: true, remaining: Math.max(0, maxRequests - bucket.count) };
}
