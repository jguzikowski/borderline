-- Two puzzles a day: one world, one US. Everything keyed on puzzle
-- number alone has to become (puzzle number, track).

alter table puzzles add column if not exists track text not null default 'world';
alter table plays   add column if not exists track text not null default 'world';

-- Existing rows default to 'world'. Fix the ones that were US regions so
-- old plays stay attached to the right track.
update plays set track = 'us' where region_id in (
  'deepsouth','newengland','midwest','mountainwest','southwest','appalachia',
  'plains','cascadia','midatlantic','rustbelt','gulfcoast','fourcorners',
  'uppermidwest','borderstates','tornadoalley','necorridor','pnw','sunbelt',
  'ohiovalley','mississippi','bigsky'
);
update puzzles set track = 'us' where region_id in (
  'deepsouth','newengland','midwest','mountainwest','southwest','appalachia',
  'plains','cascadia','midatlantic','rustbelt','gulfcoast','fourcorners',
  'uppermidwest','borderstates','tornadoalley','necorridor','pnw','sunbelt',
  'ohiovalley','mississippi','bigsky'
);

-- Repoint the keys. Drop the foreign key first, since it depends on the
-- primary key we're about to replace.
alter table plays   drop constraint if exists plays_puzzle_n_fkey;
alter table puzzles drop constraint if exists puzzles_pkey;
alter table puzzles add  constraint puzzles_pkey primary key (n, track);

alter table puzzles drop constraint if exists puzzles_play_date_key;
alter table puzzles add  constraint puzzles_date_track_key unique (play_date, track);

alter table plays drop constraint if exists plays_user_id_puzzle_n_key;
alter table plays add  constraint plays_user_puzzle_track_key unique (user_id, puzzle_n, track);

alter table plays add constraint plays_puzzle_fkey
  foreign key (puzzle_n, track) references puzzles (n, track);

create index if not exists plays_user_track_idx on plays (user_id, track);

-- The history view gains the track so stats can split by it.
create or replace view region_history as
select
  p.user_id, p.region_id, p.track, p.puzzle_n, p.score, p.max_score,
  round(100.0 * p.score / nullif(p.max_score, 0)) as pct,
  p.completed_at
from plays p
where p.completed_at is not null;
