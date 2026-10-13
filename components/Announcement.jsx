"use client";

import { useState, useEffect } from "react";

// A dated, dismissible notice. Versioned so the next announcement just
// bumps ID and nobody's old dismissal hides it, and dated so it retires
// on its own rather than becoming permanent furniture.
//
// Dismissal lives in localStorage, which is per-browser and can throw in
// private windows, so every access is guarded and the banner simply
// shows if storage is unavailable.

const ID = "two-tracks";
const RETIRE_AFTER = "2026-11-15"; // stops rendering on its own

export default function Announcement() {
  // Renders only after mount: the server has no way to know whether this
  // viewer dismissed it, and guessing would flash the wrong thing.
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (new Date().toISOString().slice(0, 10) > RETIRE_AFTER) return;
    try {
      if (localStorage.getItem(`cartogram:seen:${ID}`)) return;
    } catch { /* storage blocked; show it */ }
    setShow(true);
  }, []);

  const dismiss = () => {
    setShow(false);
    try { localStorage.setItem(`cartogram:seen:${ID}`, "1"); } catch { /* nothing to do */ }
  };

  if (!show) return null;

  return (
    <aside className="announce" role="status">
      <span className="announce-tag">New</span>
      <p>
        There are now <strong>two maps every day</strong>: one somewhere in the
        world, and one in the United States. Both are below, and finishing one
        hands you the other.
      </p>
      <button className="announce-close" aria-label="Dismiss" onClick={dismiss}>×</button>
    </aside>
  );
}
