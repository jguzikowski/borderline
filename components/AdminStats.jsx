"use client";

import { useState, useEffect, useMemo } from "react";
import { regionById, TRACK_SHORT } from "@/data/regions";

// Validated against the dark chart surface (#143440) with the dataviz
// six checks: lightness band, chroma, CVD separation, normal-vision
// floor, contrast. The two warnings it carries both oblige the same
// relief, which is built in below: every segment is directly labelled
// and every chart has a table view.
const C = { named: "#389469", narrowed: "#b3880f", missed: "#bc4a3c" };
const BAR = "#5a8f9e";

const pct = (v) => (v === null || v === undefined ? "—" : `${v}%`);
const nf = new Intl.NumberFormat("en-US");

function Stat({ label, value, sub }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

function Bars({ rows, max, color = BAR, format = (v) => v, empty }) {
  if (!rows.length) return <p className="muted" style={{ fontSize: 13 }}>{empty}</p>;
  const top = max ?? Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="bars">
      {rows.map((r) => (
        <div className="bar-row" key={r.key}>
          <span className="bar-label" title={r.label}>{r.label}</span>
          <span className="bar-track">
            <span className="bar-fill"
              style={{ width: `${Math.max(1, (r.value / top) * 100)}%`, background: r.color || color }} />
          </span>
          <span className="bar-value">{format(r.value)}</span>
        </div>
      ))}
    </div>
  );
}

