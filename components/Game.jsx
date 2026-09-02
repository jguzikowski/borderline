"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { geoMercator, geoAlbers, geoPath } from "d3-geo";
import { DIFF_LABEL } from "@/data/regions";
import { dayKeyFor } from "@/lib/daily";
import { browserClient } from "@/lib/supabase/client";
import { siteUrl } from "@/lib/site-url";
import { grade, tally } from "@/lib/grade";

const CHIP = { exact: "🟩", narrowed: "🟨", miss_narrow: "🟧", miss_exact: "🟥" };
const FILL = {
  exact: "var(--jade)",
  narrowed: "var(--ochre)",
  miss_narrow: "#9C6B57",
  miss_exact: "var(--rust)",
};
const POINTS = { exact: 3, narrowed: 1, miss_narrow: -1, miss_exact: -3 };
const FLASH_MS = 1500;

const post = async (url, body) => {
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await r.text();
    try {
      return JSON.parse(text);
    } catch {
      console.error(`Non-JSON response from ${url} (HTTP ${r.status})`, text.slice(0, 400));
      return { error: `${url} returned a web page instead of data (HTTP ${r.status}). Check that NEXT_PUBLIC_SUPABASE_URL points at your Supabase project, not at this site.` };
    }
  } catch (err) {
    return { error: `Couldn't reach ${url}: ${err.message}` };
  }
};

