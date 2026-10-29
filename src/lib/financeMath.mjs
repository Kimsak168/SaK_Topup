/** Exact integer minor-unit helpers for values read from the legacy numeric money fields. */
export function currencyExponent(currency) {
  return String(currency || "").toUpperCase() === "KHR" ? 0 : 2;
}

export function toMinorUnits(value, currency) {
  const exponent = currencyExponent(currency);
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "number" && (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER)) return null;
  const source = String(value).trim();
  const match = /^(\d+)(?:\.(\d+))?$/.exec(source);
  if (!match) return null;
  const whole = BigInt(match[1]);
  const fraction = match[2] || "";
  const kept = (fraction + "0".repeat(exponent)).slice(0, exponent);
  let minor = whole * (10n ** BigInt(exponent)) + BigInt(kept || "0");
  const discarded = fraction.slice(exponent);
  if (discarded && Number(discarded[0]) >= 5) minor += 1n;
  return minor;
}

export function formatMinorUnits(value, currency) {
  const exponent = currencyExponent(currency);
  const amount = typeof value === "bigint" ? value : BigInt(value);
  const negative = amount < 0n;
  const absolute = negative ? -amount : amount;
  const scale = 10n ** BigInt(exponent);
  const whole = absolute / scale;
  if (!exponent) return `${negative ? "-" : ""}${whole}`;
  const fraction = String(absolute % scale).padStart(exponent, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

export function addMinorUnits(current, value) {
  const parsed = typeof value === "bigint" ? value : BigInt(value);
  return (typeof current === "bigint" ? current : BigInt(current || 0)) + parsed;
}
