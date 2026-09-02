"use client";
import { useState } from "react";

export default function AdminSchedule({ rows, regions }) {
  const [state, setState] = useState(() =>
    Object.fromEntries(
      rows.map((r) => [r.n, { regionId: r.regionId, pinned: r.pinned, locked: r.locked, plays: r.plays, status: null }])
    )
  );

  const unlock = async (row) => {
    const cur = state[row.n];
    const ok = window.confirm(
      `Puzzle ${row.n} has ${cur.plays} play${cur.plays === 1 ? "" : "s"} recorded.\n\n` +
      `Unlocking deletes ${cur.plays === 1 ? "it" : "them"} along with every answer, ` +
      `because a score against a region that later changed would be meaningless.\n\nThis can't be undone.`
    );
    if (!ok) return;

    setState((s) => ({ ...s, [row.n]: { ...s[row.n], status: "unlocking" } }));
    const res = await fetch("/api/admin/unlock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ n: row.n }),
    });
    const d = await res.json().catch(() => ({}));
    setState((s) => ({
      ...s,
      [row.n]: res.ok
        ? { ...s[row.n], locked: false, plays: 0, status: null }
        : { ...s[row.n], status: d.error || "unlock failed" },
    }));
  };

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
            opacity: cur.locked ? 0.55 : 1,
          }}>
            <span style={{ fontSize: 12, width: 150, flexShrink: 0 }} className="muted">
              {i === 0 ? "Today" : row.date} · #{row.n}
            </span>

            <select value={cur.regionId} disabled={cur.locked}
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

            <span style={{ fontSize: 11, width: 150, flexShrink: 0, display: "flex", gap: 8, alignItems: "center",
              color: cur.status === "saved" ? "var(--jade)"
                : cur.status && !["saving", "unlocking"].includes(cur.status) ? "var(--rust)" : "var(--fog)" }}>
              {cur.locked ? (
                <>
                  <span>{cur.plays} play{cur.plays === 1 ? "" : "s"}</span>
                  <button className="quiet" onClick={() => unlock(row)}
                    disabled={cur.status === "unlocking"}
                    style={{ padding: 0, fontSize: 11, textDecoration: "underline", color: "var(--rust)" }}>
                    {cur.status === "unlocking" ? "clearing" : "unlock"}
                  </button>
                </>
              ) : cur.status === "saving" ? "saving"
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
