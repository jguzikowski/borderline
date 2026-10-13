import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin";
import { adminClient } from "@/lib/supabase/server";
import { dateString } from "@/lib/daily";
import { regionById, trackOf } from "@/data/regions";

export async function POST(req) {
  if (!isAdmin()) return NextResponse.json({ error: "not authorised" }, { status: 401 });

  const { n, regionId, dayKey, track } = await req.json().catch(() => ({}));
  const region = regionById(regionId);
  if (!Number.isInteger(n) || !region) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  // A US region on the world track would serve the wrong atlas.
  if (trackOf(region) !== track) {
    return NextResponse.json({ error: `${region.name} isn't a ${track} region.` }, { status: 400 });
  }

  const db = adminClient();

  // Changing a day people have already played would invalidate their
  // scores, so past and current puzzles with plays against them are locked.
  const { count } = await db
    .from("plays")
    .select("id", { count: "exact", head: true })
    .eq("puzzle_n", n)
    .eq("track", track);

  if (count > 0) {
    return NextResponse.json(
      { error: `Puzzle ${n} already has ${count} plays and can't be changed.` },
      { status: 409 }
    );
  }

  const { error } = await db.from("puzzles").upsert(
    { n, track, play_date: dateString(dayKey), region_id: region.id, difficulty: region.diff },
    { onConflict: "n,track" }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, n, track, regionId: region.id });
}
