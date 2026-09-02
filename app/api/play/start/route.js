import { NextResponse } from "next/server";
import { serverClient, adminClient } from "@/lib/supabase/server";
import { codesForRegion } from "@/lib/answers";
import { utcDayKey, isPlausibleDayKey } from "@/lib/daily";
import { resolvePuzzle, ensurePuzzleRow } from "@/lib/puzzle";

// Starts (or resumes) today's play. Returns which shapes are already
// answered so a refresh doesn't lose progress or let you re-guess.
export async function POST(req) {
  const { hardMode = false, dayKey: claimed } = await req.json().catch(() => ({}));

  const supabase = serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "sign in first" }, { status: 401 });

  // The browser reports its own local date. Anything outside a day of UTC
  // is rejected, so nobody can walk the archive by lying about their clock.
  const dayKey = isPlausibleDayKey(claimed) ? claimed : utcDayKey();

  // A scheduled override wins over the generated rotation.
  const { n, region } = await resolvePuzzle(dayKey);

  const db = adminClient();
  await ensurePuzzleRow(db, dayKey, region);

  let { data: play } = await db
    .from("plays")
    .select("id, hard_mode, completed_at, score")
    .eq("user_id", user.id)
    .eq("puzzle_n", n)
    .maybeSingle();

  if (!play) {
    const { data, error } = await db
      .from("plays")
      .insert({
        user_id: user.id,
        puzzle_n: n,
        region_id: region.id,
        hard_mode: !!hardMode,
        max_score: codesForRegion(region.id).length * 3,
      })
      .select("id, hard_mode, completed_at, score")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    play = data;
  }

  const { data: answered } = await db
    .from("answers")
    .select("code, target_name, outcome, points")
    .eq("play_id", play.id);

  // Their previous run at this region, for the improvement line.
  const { data: prior } = await db
    .from("plays")
    .select("puzzle_n, score, max_score")
    .eq("user_id", user.id)
    .eq("region_id", region.id)
    .not("completed_at", "is", null)
    .order("puzzle_n", { ascending: false })
    .limit(1);

  return NextResponse.json({
    playId: play.id,
    puzzleNumber: n,
    region: { id: region.id, name: region.name, note: region.note, diff: region.diff },
    hardMode: play.hard_mode,
    completed: !!play.completed_at,
    answered: answered ?? [],
    lastPlay: prior?.[0] ?? null,
    total: codesForRegion(region.id).length,
  });
}
