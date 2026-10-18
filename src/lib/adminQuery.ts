export function getAdminPagination(searchParams: URLSearchParams, defaultLimit = 25, maximumLimit = 100) {
  const positiveInteger = (value: string | null, fallback: number, maximum: number) => {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
  };
  return {
    page: positiveInteger(searchParams.get("page"), 1, 1_000_000),
    limit: positiveInteger(searchParams.get("limit"), defaultLimit, maximumLimit),
  };
}

export function escapeSearchRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
