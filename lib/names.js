// Name handling. Used on the server for grading and in the build script
// for matching Natural Earth's own spellings to our canonical names.

export const norm = (s) =>
  (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\b(the|republic|of|rep|dem|democratic|people s|state|states|kingdom)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const ALIASES = {
  "United States": ["united states of america", "usa", "us", "america"],
  "United Kingdom": ["uk", "great britain", "britain", "england"],
  Netherlands: ["holland"],
  Czechia: ["czech republic"],
  "Bosnia and Herzegovina": ["bosnia and herz", "bosnia", "bih"],
  "North Macedonia": ["macedonia", "fyrom"],
  Eswatini: ["swaziland"],
  "Côte d'Ivoire": ["cote divoire", "ivory coast", "cote d ivoire"],
  "DR Congo": ["dem rep congo", "democratic republic of the congo", "drc", "congo kinshasa", "zaire", "congo dr"],
  "Republic of the Congo": ["congo", "congo brazzaville", "congo republic"],
  "Central African Republic": ["central african rep", "car"],
  "South Sudan": ["s sudan"],
  "Equatorial Guinea": ["eq guinea"],
  "Cabo Verde": ["cape verde"],
  "Timor-Leste": ["east timor", "timor leste"],
  Myanmar: ["burma"],
  Laos: ["lao pdr", "lao"],
  "South Korea": ["korea", "republic of korea", "rok"],
  "North Korea": ["dem rep korea", "dprk", "korea north"],
  "United Arab Emirates": ["uae", "emirates"],
  "Dominican Republic": ["dominican rep"],
  "Trinidad and Tobago": ["trinidad"],
  Bahamas: ["the bahamas"],
  "Western Sahara": ["w sahara", "sahrawi"],
  Turkey: ["turkiye", "türkiye"],
  Russia: ["russian federation"],
  "Solomon Islands": ["solomon is"],
  "Papua New Guinea": ["png"],
  "New Zealand": ["nz", "aotearoa"],
  "Sri Lanka": ["ceylon"],
  "District of Columbia": ["washington dc", "dc", "washington d c"],
};

const aliasIndex = (() => {
  const m = new Map();
  for (const [canon, list] of Object.entries(ALIASES)) {
    m.set(norm(canon), canon);
    for (const a of list) m.set(norm(a), canon);
  }
  return m;
})();

export const canonical = (raw) => aliasIndex.get(norm(raw)) || raw;

function lev(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 9;
  const n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

// Accepts aliases and one-character typos on longer names.
export function matches(typed, target) {
  const t = norm(typed);
  if (!t) return false;
  if (aliasIndex.get(t) === target) return true;
  const pool = [norm(target), ...(ALIASES[target] || []).map(norm)];
  return pool.some((p) => p === t || (p.length > 5 && lev(p, t) <= 1));
}
