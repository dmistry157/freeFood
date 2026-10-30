-- Berkeley Free Food Map schema. Safe to re-run.
-- The pipeline uses the secret key (bypasses RLS); the app uses the
-- publishable key, which can only read events.

-- Raw scraped items, one row per post/email/feed entry.
create table if not exists raw_items (
  id          bigint generated always as identity primary key,
  source      text not null,             -- berkeley_events | callink | gmail | instagram
  source_id   text not null,
  fetched_at  timestamptz not null default now(),
  text        text,
  media_paths text[] not null default '{}',
  posted_at   timestamptz,
  processed   boolean not null default false,
  unique (source, source_id)
);
create index if not exists raw_items_unprocessed on raw_items (fetched_at) where not processed;

-- Extracted, geocoded, deduped events shown in the app.
create table if not exists events (
  id           bigint generated always as identity primary key,
  title        text not null,
  start_time   timestamptz not null,
  end_time     timestamptz not null,
  building     text,
  room         text,
  lat          double precision,          -- null = list view, not map
  lng          double precision,
  food         text,
  requirements text,
  link         text,
  open_to      text,
  confidence   real,
  fingerprint  text not null unique,      -- date + start hour + building
  source_urls  text[] not null default '{}',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists events_time on events (start_time, end_time);

-- Phase 4: food certainty. stated = food mentioned; likely = event type usually has food.
alter table events add column if not exists food_status text not null default 'stated'
  check (food_status in ('stated', 'likely'));
alter table events add column if not exists food_reason text;

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists events_updated_at on events;
create trigger events_updated_at before update on events
  for each row execute function set_updated_at();

-- Building lookup for geocoding.
create table if not exists buildings (
  name    text primary key,
  aliases text[] not null default '{}',
  lat     double precision not null,
  lng     double precision not null
);

-- Clubs to watch on CalLink / Instagram.
create table if not exists clubs (
  name             text primary key,
  callink_url      text,
  instagram_handle text,
  is_public        boolean not null default true,
  active           boolean not null default true
);

-- Row-level security: everything locked down except public read of events.
alter table raw_items enable row level security;
alter table events    enable row level security;
alter table buildings enable row level security;
alter table clubs     enable row level security;

drop policy if exists "public read events" on events;
create policy "public read events" on events for select to anon, authenticated using (true);

-- Phase 6: when each scheduled job last ran, so the pipeline adapts to irregular GitHub schedules.
create table if not exists pipeline_state (
  key   text primary key,          -- last_full_extract | last_ig_posts | last_ig_stories
  value timestamptz not null
);
alter table pipeline_state enable row level security;  -- pipeline (secret key) only

-- Shared mailing lists: contributors run apps-script/ in their own bmail, and it calls submit_email
-- (publishable key + a submit key) to queue list emails for the pipeline. It can't read or change
-- anything else. One row per email (Message-ID), so two people on the same list don't double it.
create table if not exists submit_keys (
  key  text primary key,
  note text
);
alter table submit_keys enable row level security;  -- no policies: only the pipeline's secret key sees it

-- Every list anyone has shared. Only 'approved' lists reach the pipeline; a new list starts 'pending' and
-- its emails wait in held_emails until the owner approves it (Table Editor -> shared_lists -> status).
do $$ begin
  create type list_status as enum ('pending', 'approved', 'blocked');
exception when duplicate_object then null; end $$;
create table if not exists shared_lists (
  list_id    text primary key,                      -- e.g. met-2030.lists.berkeley.edu
  status     list_status not null default 'pending',
  sample     text,                                  -- latest subject, to judge the list by
  first_seen timestamptz not null default now(),
  last_seen  timestamptz not null default now()
);
alter table shared_lists enable row level security;
alter table shared_lists add column if not exists shared_by text[] not null default '{}';  -- who shared it
create table if not exists held_emails (            -- emails from pending lists; kept 14 days
  source_id   text primary key,
  list_id     text not null references shared_lists on delete cascade,
  text        text,
  posted_at   timestamptz,
  contributor text,
  held_at     timestamptz not null default now()
);
alter table held_emails enable row level security;
create table if not exists blocked_contributors (   -- their submissions are refused
  email text primary key,
  note  text
);
alter table blocked_contributors enable row level security;
alter table raw_items add column if not exists contributor text;  -- gmail_shared: who shared it
create index if not exists raw_items_contributor on raw_items (contributor, fetched_at) where contributor is not null;

-- Returns stored | duplicate | held (list pending) | list_blocked | blocked (contributor) | over_limit.
drop function if exists submit_email(text, text, text, timestamptz);
create or replace function submit_email(p_key text, p_id text, p_text text, p_posted_at timestamptz,
                                        p_list text, p_contributor text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  who text := lower(trim(coalesce(p_contributor, '')));
  st  list_status;
begin
  if not exists (select 1 from submit_keys where key = p_key) then
    raise exception 'invalid submit key' using errcode = '28000';
  end if;
  if coalesce(trim(p_list), '') = '' then
    raise exception 'missing list id' using errcode = '22023';
  end if;
  if who = '' or exists (select 1 from blocked_contributors where email = who) then
    return 'blocked';
  end if;
  if (select count(*) from raw_items where contributor = who and fetched_at > now() - interval '1 day')
     + (select count(*) from held_emails where contributor = who and held_at > now() - interval '1 day') >= 100 then
    return 'over_limit';  -- 100 emails per person per day
  end if;
  delete from held_emails where held_at < now() - interval '14 days';
  insert into shared_lists (list_id, sample, shared_by)
  values (left(replace(lower(trim(p_list)), '@', '.'), 200), left(substring(p_text from 'Subject: ([^\n]*)'), 300), array[who])
  on conflict (list_id) do update set last_seen = now(), sample = excluded.sample,
    shared_by = case when who = any(shared_lists.shared_by) then shared_lists.shared_by
                     else shared_lists.shared_by || who end
  returning status into st;
  if st = 'blocked' then
    return 'list_blocked';
  elsif st = 'pending' then
    insert into held_emails (source_id, list_id, text, posted_at, contributor)
    values (left(p_id, 300), left(replace(lower(trim(p_list)), '@', '.'), 200), left(p_text, 20000), p_posted_at, who)
    on conflict (source_id) do nothing;
    return 'held';
  end if;
  insert into raw_items (source, source_id, text, posted_at, contributor)
  values ('gmail_shared', left(p_id, 300), left(p_text, 20000), p_posted_at, who)
  on conflict (source, source_id) do nothing;
  return case when found then 'stored' else 'duplicate' end;
end $$;
revoke all on function submit_email(text, text, text, timestamptz, text, text) from public;
grant execute on function submit_email(text, text, text, timestamptz, text, text) to anon, authenticated;

-- Submit registers the ticked lists right away (pending until approved) and credits who ticked them,
-- so the owner can review a list before any of its emails arrive. Never changes a list's status.
create or replace function register_lists(p_key text, p_lists text[], p_samples text[], p_contributor text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  who text := lower(trim(coalesce(p_contributor, '')));
  id  text;
begin
  if not exists (select 1 from submit_keys where key = p_key) then
    raise exception 'invalid submit key' using errcode = '28000';
  end if;
  if who = '' or exists (select 1 from blocked_contributors where email = who) then
    return 'blocked';
  end if;
  for i in 1 .. least(coalesce(array_length(p_lists, 1), 0), 20) loop
    id := left(replace(lower(trim(coalesce(p_lists[i], ''))), '@', '.'), 200);
    continue when id = '';
    insert into shared_lists (list_id, sample, shared_by) values (id, left(p_samples[i], 300), array[who])
    on conflict (list_id) do update set
      sample = coalesce(shared_lists.sample, excluded.sample),
      shared_by = case when who = any(shared_lists.shared_by) then shared_lists.shared_by
                       else shared_lists.shared_by || who end;
  end loop;
  return 'ok';
end $$;
revoke all on function register_lists(text, text[], text[], text) from public;
grant execute on function register_lists(text, text[], text[], text) to anon, authenticated;

-- Approving a list releases its held emails to the pipeline; blocking one drops them.
create or replace function release_held_emails() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'approved' then
    insert into raw_items (source, source_id, text, posted_at, contributor)
    select 'gmail_shared', source_id, text, posted_at, contributor from held_emails where list_id = new.list_id
    on conflict (source, source_id) do nothing;
  end if;
  if new.status <> 'pending' then
    delete from held_emails where list_id = new.list_id;
  end if;
  return new;
end $$;
revoke all on function release_held_emails() from public;
drop trigger if exists shared_lists_release on shared_lists;
create trigger shared_lists_release after update of status on shared_lists
  for each row when (old.status is distinct from new.status) execute function release_held_emails();

-- Lists shared before approval existed start as pending, so the owner reviews them too.
insert into shared_lists (list_id, sample)
select distinct on (id) id, substring(text from 'Subject: ([^\n]*)')
from (select lower(substring(text from 'List: [^\n]*<([^>\n]+)>')) as id, text, fetched_at
      from raw_items where source = 'gmail_shared') t
where id is not null
order by id, fetched_at desc
on conflict (list_id) do nothing;

-- Fill shared_by for lists shared before it existed, from the emails still stored or held.
update shared_lists l set shared_by = coalesce((
  select array_agg(c order by c) from (
    select contributor as c from held_emails h where h.list_id = l.list_id and contributor is not null
    union
    select contributor from raw_items r where r.source = 'gmail_shared' and r.contributor is not null
      and lower(substring(r.text from 'List: [^\n]*<([^>\n]+)>')) = l.list_id) x), '{}')
where shared_by = '{}';

notify pgrst, 'reload schema';  -- make the API see new/changed functions now
