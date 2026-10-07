/** Only allow login return paths within the admin dashboard. */
export function getAdminRedirect(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || /[\\\u0000-\u0020]/.test(value)) {
    return "/admin";
  }

  try {
    const base = "https://admin.invalid";
    const url = new URL(value, base);
    const pathname = decodeURIComponent(url.pathname);
    if (
      url.origin !== base ||
      /[\\\u0000-\u0020]/.test(pathname) ||
      pathname.split("/").some((segment) => segment === "." || segment === "..") ||
      (pathname !== "/admin" && !pathname.startsWith("/admin/")) ||
      pathname === "/admin/login" ||
      pathname.startsWith("/admin/login/")
    ) {
      return "/admin";
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/admin";
  }
}