export default function AdminStats() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [tables, setTables] = useState({});

  useEffect(() => {
    fetch("/api/admin/stats")
      .then((r) => r.json())
      .then((d) => (d.error ? setError(d.error) : setData(d)))
      .catch(() => setError("Couldn't load the numbers."));
  }, []);

  const toggle = (k) => setTables((t) => ({ ...t, [k]: !t[k] }));

  const conf = useMemo(() => {
    const named = data?.confidence?.find((c) => c.mode === "named");
    const narrowed = data?.confidence?.find((c) => c.mode === "narrowed");
    return { named, narrowed };
  }, [data]);

  if (error) return <p style={{ color: "var(--rust)", marginTop: 20 }}>{error}</p>;
  if (!data) return <p className="muted" style={{ marginTop: 20 }}>Counting…</p>;

  const o = data.overview;
  const dailyByDay = {};
  for (const d of data.daily) {
    dailyByDay[d.day] ??= { day: d.day, plays: 0, players: 0 };
    dailyByDay[d.day].plays += Number(d.plays);
    dailyByDay[d.day].players = Math.max(dailyByDay[d.day].players, Number(d.players));
  }
  const days = Object.values(dailyByDay).sort((a, b) => a.day.localeCompare(b.day));

  return (
    <>
      <section className="stats-grid" style={{ marginTop: 20 }}>
        <Stat label="Players" value={nf.format(o?.players ?? 0)} />
        <Stat label="Rounds started" value={nf.format(o?.plays ?? 0)} />
        <Stat label="Finished" value={pct(o?.completion_rate)} sub={`${nf.format(o?.completed ?? 0)} rounds`} />
        <Stat label="Today" value={nf.format(o?.plays_today ?? 0)} sub={`${nf.format(o?.players_today ?? 0)} players`} />
      </section>

      {/* --- confidence: the question the whole game turns on --- */}
      <section className="block">
        <h2>Does gambling pay?</h2>
        <p className="muted small">
          Average points per answer, by how it was answered. If naming outright
          earns less than narrowing, the three-point bet is priced wrong.
        </p>
        {conf.named || conf.narrowed ? (
          <>
            <div className="duo">
              {[["named", conf.named, C.named], ["narrowed", conf.narrowed, C.narrowed]].map(([k, c, col]) => (
                <div className="duo-cell" key={k}>
                  <div className="duo-label">
                    <span className="swatch" style={{ background: col }} aria-hidden="true" />
                    {k === "named" ? "Named outright" : "Narrowed to three"}
                  </div>
                  <div className="duo-value" style={{ color: col }}>
                    {c ? (Number(c.avg_points) > 0 ? "+" : "") + Number(c.avg_points).toFixed(2) : "—"}
                  </div>
                  <div className="duo-sub">
                    {c ? `${pct(c.hit_rate)} right · ${nf.format(c.attempts)} answers` : "no data yet"}
                  </div>
                </div>
              ))}
            </div>
            {conf.named && conf.narrowed && (
              <p className="verdict">
                {Number(conf.named.avg_points) > Number(conf.narrowed.avg_points)
                  ? "Naming outright is the better bet on current play. People may be hedging too much."
                  : Number(conf.named.avg_points) < Number(conf.narrowed.avg_points)
                  ? "Hedging is winning. People are over-confident, or the three-point bet is too punishing."
                  : "The two options are priced evenly."}
              </p>
            )}
          </>
        ) : (
          <p className="muted small">No answers recorded yet.</p>
        )}
      </section>

      {/* --- daily volume --- */}
      <section className="block">
        <h2>Rounds per day</h2>
        <button className="quiet small" onClick={() => toggle("days")}>
          {tables.days ? "Show chart" : "Show table"}
        </button>
        {tables.days ? (
          <table className="data">
            <thead><tr><th>Day</th><th>Rounds</th><th>Players</th></tr></thead>
            <tbody>
              {days.map((d) => (
                <tr key={d.day}><td>{d.day}</td><td>{d.plays}</td><td>{d.players}</td></tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Bars
            rows={days.map((d) => ({ key: d.day, label: d.day.slice(5), value: d.plays }))}
            empty="No rounds yet."
          />
        )}
      </section>

      {/* --- regions by real difficulty --- */}
      <section className="block">
        <h2>Regions by how they actually played</h2>
        <p className="muted small">
          Median score as a share of the maximum. This is the number to re-rate
          the difficulty tiers against, rather than my original guesses.
        </p>
        <button className="quiet small" onClick={() => toggle("regions")}>
          {tables.regions ? "Show chart" : "Show table"}
        </button>
        {tables.regions ? (
          <table className="data">
            <thead><tr><th>Region</th><th>Track</th><th>Plays</th><th>Median</th><th>Mean</th><th>Bold</th></tr></thead>
            <tbody>
              {data.regions.map((r) => (
                <tr key={`${r.region_id}:${r.track}`}>
                  <td>{regionById(r.region_id)?.name ?? r.region_id}</td>
                  <td>{TRACK_SHORT[r.track] ?? r.track}</td>
                  <td>{r.plays}</td><td>{pct(r.median_pct)}</td>
                  <td>{pct(r.avg_pct)}</td><td>{pct(r.bold_rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Bars
            max={100}
            rows={data.regions.map((r) => ({
              key: `${r.region_id}:${r.track}`,
              label: regionById(r.region_id)?.name ?? r.region_id,
              value: Number(r.median_pct ?? 0),
              color: Number(r.median_pct) < 35 ? C.missed : Number(r.median_pct) < 65 ? C.narrowed : C.named,
            }))}
            format={(v) => `${v}%`}
            empty="No finished rounds yet."
          />
        )}
      </section>

      {/* --- hardest shapes --- */}
      <section className="block">
        <h2>The shapes people get wrong</h2>
        <p className="muted small">
          Miss rate across every answer, minimum three attempts. The good
          material for a post is near the top of this list.
        </p>
        <button className="quiet small" onClick={() => toggle("shapes")}>
          {tables.shapes ? "Show chart" : "Show table"}
        </button>
        {tables.shapes ? (
          <table className="data">
            <thead><tr><th>Place</th><th>Attempts</th><th>Missed</th><th>Miss rate</th><th>Named outright</th></tr></thead>
            <tbody>
              {data.shapes.map((s) => (
                <tr key={s.target_name}>
                  <td>{s.target_name}</td><td>{s.attempts}</td><td>{s.misses}</td>
                  <td>{pct(s.miss_rate)}</td><td>{pct(s.bold_rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Bars
            max={100}
            rows={data.shapes.slice(0, 20).map((s) => ({
              key: s.target_name, label: s.target_name, value: Number(s.miss_rate),
              color: C.missed,
            }))}
            format={(v) => `${v}%`}
            empty="Not enough answers yet. Needs three attempts at a shape before it appears."
          />
        )}
      </section>

      {/* --- retention --- */}
      <section className="block">
        <h2>Came back</h2>
        <p className="muted small">
          Of the players who finished on a day, how many finished again the next
          day and a week later. This is the number that decides everything else.
        </p>
        {data.retention.length ? (
          <table className="data">
            <thead><tr><th>Day</th><th>Finished</th><th>Next day</th><th>Day 7</th></tr></thead>
            <tbody>
              {data.retention.map((r) => (
                <tr key={r.day}>
                  <td>{r.day}</td>
                  <td>{r.cohort}</td>
                  <td>{r.next_day} {r.cohort > 0 && <span className="muted">({Math.round(100 * r.next_day / r.cohort)}%)</span>}</td>
                  <td>{r.day_7} {r.cohort > 0 && <span className="muted">({Math.round(100 * r.day_7 / r.cohort)}%)</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted small">No finished rounds yet.</p>
        )}
      </section>

      <p className="muted" style={{ fontSize: 11, marginTop: 24 }}>
        Generated {new Date(data.generatedAt).toLocaleString()}. Your own test
        plays are included in these numbers.
      </p>
    </>
  );
}
