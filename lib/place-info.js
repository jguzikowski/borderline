// Live lookups against two free, keyless, CORS-enabled APIs. Nothing is
// baked into the repo, so nothing here can go quietly stale or be wrong
// because someone typed a population from memory.
//
//   Wikipedia REST summary  — works for countries and US states alike
//   REST Countries          — structured numbers, countries only

const cache = new Map();

// Wikipedia titles that collide with something more famous.
const WIKI_TITLE = {
  Georgia: "Georgia (U.S. state)",
  Washington: "Washington (state)",
  "New York": "New York (state)",
  "District of Columbia": "Washington, D.C.",
};

const nf = new Intl.NumberFormat("en-US");

async function wikipedia(name, atlas) {
  const title = atlas === "us" ? WIKI_TITLE[name] || name : name;
  const res = await fetch(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}?redirect=true`
  );
  if (!res.ok) throw new Error(res.status);
  const d = await res.json();
  if (d.type === "disambiguation") throw new Error("disambiguation");
  return {
    extract: d.extract || null,
    url: d.content_urls?.desktop?.page || null,
    thumb: d.thumbnail?.source || null,
  };
}

async function restCountries(name) {
  const res = await fetch(
    `https://restcountries.com/v3.1/name/${encodeURIComponent(name)}?fullText=true&fields=capital,population,area,subregion,languages`
  );
  if (!res.ok) throw new Error(res.status);
  const [d] = await res.json();
  if (!d) throw new Error("no match");
  return {
    capital: d.capital?.[0] || null,
    population: d.population ?? null,
    area: d.area ?? null,
    subregion: d.subregion || null,
    languages: d.languages ? Object.values(d.languages).slice(0, 3).join(", ") : null,
  };
}

export async function placeInfo(name, atlas) {
  const key = `${atlas}:${name}`;
  if (cache.has(key)) return cache.get(key);

  const [wiki, facts] = await Promise.all([
    wikipedia(name, atlas).catch(() => null),
    atlas === "us" ? Promise.resolve(null) : restCountries(name).catch(() => null),
  ]);

  const out = { name, wiki, facts };
  cache.set(key, out);
  return out;
}

export function formatFacts(facts) {
  if (!facts) return [];
  const rows = [];
  if (facts.capital) rows.push(["Capital", facts.capital]);
  if (facts.population) rows.push(["Population", nf.format(facts.population)]);
  if (facts.area) rows.push(["Area", `${nf.format(Math.round(facts.area))} km²`]);
  if (facts.subregion) rows.push(["Subregion", facts.subregion]);
  if (facts.languages) rows.push(["Languages", facts.languages]);
  return rows;
}
