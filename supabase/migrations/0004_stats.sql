-- Aggregates for the admin dashboard.
--
-- These are functions rather than client-side queries because the
-- alternative is pulling every play and answer row into the browser and
-- grouping there, which stops working at the first thousand players.
-- All are security definer and read-only; the API route gates access.

-- 1. Headline counters.
create or replace function stats_overview()
returns table (
  players bigint, plays bigint, completed bigint,
  plays_today bigint, players_today bigint,
  completion_rate numeric
)
language sql security definer set search_path = public as $$
  select
    count(distinct user_id),
    count(*),
    count(*) filter (where completed_at is not null),
    count(*) filter (where started_at::date = current_date),
    count(distinct user_id) filter (where started_at::date = current_date),
    round(100.0 * count(*) filter (where completed_at is not null) / nullif(count(*), 0), 1)
  from plays;
$$;

-- 2. Plays per day, split by track.
create or replace function stats_daily(days int default 30)
returns table (day date, track text, plays bigint, players bigint, avg_pct numeric)
language sql security definer set search_path = public as $$
  select
    started_at::date as day,
    track,
    count(*),
    count(distinct user_id),
    round(avg(100.0 * score / nullif(max_score, 0)) filter (where completed_at is not null), 1)
  from plays
  where started_at >= current_date - days
  group by 1, 2
  order by 1, 2;
$$;

-- 3. Which regions actually play hard, as opposed to how I rated them.
create or replace function stats_regions(min_plays int default 1)
returns table (
  region_id text, track text, plays bigint,
  avg_pct numeric, median_pct numeric,
  bold_rate numeric
)
language sql security definer set search_path = public as $$
  select
    p.region_id,
    p.track,
    count(*) as plays,
    round(avg(100.0 * p.score / nullif(p.max_score, 0)), 1),
    round(percentile_cont(0.5) within group (
      order by 100.0 * p.score / nullif(p.max_score, 0)
    )::numeric, 1),
    round(100.0 * avg(bold.share), 1)
  from plays p
  join lateral (
    select avg(case when a.outcome in ('exact','miss_exact') then 1.0 else 0.0 end) as share
    from answers a where a.play_id = p.id
  ) bold on true
  where p.completed_at is not null
  group by 1, 2
  having count(*) >= min_plays
  order by 4 asc;
$$;

-- 4. The shapes people get wrong. This is the interesting one.
create or replace function stats_shapes(min_attempts int default 3, lim int default 40)
returns table (
  target_name text, attempts bigint, misses bigint,
  miss_rate numeric, bold_attempts bigint, bold_rate numeric
)
language sql security definer set search_path = public as $$
  select
    a.target_name,
    count(*) as attempts,
    count(*) filter (where a.outcome in ('miss_exact','miss_narrow')) as misses,
    round(100.0 * count(*) filter (where a.outcome in ('miss_exact','miss_narrow')) / count(*), 1),
    count(*) filter (where a.outcome in ('exact','miss_exact')) as bold_attempts,
    round(100.0 * count(*) filter (where a.outcome in ('exact','miss_exact')) / count(*), 1)
  from answers a
  group by 1
  having count(*) >= min_attempts
  order by 4 desc, 2 desc
  limit lim;
$$;

-- 5. Does gambling pay? Average points per attempt, by how it was answered.
create or replace function stats_confidence()
returns table (mode text, attempts bigint, correct bigint, hit_rate numeric, avg_points numeric)
language sql security definer set search_path = public as $$
  select
    case when outcome in ('exact','miss_exact') then 'named' else 'narrowed' end as mode,
    count(*),
    count(*) filter (where outcome in ('exact','narrowed')),
    round(100.0 * count(*) filter (where outcome in ('exact','narrowed')) / count(*), 1),
    round(avg(points), 2)
  from answers
  group by 1;
$$;

-- 6. Return rate: of the players who finished on a given day, how many
--    came back the next day and seven days later.
create or replace function stats_retention(days int default 14)
returns table (day date, cohort bigint, next_day bigint, day_7 bigint)
language sql security definer set search_path = public as $$
  with done as (
    select distinct user_id, completed_at::date as d
    from plays where completed_at is not null
  )
  select
    c.d,
    count(distinct c.user_id),
    count(distinct n.user_id),
    count(distinct s.user_id)
  from done c
  left join done n on n.user_id = c.user_id and n.d = c.d + 1
  left join done s on s.user_id = c.user_id and s.d = c.d + 7
  where c.d >= current_date - days
  group by 1
  order by 1;
$$;

revoke execute on function stats_overview, stats_daily(int), stats_regions(int),
  stats_shapes(int,int), stats_confidence, stats_retention(int) from anon, authenticated;