export default function Game({ puzzleNumber: serverNumber, region: serverRegion, signedIn, isGuest }) {
  const [resolved, setResolved] = useState({ n: serverNumber, region: serverRegion });
  const puzzleNo = resolved.n;
  const region = resolved.region;

  const [geo, setGeo] = useState(null);
  const [session, setSession] = useState(null);
  const [error, setError] = useState(null);
  const [results, setResults] = useState({});
  const [active, setActive] = useState(null);
  const [choices, setChoices] = useState([]);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(null);
  const [summary, setSummary] = useState(null);
  const [hardMode, setHardMode] = useState(false);
  const [copied, setCopied] = useState(false);
  const [size, setSize] = useState({ w: 640, h: 460 });
  const [view, setView] = useState({ k: 1, x: 0, y: 0 });

  const frameRef = useRef(null);
  const svgRef = useRef(null);
  const inputRef = useRef(null);
  const pointers = useRef(new Map());
  const pinch = useRef(null);
  const dragged = useRef(false);
  const pressedShape = useRef(null);

  /* ---------------- load ---------------- */

  useEffect(() => {
    let alive = true;
    setGeo(null);
    fetch(`/regions/${region.id}.json`)
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then((d) => alive && setGeo(d))
      .catch(() => alive && setError("The map for today's region is missing. Run npm run build:regions."));
    return () => { alive = false; };
  }, [region.id]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!signedIn && !isGuest) {
        const supabase = browserClient();
        const { error } = await supabase.auth.signInAnonymously();
        if (error) {
          if (!alive) return;
          setError(`Couldn't start a session: ${error.message}`);
          console.error("signInAnonymously failed", error);
          return;
        }
      }
      const d = await post("/api/play/start", { hardMode: false, dayKey: dayKeyFor() });
      if (!alive) return;
      if (d.error) { setError(d.error); return; }
      setSession(d);
      if (d.region) setResolved({ n: d.puzzleNumber, region: d.region });
      setHardMode(d.hardMode);
      const seeded = {};
      for (const a of d.answered) seeded[a.code] = { outcome: a.outcome, name: a.target_name };
      setResults(seeded);
    })();
    return () => { alive = false; };
  }, [signedIn, isGuest]);

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth || 640;
      setSize({ w, h: Math.max(320, Math.min(560, w * 0.75)) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ---------------- projection ---------------- */

  const path = useMemo(() => {
    if (!geo?.targets?.length) return null;
    const p = geo.region.atlas === "us" ? geoAlbers() : geoMercator();
    const pad = 26;
    p.fitExtent(
      [[pad, pad], [size.w - pad, size.h - pad]],
      { type: "FeatureCollection", features: geo.targets.map((t) => ({ type: "Feature", geometry: t.geometry })) }
    );
    return geoPath(p);
  }, [geo, size]);

  const total = geo?.targets?.length ?? 0;
  const answeredCount = Object.keys(results).length;
  const done = total > 0 && answeredCount === total;
  const score = useMemo(
    () => Object.values(results).reduce((a, r) => a + (POINTS[r.outcome] ?? 0), 0),
    [results]
  );
  const counts = useMemo(() => tally(results), [results]);
  const report = useMemo(
    () => grade({
      score: summary?.score ?? score,
      max: summary?.maxScore ?? total * 3,
      exact: counts.exact, narrowed: counts.narrowed,
      missExact: counts.miss_exact, missNarrow: counts.miss_narrow,
    }),
    [summary, score, total, counts]
  );

  useEffect(() => {
    if (!done || !session || summary) return;
    post("/api/play/complete", { playId: session.playId }).then((d) => {
      if (!d.error) setSummary(d);
    });
  }, [done, session, summary]);

  /* ---------------- guessing ---------------- */

  const openShape = useCallback((code) => {
    if (results[code] || !session) return;
    setActive(code);
    setTyped("");
    setChoices([]);
    setTimeout(() => inputRef.current?.focus(), 40);
  }, [results, session]);

  const settle = (code, outcome, name, message) => {
    setResults((r) => ({ ...r, [code]: { outcome, name } }));
    setFlash({ code, outcome, message });
    setActive(null);
    setTyped("");
    setChoices([]);
    setTimeout(() => setFlash((f) => (f && f.code === code ? null : f)), FLASH_MS);
  };

  const guess = async (mode_, value) => {
    if (busy || !active) return;
    setBusy(true);
    const d = await post("/api/guess", { playId: session.playId, code: active, mode: mode_, guess: value });
    setBusy(false);
    if (d.error) { setError(d.error); return; }
    const good = d.outcome === "exact" || d.outcome === "narrowed";
    settle(
      active, d.outcome, d.name,
      good ? `${d.name}. ${d.points > 1 ? "Three points." : "One point."}`
           : `That was ${d.name}. Minus ${Math.abs(d.points)}.`
    );
  };

  const openNarrow = async () => {
    if (!active || busy) return;
    setBusy(true);
    const d = await post("/api/narrow", { playId: session.playId, code: active });
    setBusy(false);
    if (d.error) { setError(d.error); return; }
    setChoices(d.choices);
  };

  // Escape backs out, 2 opens the three-way choice when not mid-typing.
  useEffect(() => {
    const onKey = (e) => {
      if (!active) return;
      if (e.key === "Escape") { setActive(null); setChoices([]); setTyped(""); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  /* ---------------- zoom and pan ---------------- */

  const MIN_K = 0.3;
  const MAX_K = 8;

  const clamp = (v) => {
    const k = Math.max(MIN_K, Math.min(MAX_K, v.k));
    if (k <= 1) return { k, x: (size.w * (1 - k)) / 2, y: (size.h * (1 - k)) / 2 };
    return {
      k,
      x: Math.max(size.w * (1 - k), Math.min(0, v.x)),
      y: Math.max(size.h * (1 - k), Math.min(0, v.y)),
    };
  };
  const at = (e) => {
    const r = svgRef.current.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * size.w, ((e.clientY - r.top) / r.height) * size.h];
  };
  const zoomAt = (px, py, factor) =>
    setView((v) => {
      const k = Math.max(MIN_K, Math.min(MAX_K, v.k * factor));
      const f = k / v.k;
      return clamp({ k, x: px - (px - v.x) * f, y: py - (py - v.y) * f });
    });

  const onWheel = (e) => { const [x, y] = at(e); zoomAt(x, y, e.deltaY < 0 ? 1.15 : 1 / 1.15); };
  const onDown = (e) => {
    svgRef.current.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, at(e));
    dragged.current = false;
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = Math.hypot(a[0] - b[0], a[1] - b[1]);
    }
  };
  const onMove = (e) => {
    if (!pointers.current.has(e.pointerId)) return;
    const prev = pointers.current.get(e.pointerId);
    const now = at(e);
    pointers.current.set(e.pointerId, now);
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (Math.abs(d - pinch.current) > 2) {
        dragged.current = true;
        zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, d / pinch.current);
        pinch.current = d;
      }
      return;
    }
    const dx = now[0] - prev[0], dy = now[1] - prev[1];
    if (Math.abs(dx) + Math.abs(dy) > 2) dragged.current = true;
    setView((v) => clamp({ ...v, x: v.x + dx, y: v.y + dy }));
  };
  const onUp = (e) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    const code = pressedShape.current;
    pressedShape.current = null;
    if (code && !dragged.current && pointers.current.size === 0) openShape(code);
    dragged.current = false;
  };

  /* ---------------- share ---------------- */

  const shareText = () => {
    const last = session?.lastPlay;
    const site = siteUrl();
    const s = summary?.score ?? score;
    const m = summary?.maxScore ?? total * 3;
    return (
      `Cartogram #${puzzleNo} — ${region.name}${hardMode ? " (hard)" : ""}\n` +
      `${s}/${m} · ${report.title}\n` +
      (summary?.grid ? `${summary.grid}\n` : "") +
      `${counts.exact} named · ${counts.narrowed} narrowed · ${counts.miss_exact + counts.miss_narrow} missed` +
      (last ? `\nlast time ${last.score}/${last.max_score}` : "") +
      (site ? `\n${site}` : "")
    );
  };

  const share = async () => {
    const text = shareText();
    if (typeof navigator !== "undefined" && navigator.share) {
      try { await navigator.share({ text }); return; } catch { /* dismissed */ }
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked */ }
  };

  const k = view.k;
  const last = session?.lastPlay;
  const activeResolved = active && results[active];

  /* ---------------- render ---------------- */

  return (
    <>
      <div className="slug">
        <span>NO. {puzzleNo}</span>
        <span aria-hidden="true">·</span>
        <span title={`Difficulty ${region.diff} of 5. Set by how hard the shapes are to tell apart.`}>
          {DIFF_LABEL[region.diff]?.toUpperCase()}
        </span>
        <span aria-hidden="true">·</span>
        <span>{total || "…"} SHAPES</span>
      </div>

      <header style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 14 }}>
        <div>
          <h1 className="region">{region.name}</h1>
          <p className="note" style={{ margin: 0 }}>{region.note}</p>
        </div>
        <div className="tally">
          <span className="num" style={{ color: score < 0 ? "var(--rust)" : "var(--paper)" }}>
            {score > 0 ? "+" : ""}{score}
          </span>
          <span className="of">{answeredCount}/{total || "—"}</span>
        </div>
      </header>

      <div className="toolbar">
        <button className="tiny" onClick={() => setHardMode((h) => !h)} disabled={answeredCount > 0}
          title="Hides the surrounding countries, leaving only the region itself."
          style={{ color: hardMode ? "var(--amber)" : "var(--fog)" }}>
          {hardMode ? "Hard mode on" : "Hard mode off"}
        </button>
        <button className="tiny" aria-label="Zoom out" onClick={() => zoomAt(size.w / 2, size.h / 2, 1 / 1.4)}>−</button>
        <button className="tiny" aria-label="Zoom in" onClick={() => zoomAt(size.w / 2, size.h / 2, 1.4)}>+</button>
        {Math.abs(k - 1) > 0.01 && (
          <button className="tiny quiet" style={{ padding: "5px 9px" }} onClick={() => setView({ k: 1, x: 0, y: 0 })}>
            Fit region
          </button>
        )}
        <span style={{ fontSize: 12 }} className="muted">
          {hardMode ? "Neighbours hidden." : "Zoom out to get your bearings."}
        </span>
      </div>

      <div className="map-frame" ref={frameRef}>
        {error && <div style={{ padding: 36, textAlign: "center", fontSize: 14 }} className="muted">{error}</div>}
        {!error && !path && <div style={{ padding: 56, textAlign: "center", fontSize: 14 }} className="muted">Drawing the coastline…</div>}
        {path && (
          <svg ref={svgRef} className="map" width="100%" viewBox={`0 0 ${size.w} ${size.h}`}
            role="group" aria-label={`Map of ${region.name}. ${total} shapes to identify.`}
            onWheel={onWheel} onPointerDown={onDown} onPointerMove={onMove}
            onPointerUp={onUp} onPointerCancel={onUp}
            style={{ cursor: k > 1 ? "grab" : "default" }}>
            <g transform={`translate(${view.x},${view.y}) scale(${k})`}>
              {!hardMode && geo.context.map((f, i) => (
                <path key={"c" + i} d={path({ type: "Feature", geometry: f.geometry }) || ""}
                  fill="var(--sea)" stroke="var(--ink)" strokeWidth={0.5 / Math.max(k, 1)}
                  opacity={k < 1 ? 0.85 : 1} aria-hidden="true" />
              ))}
              {geo.targets.map((t, i) => {
                const r = results[t.code];
                const fill = r ? FILL[r.outcome] : active === t.code ? "var(--amber)" : "var(--bone)";
                return (
                  <path key={t.code} className="target"
                    d={path({ type: "Feature", geometry: t.geometry }) || ""}
                    fill={fill}
                    stroke={active === t.code ? "var(--paper)" : "var(--ink)"}
                    strokeWidth={(active === t.code ? 2 : 0.9) / Math.max(k, 1)}
                    role="button"
                    tabIndex={r ? -1 : 0}
                    aria-label={r ? `${r.name}, answered` : `Unidentified shape ${i + 1} of ${total}`}
                    aria-disabled={r ? "true" : "false"}
                    style={{ cursor: r ? "default" : "pointer" }}
                    onPointerDown={() => { pressedShape.current = t.code; }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openShape(t.code); }
                    }} />
                );
              })}
              <g style={{ pointerEvents: "none" }}>
                {geo.targets.map((t) => {
                  const r = results[t.code];
                  if (!r) return null;
                  const feat = { type: "Feature", geometry: t.geometry };
                  const c = path.centroid(feat);
                  if (!c || Number.isNaN(c[0]) || path.area(feat) * k * k < 300) return null;
                  return (
                    <text key={"l" + t.code} x={c[0]} y={c[1]} textAnchor="middle" dominantBaseline="middle"
                      style={{ fontSize: 9 / Math.max(k, 1), fill: "var(--ink)", fontWeight: 600 }}>{r.name}</text>
                  );
                })}
              </g>
            </g>
          </svg>
        )}
      </div>

      <div aria-live="polite">
        {flash && (
          <div className={`flash${flash.outcome.startsWith("miss") ? " bad" : ""}`}>{flash.message}</div>
        )}
      </div>

      {!done && !active && path && session && (
        <p style={{ marginTop: 14, fontSize: 14, lineHeight: 1.55 }} className="muted">
          Tap a shape, then name it for three points or narrow it to one of three for one.
          A wrong answer costs what a right one would have paid.
        </p>
      )}

      {active && !activeResolved && (
        <div className="panel">
          <h2>What is this place?</h2>
          <div style={{ display: "flex", gap: 8 }}>
            <input ref={inputRef} value={typed} onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && typed.trim() && guess("exact", typed)}
              placeholder="Name it for +3" aria-label="Your answer" autoComplete="off" />
            <button className="primary" disabled={busy || !typed.trim()} onClick={() => guess("exact", typed)}>
              +3 / −3
            </button>
          </div>

          {choices.length === 0 ? (
            <button style={{ marginTop: 10 }} disabled={busy} onClick={openNarrow}>
              Not sure? Narrow it to three · +1 / −1
            </button>
          ) : (
            <div style={{ marginTop: 12 }}>
              <div className="eyebrow" style={{ marginBottom: 8 }}>One of these three</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {choices.map((c) => (
                  <button key={c} disabled={busy} style={{ textAlign: "left" }} onClick={() => guess("narrow", c)}>{c}</button>
                ))}
              </div>
            </div>
          )}

          <button className="quiet" style={{ marginTop: 10, fontSize: 12 }} onClick={() => { setActive(null); setChoices([]); }}>
            Cancel (Esc)
          </button>
        </div>
      )}

      {done && summary && (
        <div className="panel" style={{ borderLeftColor: "var(--jade)" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 34, lineHeight: 1 }}>
            {summary.score}<span className="muted" style={{ fontSize: 20 }}>/{summary.maxScore}</span>
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 22, margin: "6px 0 12px" }}>
            {report.title}
          </div>

          <div className="breakdown">
            <span>{counts.exact} named outright</span>
            <span>{counts.narrowed} narrowed</span>
            <span>{counts.miss_exact + counts.miss_narrow} missed</span>
          </div>

          {last && (
            <p style={{ fontSize: 13, marginTop: 12, marginBottom: 0,
              color: summary.score > last.score ? "var(--jade)" : summary.score === last.score ? "var(--fog)" : "var(--rust)" }}>
              {summary.score > last.score
                ? `Up ${summary.score - last.score} on your last run at this region.`
                : summary.score === last.score
                ? "Exactly where you were last time."
                : `Down ${last.score - summary.score} on your last run at this region.`}
            </p>
          )}

          <div className="grid-line" style={{ margin: "14px 0" }}>{summary.grid}</div>

          <button className="primary" onClick={share}>{copied ? "Copied" : "Share result"}</button>
          <a href="/stats" style={{ marginLeft: 14, fontSize: 13, color: "var(--fog)" }}>Your regions</a>

          {isGuest && (
            <p style={{ fontSize: 12, marginTop: 14, marginBottom: 0 }} className="muted">
              {process.env.NEXT_PUBLIC_EMAIL_SIGNIN === "on"
                ? "Playing as a guest. Add an email at the top to keep this history across devices."
                : "Your history lives in this browser for now. Saved logins are coming soon."}
            </p>
          )}
        </div>
      )}

      {total > 0 && (
        <div style={{ marginTop: 20 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            {done ? "The full list" : `${total - answeredCount} still unnamed`}
          </div>
          <div className="chips">
            {geo.targets.map((t) => {
              const r = results[t.code];
              return (
                <span key={t.code} className="chip"
                  style={{ color: r ? FILL[r.outcome] : "var(--fog)",
                           borderColor: r ? "transparent" : "var(--hair)",
                           background: r ? "rgba(255,255,255,0.05)" : "transparent" }}>
                  {r ? r.name : "· · ·"}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
