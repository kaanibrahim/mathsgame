create table if not exists public.leaderboard (
  id bigint generated always as identity primary key,
  name text not null check (
    char_length(btrim(name)) between 1 and 20
    and name !~ '[[:cntrl:]]'
  ),
  normalized_name text generated always as (lower(btrim(name))) stored,
  score_seconds numeric(6, 1) not null check (score_seconds > 0 and score_seconds <= 3600),
  score_date date not null default ((now() at time zone 'UTC')::date),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.leaderboard
  add column if not exists score_date date;

update public.leaderboard
set score_date = (created_at at time zone 'UTC')::date
where score_date is null;

alter table public.leaderboard
  alter column score_date set default ((now() at time zone 'UTC')::date),
  alter column score_date set not null,
  drop constraint if exists leaderboard_normalized_name_key;

create unique index if not exists leaderboard_score_date_normalized_name_key
  on public.leaderboard (score_date, normalized_name);

alter table public.leaderboard enable row level security;

drop policy if exists "Leaderboard is readable by everyone" on public.leaderboard;
create policy "Leaderboard is readable by everyone"
  on public.leaderboard for select to anon, authenticated
  using (true);

grant select on public.leaderboard to anon, authenticated;
revoke insert, update, delete, truncate, references, trigger
  on public.leaderboard from anon, authenticated;

create or replace function public.submit_score(p_name text, p_time_seconds numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date;
begin
  if p_name is null
    or pg_catalog.char_length(pg_catalog.btrim(p_name)) not between 1 and 20
    or p_name ~ '[[:cntrl:]]' then
    raise exception 'Name must be 1 to 20 characters without control characters';
  end if;

  if p_time_seconds is null or p_time_seconds <= 0 or p_time_seconds > 3600 then
    raise exception 'Score must be greater than 0 and no more than 3600 seconds';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('mathsgame_leaderboard')
  );

  v_today := pg_catalog.timezone('UTC', pg_catalog.clock_timestamp())::date;

  delete from public.leaderboard
  where score_date < v_today;

  insert into public.leaderboard (name, score_seconds, score_date)
  values (pg_catalog.btrim(p_name), pg_catalog.round(p_time_seconds, 1), v_today)
  on conflict (score_date, normalized_name) do update
    set name = excluded.name,
        score_seconds = excluded.score_seconds,
        updated_at = pg_catalog.now()
    where excluded.score_seconds < public.leaderboard.score_seconds;

  with ranked as (
    select id, pg_catalog.row_number() over (
      order by score_seconds asc, updated_at asc, id asc
    ) as position
    from public.leaderboard
    where score_date = v_today
  )
  delete from public.leaderboard
  where score_date = v_today
    and id in (select id from ranked where position > 10);
end;
$$;

revoke all on function public.submit_score(text, numeric) from public;
grant execute on function public.submit_score(text, numeric) to anon, authenticated;
