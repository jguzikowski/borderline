"use client";
import { useState } from "react";

export default function AdminSchedule({ rows, regions }) {
  const [state, setState] = useState(() =>
    Object.fromEntries(rows.map((r) => [r.n, { regionId: r.regionId, pinned: r.pinned, status: null }]))
  );

  const change = async (row, regionId) => {
    setState((s) => ({ ...s, [row.n]: { ...s[row.n], regionId, status: "saving" } }));
    const res = await fetch("/api/admin/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ n: row.n, regionId, dayKey: row.dayKey }),
    });
    const d = await res.json().catch(() => ({}));
    setState((s) => ({
      ...s,
      [row.n]: {
        ...s[row.n],
        pinned: res.ok ? true : s[row.n].pinned,
        status: res.ok ? "saved" : d.error || "failed",
      },
    }));
    if (res.ok) setTimeout(() => setState((s) => ({ ...s, [row.n]: { ...s[row.n], status: null } })), 1600);
  };

  return (
    <div style={{ marginTop: 18 }}>
      {rows.map((row, i) => {
        const cur = state[row.n];
        return (
          <div key={row.n} style={{
            display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
            padding: "8px 0", borderBottom: "1px solid rgba(143,163,169,0.15)",
            opacity: row.locked ? 0.55 : 1,
          }}>
            <span style={{ fontSize: 12, width: 150, flexShrink: 0 }} className="muted">
              {i === 0 ? "Today" : row.date} · #{row.n}
            </span>

            <select value={cur.regionId} disabled={row.locked}
              onChange={(e) => change(row, e.target.value)}
              style={{
                flex: 1, minWidth: 200, padding: "7px 10px", fontSize: 13, borderRadius: 4,
                background: "var(--ink)", color: "var(--paper)",
                border: "1px solid var(--fog)", fontFamily: "inherit",
              }}>
              {regions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.atlas === "us" ? "US" : "world"}, {r.diff})
                </option>
              ))}
            </select>

            <span style={{ fontSize: 11, width: 130, flexShrink: 0,
              color: cur.status === "saved" ? "var(--jade)"
                : cur.status && cur.status !== "saving" ? "var(--rust)" : "var(--fog)" }}>
              {row.locked ? "locked, has plays"
                : cur.status === "saving" ? "saving"
                : cur.status === "saved" ? "saved"
                : cur.status ? cur.status
                : cur.pinned ? "scheduled" : "auto"}
            </span>
          </div>
        );
      })}
    </div>
  );
}
