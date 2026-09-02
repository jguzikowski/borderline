import { NextResponse } from "next/server";
import { serverClient, adminClient } from "@/lib/supabase/server";
import { codesForRegion } from "@/lib/answers";
import { CHIP } from "@/lib/daily";

export async function POST(req) {
  const { playId } = await req.json().catch(() => ({}));
  const supabase = serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "sign in first" }, { status: 401 });

  const db = adminClient();
  const { data: play } = await db
    .from("plays").select("id, user_id, region_id, completed_at").eq("id", playId).maybeSingle();
  if (!play || play.user_id !== user.id) {
    return NextResponse.json({ error: "not your play" }, { status: 403 });
  }

  const { data: rows } = await db
    .from("answers").select("target_name, outcome, points").eq("play_id", play.id);

  const total = codesForRegion(play.region_id).length;
  if ((rows ?? []).length < total) {
    return NextResponse.json({ error: "not finished" }, { status: 400 });
  }

  const sorted = (rows ?? []).slice().sort((a, b) => a.target_name.localeCompare(b.target_name));
  const grid = sorted.map((r) => CHIP[r.outcome]).join("");
  const score = sorted.reduce((a, r) => a + r.points, 0);

  if (!play.completed_at) {
    await db.from("plays")
      .update({ score, max_score: total * 3, grid, completed_at: new Date().toISOString() })
      .eq("id", play.id);
  }

  return NextResponse.json({ score, maxScore: total * 3, grid });
}
