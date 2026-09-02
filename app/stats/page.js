import { serverClient } from "@/lib/supabase/server";
import { regionById } from "@/data/regions";

export const dynamic = "force-dynamic";

export default async function Stats() {
  const supabase = serverClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="wrap">
        <h1 className="region">Your regions</h1>
        <p className="muted">Sign in from the game to see your history.</p>
        <a href="/" style={{ color: "var(--fog)" }}>Back to today&rsquo;s puzzle</a>
      </main>
    );
  }

  const { data: runs } = await supabase
    .from("region_history")
    .select("region_id, puzzle_n, score, max_score, pct")
    .order("puzzle_n", { ascending: true });

  const grouped = {};
  for (const r of runs ?? []) (grouped[r.region_id] ??= []).push(r);

  return (
    <main className="wrap">
      <h1 className="region">Your regions</h1>
      <p className="muted" style={{ fontSize: 13 }}>
        Each row shows every run at that region, oldest first.
      </p>

      {Object.keys(grouped).length === 0 && (
        <p className="muted">Nothing finished yet. <a href="/" style={{ color: "var(--paper)" }}>Play today&rsquo;s puzzle.</a></p>
      )}

      <div style={{ marginTop: 18 }}>
        {Object.entries(grouped).map(([id, list]) => {
          const region = regionById(id);
          const trend = list.length > 1 ? list[list.length - 1].pct - list[0].pct : null;
          return (
            <div key={id} style={{
              display: "flex", justifyContent: "space-between", gap: 12,
              fontSize: 13, padding: "7px 0", borderBottom: "1px solid rgba(143,163,169,0.15)",
            }}>
              <span>{region?.name ?? id}</span>
              <span className="muted">
                {list.map((r) => `${r.pct}%`).join(" → ")}
                {trend !== null && (
                  <span style={{ marginLeft: 8, color: trend > 0 ? "var(--jade)" : trend < 0 ? "var(--rust)" : "var(--fog)" }}>
                    {trend > 0 ? "+" : ""}{trend}
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>

      <p style={{ marginTop: 22 }}>
        <a href="/" style={{ color: "var(--fog)", fontSize: 14 }}>Back to today&rsquo;s puzzle</a>
      </p>
    </main>
  );
}
