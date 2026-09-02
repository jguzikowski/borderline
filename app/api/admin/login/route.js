import { NextResponse } from "next/server";
import { ADMIN_COOKIE } from "@/lib/admin";

export async function POST(req) {
  const { token } = await req.json().catch(() => ({}));
  const expected = process.env.ADMIN_TOKEN;

  if (!expected) {
    return NextResponse.json({ error: "ADMIN_TOKEN is not set on the server." }, { status: 500 });
  }
  if (!token || token !== expected) {
    return NextResponse.json({ error: "Wrong token." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
