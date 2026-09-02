import { cookies } from "next/headers";

export const ADMIN_COOKIE = "borderline_admin";

// A shared token rather than a user role. Keeps admin access working even
// when email delivery isn't, and there is exactly one administrator.
export function isAdmin() {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) return false;
  return cookies().get(ADMIN_COOKIE)?.value === expected;
}
