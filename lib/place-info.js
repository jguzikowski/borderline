// Structured facts for any place, country or US state, from Wikidata.
//
// Wikidata is the right source here because it uses the same properties
// for a country and a state, so the panel can show the same rows for
// both. REST Countries only covers countries, which would have meant a
// different template for half the regions.
//
// Three keyless, CORS-enabled requests, cached for the session:
//   1. Wikipedia summary  -> description, article link, Wikidata id
//   2. Wikidata claims    -> the numbers
//   3. Wikidata labels    -> names for the things those claims point at

const cache = new Map();
const nf = new Intl.NumberFormat("en-US");

const WIKI_TITLE = {
  Georgia: "Georgia (U.S. state)",
  Washington: "Washington (state)",
  "New York": "New York (state)",
  "District of Columbia": "Washington, D.C.",
};

const P = {
  capital: "P36",
  population: "P1082",
  area: "P2046",
  language: "P37",
  currency: "P38",
  continent: "P30",
  head: "P35",
};

async function json(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(res.status);
  return res.json();
}

async function summary(name, atlas) {
  const title = atlas === "us" ? WIKI_TITLE[name] || name : name;
  const d = await json(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}?redirect=true`
  );
  if (d.type === "disambiguation") throw new Error("disambiguation");
  return {
    description: d.description || null,
    extract: d.extract || null,
    url: d.content_urls?.desktop?.page || null,
    qid: d.wikibase_item || null,
  };
}

// Wikidata often holds several values for one property across different
// years. Prefer the one with the most recent "point in time" qualifier,
// and skip anything flagged deprecated.
function bestClaim(claims, prop) {
  const list = (claims?.[prop] || []).filter((c) => c.rank !== "deprecated");
  if (!list.length) return null;
  const preferred = list.filter((c) => c.rank === "preferred");
  const pool = preferred.length ? preferred : list;
  let best = pool[0];
  let bestTime = "";
  for (const c of pool) {
    const t = c.qualifiers?.P585?.[0]?.datavalue?.value?.time || "";
    if (t > bestTime) { bestTime = t; best = c; }
  }
  return { claim: best, time: bestTime };
}

const yearOf = (t) => (t && /^[+-]\d{4}/.test(t) ? t.slice(1, 5) : null);

async function wikidata(qid) {
  const d = await json(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qid}` +
    `&props=claims&format=json&origin=*`
  );
  const claims = d.entities?.[qid]?.claims;
  if (!claims) throw new Error("no claims");

  const refs = new Set();
  const itemValue = (prop, limit = 2) => {
    const list = (claims[prop] || []).filter((c) => c.rank !== "deprecated").slice(0, limit);
    const ids = list.map((c) => c.mainsnak?.datavalue?.value?.id).filter(Boolean);
    ids.forEach((id) => refs.add(id));
    return ids;
  };

  const pop = bestClaim(claims, P.population);
  const area = bestClaim(claims, P.area);

  const out = {
    capital: itemValue(P.capital, 1),
    languages: itemValue(P.language, 3),
    currency: itemValue(P.currency, 1),
    continent: itemValue(P.continent, 1),
    population: pop?.claim?.mainsnak?.datavalue?.value?.amount
      ? Number(pop.claim.mainsnak.datavalue.value.amount)
      : null,
    populationYear: yearOf(pop?.time),
    area: area?.claim?.mainsnak?.datavalue?.value?.amount
      ? Number(area.claim.mainsnak.datavalue.value.amount)
      : null,
  };

  // Resolve the referenced items to readable names in one more request.
  let labels = {};
  if (refs.size) {
    const l = await json(
      `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${[...refs].join("|")}` +
      `&props=labels&languages=en&format=json&origin=*`
    ).catch(() => null);
    if (l?.entities) {
      for (const [id, e] of Object.entries(l.entities)) {
        labels[id] = e.labels?.en?.value || null;
      }
    }
  }
  const named = (ids) => ids.map((id) => labels[id]).filter(Boolean);

  return {
    capital: named(out.capital)[0] || null,
    languages: named(out.languages).join(", ") || null,
    currency: named(out.currency)[0] || null,
    continent: named(out.continent)[0] || null,
    population: out.population,
    populationYear: out.populationYear,
    area: out.area,
  };
}

export async function placeInfo(name, atlas) {
  const key = `${atlas}:${name}`;
  if (cache.has(key)) return cache.get(key);

  const wiki = await summary(name, atlas).catch(() => null);
  const facts = wiki?.qid ? await wikidata(wiki.qid).catch(() => null) : null;

  const out = { name, wiki, facts };
  cache.set(key, out);
  return out;
}

// One template for every place, so a country and a state read the same.
// Rows with no value are dropped rather than shown empty.
export function factRows(facts, atlas) {
  if (!facts) return [];
  const rows = [];
  if (facts.capital) rows.push(["Capital", facts.capital]);
  if (facts.population) {
    rows.push([
      "Population",
      nf.format(Math.round(facts.population)) + (facts.populationYear ? ` (${facts.populationYear})` : ""),
    ]);
  }
  if (facts.area) rows.push(["Area", `${nf.format(Math.round(facts.area))} km²`]);
  if (facts.languages) rows.push([atlas === "us" ? "Language" : "Official language", facts.languages]);
  if (atlas !== "us" && facts.currency) rows.push(["Currency", facts.currency]);
  if (atlas !== "us" && facts.continent) rows.push(["Continent", facts.continent]);
  return rows;
}
