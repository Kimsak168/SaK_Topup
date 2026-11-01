import { timingSafeEqual } from "node:crypto";

export function isCronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;

  const authHeader = request.headers.get("authorization")?.trim();
  if (authHeader) {
    const received = Buffer.from(authHeader);
    const expected = Buffer.from(`Bearer ${secret}`);
    if (received.length === expected.length && timingSafeEqual(received, expected)) {
      return true;
    }
  }

  const customHeader = request.headers.get("x-cron-secret")?.trim();
  if (customHeader) {
    const received = Buffer.from(customHeader);
    const expected = Buffer.from(secret);
    if (received.length === expected.length && timingSafeEqual(received, expected)) {
      return true;
    }
  }

  // Also support URL query parameter (?secret=... or ?key=...) for external cron schedulers (e.g. cron-job.org)
  try {
    const url = new URL(request.url);
    const querySecret = (
      url.searchParams.get("secret") ||
      url.searchParams.get("key") ||
      url.searchParams.get("token")
    )?.trim();
    if (querySecret) {
      const received = Buffer.from(querySecret);
      const expected = Buffer.from(secret);
      if (received.length === expected.length && timingSafeEqual(received, expected)) {
        return true;
      }
    }
  } catch {
    // ignore malformed URLs
  }

  return false;
}
