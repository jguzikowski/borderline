"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { geoMercator, geoAlbers, geoPath } from "d3-geo";
import { DIFF_LABEL } from "@/data/regions";
import { dayKeyFor, puzzleNumber, regionForPuzzle } from "@/lib/daily";
import { browserClient } from "@/lib/supabase/client";
import { siteUrl } from "@/lib/site-url";

const CHIP = { exact: "🟩", narrowed: "🟨", miss_narrow: "🟧", miss_exact: "🟥" };
const FILL = {
  exact: "var(--jade)",
  narrowed: "var(--ochre)",
  miss_narrow: "#9C6B57",
  miss_exact: "var(--rust)",
};

const post = (url, body) =>
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => r.json());

export default function Game({ puzzleNumber: serverNumber, region: serverRegion, signedIn, isGuest }) {
  // Recompute from the device clock so the puzzle turns over at local
  // midnight. Same date, same puzzle, whatever timezone you're in.
  const [local, setLocal] = useState({ n: serverNumber, region: serverRegion });
  useEffect(() => {
    const n = puzzleNumber(dayKeyFor());
    if (n !== serverNumber) setLocal({ n, region: regionForPuzzle(n) });
  }, [serverNumber]);
  const puzzleNo = local.n;
  const region = local.region;

  const [geo, setGeo] = useState(null);
  const [session, setSession] = useState(null);
  const [error, setError] = useState(null);
  const [results, setResults] = useState({});       // code -> {outcome, name}
  const [active, setActive] = useState(null);        // code
  const [mode, setMode] = useState(null);            // menu | type | narrow
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

  /* ---------------- load geometry and session ---------------- */

  useEffect(() => {
    let alive = true;
    fetch(`/regions/${region.id}.json`)
      .then((r) => {
        if (!r.ok) throw new Error(r.status);
        return r.json();
      })
      .then((d) => alive && setGeo(d))
      .catch(() =>
        alive &&
        setError("The map for today's region is missing. Run npm run build:regions.")
      );
    return () => { alive = false; };
  }, [region.id]);

  // No email required. If nobody is signed in we open an anonymous
  // session, which is a real row in auth.users, so scoring and history
  // work identically. Adding an email later upgrades the same account
  // and keeps everything already played.
  useEffect(() => {
    let alive = true;

    (async () => {
      if (!signedIn && !isGuest) {
        const supabase = browserClient();
        const { error } = await supabase.auth.signInAnonymously();
        if (error) {
          if (!alive) return;
          // Show what Supabase actually said. The two usual causes are
          // anonymous sign-ins being disabled, and CAPTCHA protection
          // being on, which rejects any request without a token.
          setError(`Couldn't start a session: ${error.message}`);
          console.error("signInAnonymously failed", error);
          return;
        }
      }
      const d = await post("/api/play/start", { hardMode: false, dayKey: dayKeyFor() });
      if (!alive) return;
      if (d.error) { setError(d.error); return; }
      setSession(d);
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
    () => Object.values(results).reduce((a, r) => a + ({ exact: 3, narrowed: 1, miss_narrow: -1, miss_exact: -3 }[r.outcome] ?? 0), 0),
    [results]
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
    setMode("menu");
    setTyped("");
    setChoices([]);
  }, [results, session]);

  const settle = (code, outcome, name, message) => {
    setResults((r) => ({ ...r, [code]: { outcome, name } }));
    setFlash({ code, outcome, message });
    setActive(null);
    setMode(null);
    setTyped("");
    setTimeout(() => setFlash((f) => (f && f.code === code ? null : f)), 2800);
  };

  const guess = async (mode_, value) => {
    if (busy) return;
    setBusy(true);
    const d = await post("/api/guess", { playId: session.playId, code: active, mode: mode_, guess: value });
    setBusy(false);
    if (d.error) { setError(d.error); return; }
    const good = d.outcome === "exact" || d.outcome === "narrowed";
    settle(
      active,
      d.outcome,
      d.name,
      good ? `${d.name}. ${d.points > 1 ? "Three points." : "One point."}`
           : `That was ${d.name}. Minus ${Math.abs(d.points)}.`
    );
  };

  const openNarrow = async () => {
    setBusy(true);
    const d = await post("/api/narrow", { playId: session.playId, code: active });
    setBusy(false);
    if (d.error) { setError(d.error); return; }
    setChoices(d.choices);
    setMode("narrow");
  };

  /* ---------------- zoom and pan ---------------- */

  const clamp = (v) => {
    const k = Math.max(1, Math.min(8, v.k));
    return {
      k,
      x: Math.max(-size.w * (k - 1), Math.min(0, v.x)),
      y: Math.max(-size.h * (k - 1), Math.min(0, v.y)),
    };
  };
  const at = (e) => {
    const r = svgRef.current.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * size.w, ((e.clientY - r.top) / r.height) * size.h];
  };
  const zoomAt = (px, py, factor) =>
    setView((v) => {
      const k = Math.max(1, Math.min(8, v.k * factor));
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

    // A tap that didn't turn into a drag is a selection. This can't ride
    // on the path's onClick: setPointerCapture retargets events to the
    // SVG, so the click never reaches the shape underneath.
    const code = pressedShape.current;
    pressedShape.current = null;
    if (code && !dragged.current && pointers.current.size === 0) openShape(code);

    dragged.current = false;
  };

  /* ---------------- share ---------------- */

  const shareText = () => {
    const last = session?.lastPlay;
    const site = siteUrl();
    return (
      `Borderline #${puzzleNo} — ${region.name}${hardMode ? " (hard)" : ""}\n` +
      `${summary?.score ?? score}/${summary?.maxScore ?? total * 3}` +
      (last ? `\nlast time ${last.score}/${last.max_score}` : "") +
      `\n${summary?.grid ?? ""}` +
      (site ? `\n${site}` : "")
    );
  };

  // Web Share on phones, clipboard everywhere else. The link rides along
  // as the last line so a pasted result is always followed by somewhere
  // to play it.
  const copy = async () => {
    const text = shareText();
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch { /* dismissed, fall through to clipboard */ }
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked */ }
  };

  const k = view.k;
  const last = session?.lastPlay;

  /* ---------------- render ---------------- */

  return (
    <>
      <header style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div className="eyebrow">Borderline no. {puzzleNo} · {DIFF_LABEL[region.diff]}</div>
          <h1 className="region">{region.name}</h1>
          <div style={{ fontSize: 13 }} className="muted">{region.note}</div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontFamily: "Georgia, serif", fontSize: 30, lineHeight: 1, color: score < 0 ? "var(--rust)" : "var(--paper)" }}>
            {score > 0 ? "+" : ""}{score}
          </div>
          <div className="eyebrow">{answeredCount} of {total || "—"}</div>
        </div>
      </header>

      {last && !done && (
        <p style={{ fontSize: 12, margin: "10px 0 0" }} className="muted">
          You last played this region on puzzle {last.puzzle_n} and scored {last.score} of {last.max_score}.
        </p>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", margin: "12px 0 10px" }}>
        <button onClick={() => setHardMode((h) => !h)} disabled={answeredCount > 0}
          style={{ padding: "6px 12px", fontSize: 12, color: hardMode ? "var(--amber)" : "var(--fog)" }}>
          {hardMode ? "Hard mode on" : "Hard mode off"}
        </button>
        {k > 1 && (
          <button className="quiet" onClick={() => setView({ k: 1, x: 0, y: 0 })} style={{ padding: "6px 12px", fontSize: 12 }}>
            Reset view
          </button>
        )}
        <span style={{ fontSize: 12 }} className="muted">
          {hardMode ? "Neighbours hidden." : "Scroll or pinch to zoom, drag to pan."}
        </span>
      </div>

      <div className="map-frame" ref={frameRef}>
        {error && <div style={{ padding: 40, textAlign: "center", fontSize: 14 }} className="muted">{error}</div>}
        {!error && !path && <div style={{ padding: 60, textAlign: "center", fontSize: 14 }} className="muted">Drawing the coastline…</div>}
        {path && (
          <svg ref={svgRef} className="map" width="100%" viewBox={`0 0 ${size.w} ${size.h}`}
            onWheel={onWheel} onPointerDown={onDown} onPointerMove={onMove}
            onPointerUp={onUp} onPointerCancel={onUp}
            style={{ cursor: k > 1 ? "grab" : "default" }}>
            <g transform={`translate(${view.x},${view.y}) scale(${k})`}>
              {!hardMode && geo.context.map((f, i) => (
                <path key={"c" + i} d={path({ type: "Feature", geometry: f.geometry }) || ""}
                  fill="var(--sea)" stroke="var(--ink)" strokeWidth={0.5 / k} />
              ))}
              {geo.targets.map((t) => {
                const r = results[t.code];
                const fill = r ? FILL[r.outcome] : active === t.code ? "var(--amber)" : "var(--bone)";
                return (
                  <path key={t.code} className="target"
                    d={path({ type: "Feature", geometry: t.geometry }) || ""}
                    fill={fill} stroke="var(--ink)" strokeWidth={0.9 / k}
                    style={{ cursor: r ? "default" : "pointer" }}
                    onPointerDown={() => { pressedShape.current = t.code; }} />
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
                      style={{ fontSize: 9 / k, fill: "var(--ink)", fontWeight: 600 }}>{r.name}</text>
                  );
                })}
              </g>
            </g>
          </svg>
        )}
      </div>

      {flash && (
        <div style={{
          marginTop: 10, padding: "10px 12px", borderRadius: 5, fontSize: 14,
          background: flash.outcome.startsWith("miss") ? "rgba(193,85,59,0.18)" : "rgba(78,158,126,0.18)",
          borderLeft: `3px solid ${flash.outcome.startsWith("miss") ? "var(--rust)" : "var(--jade)"}`,
        }}>{flash.message}</div>
      )}

      {!done && !active && path && (
        <p style={{ marginTop: 14, fontSize: 14, lineHeight: 1.5 }} className="muted">
          Tap a shape. Name it outright for three points, or narrow it to one of three for one.
          Guessing wrong costs you the same either way.
        </p>
      )}

      {active && (
        <div className="panel">
          {mode === "menu" && (
            <>
              <div style={{ fontSize: 14, marginBottom: 12 }} className="muted">How confident are you?</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button className="primary" onClick={() => { setMode("type"); setTimeout(() => inputRef.current?.focus(), 30); }}>
                  Name it · +3 / −3
                </button>
                <button onClick={openNarrow} disabled={busy}>Narrow to three · +1 / −1</button>
                <button className="quiet" onClick={() => { setActive(null); setMode(null); }}>Back</button>
              </div>
            </>
          )}

          {mode === "type" && (
            <>
              <div style={{ fontSize: 14, marginBottom: 10 }} className="muted">What is it?</div>
              <div style={{ display: "flex", gap: 8 }}>
                <input ref={inputRef} value={typed} onChange={(e) => setTyped(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && typed.trim() && guess("exact", typed)}
                  placeholder="Type a name" aria-label="Your answer" />
                <button className="primary" disabled={busy || !typed.trim()} onClick={() => guess("exact", typed)}>
                  Lock in
                </button>
              </div>
              <button className="quiet" style={{ marginTop: 8, padding: "6px 0" }} onClick={() => setMode("menu")}>Back</button>
            </>
          )}

          {mode === "narrow" && (
            <>
              <div style={{ fontSize: 14, marginBottom: 10 }} className="muted">One of these three.</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {choices.map((c) => (
                  <button key={c} disabled={busy} style={{ textAlign: "left" }} onClick={() => guess("narrow", c)}>{c}</button>
                ))}
              </div>
              <button className="quiet" style={{ marginTop: 8, padding: "6px 0" }} onClick={() => setMode("menu")}>Back</button>
            </>
          )}
        </div>
      )}

      {done && summary && (
        <div className="panel">
          <div style={{ fontFamily: "Georgia, serif", fontSize: 24, marginBottom: 4 }}>
            {summary.score} out of {summary.maxScore}
          </div>
          {last && (
            <div style={{ fontSize: 13, marginBottom: 4,
              color: summary.score > last.score ? "var(--jade)" : summary.score === last.score ? "var(--fog)" : "var(--rust)" }}>
              {summary.score > last.score
                ? `Up ${summary.score - last.score} on your last run at this region.`
                : summary.score === last.score
                ? "Exactly where you were last time."
                : `Down ${last.score - summary.score} on your last run at this region.`}
            </div>
          )}
          <div style={{ fontSize: 20, letterSpacing: 1, margin: "10px 0 14px", wordBreak: "break-all" }}>{summary.grid}</div>
          <button className="primary" onClick={copy}>{copied ? "Copied" : "Share result"}</button>
          <a href="/stats" style={{ marginLeft: 12, fontSize: 14, color: "var(--fog)" }}>Your regions</a>
          {isGuest && (
            <p style={{ fontSize: 12, marginTop: 12 }} className="muted">
              Playing as a guest. Add an email at the top to keep this history if
              you clear your browser or switch devices.
            </p>
          )}
        </div>
      )}

      {total > 0 && (
        <div style={{ marginTop: 18 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            {done ? "The full list" : `${total} to find`}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {geo.targets.map((t) => {
              const r = results[t.code];
              return (
                <span key={t.code} style={{
                  fontSize: 12, padding: "4px 9px", borderRadius: 3,
                  background: r ? "rgba(255,255,255,0.06)" : "transparent",
                  border: `1px solid ${r ? "transparent" : "rgba(143,163,169,0.35)"}`,
                  color: r ? FILL[r.outcome] : "var(--fog)",
                }}>{r ? r.name : "· · ·"}</span>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
