# Borderline

A daily map game. One region, blank. Click a shape and either name it
outright for three points or narrow it to one of three for one. Wrong
answers cost the same as right ones pay.

Next.js on Vercel, Postgres and auth on Supabase, geometry from Natural
Earth (public domain).

## Getting it running

```bash
npm install
cp .env.example .env.local        # fill in your Supabase keys
npm run build:regions             # downloads Natural Earth, writes public/regions/
npm run dev
```

`build:regions` caches the raw atlas in `.atlas-cache/`, so it only hits
the network the first time. Re-run it whenever you edit
`data/regions.js`. It prints any region member it couldn't find in the
atlas, which usually means the country is too small at that scale.

## Supabase setup

1. Create a project.
2. Run `supabase/migrations/0001_init.sql` in the SQL editor.
3. Authentication → Providers → enable Email. Turn on magic links.
4. Authentication → URL Configuration → add your site URL and
   `<site>/auth/callback` as a redirect.
5. Copy the project URL, anon key, and service role key into `.env.local`.

The service role key is server-only. It is what the API routes use to
write scores. Never put it in a `NEXT_PUBLIC_` variable.

## Deploying

Push to GitHub, import into Vercel, paste the same environment variables
in, and set `NEXT_PUBLIC_SITE_URL` to your real domain. `build:regions`
runs locally and the output is committed, so Vercel doesn't need network
access to Natural Earth at build time. If you'd rather generate it during
the build, add it to the `build` script instead.

## How cheating is handled

The browser never receives a shape's name. `build:regions` gives every
target an opaque code and writes the code-to-name map to `server-data/`,
which sits outside `public/`. Guesses go to `/api/guess`, the server
grades them and returns the name only after the answer is locked in.
Scores are written with the service role key and there are no insert
policies on `plays` or `answers`, so the client can't write its own
result.

Two things this does not stop. Someone can compare the rendered outlines
against a real map, which is unavoidable for a game made of real
coastlines. And the codes are stable per region, so a determined person
could build a lookup over many days. Salting the codes per puzzle in
`/api/play/start` closes that if it ever matters.

## Signing in is optional

First visit opens an anonymous Supabase session, so the game is playable
with no email and nothing to dismiss. That anonymous user is a real row
in `auth.users`, so scoring, history and row level security all behave
identically.

Entering an email later calls `updateUser` rather than a fresh sign-in,
which upgrades the same account in place. Scores banked as a guest stay
attached.

Requires Anonymous Sign-Ins enabled in the Supabase dashboard. Turn on
CAPTCHA protection alongside it.

## When the puzzle changes

At local midnight, the same way Wordle does it. The puzzle index is
derived from the device's calendar date, so two people playing the same
date get the same region even though their midnights are hours apart.

The server renders a UTC-based first paint and the client recomputes on
mount. `/api/play/start` takes the client's day key but rejects anything
more than a day either side of UTC, since real timezones only span
UTC-12 to UTC+14. That stops anyone walking the archive by changing
their clock.

## Structure

```
data/regions.js              region definitions, shared everywhere
lib/daily.js                 puzzle numbering, rotation, scoring table
lib/names.js                 aliases and fuzzy matching
lib/answers.js               server-only code-to-name lookup
scripts/build-regions.mjs    Natural Earth → per-region geometry
app/api/guess                grades one guess
app/api/narrow               builds the three-way choice
app/api/play/start           starts or resumes today
app/api/play/complete        finalizes and returns the grid
components/Game.jsx          the map and the answer panels
app/stats                    per-region history
supabase/migrations          schema, views, row level security
```

## Adding a region

Append to `data/regions.js` with an `id`, `atlas` (`world` or `us`),
`diff` from 1 to 5, and the member list using canonical names. Add any
unusual spellings to `ALIASES` in `lib/names.js`. Re-run
`npm run build:regions`.

The rotation shuffles within difficulty tiers and deals them round-robin,
so two brutal regions never land on consecutive days. Adding regions
changes the cycle length, which changes future ordering. Past puzzles are
pinned in the `puzzles` table so history stays accurate.

## Money

`components/SponsorSlot.jsx` renders one text line, no third-party
script, no tracking. Set `NEXT_PUBLIC_SPONSOR_TEXT` and
`NEXT_PUBLIC_SPONSOR_URL` to fill it, leave them blank and it doesn't
render at all.

Being realistic about the numbers: display CPMs for a puzzle site run
roughly $2 to $8, so a thousand daily players is a few dollars a month.
EthicalAds and Carbon are the nice options and both want existing
traffic before approving you. A single sponsor slot sold directly, or a
supporter tier that unlocks the archive, will beat a network at this
scale. The archive paywall is nearly free to build since every puzzle is
already in the database.

Worth watching before deciding anything: day-seven return rate. If people
don't come back, monetization is not the problem to solve.

## Not built yet

- Archive and replay of past puzzles
- Weak-spot feedback ("you've missed Burkina Faso four times") — the
  `weak_spots` view is there, nothing reads it yet
- Friend comparison or leaderboards
- Streak tracking (derivable from `plays`, not surfaced)
- Per-puzzle salted shape codes
