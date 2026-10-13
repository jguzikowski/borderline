"use client";

import { useState, useEffect, useCallback } from "react";
import Game from "@/components/Game";
import { dayKeyFor } from "@/lib/daily";
import { TRACK_SHORT } from "@/data/regions";

// Two puzzles a day, played in sequence rather than chosen between.
// The world map is the headline; the US map sits beside it. Remounting
// Game on a track change keeps each one's state cleanly separate, and
// progress is reloaded from the server either way.
export default function DailyBoard({ initial, signedIn, isGuest }) {
  const [day, setDay] = useState(initial);
  const [track, setTrack] = useState(initial?.tracks?.[0]?.track || "world");

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/day", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dayKey: dayKeyFor() }),
      });
      const d = await res.json();
      if (!d.error) setDay(d);
    } catch { /* keep what we have */ }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const tracks = day?.tracks ?? [];
  const current = tracks.find((t) => t.track === track) ?? tracks[0];
  const other = tracks.find((t) => t.track !== track);

  if (!current) return null;

  return (
    <>
      <nav className="tracks" aria-label="Today's puzzles">
        {tracks.map((t) => {
          const on = t.track === track;
          return (
            <button key={t.track} className={`track${on ? " on" : ""}`}
              aria-current={on ? "page" : undefined}
              onClick={() => setTrack(t.track)}>
              <span className="track-label">{TRACK_SHORT[t.track]}</span>
              <span className="track-region">{t.region.name}</span>
              <span className="track-state">
                {t.completed ? `${t.score}/${t.maxScore}` : t.started ? "in progress" : "not started"}
              </span>
            </button>
          );
        })}
      </nav>

      <Game
        key={track}
        track={track}
        puzzleNumber={day.puzzleNumber}
        region={current.region}
        signedIn={signedIn}
        isGuest={isGuest}
        onProgress={refresh}
        otherTrack={other}
        onSwitchTrack={() => other && setTrack(other.track)}
      />
    </>
  );
}
