// A site URL entered without a scheme, or with a trailing slash, makes
// Supabase reject the auth redirect with "requested path is invalid".
// Normalize rather than trusting whatever ended up in the env var.
export function siteUrl() {
  let base = process.env.NEXT_PUBLIC_SITE_URL || "";
  if (!base && typeof window !== "undefined") base = window.location.origin;
  base = base.trim().replace(/\/+$/, "");
  if (base && !/^https?:\/\//i.test(base)) {
    base = (base.startsWith("localhost") ? "http://" : "https://") + base;
  }
  return base;
}
