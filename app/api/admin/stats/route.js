import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin";
import { adminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isAdmin()) return NextResponse.json({ error: "not authorised" }, { status: 401 });

  const db = adminClient();
  const call = async (fn, args) => {
    const { data, error } = await db.rpc(fn, args);
    if (error) {
      console.error(`${fn} failed`, error.message);
      return null;
    }
    return data;
  };

  // One failing aggregate shouldn't blank the whole page, so each is
  // resolved independently and the UI renders what it got.
  const [overview, daily, regions, shapes, confidence, retention] = await Promise.all([
    call("stats_overview"),
    call("stats_daily", { days: 30 }),
    call("stats_regions", { min_plays: 1 }),
    call("stats_shapes", { min_attempts: 3, lim: 40 }),
    call("stats_confidence"),
    call("stats_retention", { days: 14 }),
  ]);

  return NextResponse.json({
    overview: overview?.[0] ?? null,
    daily: daily ?? [],
    regions: regions ?? [],
    shapes: shapes ?? [],
    confidence: confidence ?? [],
    retention: retention ?? [],
    generatedAt: new Date().toISOString(),
  });
}
