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

  return false;
}
