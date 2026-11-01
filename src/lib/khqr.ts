/** Read the merchant display name (EMV tag 59) without altering the QR payload.
 * This is display metadata, not payment or authenticity verification.
 */
export function getKhqrMerchantName(payload?: string | null): string | null {
  if (!payload?.startsWith("000201")) return null;
  let offset = 0;
  while (offset + 4 <= payload.length) {
    const tag = payload.slice(offset, offset + 2);
    const rawLength = payload.slice(offset + 2, offset + 4);
    if (!/^\d{2}$/.test(tag) || !/^\d{2}$/.test(rawLength)) return null;
    const length = Number(rawLength);
    const end = offset + 4 + length;
    if (end > payload.length) return null;
    if (tag === "59") return payload.slice(offset + 4, end).trim() || null;
    offset = end;
  }
  return null;
}
