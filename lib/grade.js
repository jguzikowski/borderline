// A score alone tells you nothing. The title reads both axes: how well
// you did, and how much you gambled to get there. Boldness is what the
// game is actually about, so it belongs in the result.

export function grade({ score, max, exact, narrowed, missExact, missNarrow }) {
  const answered = exact + narrowed + missExact + missNarrow;
  if (!answered) return { title: "Unplayed", pct: 0, boldness: 0 };

  const pct = max > 0 ? Math.round((score / max) * 100) : 0;
  const boldness = (exact + missExact) / answered;

  const bold = boldness >= 0.6;
  const cautious = boldness <= 0.3;
  const strong = pct >= 65;
  const weak = pct < 30;

  let title;
  if (bold && strong) title = "Bold and right";
  else if (bold && weak) title = "Bold, geographically suspect";
  else if (bold) title = "Playing for the big points";
  else if (cautious && strong) title = "Cautious and correct";
  else if (cautious && weak) title = "Hedged, still lost";
  else if (cautious) title = "Taking no chances";
  else if (strong) title = "Well travelled";
  else if (weak) title = "Finding your bearings";
  else title = "Steady hand";

  return { title, pct, boldness };
}

export function tally(results) {
  const t = { exact: 0, narrowed: 0, miss_exact: 0, miss_narrow: 0 };
  for (const r of Object.values(results)) if (t[r.outcome] !== undefined) t[r.outcome]++;
  return t;
}
