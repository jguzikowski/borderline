import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin";
import { adminClient } from "@/lib/supabase/server";

// Clears the plays blocking a scheduled day so it can be changed.
// Destructive by nature: a play whose region changed underneath it would
// be scored against shapes the player never saw, so the rows go rather
// than being left dangling. Answers cascade with them.
export async function POST(req) {
  if (!isAdmin()) return NextResponse.json({ error: "not authorised" }, { status: 401 });

  const { n } = await req.json().catch(() => ({}));
  if (!Number.isInteger(n)) return NextResponse.json({ error: "bad request" }, { status: 400 });

  const db = adminClient();

  const { count } = await db
    .from("plays")
    .select("id", { count: "exact", head: true })
    .eq("puzzle_n", n);

  const { error } = await db.from("plays").delete().eq("puzzle_n", n);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, deleted: count ?? 0 });
}
