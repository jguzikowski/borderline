import { NextResponse } from "next/server";
import { serverClient, adminClient } from "@/lib/supabase/server";
import { nameForCode } from "@/lib/answers";
import { matches } from "@/lib/names";
import { SCORE } from "@/lib/daily";

// Grades a single guess. The browser never learns a shape's name until
// the guess is in, so there is nothing in the payload to read ahead.
export async function POST(req) {
  const { playId, code, mode, guess } = await req.json().catch(() => ({}));
  if (!playId || !code || !["exact", "narrow"].includes(mode)) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const supabase = serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "sign in first" }, { status: 401 });

  const db = adminClient();
  const { data: play } = await db
    .from("plays")
    .select("id, user_id, region_id, completed_at")
    .eq("id", playId)
    .maybeSingle();

  if (!play || play.user_id !== user.id) {
    return NextResponse.json({ error: "not your play" }, { status: 403 });
  }
  if (play.completed_at) {
    return NextResponse.json({ error: "already finished" }, { status: 409 });
  }

  const target = nameForCode(play.region_id, code);
  if (!target) return NextResponse.json({ error: "unknown shape" }, { status: 400 });

  const right = mode === "exact" ? matches(guess ?? "", target) : (guess ?? "") === target;
  const outcome = right
    ? mode === "exact" ? "exact" : "narrowed"
    : mode === "exact" ? "miss_exact" : "miss_narrow";
  const points = SCORE[outcome];

  // The unique constraint on (play_id, code) is what stops a second
  // attempt at the same shape.
  const { error } = await db.from("answers").insert({
    play_id: play.id, code, target_name: target, guess: guess ?? null, outcome, points,
  });
  if (error) return NextResponse.json({ error: "already answered" }, { status: 409 });

  const { data: rows } = await db.from("answers").select("points").eq("play_id", play.id);
  const score = (rows ?? []).reduce((a, r) => a + r.points, 0);
  await db.from("plays").update({ score }).eq("id", play.id);

  return NextResponse.json({ outcome, points, name: target, score });
}
