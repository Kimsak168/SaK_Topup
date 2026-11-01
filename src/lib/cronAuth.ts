import { timingSafeEqual } from "node:crypto";

let lastPublicTriggerAt = 0;
const PUBLIC_THROTTLE_MS = 10_000; // Allow at most once every 10 seconds for unauthenticated monitors

export function isCronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();

  if (secret) {
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

    // Also support URL query parameter (?secret=... or ?key=...) for external cron schedulers
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
  }

  // Allow known cron services (cron-job.org, Vercel cron, EasyCron)
  const userAgent = request.headers.get("user-agent")?.toLowerCase() || "";
  if (
    userAgent.includes("cron-job") ||
    userAgent.includes("cronjob") ||
    userAgent.includes("vercel-cron") ||
    userAgent.includes("easycron")
  ) {
    return true;
  }

  // Safe rate-limited fallback so bare URLs in external monitors succeed
  const now = Date.now();
  if (now - lastPublicTriggerAt > PUBLIC_THROTTLE_MS) {
    lastPublicTriggerAt = now;
    return true;
  }

  return false;
}
