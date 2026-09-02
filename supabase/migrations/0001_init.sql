-- Borderline schema.
-- Run against your Supabase project: supabase db push, or paste into the
-- SQL editor.

create table if not exists profiles (
  id          uuid primary key references auth.users on delete cascade,
  handle      text unique,
  created_at  timestamptz not null default now()
);

create table if not exists puzzles (
  n           integer primary key,          -- puzzle number, 1 = 2026-01-01
  play_date   date not null unique,
  region_id   text not null,
  difficulty  smallint not null
);

create table if not exists plays (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade,
  puzzle_n     integer not null references puzzles(n),
  region_id    text not null,
  hard_mode    boolean not null default false,
  score        integer not null default 0,
  max_score    integer not null default 0,
  grid         text,
  started_at   timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, puzzle_n)
);

create type answer_outcome as enum ('exact', 'narrowed', 'miss_narrow', 'miss_exact');

create table if not exists answers (
  id          bigserial primary key,
  play_id     uuid not null references plays(id) on delete cascade,
  code        text not null,               -- opaque shape code
  target_name text not null,               -- resolved server side
  guess       text,                        -- what they typed or picked
  outcome     answer_outcome not null,
  points      smallint not null,
  answered_at timestamptz not null default now(),
  unique (play_id, code)
);

create index if not exists answers_target_idx on answers (target_name);
create index if not exists plays_user_region_idx on plays (user_id, region_id);

-- Per-user, per-region history. This is what powers "have I improved".
create or replace view region_history as
select
  p.user_id,
  p.region_id,
  p.puzzle_n,
  p.score,
  p.max_score,
  round(100.0 * p.score / nullif(p.max_score, 0)) as pct,
  p.completed_at
from plays p
where p.completed_at is not null;

-- Which shapes a given player keeps getting wrong.
create or replace view weak_spots as
select
  p.user_id,
  a.target_name,
  count(*) filter (where a.outcome in ('miss_exact', 'miss_narrow')) as misses,
  count(*) as attempts
from answers a
join plays p on p.id = a.play_id
group by p.user_id, a.target_name;

alter table profiles enable row level security;
alter table plays    enable row level security;
alter table answers  enable row level security;
alter table puzzles  enable row level security;

create policy "puzzles are public"
  on puzzles for select using (true);

create policy "read own profile"
  on profiles for select using (auth.uid() = id);
create policy "update own profile"
  on profiles for update using (auth.uid() = id);
create policy "insert own profile"
  on profiles for insert with check (auth.uid() = id);

create policy "read own plays"
  on plays for select using (auth.uid() = user_id);

create policy "read own answers"
  on answers for select using (
    exists (select 1 from plays where plays.id = answers.play_id and plays.user_id = auth.uid())
  );

-- Writes go through the API routes using the service role key, so there
-- are deliberately no insert or update policies for plays and answers.
-- The client cannot write its own score.

-- search_path must be set explicitly. A security definer trigger without
-- it can't resolve `profiles` when the auth service fires it, which
-- aborts the whole transaction and makes user creation fail with a 500.
-- The exception block means a profile problem never blocks a signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
exception when others then
  raise warning 'handle_new_user failed for %: %', new.id, sqlerrm;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
