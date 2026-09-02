# Getting Borderline live

Start to finish. Roughly two hours if nothing fights you, and most of
that is waiting on Supabase and Vercel.

You need Node 18 or newer, a GitHub account, a Supabase account, and a
Vercel account. All three are free at this scale.

---

## 1. Get it running locally

Unzip the project, then:

```bash
cd borderline
npm install
```

Nothing works yet because there's no database and no map data. That's
the next two steps.

---

## 2. Build the map data

```bash
npm run build:regions
```

This downloads Natural Earth once, simplifies it, and writes one file
per region into `public/regions/`, plus the answer key into
`server-data/answers.json`.

It prints a line per region with the target count and file size, then a
list of any member it couldn't find. Expect Monaco, Liechtenstein, and
possibly Malta and Singapore to show up as missing, because they're
smaller than the atlas resolution. Two options: delete them from the
member lists in `data/regions.js` and re-run, or leave them out and
accept those regions are one shape shorter than written.

The raw atlas is cached in `.atlas-cache/`, so re-runs are instant.

---

## 3. Set up Supabase

1. Go to supabase.com, create a project. Pick a region near you. Save
   the database password somewhere, though you won't need it here.
2. Wait for it to provision, about two minutes.
3. Open the SQL Editor, paste the whole contents of
   `supabase/migrations/0001_init.sql`, and run it. It should report
   success with no rows.
4. Go to Authentication → Providers, make sure Email is enabled, and
   turn on "Email OTP" or magic links depending on how your dashboard
   labels it. Turn off "Confirm email" if it's on, since magic links
   already prove the address.
4b. **Enable anonymous sign-ins.** Authentication → Providers → Anonymous
   Sign-Ins, toggle on. This is what lets people play without an email.
   Without it the game shows a session error and nobody can play.

   Leave CAPTCHA protection (Authentication → Attack Protection) OFF.
   Turning it on rejects every auth request that doesn't carry a captcha
   token, and the app doesn't send one, so anonymous sign-in fails with
   "captcha verification process failed". Wiring up hCaptcha or Turnstile
   is worth doing before launch, but it is a separate job and the app
   needs a token passed into `signInAnonymously` for it to work.
5. Go to Authentication → URL Configuration. Set Site URL to
   `http://localhost:3000` for now. Add `http://localhost:3000/auth/callback`
   to Redirect URLs.
6. Go to Project Settings → API. You need three values: the Project URL,
   the `anon` public key, and the `service_role` secret key.

---

## 4. Wire up your environment

```bash
cp .env.example .env.local
```

Fill it in:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_CONTACT_EMAIL=you@yourdomain.com
```

Leave the sponsor variables blank. The slot won't render.

The service role key must never get a `NEXT_PUBLIC_` prefix. That prefix
is what tells Next.js to ship a variable to the browser, and this key
bypasses every security rule in the database.

---

## 5. Run it

```bash
npm run dev
```

Open localhost:3000. You should see today's region drawn in bone on a
dark background, with "Sign in to save your history" at the top.

Sign in with your own email, click the link in the message, and play a
full round. Things to verify:

- Every shape resolves and the score matches what you'd expect
- Refreshing mid-round keeps your progress
- Clicking an already-answered shape does nothing
- The narrow-to-three options never include something already on the map
- `/stats` shows the region after you finish

If the map says the region file is missing, step 2 didn't finish.

---

## 6. Push to GitHub

```bash
git init
git add .
git commit -m "Borderline"
```

Before you push, confirm `.env.local` is not in the commit:

```bash
git status --porcelain | grep env
```

That should print nothing. Then create an empty repo on GitHub and push
to it.

Note that `public/regions/` is committed on purpose. Vercel doesn't need
to download Natural Earth at build time this way.

---

## 7. Deploy on Vercel

1. vercel.com → Add New → Project → import the GitHub repo.
2. It'll detect Next.js. Don't change the build settings.
3. Before deploying, add environment variables. Paste in the same five
   from `.env.local`, but set `NEXT_PUBLIC_SITE_URL` to the domain
   Vercel gives you, something like `https://borderline-xyz.vercel.app`.
4. Deploy. Two or three minutes.

Then go back to Supabase → Authentication → URL Configuration and add
the production URL as Site URL, plus `https://yourdomain/auth/callback`
to Redirect URLs. Sign-in will fail with a redirect error until you do.

Test the live site by signing in fresh. This is the step that most often
breaks, and the error is almost always a missing redirect URL.

---

## 8. Domain

Buy one wherever you like. In Vercel, Project → Settings → Domains, add
it and follow the DNS instructions. Then update `NEXT_PUBLIC_SITE_URL`
and the Supabase URLs again to point at the real domain.

---

## 9. Before you tell anyone about it

- Play it on a phone. The map is the whole experience and it needs to
  feel right with a thumb.
- Check a few region definitions you know well. If the Deep South
  grouping annoys you, it'll annoy others, and the `/about` page invites
  corrections for exactly this reason.
- The puzzle rolls over at local midnight, matching Wordle. Everyone
  playing a given calendar date gets the same region, but it arrives at
  their own midnight rather than all at once. Test it by setting your
  machine's clock forward across midnight and reloading.

---

## About the sponsorship contact

There's now a footer with an About link and two mailto links, one
general and one that pre-fills a sponsorship subject line. It renders
only when `NEXT_PUBLIC_CONTACT_EMAIL` is set. The `/about` page explains
what a sponsor gets and offers to send numbers.

A plain mailto is fine to start. Two things worth knowing.

Use a dedicated address rather than your personal one, since a mailto on
a public page will attract spam. Something like `hello@yourdomain` with
forwarding turned on.

And nobody will write until there's traffic to write about. The contact
link isn't what generates sponsorship, it's what stops you missing it if
someone does reach out. The thing worth tracking first is whether people
come back on day seven. That number is what any sponsor will ask for,
and it's also what tells you whether the game is any good.

You can pull it from the database once you have a few weeks of data:

```sql
select count(distinct user_id)
from plays
where completed_at is not null
  and user_id in (
    select user_id from plays
    where puzzle_n = <the day you launched>
  )
  and puzzle_n = <launch day + 7>;
```
