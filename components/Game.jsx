"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { geoMercator, geoAlbers, geoPath } from "d3-geo";
import { DIFF_LABEL } from "@/data/regions";
import { dayKeyFor } from "@/lib/daily";
import { browserClient } from "@/lib/supabase/client";
import { siteUrl } from "@/lib/site-url";
import { grade, tally } from "@/lib/grade";
import { placeInfo, formatFacts } from "@/lib/place-info";

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
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [inspect, setInspect] = useState(null); // { code, name, loading, data }
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

  // Move the viewport onto a shape. Small countries are the whole problem
  // here: Brunei at the default zoom is a few pixels, and no amount of
  // squinting finds it.
  const focusShape = useCallback((code, { onlyIfHardToSee = false } = {}) => {
    if (!path || !geo) return;
    const target = geo.targets.find((t) => t.code === code);
    if (!target) return;

    const feat = { type: "Feature", geometry: target.geometry };
    const b = path.bounds(feat);
    if (!b || Number.isNaN(b[0][0])) return;

    const [[x0, y0], [x1, y1]] = b;
    const w = Math.max(x1 - x0, 1);
    const h = Math.max(y1 - y0, 1);
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;

    if (onlyIfHardToSee) {
      // Already big enough and on screen? Leave the view alone. Yanking
      // the map on every answer is worse than not moving it at all.
      const kNow = view.k;
      const sx = cx * kNow + view.x;
      const sy = cy * kNow + view.y;
      const onScreen = sx > 20 && sx < size.w - 20 && sy > 20 && sy < size.h - 20;
      const bigEnough = w * kNow > size.w * 0.06 && h * kNow > size.h * 0.06;
      if (onScreen && bigEnough) return;
    }

    // Fill about a third of the frame, within the usual zoom limits.
    const fit = Math.min((size.w * 0.34) / w, (size.h * 0.34) / h);
    const k = Math.max(1, Math.min(MAX_K, fit));
    setView(clamp({ k, x: size.w / 2 - cx * k, y: size.h / 2 - cy * k }));
  }, [path, geo, size, view]);

  const openShape = useCallback((code, opts) => {
    if (results[code] || !session) return;
    setActive(code);
    setInspect(null);
    setTyped("");
    setChoices([]);
    focusShape(code, opts);
    setTimeout(() => inputRef.current?.focus(), 60);
  }, [results, session, focusShape]);

  // Reviewing an answered shape. Highlights it on the map and pulls a
  // short reference entry, which is where the learning actually happens:
  // most people want to know what they just got wrong.
  const review = useCallback(async (code) => {
    const r = results[code];
    if (!r || !geo) return;
    setActive(null);
    setInspect({ code, name: r.name, loading: true, data: null });
    focusShape(code);
    try {
      const data = await placeInfo(r.name, geo.region.atlas);
      setInspect((cur) => (cur && cur.code === code ? { ...cur, loading: false, data } : cur));
    } catch {
      setInspect((cur) => (cur && cur.code === code ? { ...cur, loading: false, data: null } : cur));
    }
  }, [results, geo, focusShape]);

  // Next unanswered shape in map order, wrapping around.
  const nextUnanswered = useCallback((after) => {
    if (!geo) return null;
    const list = geo.targets.map((t) => t.code);
    const start = after ? list.indexOf(after) + 1 : 0;
    for (let i = 0; i < list.length; i++) {
      const code = list[(start + i) % list.length];
      if (!results[code] && code !== after) return code;
    }
    return null;
  }, [geo, results]);

  const settle = (code, outcome, name, message) => {
    const updated = { ...results, [code]: { outcome, name } };
    setResults(updated);
    setFlash({ code, outcome, message });
    setActive(null);
    setTyped("");
    setChoices([]);
    setTimeout(() => setFlash((f) => (f && f.code === code ? null : f)), FLASH_MS);

    if (!autoAdvance || !geo) return;
    const list = geo.targets.map((t) => t.code);
    const start = list.indexOf(code) + 1;
    let next = null;
    for (let i = 0; i < list.length; i++) {
      const c = list[(start + i) % list.length];
      if (!updated[c]) { next = c; break; }
    }
    if (!next) return;
    // Wait out the feedback so the answer is readable before moving on.
    setTimeout(() => {
      setActive(next);
      setTyped("");
      setChoices([]);
      focusShape(next, { onlyIfHardToSee: true });
      setTimeout(() => inputRef.current?.focus(), 60);
    }, FLASH_MS - 300);
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
      if (e.key !== "Escape") return;
      if (inspect) { setInspect(null); return; }
      if (active) { setActive(null); setChoices([]); setTyped(""); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, inspect]);

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
    if (code && !dragged.current && pointers.current.size === 0) {
      results[code] ? review(code) : openShape(code);
    }
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

  // Desktop browsers route navigator.share into whatever mail client is
  // registered, which nobody wants. Only offer the share sheet on touch
  // devices, where it's the good path; copy everywhere else.
  const share = async () => {
    const text = shareText();
    const touch =
      typeof window !== "undefined" &&
      window.matchMedia?.("(pointer: coarse)").matches &&
      typeof navigator !== "undefined" &&
      !!navigator.share;

    if (touch) {
      try { await navigator.share({ text }); return; } catch { /* dismissed, fall through */ }
    }

    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Older browsers and non-secure contexts.
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch { /* nothing left to try */ }
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2400);
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
        {session?.streak > 1 && (
          <>
            <span aria-hidden="true">·</span>
            <span style={{ color: "var(--amber)" }}>{session.streak} DAY STREAK</span>
          </>
        )}
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
        {!done && (
          <button className="tiny" onClick={() => { const n = nextUnanswered(active); if (n) openShape(n); }}
            title="Jump to the next shape you haven't answered.">
            Next shape
          </button>
        )}
        <button className="tiny" onClick={() => setAutoAdvance((a) => !a)}
          title="After each answer, move straight to the next unanswered shape."
          style={{ color: autoAdvance ? "var(--amber)" : "var(--fog)" }}>
          Auto-advance {autoAdvance ? "on" : "off"}
        </button>
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
                const lit = active === t.code || inspect?.code === t.code;
                return (
                  <path key={t.code} className="target"
                    d={path({ type: "Feature", geometry: t.geometry }) || ""}
                    fill={fill}
                    stroke={lit ? "var(--paper)" : "var(--ink)"}
                    strokeWidth={(lit ? 2.2 : 0.9) / Math.max(k, 1)}
                    role="button"
                    tabIndex={0}
                    aria-label={r ? `${r.name}, answered. Show details.` : `Unidentified shape ${i + 1} of ${total}`}
                    style={{ cursor: "pointer" }}
                    onPointerDown={() => { pressedShape.current = t.code; }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        r ? review(t.code) : openShape(t.code);
                      }
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

      {inspect && (
        <div className="panel" style={{ borderLeftColor: "var(--fog)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
            <h2 style={{ margin: 0 }}>{inspect.name}</h2>
            <button className="quiet" style={{ fontSize: 12 }} onClick={() => setInspect(null)}>Close</button>
          </div>

          {inspect.loading && <p style={{ fontSize: 13, marginBottom: 0 }} className="muted">Looking it up…</p>}

          {!inspect.loading && !inspect.data?.wiki && !inspect.data?.facts && (
            <p style={{ fontSize: 13, marginBottom: 0 }} className="muted">
              Couldn&rsquo;t find a reference entry for this one.
            </p>
          )}

          {!inspect.loading && formatFacts(inspect.data?.facts).length > 0 && (
            <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 14px",
                         fontFamily: "var(--font-mono)", fontSize: 12, margin: "10px 0 0" }}>
              {formatFacts(inspect.data.facts).map(([label, value]) => (
                <div key={label} style={{ display: "contents" }}>
                  <dt className="muted">{label}</dt>
                  <dd style={{ margin: 0 }}>{value}</dd>
                </div>
              ))}
            </dl>
          )}

          {!inspect.loading && inspect.data?.wiki?.extract && (
            <p style={{ fontSize: 13, lineHeight: 1.6, marginTop: 12, marginBottom: 0 }}>
              {inspect.data.wiki.extract.length > 320
                ? inspect.data.wiki.extract.slice(0, 320).replace(/\s+\S*$/, "") + "…"
                : inspect.data.wiki.extract}
              {inspect.data.wiki.url && (
                <>
                  {" "}
                  <a href={inspect.data.wiki.url} target="_blank" rel="noopener noreferrer"
                     style={{ color: "var(--fog)" }}>
                    Wikipedia
                  </a>
                </>
              )}
            </p>
          )}
        </div>
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

          {session?.streak > 0 && (
            <p style={{ marginTop: 14, marginBottom: 0, fontSize: 13, lineHeight: 1.5 }}>
              <span style={{ fontFamily: "var(--font-mono)", color: "var(--amber)" }}>
                {session.streak === 1 ? "Day 1" : `${session.streak} days in a row`}
              </span>
              <span className="muted">
                {session.streak === 1
                  ? " · come back tomorrow to start a streak."
                  : session.streak < 5
                  ? " · come back tomorrow to keep it going."
                  : ` · that's a long way to fall. New region tomorrow.`}
              </span>
            </p>
          )}

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

          <button className="primary" onClick={share}>
            {copied ? "Copied to clipboard" : "Share result"}
          </button>
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
            {done ? "The full list · tap any to review it" : `${total - answeredCount} still unnamed · tap one to jump to it`}
          </div>
          <div className="chips">
            {geo.targets.map((t, i) => {
              const r = results[t.code];
              if (r) {
                return (
                  <button key={t.code} className="chip"
                    onClick={() => review(t.code)}
                    aria-label={`Show ${r.name} on the map`}
                    style={{ color: FILL[r.outcome],
                             borderColor: inspect?.code === t.code ? FILL[r.outcome] : "transparent",
                             background: "rgba(255,255,255,0.05)", cursor: "pointer" }}>
                    {r.name}
                  </button>
                );
              }
              // Unanswered entries are buttons: clicking one zooms the map
              // to that shape and opens the prompt. Finding Brunei by eye
              // is not the puzzle.
              return (
                <button key={t.code} className="chip"
                  aria-label={`Go to unidentified shape ${i + 1}`}
                  onClick={() => openShape(t.code)}
                  style={{ color: active === t.code ? "var(--amber)" : "var(--fog)",
                           borderColor: active === t.code ? "var(--amber)" : "var(--hair)",
                           background: "transparent", cursor: "pointer" }}>
                  · · ·
                </button>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
